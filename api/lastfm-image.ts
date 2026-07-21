/// <reference types="node" />

// Server-side scraper for Last.fm artist photos.
//
// Last.fm's JSON API (artist.getInfo / user.gettopartists) stopped returning
// real artist images years ago — the `image` array is now a grey star
// placeholder. The public artist PAGE, however, still renders the real photo
// (the same one the app shows) and exposes it in its <meta property="og:image">
// tag. We fetch that page here and extract the URL.
//
// Done server-side because last.fm's HTML pages aren't CORS-enabled, so the
// browser can't scrape them directly. Only the artist name is used to build a
// fixed last.fm URL, so this can't be turned into an open proxy.

interface Req {
  url?: string
  query: Record<string, string | string[] | undefined>
}
interface Res {
  status: (code: number) => Res
  setHeader: (name: string, value: string) => void
  send: (body: string) => void
  json: (body: unknown) => void
}

// The star placeholder Last.fm serves for imageless artists — treat as "no photo".
const PLACEHOLDER = '2a96cbd8b46e442fc41c2b86b821562f'

// Reads a query param straight from the raw URL, still percent-encoded. The
// framework's pre-parsed req.query can mis-decode UTF-8 as latin1, turning
// "Facção" into "FacÃ§Ã£o" — which then points at a nonexistent Last.fm page and
// hands back the star placeholder. Decoding the raw bytes ourselves (UTF-8, via
// decodeURIComponent) keeps accented names intact.
function rawParam(url: string | undefined, key: string): string | undefined {
  const qs = url?.split('?')[1]
  if (!qs) return undefined
  for (const pair of qs.split('&')) {
    const eq = pair.indexOf('=')
    if (eq !== -1 && pair.slice(0, eq) === key) return pair.slice(eq + 1)
  }
  return undefined
}

export default async function handler(req: Req, res: Res) {
  const raw = rawParam(req.url, 'artist')?.replace(/\+/g, '%20')
  let artist = ''
  if (raw) {
    try {
      artist = decodeURIComponent(raw).trim()
    } catch {
      artist = ''
    }
  }
  // Last resort if the raw URL wasn't available (may be mis-decoded, but rare).
  if (!artist) artist = String(req.query.artist ?? '').trim()
  if (!artist) {
    res.status(400).json({ error: 'Informe o artista.' })
    return
  }

  const pageUrl = `https://www.last.fm/music/${encodeURIComponent(artist)}`
  try {
    const upstream = await fetch(pageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EchoRecap/1.0)' },
    })
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: `Last.fm respondeu ${upstream.status}.` })
      return
    }
    const html = await upstream.text()
    // <meta property="og:image" content="…"> — tolerate arbitrary whitespace
    // and attribute order between the property and content attributes.
    const match =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
    const image = match?.[1]
    res.setHeader('Content-Type', 'application/json; charset=utf-8')

    if (!image || image.includes(PLACEHOLDER)) {
      // Short cache for misses: a transient scrape failure shouldn't lock an
      // artist out of their real photo for a full day.
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
      res.status(200).json({ image: null })
      return
    }
    // Found artists' photos rarely change — cache hits hard at the edge.
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=172800')
    res.status(200).json({ image })
  } catch {
    res.status(502).json({ error: 'Falha ao contatar o Last.fm.' })
  }
}
