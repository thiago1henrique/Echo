import type { AlbumStat, ArtistStat, Period, Recap, TrackStat } from '../types'
import { flattenImage, proxied, toDataUrl } from './images'

// Spotify integration (auth + data + pure mappers). No UI here.
//
// Auth uses the Authorization Code flow with PKCE, which runs entirely in the
// browser (no client secret, no backend). The user logs in on Spotify and is
// redirected back here with a code we exchange for a token. Mirrors the Android
// SpotifyAuthManager / SpotifyRepository.
//
// IMPORTANT limitations of the public Web API (vs. Last.fm):
// - No play counts per track/artist and no total "minutes listened" — only
//   *ranked* top lists. Per-item playcounts, Recap.scrobbles and Recap.minutes
//   stay undefined; the card shows the user's top genres instead (aggregated
//   from the top artists' genre tags).
// - Only three fixed windows: short_term (~4 weeks), medium_term (~6 months),
//   long_term (~1 year). No weekly view.
// - No "top albums" endpoint: albums are derived from the top tracks.

const AUTH_URL = 'https://accounts.spotify.com/authorize'
const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const API = 'https://api.spotify.com/v1'
const SCOPE = 'user-top-read user-read-recently-played user-read-private'

/** 50 is the API max; enough distinct albums for a 5x5 collage. */
const TOP_TRACKS_LIMIT = 50
/** Responses are reused for this long unless a refresh is forced. */
const CACHE_TTL_MS = 5 * 60 * 1000
/** Renew the token this long before it expires. */
const EXPIRY_SKEW_MS = 60_000
/** After a failed renewal, don't hit the token endpoint again for this long. */
const RENEW_BACKOFF_MS = 10_000
/** Retries per call after a 429, and the longest Retry-After worth waiting for in-app. */
const RATE_LIMIT_RETRIES = 2
const MAX_RETRY_AFTER_S = 30
/** How many genre tags to surface on the recap card. */
const MAX_GENRES = 4

