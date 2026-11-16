import { parseLrc } from './lyrics'

// Android-style resolution of a track's pickable lyric lines (LyricScreen.kt
// selectTrack): instrumental -> error, synced lines (LRC, time-sorted, repeated
// choruses kept as separate entries) when present, otherwise the plain lyrics.
// Unlike lib/lyrics.ts this tells "instrumental" apart from "not found" so the
// UI can show the exact Android messages.

interface LrclibResp {
  plainLyrics?: string | null
  syncedLyrics?: string | null
  instrumental?: boolean
}

export type LyricLinesResult =
  | { kind: 'ok'; lines: string[] }
  | { kind: 'instrumental' }
  | { kind: 'notfound' }
  | { kind: 'error' }

export const LYRIC_ERROR_TEXT: Record<Exclude<LyricLinesResult['kind'], 'ok'>, string> = {
  instrumental: 'Faixa instrumental — sem letra.',
  notfound: 'Letra não encontrada.',
  error: 'Falha ao buscar a letra.',
}

export async function loadLyricLines(artist: string, track: string): Promise<LyricLinesResult> {
  try {
    const res = await fetch(
      `/api/lyrics?artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(track)}`,
    )
    if (res.status === 404) return { kind: 'notfound' }
    if (!res.ok) return { kind: 'error' }
    const data = (await res.json()) as LrclibResp
    if (data.instrumental) return { kind: 'instrumental' }
    const synced = data.syncedLyrics ? parseLrc(data.syncedLyrics).map((l) => l.text) : []
    const lines =
      synced.length > 0
        ? synced
        : (data.plainLyrics ?? '')
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l.length > 0)
    return lines.length > 0 ? { kind: 'ok', lines } : { kind: 'notfound' }
  } catch {
    return { kind: 'error' }
  }
}
