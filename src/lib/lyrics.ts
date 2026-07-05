// Fetches lyrics from lrclib.net (free, no key, CORS-enabled).
// Returns the lyric lines (non-empty, trimmed) so the user can pick a verse.

interface LrclibResp {
  plainLyrics?: string | null
  instrumental?: boolean
}

export async function fetchLyricLines(
  artist: string,
  track: string,
): Promise<string[]> {
  const url =
    `https://lrclib.net/api/get?` +
    `artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(track)}`

  const res = await fetch(url)
  if (res.status === 404) return []
  if (!res.ok) throw new Error(`Falha ao buscar a letra (${res.status}).`)

  const data = (await res.json()) as LrclibResp
  if (data.instrumental || !data.plainLyrics) return []

  return data.plainLyrics
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
}