const LS = {
  clientId: 'spotify_client_id',
  verifier: 'spotify_pkce_verifier',
  state: 'spotify_pkce_state',
  token: 'spotify_token',
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SpotifyAuth =
  | { status: 'checking' | 'disconnected' | 'connecting' | 'connected' }
  | { status: 'failed'; message: string }

export type SpotifyRange = 'short_term' | 'medium_term' | 'long_term'

export interface SpotifyRangeInfo {
  value: SpotifyRange
  /** Chip / sheet label. */
  chip: string
  /** Sheet description. */
  description: string
  /** Short label used on cards ("4 semanas"). */
  cardLabel: string
  /** App-level Period this window maps to (see SOURCE_PERIODS / periodLabel). */
  period: Period
}

export const SPOTIFY_RANGES: SpotifyRangeInfo[] = [
  { value: 'short_term', chip: 'Mês', description: 'Últimas 4 semanas', cardLabel: '4 semanas', period: 'month' },
  { value: 'medium_term', chip: '6 meses', description: 'Padrão do Spotify', cardLabel: '6 meses', period: 'year' },
  { value: 'long_term', chip: 'Ano', description: 'Último ano', cardLabel: '1 ano', period: 'all' },
]

export const DEFAULT_SPOTIFY_RANGE: SpotifyRange = 'medium_term'

export interface SpotifyProfile {
  id: string
  displayName: string
  imageUrl?: string
}

export interface SpotifyTopTrack {
  id: string
  name: string
  /** Artist names joined by ", ". */
  artistLine: string
  artists: string[]
  album: {
    id: string
    name: string
    /** Name of the album's first artist ('' when unknown). */
    artist: string
    /** Largest cover. */
    imageUrl?: string
    /** Smallest cover (list thumbnails). */
    thumbUrl?: string
  }
}

export interface SpotifyTopArtist {
  id: string
  name: string
  imageUrl?: string
  genres: string[]
}

export interface SpotifyData {
  profile: SpotifyProfile | null
  /** Up to 50, ranked. */
  topTracks: SpotifyTopTrack[]
  topArtists: SpotifyTopArtist[]
  /** Message of the first failed call when the result is partial; null when all succeeded. */
  error: string | null
}

// ---------------------------------------------------------------------------
// Errors + messages
// ---------------------------------------------------------------------------

export class SpotifyError extends Error {}

/** No access token to send (logged out, or the last renewal failed). */
class SpotifyAuthUnavailableError extends SpotifyError {}

class SpotifyHttpError extends SpotifyError {
  readonly status: number
  readonly retryAfterSeconds: number | null
  constructor(status: number, retryAfterSeconds: number | null) {
    super(`Spotify respondeu ${status}.`)
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
  }
}

/** A 429 that was not (or could not be) waited out. */
class SpotifyRateLimitedError extends SpotifyError {
  readonly retryAfterSeconds: number
  constructor(retryAfterSeconds: number) {
    super(`Spotify rate limited, retry after ${retryAfterSeconds}s`)
    this.retryAfterSeconds = retryAfterSeconds
  }
}

/** "em Xs" / "em ~X min" / "em ~X h" for a Retry-After, or "em instantes" when unknown. */
export function rateLimitWaitPhrase(retryAfterSeconds: number | null | undefined): string {
  if (retryAfterSeconds == null || retryAfterSeconds < 1) return 'em instantes'
  if (retryAfterSeconds < 60) return `em ${Math.floor(retryAfterSeconds)}s`
  if (retryAfterSeconds < 3600) return `em ~${Math.ceil(retryAfterSeconds / 60)} min`
  return `em ~${Math.ceil(retryAfterSeconds / 3600)} h`
}

export function rateLimitWaitMessage(retryAfterSeconds: number | null | undefined): string {
  return `O Spotify limitou as requisições (429). Tente de novo ${rateLimitWaitPhrase(retryAfterSeconds)}.`
}

const MSG_401 = 'O Spotify recusou o acesso (401). Desconecte e entre de novo.'
const MSG_403 =
  'Acesso negado (403). No modo desenvolvimento, adicione sua conta em User Management no Spotify Dashboard.'
const MSG_GENERIC = 'Não foi possível carregar os dados do Spotify.'
const MSG_RENEW = 'Não foi possível renovar o acesso ao Spotify. Verifique sua conexão.'

/** Maps any error thrown while loading data to the user-facing (pt-BR) message. */
export function spotifyErrorMessage(e: unknown): string {
  if (e instanceof SpotifyAuthUnavailableError) return e.message
  if (e instanceof SpotifyRateLimitedError) return rateLimitWaitMessage(e.retryAfterSeconds)
  if (e instanceof SpotifyHttpError) {
    if (e.status === 401) return lastRenewError ?? MSG_401
    if (e.status === 403) return MSG_403
    if (e.status === 429) return rateLimitWaitMessage(e.retryAfterSeconds)
  }
  return MSG_GENERIC
}

// ---------------------------------------------------------------------------
// Client id + PKCE helpers
// ---------------------------------------------------------------------------

/** Client ID from env, falling back to a value saved in the UI. */
export function getClientId(): string {
  const fromEnv = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined
  return fromEnv || localStorage.getItem(LS.clientId) || ''
}

export function setClientId(id: string) {
  localStorage.setItem(LS.clientId, id.trim())
}

export function hasClientId(): boolean {
  return getClientId().trim().length > 0
}

/** Must be registered as a Redirect URI in the Spotify app dashboard. */
function redirectUri(): string {
  return window.location.origin + window.location.pathname
}

function randomString(len: number): string {
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

async function sha256(input: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
}

function base64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

// ---------------------------------------------------------------------------
// Token storage + auth change notifications
// ---------------------------------------------------------------------------

interface TokenSet {
  access_token: string
  refresh_token?: string
  expires_at: number
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
}

function saveToken(data: TokenResponse, fallbackRefresh?: string): TokenSet {
  const t: TokenSet = {
    access_token: data.access_token,
    // Spotify omits refresh_token on refresh responses — keep the old one.
    refresh_token: data.refresh_token ?? fallbackRefresh,
    expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
  }
  localStorage.setItem(LS.token, JSON.stringify(t))
  return t
}

function loadToken(): TokenSet | null {
  const raw = localStorage.getItem(LS.token)
  if (!raw) return null
  try {
    return JSON.parse(raw) as TokenSet
  } catch {
    return null
  }
}

export function isConnected(): boolean {
  return !!loadToken()
}

const authListeners = new Set<(auth: SpotifyAuth) => void>()

/** Subscribes to auth changes caused inside this module (logout, session lost on renewal). */
export function onSpotifyAuthChange(listener: (auth: SpotifyAuth) => void): () => void {
  authListeners.add(listener)
  return () => authListeners.delete(listener)
}

function notifyAuth(auth: SpotifyAuth) {
  authListeners.forEach((l) => l(auth))
}

export function logout() {
  localStorage.removeItem(LS.token)
  clearSpotifyCache()
  clearRenewFailure()
  notifyAuth({ status: 'disconnected' })
}

// ---------------------------------------------------------------------------
// Login / redirect
// ---------------------------------------------------------------------------

/** Kicks off the login redirect (navigates away). Throws a user-facing error without a Client ID. */
export async function startLogin(): Promise<void> {
  const clientId = getClientId().trim()
  if (!clientId) {
    throw new SpotifyError(
      'Cole o Client ID do seu app do Spotify (developer.spotify.com/dashboard) para conectar.',
    )
  }
  const verifier = randomString(64)
  const challenge = base64url(await sha256(verifier))
  // Opaque, single-use value echoed back by Spotify — lets us reject a redirect
  // we didn't initiate (CSRF protection), on top of what PKCE already covers.
  const state = randomString(16)
  localStorage.setItem(LS.verifier, verifier)
  localStorage.setItem(LS.state, state)
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SCOPE,
    state,
  })
  window.location.assign(`${AUTH_URL}?${params.toString()}`)
}

