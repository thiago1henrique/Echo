// Fetches lyrics from lrclib.net (free, no key) via our /api/lyrics proxy —
// calling lrclib directly from the browser fails with "Failed to fetch" when
// CORS/an extension blocks it, so we go through the server like Deezer/Last.fm.
// Returns the lyric lines (non-empty, trimmed) so the user can pick a verse,
// plus the time-synced lyrics (LRC) when lrclib has them.

interface LrclibResp {
  plainLyrics?: string | null
  syncedLyrics?: string | null
  instrumental?: boolean
}

/** One time-synced lyric line: `t` is the start time in seconds. */
export interface SyncedLine {
  t: number
  text: string
}

/** Splits plain lyrics into non-empty, trimmed lines. */
function toLines(plain: string): string[] {
  return plain
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
}

/**
 * Parses an LRC string into time-sorted lines. Handles multiple timestamps on a
 * single line (e.g. `[00:12.00][01:45.30]text`) and both `.xx` and `.xxx`
 * fractions. Lines with no text (blank) are dropped so they don't blank the card.
 */
export function parseLrc(lrc: string): SyncedLine[] {
  const out: SyncedLine[] = []
  const stamp = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g
  for (const raw of lrc.split('\n')) {
    stamp.lastIndex = 0
    const times: number[] = []
    let m: RegExpExecArray | null
    let lastEnd = 0
    while ((m = stamp.exec(raw))) {
      const min = Number(m[1])
      const sec = Number(m[2])
      const frac = m[3] ? Number(`0.${m[3]}`) : 0
      times.push(min * 60 + sec + frac)
      lastEnd = m.index + m[0].length
    }
    if (times.length === 0) continue
    const text = raw.slice(lastEnd).trim()
    if (!text) continue
    for (const t of times) out.push({ t, text })
  }
  return out.sort((a, b) => a.t - b.t)
}

/**
 * Index of the active line for a given song time (seconds): the last line whose
 * start time is <= songTime, or -1 before the first line. `lines` must be sorted
 * by `t` (parseLrc guarantees this). Binary search — called per frame on export.
 */
export function activeLineIndex(lines: SyncedLine[], songTime: number): number {
  let lo = 0
  let hi = lines.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].t <= songTime) {
      ans = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return ans
}

/**
 * Fetches both plain and time-synced lyrics for a track. `plain` always has the
 * pickable lines (empty if none); `synced` is empty when lrclib has no LRC, in
 * which case the caller should fall back to the manual-verse flow.
 */
export async function fetchSyncedLyrics(
  artist: string,
  track: string,
): Promise<{ plain: string[]; synced: SyncedLine[] }> {
  const url =
    `/api/lyrics?` +
    `artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(track)}`

  const res = await fetch(url)
  if (res.status === 404) return { plain: [], synced: [] }
  if (!res.ok) throw new Error(`Falha ao buscar a letra (${res.status}).`)

  const data = (await res.json()) as LrclibResp
  if (data.instrumental) return { plain: [], synced: [] }

  const plain = data.plainLyrics ? toLines(data.plainLyrics) : []
  const synced = data.syncedLyrics ? parseLrc(data.syncedLyrics) : []
  return { plain, synced }
}

export async function fetchLyricLines(
  artist: string,
  track: string,
): Promise<string[]> {
  const { plain } = await fetchSyncedLyrics(artist, track)
  return plain
}
