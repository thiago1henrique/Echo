/// <reference types="node" />

// Server-side proxy for lrclib.net's lyrics API.
//
// The browser used to call lrclib.net directly, but that fetch fails with a bare
// "Failed to fetch" whenever CORS, a privacy extension, or an ad-blocker gets in
// the way — the same reason Deezer/Last.fm go through /api/*. Routing here also
// lets us send the User-Agent lrclib asks clients to set, which the browser
// forbids setting on a direct fetch.

interface Req {
  query: Record<string, string | string[] | undefined>
}
interface Res {
  status: (code: number) => Res
  setHeader: (name: string, value: string) => void
  send: (body: string) => void
  json: (body: unknown) => void
}

export default async function handler(req: Req, res: Res) {
  const artist = String(req.query.artist ?? '')
  const track = String(req.query.track ?? '')

  const upstreamUrl =
    `https://lrclib.net/api/get?` +
    `artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(track)}`

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: { 'User-Agent': 'Echo (https://github.com/manguehouse/echo)' },
    })
    const body = await upstream.text()
    if (upstream.ok) {
      // Lyrics for a given track are effectively immutable; cache generously.
      res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=172800')
    }
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.status(upstream.status).send(body)
  } catch {
    res.status(502).json({ error: 'Falha ao contatar o lrclib.' })
  }
}
