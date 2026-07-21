import type { AlbumStat, ArtistStat, Period, Recap, TrackStat } from '../types'
import { fetchArtistImage, fetchTrackCover, flattenImage, proxied, toDataUrl } from './images'

// Calls go through our own serverless proxy (api/lastfm.ts) so the Last.fm API
// key stays server-side and never enters the client bundle. Requires the site
// to be served by Vercel (or `vercel dev` locally); plain `vite dev` doesn't
// serve /api.
const BASE = '/api/lastfm'

// Maps our UI period to Last.fm's period param and to a day window (used for
// the exact scrobble count via user.getRecentTracks).
const PERIOD_MAP: Record<Period, { lfm: string; days: number }> = {
  week: { lfm: '7day', days: 7 },
  month: { lfm: '1month', days: 30 },
  year: { lfm: '12month', days: 365 },
  all: { lfm: 'overall', days: 0 },
}

const AVG_TRACK_SECONDS = 210 // fallback when Last.fm has no duration data

/**
 * Estimates minutes listened: exact scrobble count in the window × average
 * track length (derived from durations reported by the user's top tracks,
 * falling back to AVG_TRACK_SECONDS when none are available). Last.fm doesn't
 * expose real listening time (msPlayed) per scrobble, so this is a proxy.
 */
export function estimateMinutes(scrobbles: number, trackDurations: number[]): number {
  const durations = trackDurations.filter((d) => d > 0)
  const avgSeconds = durations.length
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : AVG_TRACK_SECONDS
  return Math.round((scrobbles * avgSeconds) / 60)
}

class LastfmError extends Error {}

async function call<T>(params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(params)
  const res = await fetch(`${BASE}?${qs.toString()}`)
  const text = await res.text()
  // The proxy always answers JSON. Anything else means /api/lastfm wasn't served
  // (e.g. plain `vite dev` without the api plugin, or a broken deploy) and we got
  // the SPA's index.html back — surface that instead of a cryptic JSON.parse error.
  let data: (T & { error?: unknown; message?: string })
  try {
    data = JSON.parse(text)
  } catch {
    throw new LastfmError(
      'O proxy /api/lastfm não respondeu JSON (provavelmente não está sendo servido). ' +
        'Rode o app com `vercel dev` ou verifique o deploy na Vercel.',
    )
  }
  // Both Last.fm (`error` number + `message`) and our proxy (`error` string)
  // report failures on the `error` field.
  if (data.error) {
    const msg =
      data.message || (typeof data.error === 'string' ? data.error : 'Erro na API do Last.fm.')
    throw new LastfmError(msg)
  }
  if (!res.ok) throw new LastfmError(`Last.fm respondeu ${res.status}.`)
  return data as T
}

// The star placeholder Last.fm serves for imageless artists (same one
// api/lastfm-image.ts filters out of its own scrape) — never a real photo.
const LFM_STAR_PLACEHOLDER = '2a96cbd8b46e442fc41c2b86b821562f'

// Last.fm image arrays: [{'#text': url, size: 'small'|...|'extralarge'}]
type LfmImage = { '#text': string; size: string }
function pickImage(images?: LfmImage[]): string | undefined {
  if (!images?.length) return undefined
  const order = ['extralarge', 'large', 'medium', 'small']
  for (const s of order) {
    const found = images.find((i) => i.size === s && i['#text'])
    if (found) return found['#text']
  }
  return images.find((i) => i['#text'])?.['#text']
}

interface TopArtistsResp {
  topartists: {
    artist: {
      name: string
      playcount: string
      image?: LfmImage[]
    }[]
  }
}
interface TopTracksResp {
  toptracks: {
    track: {
      name: string
      playcount: string
      duration: string
      artist: { name: string }
      image: LfmImage[]
    }[]
  }
}
interface TopAlbumsResp {
  topalbums: {
    album: {
      name: string
      playcount: string
      artist: { name: string }
      image: LfmImage[]
    }[]
  }
}
interface RecentResp {
  recenttracks: { '@attr'?: { total?: string } }
}

async function getTopArtists(
  user: string,
  period: Period,
  limit: number,
): Promise<(ArtistStat & { lfmImage?: string })[]> {
  const data = await call<TopArtistsResp>({
    method: 'user.gettopartists',
    user,
    period: PERIOD_MAP[period].lfm,
    limit: String(limit),
  })
  return (data.topartists?.artist ?? []).map((a) => {
    const img = pickImage(a.image)
    return {
      name: a.name,
      playcount: Number(a.playcount) || 0,
      // Last.fm's JSON API only returns the deprecated star for artist photos
      // now — using it as a fallback would render a fake "photo" instead of
      // gracefully falling through to the empty-thumb state.
      lfmImage: img?.includes(LFM_STAR_PLACEHOLDER) ? undefined : img,
    }
  })
}

async function getTopTracks(user: string, period: Period, limit: number) {
  const data = await call<TopTracksResp>({
    method: 'user.gettoptracks',
    user,
    period: PERIOD_MAP[period].lfm,
    limit: String(limit),
  })
  return data.toptracks?.track ?? []
}

