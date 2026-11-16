import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useState } from 'react'
import type { ComponentType } from 'react'
import type { AlbumStat, Period, Recap, Source, TrackStat } from './types'
import { periodLabel } from './types'
import { fetchRecap, fetchTopAlbums, fetchTopTracksList, fetchUserAvatar } from './lib/lastfm'
import {
  fetchRecommendation,
  fetchRecommendationFromSeeds,
  getCachedRecommendation,
  setCachedRecommendation,
  slotKey,
} from './lib/recommend'
import type { AlbumRecommendation } from './lib/recommend'
import * as spotify from './lib/spotify'
import type { SpotifyAuth, SpotifyData, SpotifyRange } from './lib/spotify'
import { PERIOD_OPTIONS, ROUTE_TITLE, SPOTIFY_ENABLED, shouldShowSplash } from './lib/home'
import type { HomeData, PeriodOption, Route } from './lib/home'
import { lastfmHomeModel, spotifyHomeModel } from './lib/homeModel'
import type { ScreenCtx } from './lib/screenCtx'
import { CreateScaffold, EchoLoadingText, Home, PeriodSheet } from './components/Home'
import { Dock } from './components/Dock'
import { SpotifyConnect } from './components/SpotifyConnect'
import { Splash } from './components/Splash'
import { InstallPrompt } from './components/InstallPrompt'
import { ErrorText, ToastProvider } from './components/ui'
import './App.css'

// Sub-screens are lazy: the video one drags in the whole encoder stack.
function screen<T extends Record<string, ComponentType<{ ctx: ScreenCtx }>>>(
  load: () => Promise<T>,
  name: keyof T & string,
) {
  return lazy(() => load().then((m) => ({ default: m[name] })))
}
const RecapScreen = screen(() => import('./screens/RecapScreen'), 'RecapScreen')
const CollageScreen = screen(() => import('./screens/CollageScreen'), 'CollageScreen')
const VideoScreen = screen(() => import('./screens/VideoScreen'), 'VideoScreen')
const TracksScreen = screen(() => import('./screens/TracksScreen'), 'TracksScreen')
const DiscoverScreen = screen(() => import('./screens/DiscoverScreen'), 'DiscoverScreen')
const LyricScreen = screen(() => import('./screens/LyricScreen'), 'LyricScreen')

const SCREENS: Record<Route, ReturnType<typeof screen>> = {
  recap: RecapScreen,
  collage: CollageScreen,
  video: VideoScreen,
  tracks: TracksScreen,
  discover: DiscoverScreen,
  lyric: LyricScreen,
}

// Início data per user+period (Last.fm), so coming back from a screen — or
// flipping the period chip back and forth — is instant instead of refetching.
const HOME_CACHE = new Map<string, HomeData>()

const LS_SOURCE = 'echo_source'
const LS_USER = 'lastfm_user'
const LS_RANGE = 'echo_spotify_range'

/** True when the page was opened by Spotify's OAuth redirect (code or error in the query). */
function cameBackFromSpotify(): boolean {
  const q = new URLSearchParams(window.location.search)
  return q.has('code') || q.has('error')
}

function readSource(): Source {
  if (cameBackFromSpotify()) return 'spotify'
  try {
    return localStorage.getItem(LS_SOURCE) === 'spotify' ? 'spotify' : 'lastfm'
  } catch {
    return 'lastfm'
  }
}

function readRange(): SpotifyRange {
  try {
    const v = localStorage.getItem(LS_RANGE)
    if (v === 'short_term' || v === 'medium_term' || v === 'long_term') return v
  } catch {
    /* storage unavailable */
  }
  return 'medium_term'
}

const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback)