/**
 * Call once on app load. If the URL carries ?code / ?error (we just came back
 * from Spotify), validates it and exchanges the code for a token. Always strips
 * the auth params from the URL. Returns null when the URL is not a redirect.
 */
export async function completeRedirect(): Promise<SpotifyAuth | null> {
  const url = new URL(window.location.href)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  if (!code && !error) return null

  const returnedState = url.searchParams.get('state')
  // Pending PKCE data is single-use: take it and clear it either way.
  const verifier = localStorage.getItem(LS.verifier)
  const savedState = localStorage.getItem(LS.state)
  localStorage.removeItem(LS.verifier)
  localStorage.removeItem(LS.state)

  for (const k of ['code', 'state', 'error', 'error_description']) url.searchParams.delete(k)
  window.history.replaceState({}, '', url.pathname + url.search + url.hash)

  const failed = (message: string): SpotifyAuth => {
    const auth: SpotifyAuth = { status: 'failed', message }
    notifyAuth(auth)
    return auth
  }
  if (!verifier || !savedState || returnedState !== savedState) {
    return failed('Resposta de login inválida. Tente novamente.')
  }
  if (error) return failed(error === 'access_denied' ? 'Login cancelado.' : `Erro do Spotify: ${error}`)
  if (!code) return failed('Resposta de login sem código.')

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(),
    client_id: getClientId().trim(),
    code_verifier: verifier,
  })
  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!res.ok) return failed('Não foi possível concluir o login.')
    saveToken((await res.json()) as TokenResponse)
  } catch {
    return failed('Não foi possível concluir o login.')
  }
  clearRenewFailure()
  const auth: SpotifyAuth = { status: 'connected' }
  notifyAuth(auth)
  return auth
}

// ---------------------------------------------------------------------------
// Token renewal
// ---------------------------------------------------------------------------

/** Why the last renewal failed, for the UI; null once a token is obtained again. */
let lastRenewError: string | null = null
let lastRenewFailureAt = 0
/** Parallel calls share one renewal instead of each hitting the token endpoint. */
let renewing: Promise<TokenSet | null> | null = null

function clearRenewFailure() {
  lastRenewError = null
  lastRenewFailureAt = 0
}

function noteRenewFailure() {
  lastRenewError = MSG_RENEW
  lastRenewFailureAt = Date.now()
}

async function doRenew(tokens: TokenSet | null): Promise<TokenSet | null> {
  // After a failure, don't retry for every queued call.
  if (Date.now() - lastRenewFailureAt < RENEW_BACKOFF_MS) return null
  if (!tokens) return null
  if (!tokens.refresh_token) {
    logout()
    return null
  }
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
    client_id: getClientId().trim(),
  })
  let res: Response
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
  } catch {
    // Network error: keep the session so the user can retry.
    noteRenewFailure()
    return null
  }
  if (res.ok) {
    try {
      const fresh = saveToken((await res.json()) as TokenResponse, tokens.refresh_token)
      clearRenewFailure()
      return fresh
    } catch {
      noteRenewFailure()
      return null
    }
  }
  // 4xx (except 429) = grant revoked/expired -> logout. 429/5xx keep the session.
  if (res.status >= 400 && res.status < 500 && res.status !== 429) {
    logout()
  } else {
    noteRenewFailure()
  }
  return null
}

function renew(tokens: TokenSet | null): Promise<TokenSet | null> {
  if (!renewing) {
    renewing = doRenew(tokens).finally(() => {
      renewing = null
    })
  }
  return renewing
}

