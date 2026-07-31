/// <reference types="node" />

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
  const q = String(req.query.q ?? '')
  const type = String(req.query.type ?? 'artist')
  const id = String(req.query.id ?? '')
  // Clamp the requested result count to a sane range (default 1, max 25).
  const limit = Math.min(25, Math.max(1, Number(req.query.limit) || 1))

  // Deezer's search endpoints never return an album's release date — only the
  // full album resource does — so `type=album` with an `id` fetches that
  // resource directly instead of searching.
  let upstreamUrl: string
  if (type === 'album' && id) {
    upstreamUrl = `https://api.deezer.com/album/${encodeURIComponent(id)}`
  } else if (type === 'album') {
    upstreamUrl = `https://api.deezer.com/search/album?limit=${limit}&q=${encodeURIComponent(q)}`
  } else if (type === 'artist') {
    upstreamUrl = `https://api.deezer.com/search/artist?limit=${limit}&q=${encodeURIComponent(q)}`
  } else {
    upstreamUrl = `https://api.deezer.com/search?limit=${limit}&q=${encodeURIComponent(q)}`
  }

  try {
    const upstream = await fetch(upstreamUrl)
    const body = await upstream.text()
    if (upstream.ok) {
      // Cache the response at the edge for 24 hours, stale-while-revalidate for 48 hours
      res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=172800')
    }
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.status(upstream.status).send(body)
  } catch {
    res.status(502).json({ error: 'Falha ao contatar o Deezer.' })
  }
}