/** Exact number of scrobbles in the period window (or ever, for 'all'). */
async function getScrobbleCount(user: string, period: Period): Promise<number> {
  const params: Record<string, string> = {
    method: 'user.getrecenttracks',
    user,
    limit: '1',
  }
  // 'all' = whole account history: omit the window and use the total count.
  if (period !== 'all') {
    const to = Math.floor(Date.now() / 1000)
    const from = to - PERIOD_MAP[period].days * 24 * 60 * 60
    params.from = String(from)
    params.to = String(to)
  }
  const data = await call<RecentResp>(params)
  return Number(data.recenttracks?.['@attr']?.total) || 0
}

/**
 * Builds the full recap. Minutes are ESTIMATED: exact scrobble count in the
 * window × average track length (derived from your top tracks when available).
 */
export async function fetchRecap(userRaw: string, period: Period): Promise<Recap> {
  const user = userRaw.trim()
  if (!user) throw new LastfmError('Informe seu usuário do Last.fm.')

  // Fetch in parallel. Pull 50 top tracks to estimate an average duration.
  const [topArtists, rawTracks, scrobbles] = await Promise.all([
    getTopArtists(user, period, 5),
    getTopTracks(user, period, 50),
    getScrobbleCount(user, period),
  ])

  const top5Tracks = rawTracks.slice(0, 5)

  // Resolve raw source URLs: album covers from Deezer (fallback Last.fm),
  // artist photos from Deezer.
  const [trackCovers, artistImages] = await Promise.all([
    Promise.all(top5Tracks.map((t) => fetchTrackCover(t.artist?.name ?? '', t.name))),
    Promise.all(topArtists.map((a) => fetchArtistImage(a.name))),
  ])

  // Bake every image into a data URL (see toDataUrl for why). Done in parallel.
  const [heroImage, artistDataImages, trackDataImages] = await Promise.all([
    toDataUrl(proxied(artistImages[0] ?? topArtists[0]?.lfmImage, 1000)),
    Promise.all(artistImages.map((u, i) => toDataUrl(proxied(u ?? topArtists[i]?.lfmImage, 300)))),
    Promise.all(
      top5Tracks.map((t, i) => toDataUrl(proxied(trackCovers[i] ?? pickImage(t.image), 300))),
    ),
  ])

  const topTracks: TrackStat[] = top5Tracks.map((t, i) => ({
    name: t.name,
    artist: t.artist?.name ?? '',
    playcount: Number(t.playcount) || 0,
    image: trackDataImages[i],
  }))

  const minutes = estimateMinutes(scrobbles, rawTracks.map((t) => Number(t.duration)))

  const artistsWithImages: ArtistStat[] = topArtists.map((a, i) => ({
    ...a,
    image: artistDataImages[i],
  }))

  const heroArtist = artistsWithImages[0] ?? null

  return {
    source: 'lastfm',
    user,
    period,
    topArtists: artistsWithImages,
    topTracks,
    heroArtist,
    heroImage,
    scrobbles,
    minutes,
  }
}

/**
 * Fetches the user's top albums for the collage grid. Returns `count` albums
 * (an N×N grid), each with its cover baked into a data URL so the PNG export
 * doesn't depend on the image proxy being reachable at export time (same reason
 * as the recap hero, see toDataUrl in images.ts).
 *
 * Covers come from Last.fm's own album art first — it's real album art, unlike
 * the deprecated artist photos — falling back to a Deezer lookup when an album
 * has no image. `coverSize` scales with the grid so a 10×10 doesn't bake a
 * hundred full-size images.
 */
export async function fetchTopAlbums(
  userRaw: string,
  period: Period,
  count: number,
): Promise<AlbumStat[]> {
  const user = userRaw.trim()
  if (!user) throw new LastfmError('Informe seu usuário do Last.fm.')

  const data = await call<TopAlbumsResp>({
    method: 'user.gettopalbums',
    user,
    period: PERIOD_MAP[period].lfm,
    limit: String(count),
  })
  const albums = (data.topalbums?.album ?? []).slice(0, count)

  // Denser grids get smaller covers (cell ≈ 1080/√count, fetched at ~2× for
  // crispness): a 3×3 pulls 500px art, a 10×10 only ~200px.
  const cols = Math.round(Math.sqrt(count))
  const coverSize = Math.max(200, Math.min(500, Math.ceil((1080 / cols) * 1.4)))

  const covers = await Promise.all(
    albums.map(async (a) => {
      const lfm = pickImage(a.image)
      if (lfm) return lfm
      return fetchTrackCover(a.artist?.name ?? '', a.name)
    }),
  )
  // flattenImage (not toDataUrl) so animated-GIF covers are frozen to their
  // first frame — the collage is a still image, and GIFs would otherwise play
  // in the preview and risk a mid-animation frame in the PNG export.
  const dataUrls = await Promise.all(covers.map((u) => flattenImage(proxied(u, coverSize), coverSize)))

  return albums.map((a, i) => ({
    name: a.name,
    artist: a.artist?.name ?? '',
    playcount: Number(a.playcount) || 0,
    image: dataUrls[i],
  }))
}