/** Returns a non-expired access token, renewing it when needed. */
async function validAccessToken(): Promise<string> {
  const tokens = loadToken()
  if (!tokens) throw new SpotifyAuthUnavailableError('Conecte sua conta do Spotify.')
  if (Date.now() < tokens.expires_at - EXPIRY_SKEW_MS) return tokens.access_token
  const fresh = await renew(tokens)
  if (fresh) return fresh.access_token
  throw new SpotifyAuthUnavailableError(
    loadToken() ? (lastRenewError ?? MSG_RENEW) : 'Sua sessão do Spotify expirou. Conecte de novo.',
  )
}

/** Forces a renewal after a 401, unless another caller already replaced the failed token. */
async function refreshAfterUnauthorized(failedToken: string): Promise<string | null> {
  const tokens = loadToken()
  if (tokens && tokens.access_token !== failedToken) return tokens.access_token
  return (await renew(tokens))?.access_token ?? null
}

// ---------------------------------------------------------------------------
// HTTP: rate limit + cache
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

let blockedUntil = 0

function parseRetryAfter(res: Response): number | null {
  const n = Number.parseInt(res.headers.get('Retry-After')?.trim() ?? '', 10)
  return Number.isFinite(n) ? n : null
}

/**
 * Waits out 429s up to MAX_RETRY_AFTER_S. Longer ones fail with a rate-limited
 * error, and until they expire calls fail the same way without reaching the
 * API: calling during the penalty only extends it.
 */
async function rateLimited<T>(call: () => Promise<T>): Promise<T> {
  let retries = 0
  for (;;) {
    const wait = blockedUntil - Date.now()
    if (wait > MAX_RETRY_AFTER_S * 1000) throw new SpotifyRateLimitedError(Math.ceil(wait / 1000))
    if (wait > 0) await sleep(wait)
    try {
      return await call()
    } catch (e) {
      if (!(e instanceof SpotifyHttpError) || e.status !== 429) throw e
      const after = Math.max(1, e.retryAfterSeconds ?? 1)
      blockedUntil = Math.max(blockedUntil, Date.now() + after * 1000)
      if (retries >= RATE_LIMIT_RETRIES || after > MAX_RETRY_AFTER_S) {
        throw new SpotifyRateLimitedError(after)
      }
      retries++
    }
  }
}

