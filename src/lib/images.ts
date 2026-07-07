// Image helpers.
//
// Two problems this file solves:
// 1. Last.fm deprecated artist photos (their API returns a placeholder star),
//    so we fetch real artist pictures from Deezer via our server-side proxy (no CORS/JSONP issues).
// 2. Canvas export (html-to-image) taints on cross-origin images. We route every
//    external image through wsrv.nl or directly, keeping them CORS-enabled, so
//    the PNG export works reliably.

interface DeezerArtist {
  picture_xl?: string
  picture_big?: string
  picture_medium?: string
}
interface DeezerArtistSearch {
  data?: DeezerArtist[]
}

interface DeezerAlbum {
  title?: string
  cover_xl?: string
  cover_big?: string
  cover_medium?: string
}
interface DeezerTrack {
  id?: number
  title?: string
  artist?: { name?: string }
  album?: DeezerAlbum
}
interface DeezerTrackSearch {
  data?: DeezerTrack[]
}

/** A track hit from Deezer search, carrying its album cover art. */
export interface TrackHit {
  id: number
  title: string
  artist: string
  album: string
  /** Best available album cover URL, or undefined. */
  cover?: string
}

/** Returns a real artist photo URL from Deezer, or undefined if not found. */
export async function fetchArtistImage(name: string): Promise<string | undefined> {
  try {
    const url = `/api/deezer?type=artist&q=${encodeURIComponent(name)}`
    const res = await fetch(url)
    if (!res.ok) return undefined
    const data = await res.json() as DeezerArtistSearch
    const a = data.data?.[0]
    return a?.picture_xl || a?.picture_big || a?.picture_medium || undefined
  } catch (err) {
    console.error("fetchArtistImage failed for:", name, err)
    return undefined
  }
}

/** Returns the album cover art for a track from Deezer, or undefined. */
export async function fetchTrackCover(
  artist: string,
  track: string,
): Promise<string | undefined> {
  try {
    const q = `artist:"${artist}" track:"${track}"`
    const url = `/api/deezer?type=track&q=${encodeURIComponent(q)}`
    const res = await fetch(url)
    if (!res.ok) return undefined
    const data = await res.json() as DeezerTrackSearch
    const album = data.data?.[0]?.album
    return album?.cover_xl || album?.cover_big || album?.cover_medium || undefined
  } catch (err) {
    console.error("fetchTrackCover failed for:", artist, track, err)
    return undefined
  }
}

/**
 * Searches Deezer for tracks matching a free-text query, returning up to `limit`
 * hits with their album cover art. Used by the lyric mode to let the user pick a
 * song (and thus its album cover) by name.
 */
export async function searchTracks(query: string, limit = 8): Promise<TrackHit[]> {
  const q = query.trim()
  if (!q) return []
  try {
    const url = `/api/deezer?type=track&limit=${limit}&q=${encodeURIComponent(q)}`
    const res = await fetch(url)
    if (!res.ok) return []
    const data = (await res.json()) as DeezerTrackSearch
    const hits = (data.data ?? [])
      .filter((t): t is DeezerTrack & { id: number } => typeof t.id === 'number')
      .map((t) => ({
        id: t.id,
        title: t.title ?? '',
        artist: t.artist?.name ?? '',
        album: t.album?.title ?? '',
        cover: t.album?.cover_xl || t.album?.cover_big || t.album?.cover_medium || undefined,
      }))
    // Deezer often returns the same track from multiple albums/singles; dedupe by
    // "title — artist" so the picker isn't cluttered with near-identical rows.
    const seen = new Set<string>()
    return hits.filter((h) => {
      const key = `${h.title.toLowerCase()}—${h.artist.toLowerCase()}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  } catch (err) {
    console.error('searchTracks failed for:', query, err)
    return []
  }
}

/**
 * Wraps any image URL in the weserv proxy so it is served with CORS headers
 * (required for fetching cross-origin images into a data URL). Optionally resizes.
 */
export function proxied(url: string | undefined, size?: number): string | undefined {
  if (!url) return undefined

  // Spotify and Last.fm image CDNs natively support CORS and send Access-Control-Allow-Origin: *.
  // Fetching them directly bypasses public proxies (like wsrv.nl), which are often blocked
  // by ad-blockers, tracking protection, private DNS, and Incognito mode.
  const hasNativeCors =
    url.includes('scdn.co') ||
    url.includes('spotifycdn.com') ||
    url.includes('lastfm.freetls.fastly.net') ||
    url.includes('fastly.net')

  if (hasNativeCors) {
    return url
  }

  const sizeParam = size ? `&w=${size}&h=${size}&fit=cover` : ''
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}${sizeParam}`
}

/**
 * Fetches an image and returns it as a self-contained data URL.
 *
 * We bake images into data URLs (rather than letting html-to-image fetch them
 * at export time) because its internal blob cache keys by URL *path only* —
 * all our proxy URLs share the same path, so they would collide and every
 * image in the PNG would become a copy of the first one loaded.
 */
export async function toDataUrl(url: string | undefined): Promise<string | undefined> {
  if (!url) return undefined

  let fetchUrl = url
  if (url.startsWith('http://') || url.startsWith('https://')) {
    const sep = url.includes('?') ? '&' : '?'
    fetchUrl = `${url}${sep}_cb=${Date.now()}`
  }

  try {
    const res = await fetch(fetchUrl, { referrerPolicy: 'no-referrer' })
    if (!res.ok) {
      console.warn("toDataUrl got non-ok response, falling back to cache-busted url:", res.status, fetchUrl)
      return fetchUrl
    }
    const blob = await res.blob()
    return await new Promise<string | undefined>((resolve) => {
      const fr = new FileReader()
      fr.onload = () => resolve(fr.result as string)
      fr.onerror = () => {
        console.warn("toDataUrl file reader error, falling back to cache-busted url:", fetchUrl)
        resolve(fetchUrl)
      }
      fr.readAsDataURL(blob)
    })
  } catch (err) {
    console.warn("toDataUrl fetch exception, falling back to cache-busted url:", fetchUrl, err)
    return fetchUrl
  }
}
