// "Discover" tab: a single album recommendation seeded from the user's own
// Last.fm taste, refreshed at the start of each day-part (madrugada, manhã,
// tarde, noite) instead of on every visit — see slotKey() below.

import {
  getAlbumGenre,
  getAlbumInfo,
  getArtistGenre,
  getArtistInfo,
  getArtistTopAlbums,
  getSimilarArtists,
  getTopArtists,
} from './lastfm'
import { fetchAlbumReleaseYear, proxied, toDataUrl } from './images'

export interface AlbumRecommendation {
  album: string
  artist: string
  year?: number
  genre?: string
  description?: string
  /** True when `description` is the artist's bio, not this album's own wiki
   *  entry (falls back there for anything without album-level coverage). */
  descriptionIsArtist?: boolean
  image?: string
  /** The user's own top artist that led to this pick, shown as the "why". */
  seedArtist: string
}

class RecommendError extends Error {}

/** djb2 string hash — deterministic across devices/browsers, unlike Math.random(). */
function stableSeed(input: string): number {
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i)
  }
  return hash >>> 0
}

export type DaySlot = 'madrugada' | 'manhã' | 'tarde' | 'noite'

/** Which of the four day-parts a given moment falls into (local time). */
export function currentSlot(date: Date = new Date()): DaySlot {
  const h = date.getHours()
  if (h < 6) return 'madrugada'
  if (h < 12) return 'manhã'
  if (h < 18) return 'tarde'
  return 'noite'
}

/** Changes exactly at the four day-part boundaries (00h/06h/12h/18h). */
export function slotKey(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}-${currentSlot(date)}`
}

/**
 * Picks a fresh album recommendation from outside the user's own top artists:
 * seeds from one of their recent top Last.fm artists, follows Last.fm's
 * "similar artists" graph to something adjacent they likely don't already
 * listen to, then surfaces that artist's most-played album. Description comes
 * from Last.fm's wiki; release year from Deezer, since neither Last.fm API
 * exposes one reliably.
 */
export async function fetchRecommendation(
  userRaw: string,
  slot: string = slotKey(),
): Promise<AlbumRecommendation> {
  const user = userRaw.trim()
  if (!user) throw new RecommendError('Informe seu usuário do Last.fm.')

  const topArtists = await getTopArtists(user, 'month', 10)
  if (topArtists.length === 0) {
    throw new RecommendError('Não encontrei artistas suficientes no seu histórico recente.')
  }
  const known = new Set(topArtists.map((a) => a.name.toLowerCase()))
  // Deterministic pick from user + day-part slot (not Math.random()) so the
  // same account gets the same seed artist on every device/browser, matching
  // the "muda a cada período do dia" promise shown in the UI.
  const seedIndex = stableSeed(`${user.toLowerCase()}|${slot}`) % topArtists.length
  const seed = topArtists[seedIndex]

  const similar = await getSimilarArtists(seed.name, 10)
  const candidate = similar.find((name) => !known.has(name.toLowerCase())) ?? similar[0]
  if (!candidate) {
    throw new RecommendError(`Não encontrei artistas parecidos com ${seed.name}.`)
  }

  const albums = await getArtistTopAlbums(candidate, 5)
  if (albums.length === 0) {
    throw new RecommendError(`${candidate} não tem álbuns catalogados no Last.fm.`)
  }
  const topAlbum = albums.reduce((best, a) => (a.playcount > best.playcount ? a : best))

  // Artist info/tags are fetched alongside the album's own — they back up
  // both the description (plenty of albums outside the mainstream catalog
  // have no wiki entry of their own) and the genre.
  const [info, artistInfo, albumGenre, artistGenre, year] = await Promise.all([
    getAlbumInfo(candidate, topAlbum.name),
    getArtistInfo(candidate),
    getAlbumGenre(candidate, topAlbum.name),
    getArtistGenre(candidate),
    fetchAlbumReleaseYear(candidate, topAlbum.name),
  ])
  const image = await toDataUrl(proxied(topAlbum.lfmImage ?? info.lfmImage, 500))

  const description = info.summary ?? artistInfo.summary
  const descriptionIsArtist = !info.summary && !!artistInfo.summary
  // Artist-level tagging is consistently cleaner than album-level (which
  // skews toward fan/name tags on niche or joint-credit albums), so it takes
  // priority; the album's own tags are only a fallback for when the artist
  // has none at all.
  const genre = artistGenre ?? albumGenre

  return {
    album: topAlbum.name,
    artist: candidate,
    year,
    genre,
    description,
    descriptionIsArtist,
    image,
    seedArtist: seed.name,
  }
}

// ---- Per-slot cache (localStorage) ----
// Keeps the same pick for the whole day-part instead of re-rolling on every
// tab visit; a new pick is only fetched once the slot key moves on.

// Bumped whenever AlbumRecommendation's shape changes (e.g. adding `genre`) or
// its content source changes (e.g. adding `lang=pt` to the Last.fm calls) so
// stale entries don't get served back until the next day-part boundary.
const CACHE_PREFIX = 'echo_recommend_v3_'

interface CachedRecommendation {
  slot: string
  data: AlbumRecommendation
}

function cacheKey(user: string): string {
  return CACHE_PREFIX + user.trim().toLowerCase()
}

export function getCachedRecommendation(user: string, slot: string): AlbumRecommendation | null {
  try {
    const raw = localStorage.getItem(cacheKey(user))
    if (!raw) return null
    const cached = JSON.parse(raw) as CachedRecommendation
    return cached.slot === slot ? cached.data : null
  } catch {
    return null
  }
}

export function setCachedRecommendation(user: string, slot: string, data: AlbumRecommendation): void {
  try {
    localStorage.setItem(cacheKey(user), JSON.stringify({ slot, data } satisfies CachedRecommendation))
  } catch {
    // Storage full/unavailable — the recommendation still works for this
    // session, it just won't persist across reloads.
  }
}