async function apiGet<T>(path: string): Promise<T> {
  return rateLimited(async () => {
    const token = await validAccessToken()
    const get = (t: string) => fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${t}` } })
    let res = await get(token)
    if (res.status === 401) {
      const fresh = await refreshAfterUnauthorized(token)
      if (fresh) res = await get(fresh)
    }
    if (!res.ok) throw new SpotifyHttpError(res.status, parseRetryAfter(res))
    return (await res.json()) as T
  })
}

const cache = new Map<string, { at: number; value: unknown }>()

export function clearSpotifyCache() {
  cache.clear()
}

async function cached<T>(key: string, force: boolean, call: () => Promise<T>): Promise<T> {
  const entry = cache.get(key)
  if (!force && entry && Date.now() - entry.at < CACHE_TTL_MS) return entry.value as T
  try {
    const value = await call()
    cache.set(key, { at: Date.now(), value })
    return value
  } catch (e) {
    // Older data beats an empty screen; a forced refresh still reports the 429.
    if (!force && entry && e instanceof SpotifyRateLimitedError) return entry.value as T
    throw e
  }
}

// ---------------------------------------------------------------------------
// Raw API shapes -> app shapes (exported for tests)
// ---------------------------------------------------------------------------

interface RawImage {
  url?: string
}
interface RawArtistRef {
  id?: string
  name?: string
}
interface RawTrack {
  id?: string
  name?: string
  artists?: RawArtistRef[]
  album?: { id?: string; name?: string; images?: RawImage[]; artists?: RawArtistRef[] }
}
interface RawArtist {
  id?: string
  name?: string
  images?: RawImage[]
  genres?: string[]
}
interface RawUser {
  id?: string
  display_name?: string | null
  images?: RawImage[]
}

/** Spotify lists images largest first. */
const bestImage = (imgs?: RawImage[]): string | undefined => imgs?.find((i) => i.url)?.url
const smallestImage = (imgs?: RawImage[]): string | undefined =>
  [...(imgs ?? [])].reverse().find((i) => i.url)?.url

export function parseSpotifyProfile(raw: RawUser): SpotifyProfile {
  return {
    id: raw.id ?? '',
    displayName: raw.display_name?.trim() || '',
    imageUrl: bestImage(raw.images),
  }
}

export function parseSpotifyTracks(items: (RawTrack | null)[] | undefined): SpotifyTopTrack[] {
  return (items ?? [])
    .filter((t): t is RawTrack => !!t)
    .map((t) => {
      const artists = (t.artists ?? []).map((a) => a.name ?? '').filter(Boolean)
      return {
        id: t.id ?? '',
        name: t.name ?? '',
        artists,
        artistLine: artists.join(', '),
        album: {
          id: t.album?.id ?? '',
          name: t.album?.name ?? '',
          artist: t.album?.artists?.[0]?.name?.trim() ?? '',
          imageUrl: bestImage(t.album?.images),
          thumbUrl: smallestImage(t.album?.images),
        },
      }
    })
}

export function parseSpotifyArtists(items: (RawArtist | null)[] | undefined): SpotifyTopArtist[] {
  return (items ?? [])
    .filter((a): a is RawArtist => !!a)
    .map((a) => ({
      id: a.id ?? '',
      name: a.name ?? '',
      imageUrl: bestImage(a.images),
      genres: a.genres ?? [],
    }))
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

/**
 * Loads profile + top tracks + top artists in parallel and independently: a
 * failing call doesn't cancel the others, the result carries what arrived plus
 * `error` (first failure). Throws only when neither tracks nor artists loaded.
 * Responses are cached in memory for 5 min per key; `force` bypasses the cache.
 */
export async function loadSpotifyData(
  range: SpotifyRange,
  opts: { force?: boolean } = {},
): Promise<SpotifyData> {
  const force = opts.force ?? false
  const [tracks, artists, profile] = await Promise.allSettled([
    cached(`tracks:${range}`, force, async () =>
      parseSpotifyTracks(
        (await apiGet<{ items?: RawTrack[] }>(`/me/top/tracks?time_range=${range}&limit=${TOP_TRACKS_LIMIT}`)).items,
      ),
    ),
    cached(`artists:${range}`, force, async () =>
      parseSpotifyArtists(
        (await apiGet<{ items?: RawArtist[] }>(`/me/top/artists?time_range=${range}&limit=20`)).items,
      ),
    ),
    cached('me', force, async () => parseSpotifyProfile(await apiGet<RawUser>('/me'))),
  ])

  const firstFailure = [tracks, artists, profile].find((r) => r.status === 'rejected')
  const error = firstFailure?.status === 'rejected' ? spotifyErrorMessage(firstFailure.reason) : null
  if (tracks.status === 'rejected' && artists.status === 'rejected') {
    throw new SpotifyError(error ?? MSG_GENERIC)
  }
  return {
    profile: profile.status === 'fulfilled' ? profile.value : null,
    topTracks: tracks.status === 'fulfilled' ? tracks.value : [],
    topArtists: artists.status === 'fulfilled' ? artists.value : [],
    error,
  }
}

// ---------------------------------------------------------------------------
// Range helpers
// ---------------------------------------------------------------------------

export function spotifyRangeInfo(range: SpotifyRange): SpotifyRangeInfo {
  return SPOTIFY_RANGES.find((r) => r.value === range) ?? SPOTIFY_RANGES[1]
}

/** Spotify window for an app Period ('week' has no equivalent: falls back to short_term). */
export function spotifyRangeForPeriod(period: Period): SpotifyRange {
  return SPOTIFY_RANGES.find((r) => r.period === period)?.value ?? 'short_term'
}

/** Slug for export filenames: `echo-recap-${spotifyFileKey(range)}.png`. */
export function spotifyFileKey(range: SpotifyRange): string {
  return `spotify-${range}`
}

// ---------------------------------------------------------------------------
// Pure mappers
// ---------------------------------------------------------------------------

/** Genres ranked by frequency; ties break by first appearance (higher-ranked artist wins). */
export function topGenres(artists: SpotifyTopArtist[], max = MAX_GENRES): string[] {
  const counts = new Map<string, { count: number; firstSeen: number }>()
  let seen = 0
  for (const artist of artists) {
    for (const genre of artist.genres) {
      const existing = counts.get(genre)
      if (existing) existing.count++
      else counts.set(genre, { count: 1, firstSeen: seen++ })
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[1].firstSeen - b[1].firstSeen)
    .slice(0, max)
    .map(([genre]) => genre)
}

/** Stats for the home number cards (genre count / #1 genre). */
export function spotifyHomeStats(data: SpotifyData): {
  genreCount: number
  topGenre: string
  hasGenres: boolean
} {
  const distinct = new Set(data.topArtists.flatMap((a) => a.genres))
  return {
    genreCount: distinct.size,
    topGenre: topGenres(data.topArtists, 1)[0] ?? '—',
    hasGenres: distinct.size > 0,
  }
}

/**
 * Recap from Spotify's top lists, with raw image URLs (see bakeRecapImages for
 * export). Null when there is nothing to show. No minutes/scrobbles/playcounts.
 */
export function spotifyToRecap(data: SpotifyData, range: SpotifyRange): Recap | null {
  if (data.topArtists.length === 0 && data.topTracks.length === 0) return null
  const topArtists: ArtistStat[] = data.topArtists
    .slice(0, 5)
    .map((a) => ({ name: a.name, image: a.imageUrl }))
  const topTracks: TrackStat[] = data.topTracks
    .slice(0, 5)
    .map((t) => ({ name: t.name, artist: t.artistLine, image: t.album.imageUrl }))
  return {
    source: 'spotify',
    user: data.profile?.displayName || data.profile?.id || 'spotify',
    period: spotifyRangeInfo(range).period,
    topArtists,
    topTracks,
    heroArtist: topArtists[0] ?? null,
    heroImage: topArtists[0]?.image,
    genres: topGenres(data.topArtists),
  }
}

/**
 * Spotify has no "top albums" endpoint: albums are derived from the top tracks,
 * grouped by album, most tracks in the top first, ties broken by the
 * best-ranked track. No play counts.
 */
export function spotifyToAlbums(data: SpotifyData, count: number): AlbumStat[] {
  interface Group {
    first: number
    tracks: number
    name: string
    artist: string
    image?: string
  }
  const groups = new Map<string, Group>()
  data.topTracks.forEach((t, index) => {
    const artist = t.album.artist || t.artistLine
    const key = t.album.id || `${t.album.name}|${artist}`
    const g = groups.get(key)
    if (g) g.tracks++
    else groups.set(key, { first: index, tracks: 1, name: t.album.name, artist, image: t.album.imageUrl })
  })
  return [...groups.values()]
    .sort((a, b) => b.tracks - a.tracks || a.first - b.first)
    .slice(0, Math.max(0, count))
    .map((g) => ({ name: g.name, artist: g.artist, image: g.image }))
}

/** Top-tracks list for the "Top músicas" screen (thumbnail = smallest cover). */
export function spotifyTracksList(data: SpotifyData, limit = 20): TrackStat[] {
  return data.topTracks.slice(0, limit).map((t) => ({
    name: t.name,
    artist: t.artistLine,
    image: t.album.thumbUrl ?? t.album.imageUrl,
  }))
}

// ---------------------------------------------------------------------------
// Image baking (needed before PNG/video export)
// ---------------------------------------------------------------------------

/**
 * Bakes the recap's images into data URLs through the same proxy path Last.fm
 * uses, so the PNG/video export doesn't taint the canvas.
 */
export async function bakeRecapImages(recap: Recap): Promise<Recap> {
  const [heroImage, artistImages, trackImages] = await Promise.all([
    toDataUrl(proxied(recap.heroImage ?? recap.topArtists[0]?.image, 1000)),
    Promise.all(recap.topArtists.map((a) => toDataUrl(proxied(a.image, 300)))),
    Promise.all(recap.topTracks.map((t) => toDataUrl(proxied(t.image, 300)))),
  ])
  const topArtists = recap.topArtists.map((a, i) => ({ ...a, image: artistImages[i] }))
  const topTracks = recap.topTracks.map((t, i) => ({ ...t, image: trackImages[i] }))
  return { ...recap, topArtists, topTracks, heroArtist: topArtists[0] ?? null, heroImage }
}

/** Bakes album covers into square, static data URLs (same sizing rule as the Last.fm collage). */
export async function bakeAlbumImages(albums: AlbumStat[]): Promise<AlbumStat[]> {
  const cols = Math.max(1, Math.round(Math.sqrt(albums.length)))
  const coverSize = Math.max(200, Math.min(500, Math.ceil((1080 / cols) * 1.4)))
  const images = await Promise.all(albums.map((a) => flattenImage(proxied(a.image, coverSize), coverSize)))
  return albums.map((a, i) => ({ ...a, image: images[i] }))
}
