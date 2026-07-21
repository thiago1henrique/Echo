// Image helpers.
//
// Two problems this file solves:
// 1. Last.fm deprecated artist photos (their API returns a placeholder star),
//    so we fetch real artist pictures from Deezer via our server-side proxy (no CORS/JSONP issues).
// 2. Canvas export (html-to-image) taints on cross-origin images. We route every
//    external image through wsrv.nl or directly, keeping them CORS-enabled, so
//    the PNG export works reliably.

interface DeezerArtist {
  name?: string
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

/** Returns the artist photo Last.fm shows on its site (scraped og:image), or undefined. */
async function fetchLastfmArtistImage(name: string): Promise<string | undefined> {
  try {
    const url = `/api/lastfm-image?artist=${encodeURIComponent(name)}`
    const res = await fetch(url)
    if (!res.ok) return undefined
    const data = (await res.json()) as { image?: string | null }
    return data.image || undefined
  } catch (err) {
    console.error('fetchLastfmArtistImage failed for:', name, err)
    return undefined
  }
}

// Deezer serves this hash (MD5 of the empty string) as its "artist has no photo"
// placeholder — a black square. Treat any URL carrying it as "no image".
const DEEZER_EMPTY = 'd41d8cd98f00b204e9800998ecf8427e'

/**
 * Returns an artist photo URL from Deezer, or undefined if not found.
 *
 * Deezer's search ranks by popularity, not name match — for famous names that
 * also match an obscure act's tags (e.g. "David Bowie", "The Cure") the first
 * hit can be that obscure artist with no photo, while the real artist sits
 * lower in the results. Fetch a few candidates and prefer an exact (case
 * insensitive) name match over blindly trusting data[0].
 */
async function fetchDeezerArtistImage(name: string): Promise<string | undefined> {
  try {
    const url = `/api/deezer?type=artist&limit=5&q=${encodeURIComponent(name)}`
    const res = await fetch(url)
    if (!res.ok) return undefined
    const data = await res.json() as DeezerArtistSearch
    const candidates = data.data ?? []
    const pictureOf = (a: DeezerArtist) => {
      const pic = a.picture_xl || a.picture_big || a.picture_medium
      return pic && !pic.includes(DEEZER_EMPTY) ? pic : undefined
    }
    const exact = candidates.find((a) => a.name?.toLowerCase() === name.toLowerCase())
    return (exact && pictureOf(exact)) ?? candidates.map(pictureOf).find(Boolean)
  } catch (err) {
    console.error("fetchDeezerArtistImage failed for:", name, err)
    return undefined
  }
}

/**
 * Returns a real artist photo URL. Prefers the photo Last.fm shows on its own
 * site (scraped from the artist page's og:image — the JSON API only returns a
 * grey star placeholder), falling back to Deezer when Last.fm has no photo.
 */
export async function fetchArtistImage(name: string): Promise<string | undefined> {
  const lastfm = await fetchLastfmArtistImage(name)
  if (lastfm) return lastfm
  return fetchDeezerArtistImage(name)
}

/** Runs a single Deezer track search and returns the first hit's cover URL. */
async function deezerCover(query: string): Promise<string | undefined> {
  const url = `/api/deezer?type=track&q=${encodeURIComponent(query)}`
  const res = await fetch(url)
  if (!res.ok) return undefined
  const data = (await res.json()) as DeezerTrackSearch
  const album = data.data?.[0]?.album
  return album?.cover_xl || album?.cover_big || album?.cover_medium || undefined
}

/**
 * Returns the album cover art for a track from Deezer, or undefined.
 *
 * Last.fm track names often carry qualifiers Deezer's strict advanced search
 * won't match ("Bad - 2012 Remaster", "Swimming Pools (Drank) [Extended]"), so
 * a single `artist:"…" track:"…"` query returns zero hits and the cover comes
 * back blank. We try progressively looser queries and take the first that hits.
 */
export async function fetchTrackCover(
  artist: string,
  track: string,
): Promise<string | undefined> {
  // Drop trailing qualifiers: everything from the first " - ", "(" or "[".
  const clean = track.replace(/\s*[-–—([].*$/, '').trim() || track
  const queries = [
    `artist:"${artist}" track:"${track}"`, // exact match
    `artist:"${artist}" track:"${clean}"`, // suffix stripped
    `${artist} ${clean}`.trim(), // loose free-text
  ]
  // Dedupe so we don't fire identical requests when there's no suffix to strip.
  for (const q of [...new Set(queries)]) {
    try {
      const cover = await deezerCover(q)
      if (cover) return cover
    } catch (err) {
      console.error('fetchTrackCover query failed:', q, err)
    }
  }
  return undefined
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

/**
 * Loads an image and bakes a single, static square frame of it into a JPEG data
 * URL by drawing it once onto a canvas.
 *
 * This is what freezes animated GIF covers (Last.fm/Deezer occasionally serve a
 * GIF as album art): drawing an <img> to a canvas captures only the frame shown
 * at load time — the first one — so the collage stays a still image and the PNG
 * export never catches a mid-animation frame. It also center-crops to a square
 * and resizes, so every cover comes out uniform regardless of its source.
 *
 * The source must be CORS-enabled (all our covers go through `proxied`, which
 * guarantees that) or the canvas taints and export/read-back would throw — we
 * fall back to the plain data URL in that case so a cover is never lost.
 */
export function flattenImage(
  url: string | undefined,
  size: number,
): Promise<string | undefined> {
  if (!url) return Promise.resolve(undefined)
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(toDataUrl(url))
          return
        }
        // Center-crop the (possibly non-square) source to a square, then scale.
        const s = Math.min(img.naturalWidth, img.naturalHeight) || size
        const sx = (img.naturalWidth - s) / 2
        const sy = (img.naturalHeight - s) / 2
        ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size)
        resolve(canvas.toDataURL('image/jpeg', 0.9))
      } catch {
        // Tainted canvas (source wasn't CORS-clean) — keep the raw cover.
        resolve(toDataUrl(url))
      }
    }
    img.onerror = () => resolve(undefined)
    img.src = url
  })
}