export default function App() {
  const [source, setSource] = useState<Source>(readSource)
  const [route, setRoute] = useState<Route | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [splash, setSplash] = useState(shouldShowSplash)
  const hideSplash = useCallback(() => setSplash(false), [])

  // ---- Last.fm -------------------------------------------------------------
  const [user, setUser] = useState(() => {
    try {
      return localStorage.getItem(LS_USER) ?? ''
    } catch {
      return ''
    }
  })
  const [period, setPeriod] = useState<Period>('month')
  const [home, setHome] = useState<HomeData | null>(null)
  const [homeLoading, setHomeLoading] = useState(false)
  const [homeError, setHomeError] = useState<string | null>(null)
  // Bumped by "Atualizar" / "Atualizar recap": refetches, bypassing the caches.
  const [reload, setReload] = useState({ tick: 0, force: false })

  // ---- Spotify -------------------------------------------------------------
  const [auth, setAuth] = useState<SpotifyAuth>(() =>
    spotify.isConnected() ? { status: 'connected' } : { status: 'disconnected' },
  )
  const [range, setRange] = useState<SpotifyRange>(readRange)
  const [spData, setSpData] = useState<SpotifyData | null>(null)
  const [spLoading, setSpLoading] = useState(false)
  const [spError, setSpError] = useState<string | null>(null)
  const [spRec, setSpRec] = useState<AlbumRecommendation | null>(null)
  const [spBaked, setSpBaked] = useState<Recap | null>(null)

  // The accent (crimson ↔ green) lives on <html> so the sheet, dock and splash —
  // all rendered outside .app — follow it too.
  useLayoutEffect(() => {
    document.documentElement.dataset.source = source
    try {
      localStorage.setItem(LS_SOURCE, source)
    } catch {
      /* storage unavailable */
    }
  }, [source])

  // Complete a Spotify OAuth redirect if we just came back from one.
  useEffect(() => {
    if (!SPOTIFY_ENABLED || !cameBackFromSpotify()) return
    spotify.completeRedirect().then((r) => r && setAuth(r)).catch(() => {})
  }, [])

  // ---- Last.fm Início data -------------------------------------------------
  useEffect(() => {
    const u = user.trim()
    if (source !== 'lastfm' || !u) {
      const h = setTimeout(() => {
        setHome(null)
        setHomeError(null)
        setHomeLoading(false)
      }, 0)
      return () => clearTimeout(h)
    }
    let active = true
    const key = `${u.toLowerCase()}|${period}`
    if (reload.force) HOME_CACHE.delete(key)
    const cached = HOME_CACHE.get(key)
    if (cached) {
      const h = setTimeout(() => {
        if (!active) return
        setHome(cached)
        setHomeError(null)
        setHomeLoading(false)
      }, 0)
      return () => {
        active = false
        clearTimeout(h)
      }
    }
    const t = setTimeout(async () => {
      setHome((h) => (h && h.recap.user.toLowerCase() === u.toLowerCase() ? h : null))
      setHomeLoading(true)
      setHomeError(null)
      try {
        const slot = slotKey()
        // Today's pick is slow (similar artists + related albums), so it must not
        // hold the rest of the Início back: it fills the Descobrir card when ready.
        const recP = (async () => {
          const hit = getCachedRecommendation(u, slot)
          if (hit) return hit
          const fresh = await fetchRecommendation(u, slot)
          setCachedRecommendation(u, slot, fresh)
          return fresh
        })()
        const [recapR, avatarR, albumsR] = await Promise.allSettled([
          fetchRecap(u, period),
          fetchUserAvatar(u),
          fetchTopAlbums(u, period, 5),
        ])
        if (!active) return
        if (recapR.status === 'rejected') throw recapR.reason
        const data: HomeData = {
          recap: recapR.value,
          avatar: avatarR.status === 'fulfilled' ? avatarR.value : undefined,
          albumCovers:
            albumsR.status === 'fulfilled'
              ? albumsR.value.map((a) => a.image).filter((x): x is string => !!x)
              : [],
          rec: null,
        }
        HOME_CACHE.set(key, data)
        setHome(data)
        setHomeLoading(false)
        recP
          .then((rec) => {
            const full = { ...data, rec }
            HOME_CACHE.set(key, full)
            if (active) setHome(full)
          })
          .catch(() => {})
      } catch (err) {
        if (!active) return
        setHome(null)
        setHomeError(errMsg(err, 'Não foi possível carregar seus dados.'))
        setHomeLoading(false)
      }
    }, 600)
    return () => {
      active = false
      clearTimeout(t)
    }
  }, [user, period, source, reload])

  // ---- Spotify data --------------------------------------------------------
  useEffect(() => {
    if (!SPOTIFY_ENABLED || source !== 'spotify' || auth.status !== 'connected') {
      const h = setTimeout(() => {
        setSpData(null)
        setSpError(null)
        setSpLoading(false)
      }, 0)
      return () => clearTimeout(h)
    }
    let active = true
    const force = reload.force
    const h = setTimeout(() => {
      setSpLoading(true)
      setSpError(null)
    }, 0)
    spotify
      .loadSpotifyData(range, { force })
      .then((d) => {
        if (!active) return
        setSpData(d)
        setSpError(d.error)
      })
      .catch((e) => {
        if (!active) return
        setSpData(null)
        setSpError(errMsg(e, 'Não foi possível carregar os dados do Spotify.'))
      })
      .finally(() => active && setSpLoading(false))
    return () => {
      active = false
      clearTimeout(h)
    }
  }, [source, auth.status, range, reload])

  const spRecap = spData ? spotify.spotifyToRecap(spData, range) : null

  // The recap with images baked into data URLs, for PNG/MP4 export on Spotify.
  useEffect(() => {
    let active = true
    if (!spRecap) {
      const h = setTimeout(() => setSpBaked(null), 0)
      return () => clearTimeout(h)
    }
    spotify
      .bakeRecapImages(spRecap)
      .then((r) => active && setSpBaked(r))
      .catch(() => active && setSpBaked(spRecap))
    return () => {
      active = false
    }
    // spRecap is rebuilt each render; the data object is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spData, range])

  // Today's album pick for the Spotify Descobrir card (cached per day-part).
  const spProfileId = spData?.profile?.id
  useEffect(() => {
    if (!spData || spData.topArtists.length === 0) return
    let active = true
    const key = `spotify:${spProfileId ?? ''}`
    const slot = slotKey()
    const hit = getCachedRecommendation(key, slot)
    if (hit) {
      const h = setTimeout(() => active && setSpRec(hit), 0)
      return () => {
        active = false
        clearTimeout(h)
      }
    }
    fetchRecommendationFromSeeds(
      spData.topArtists.map((a) => a.name),
      key,
      slot,
    )
      .then((rec) => {
        setCachedRecommendation(key, slot, rec)
        if (active) setSpRec(rec)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [spData, spProfileId])

  // ---- Navigation ----------------------------------------------------------
  function openRoute(r: Route) {
    setRoute(r)
    history.pushState({ echoRoute: r }, '')
    window.scrollTo(0, 0)
  }
  function closeRoute() {
    setRoute(null)
    window.scrollTo(0, 0)
  }
  /** "← Início": pops the history entry openRoute pushed (popstate then closes the route). */
  function goHome() {
    if ((history.state as { echoRoute?: Route } | null)?.echoRoute) history.back()
    else closeRoute()
  }
  // Browser/Android Back from a screen returns to the Início.
  useEffect(() => {
    if (!route) return
    window.addEventListener('popstate', closeRoute)
    return () => window.removeEventListener('popstate', closeRoute)
  })

  function changeSource(next: Source) {
    if (next === source) return
    if (route) goHome()
    setSheetOpen(false)
    setSource(next)
  }

  function saveUser(u: string) {
    setUser(u)
    try {
      localStorage.setItem(LS_USER, u)
    } catch {
      /* storage unavailable — the name just won't persist */
    }
  }

  function refresh() {
    setReload((r) => ({ tick: r.tick + 1, force: true }))
  }

  async function connectSpotify() {
    setAuth({ status: 'connecting' })
    try {
      await spotify.startLogin() // navigates away to Spotify
    } catch (e) {
      setAuth({ status: 'failed', message: errMsg(e, 'Não foi possível abrir o login do Spotify.') })
    }
  }
  function disconnectSpotify() {
    spotify.logout()
    setAuth({ status: 'disconnected' })
    setSpData(null)
    setSpRec(null)
    if (route) goHome()
  }
  function pickRange(r: SpotifyRange) {
    setRange(r)
    try {
      localStorage.setItem(LS_RANGE, r)
    } catch {
      /* storage unavailable */
    }
  }

  // ---- Screen context ------------------------------------------------------
  const isSpotify = source === 'spotify'
  const rangeInfo = spotify.SPOTIFY_RANGES.find((r) => r.value === range) ?? spotify.SPOTIFY_RANGES[1]
  const ctxPeriod: Period = isSpotify ? rangeInfo.period : period
  const lastfmSlug = { week: '7day', month: '1month', year: '12month', all: 'overall' }[period]
  const ready = isSpotify ? auth.status === 'connected' && !!spData : user.trim().length > 0

  const ctx: ScreenCtx = {
    source,
    user: isSpotify ? '' : user.trim(),
    period: ctxPeriod,
    periodText: periodLabel(source, ctxPeriod),
    fileKey: isSpotify ? spotify.spotifyFileKey(range) : `${user.trim()}-${lastfmSlug}`,
    ready,
    recap: isSpotify ? spBaked ?? spRecap : home?.recap ?? null,
    recapLoading: isSpotify ? spLoading : homeLoading,
    recapError: isSpotify ? spError : homeError,
    reloadRecap: refresh,
    loadAlbums: async (count: number): Promise<AlbumStat[]> => {
      if (!isSpotify) return fetchTopAlbums(user, period, count)
      if (!spData) return []
      return spotify.bakeAlbumImages(spotify.spotifyToAlbums(spData, count))
    },
    loadTracks: async (): Promise<TrackStat[]> => {
      if (!isSpotify) return fetchTopTracksList(user, period, 30)
      return spData ? spotify.spotifyTracksList(spData, 20) : []
    },
    cachedRecommendation: () =>
      isSpotify
        ? getCachedRecommendation(`spotify:${spProfileId ?? ''}`, slotKey())
        : getCachedRecommendation(user.trim(), slotKey()),
    loadRecommendation: async (): Promise<AlbumRecommendation> => {
      const slot = slotKey()
      if (!isSpotify) {
        const u = user.trim()
        const hit = getCachedRecommendation(u, slot)
        if (hit) return hit
        const fresh = await fetchRecommendation(u, slot)
        setCachedRecommendation(u, slot, fresh)
        return fresh
      }
      const key = `spotify:${spProfileId ?? ''}`
      const hit = getCachedRecommendation(key, slot)
      if (hit) return hit
      const fresh = await fetchRecommendationFromSeeds(
        (spData?.topArtists ?? []).map((a) => a.name),
        key,
        slot,
      )
      setCachedRecommendation(key, slot, fresh)
      return fresh
    },
  }

  // ---- Period chip + sheet -------------------------------------------------
  const lastfmOptions: PeriodOption<string>[] = PERIOD_OPTIONS
  const spotifyOptions: PeriodOption<string>[] = spotify.SPOTIFY_RANGES.map((r) => ({
    value: r.value,
    label: r.chip,
    description: r.description,
  }))
  const options = isSpotify ? spotifyOptions : lastfmOptions
  const selectedPeriod: string = isSpotify ? range : period
  const chipLabel = options.find((o) => o.value === selectedPeriod)?.label ?? ''

  const dock = <Dock source={source} onChange={changeSource} />
  const chrome = (
    <>
      {sheetOpen && (
        <PeriodSheet
          options={options}
          selected={selectedPeriod}
          onSelect={(v) => (isSpotify ? pickRange(v as SpotifyRange) : setPeriod(v as Period))}
          onClose={() => setSheetOpen(false)}
        />
      )}
      {splash && <Splash onFinished={hideSplash} />}
      <InstallPrompt />
    </>
  )

  // ---- Início --------------------------------------------------------------
  if (route === null) {
    const spotifyConnected = isSpotify && auth.status === 'connected'
    return (
      <ToastProvider>
        <div className="app app--home" data-source={source}>
          {isSpotify && !spotifyConnected ? (
            <SpotifyConnect auth={auth} onConnect={connectSpotify} comingSoon={!SPOTIFY_ENABLED} />
          ) : (
            <Home
              key={source}
              model={
                isSpotify
                  ? spotifyHomeModel(spData, spRecap, spRec)
                  : lastfmHomeModel(user, home)
              }
              onSaveUser={saveUser}
              periodLabel={chipLabel}
              onOpenPeriod={() => setSheetOpen(true)}
              loading={isSpotify ? spLoading : homeLoading}
              error={isSpotify ? spError : homeError}
              onOpen={openRoute}
              onRefresh={isSpotify ? refresh : undefined}
              onLogout={isSpotify ? disconnectSpotify : undefined}
            />
          )}
        </div>
        {dock}
        {chrome}
      </ToastProvider>
    )
  }

  // ---- A sub-screen --------------------------------------------------------
  const Screen = SCREENS[route]
  return (
    <ToastProvider>
      <div className="app app--create" data-source={source}>
        <CreateScaffold title={ROUTE_TITLE[route]} onBack={goHome}>
          {route !== 'lyric' && !ctx.ready && !isSpotify && (
            <ErrorText>Informe seu usuário do Last.fm no Início (lápis) para usar esta tela.</ErrorText>
          )}
          <div className="screen-body">
            {route !== 'lyric' && ctx.recapError && route !== 'discover' && route !== 'tracks' && route !== 'collage' && (
              <ErrorText>{ctx.recapError}</ErrorText>
            )}
            <Suspense fallback={<EchoLoadingText />}>
              <Screen key={`${source}-${route}`} ctx={ctx} />
            </Suspense>
          </div>
        </CreateScaffold>
      </div>
      {dock}
      {chrome}
    </ToastProvider>
  )
}
