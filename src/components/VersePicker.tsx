import { useRef, useState } from 'react'
import { searchTracks } from '../lib/images'
import type { TrackHit } from '../lib/images'
import { LYRIC_ERROR_TEXT, loadLyricLines } from '../lib/lyricLines'
import type { LyricQuote } from '../lib/screenCtx'
import { ErrorText, HintText, PrimaryButton, TextField } from './ui'
import './VersePicker.css'

type LyricsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; lines: string[] }

/**
 * "Verso do card": search a song, pick ONE lyric line to print on a recap/video
 * card (Android: VersePicker). Picking a verse collapses the picker into a
 * summary with a "Trocar verso" link.
 */
export function VersePicker({
  value,
  onChange,
}: {
  value: LyricQuote | null
  onChange: (quote: LyricQuote | null) => void
}) {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const [results, setResults] = useState<TrackHit[] | null>(null)
  const [selected, setSelected] = useState<TrackHit | null>(null)
  const [lyrics, setLyrics] = useState<LyricsState>({ status: 'idle' })
  const requestRef = useRef(0)

  function reset() {
    requestRef.current++
    setResults(null)
    setSelected(null)
    setLyrics({ status: 'idle' })
    setSearchError(false)
  }

  async function search() {
    const q = query.trim()
    if (!q || searching) return
    reset()
    setSearching(true)
    try {
      setResults(await searchTracks(q))
    } catch {
      setSearchError(true)
    } finally {
      setSearching(false)
    }
  }

  async function selectTrack(hit: TrackHit) {
    const id = ++requestRef.current
    setSelected(hit)
    setLyrics({ status: 'loading' })
    const res = await loadLyricLines(hit.artist, hit.title)
    if (id !== requestRef.current) return
    setLyrics(
      res.kind === 'ok'
        ? { status: 'ready', lines: res.lines }
        : { status: 'error', message: LYRIC_ERROR_TEXT[res.kind] },
    )
  }

  function pickVerse(text: string) {
    if (!selected) return
    onChange({
      text,
      trackTitle: selected.title,
      artist: selected.artist,
      album: selected.album,
      coverUrl: selected.cover,
    })
    reset()
  }

  return (
    <div className="verse-picker">
      <p className="verse-picker__title">Verso do card</p>

      {value ? (
        <div className="verse-picker__chosen">
          {value.coverUrl ? (
            <img className="verse-picker__chosen-cover" src={value.coverUrl} alt="" referrerPolicy="no-referrer" />
          ) : (
            <span className="verse-picker__chosen-cover" aria-hidden="true" />
          )}
          <div className="verse-picker__chosen-body">
            <span className="verse-picker__chosen-title">{value.trackTitle}</span>
            <span className="verse-picker__chosen-meta">
              {[value.artist, value.album].filter(Boolean).join(' · ')}
            </span>
            <span className="verse-picker__chosen-quote">“{value.text}”</span>
            <button
              type="button"
              className="verse-picker__swap"
              onClick={() => {
                reset()
                onChange(null)
              }}
            >
              Trocar verso
            </button>
          </div>
        </div>
      ) : (
        <div className="verse-picker__search">
          <TextField
            value={query}
            onChange={setQuery}
            placeholder="Artista ou música"
            onEnter={search}
            enterKeyHint="search"
            autoComplete="off"
          />
          <PrimaryButton loading={searching} disabled={!query.trim()} onClick={search}>
            Buscar
          </PrimaryButton>
          {searchError && <ErrorText>Não foi possível buscar músicas. Tente novamente.</ErrorText>}

          {results && results.length > 0 && !selected && (
            <ul className="verse-picker__results">
              {results.map((hit) => (
                <li key={hit.id}>
                  <button type="button" className="verse-picker__hit" onClick={() => selectTrack(hit)}>
                    {hit.cover ? (
                      <img
                        className="verse-picker__hit-cover"
                        src={hit.cover}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="verse-picker__hit-cover" aria-hidden="true" />
                    )}
                    <span className="verse-picker__hit-text">
                      <span className="verse-picker__hit-title">{hit.title}</span>
                      <span className="verse-picker__hit-artist">{hit.artist}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {selected && lyrics.status === 'loading' && (
            <span className="ui-spinner ui-spinner--ink verse-picker__spinner" role="status" aria-label="Carregando letra" />
          )}
          {selected && lyrics.status === 'error' && <ErrorText>{lyrics.message}</ErrorText>}
          {selected && lyrics.status === 'ready' && (
            <>
              <HintText>Toque em um verso para escolhê-lo:</HintText>
              <ul className="verse-picker__lines" aria-label="Versos da letra">
                {lyrics.lines.map((line, i) => (
                  <li key={i}>
                    <button type="button" className="verse-picker__line" onClick={() => pickVerse(line)}>
                      {line}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}
