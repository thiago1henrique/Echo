import { useEffect, useMemo, useRef, useState } from 'react'
import { EchoLoadingText } from '../components/Home'
import { LyricCard } from '../components/LyricCard'
import type { CardStyle } from '../components/LyricCard'
import { ModelPicker, ModelThumb, MonoLabel, Offscreen, PrimaryButton, ScaledPreview, SecondaryButton, Segmented, ErrorText, HintText, useToast } from '../components/ui'
import type { ModelItem } from '../components/ui'
import { nodeToPngBlob } from '../lib/exportPng'
import { proxied, searchTracks, toDataUrl } from '../lib/images'
import type { TrackHit } from '../lib/images'
import { LYRIC_ERROR_TEXT, loadLyricLines } from '../lib/lyricLines'
import type { ScreenCtx } from '../lib/screenCtx'
import { saveBlob, shareBlob } from '../lib/share'
import './LyricScreen.css'

type Format = 'story' | 'feed'

const MAX_SELECTED_LINES = 4

const FORMAT_SIZE: Record<Format, { w: number; h: number }> = {
  story: { w: 1080, h: 1920 },
  feed: { w: 1600, h: 900 },
}

const FORMAT_ITEMS: { value: Format; label: string }[] = [
  { value: 'story', label: 'Story' },
  { value: 'feed', label: 'Feed' },
]

const STYLE_ITEMS: { value: CardStyle; label: string }[] = [
  { value: 'default', label: 'Padrão' },
  { value: 'abnt', label: 'ABNT' },
  { value: 'vinyl', label: 'Vinil' },
  { value: 'cassette', label: 'Fita K7' },
  { value: 'polaroid', label: 'Polaroid' },
  { value: 'synthwave', label: 'Synthwave' },
]

type LyricsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; lines: string[] }

// The Letra screen doesn't use the shell context (no Last.fm user needed).
export function LyricScreen(props: { ctx: ScreenCtx }) {
  void props
  const toast = useToast()

  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const [results, setResults] = useState<TrackHit[] | null>(null)
  const [format, setFormat] = useState<Format>('story')

  const [selected, setSelected] = useState<TrackHit | null>(null)
  const [lyrics, setLyrics] = useState<LyricsState>({ status: 'idle' })
  // Selection is by INDEX (choruses repeat the same text on several lines).
  const [picked, setPicked] = useState<Set<number>>(() => new Set())

  const [style, setStyle] = useState<CardStyle>('default')
  const [exporting, setExporting] = useState(false)
  const [cover, setCover] = useState<{ src: string; url: string | undefined } | null>(null)

  const trackBlockRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const captureRef = useRef<HTMLDivElement>(null)
  const requestRef = useRef(0)

  const lines = lyrics.status === 'ready' ? lyrics.lines : null
  const verse = useMemo(
    () =>
      lines
        ? [...picked]
            .sort((a, b) => a - b)
            .map((i) => lines[i])
            .join('\n')
        : '',
    [lines, picked],
  )
  const hasVerse = picked.size > 0 && !!selected

  // Bake the cover into a data URL (see toDataUrl) so the PNG never depends on
  // the image proxy being reachable at export time.
  const coverSrc = selected?.cover
  useEffect(() => {
    if (!coverSrc) return
    let active = true
    toDataUrl(proxied(coverSrc, 1000)).then((url) => {
      if (active) setCover({ src: coverSrc, url })
    })
    return () => {
      active = false
    }
  }, [coverSrc])
  const coverReady = !coverSrc || cover?.src === coverSrc
  const coverUrl = cover && cover.src === coverSrc ? cover.url : undefined

  // Bring the track block into view once the lyric lines arrive.
  useEffect(() => {
    if (!lines) return
    trackBlockRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [lines])

  async function search() {
    const q = query.trim()
    if (!q || searching) return
    requestRef.current++
    setSearchError(false)
    setSelected(null)
    setLyrics({ status: 'idle' })
    setPicked(new Set())
    setSearching(true)
    try {
      setResults(await searchTracks(q))
    } catch {
      setSearchError(true)
      setResults(null)
    } finally {
      setSearching(false)
    }
  }

  async function selectTrack(hit: TrackHit) {
    const id = ++requestRef.current
    setSelected(hit)
    setPicked(new Set())
    setLyrics({ status: 'loading' })
    const res = await loadLyricLines(hit.artist, hit.title)
    if (id !== requestRef.current) return
    setLyrics(
      res.kind === 'ok'
        ? { status: 'ready', lines: res.lines }
        : { status: 'error', message: LYRIC_ERROR_TEXT[res.kind] },
    )
  }

  function toggleLine(index: number) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else if (next.size < MAX_SELECTED_LINES) next.add(index)
      else return prev
      return next
    })
  }

  async function exportCard(share: boolean) {
    const node = captureRef.current
    if (!node || exporting) return
    setExporting(true)
    try {
      const blob = await nodeToPngBlob(node)
      const name = `echo-lyric-${Date.now()}.png`
      if (share) {
        await shareBlob(blob, name)
      } else {
        saveBlob(blob, name)
        toast('Card salvo.')
      }
    } catch (err) {
      console.error('lyric export failed', err)
      toast('Falha ao exportar o card.')
    } finally {
      setExporting(false)
    }
  }

  const { w, h } = FORMAT_SIZE[format]
  const renderCard = (ref?: React.Ref<HTMLDivElement>) =>
    selected && (
      <LyricCard
        ref={ref}
        variant={format}
        title={selected.title}
        artist={selected.artist}
        album={selected.album}
        cover={coverUrl}
        quote={verse}
        style={style}
      />
    )

  // Real thumbnails of the six styles, with the picked verse on them.
  const styleItems: ModelItem<CardStyle>[] = STYLE_ITEMS.map((st) => ({
    value: st.value,
    label: st.label,
    aspect: w / h,
    thumb: selected ? (
      <ModelThumb width={w} height={h}>
        <LyricCard
          variant={format}
          title={selected.title}
          artist={selected.artist}
          album={selected.album}
          cover={coverUrl}
          quote={verse}
          style={st.value}
        />
      </ModelThumb>
    ) : null,
  }))

  // Order of the picked lines (1–4) → badge shown on each picked line.
  const pickOrder = useMemo(() => new Map([...picked].sort((a, b) => a - b).map((idx, n) => [idx, n + 1])), [picked])
  const full = picked.size >= MAX_SELECTED_LINES

  function changeTrack() {
    requestRef.current++
    setSelected(null)
    setLyrics({ status: 'idle' })
    setPicked(new Set())
  }

  const showResults = !selected && (searching || results !== null)

  return (
    <div className="lyric-screen">
      {/* 1 · Busca ------------------------------------------------------- */}
      {!selected && (
        <form
          className="lyric-screen__search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault()
            search()
          }}
        >
          <svg className="lyric-screen__search-icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4.5 4.5" />
          </svg>
          <input
            className="lyric-screen__input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Artista ou música"
            aria-label="Artista ou música"
            enterKeyHint="search"
            autoComplete="off"
            autoFocus
          />
          {query && (
            <button
              type="button"
              className="lyric-screen__clear"
              aria-label="Limpar busca"
              onClick={() => {
                setQuery('')
                setResults(null)
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m7 7 10 10M17 7 7 17" />
              </svg>
            </button>
          )}
          <button type="submit" className="lyric-screen__go" disabled={!query.trim() || searching}>
            {searching ? <span className="ui-spinner" aria-label="Buscando" /> : 'Buscar'}
          </button>
        </form>
      )}
      {!selected && searchError && <ErrorText>Não foi possível buscar músicas. Tente novamente.</ErrorText>}

      {!selected && !showResults && (
        <div className="lyric-screen__empty">
          <span className="lyric-screen__empty-mark" aria-hidden="true">“</span>
          <p className="lyric-screen__empty-title">Transforme um verso em card</p>
          <p className="lyric-screen__empty-text">
            Busque uma música, escolha até 4 versos e compartilhe no story ou no feed.
          </p>
        </div>
      )}

      {!selected && showResults && (
        <section className="lyric-screen__results-wrap" aria-label="Resultados da busca" aria-busy={searching}>
          {searching && (
            <ul className="lyric-screen__results" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((n) => (
                <li key={n} className="lyric-screen__hit lyric-screen__hit--skeleton">
                  <span className="lyric-screen__hit-cover" />
                  <span className="lyric-screen__hit-text">
                    <span className="lyric-screen__sk lyric-screen__sk--title" />
                    <span className="lyric-screen__sk lyric-screen__sk--artist" />
                  </span>
                </li>
              ))}
            </ul>
          )}
          {!searching && results && results.length === 0 && (
            <p className="lyric-screen__none">
              Nenhuma música encontrada para “{query.trim()}”. Tente o nome do artista junto com o da música.
            </p>
          )}
          {!searching && results && results.length > 0 && (
            <>
              <MonoLabel>{results.length} resultados</MonoLabel>
              <ul className="lyric-screen__results">
                {results.map((hit) => (
                  <li key={hit.id}>
                    <button type="button" className="lyric-screen__hit" onClick={() => selectTrack(hit)}>
                      {hit.cover ? (
                        <img
                          className="lyric-screen__hit-cover"
                          src={hit.cover}
                          alt=""
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="lyric-screen__hit-cover" aria-hidden="true" />
                      )}
                      <span className="lyric-screen__hit-text">
                        <span className="lyric-screen__hit-title">{hit.title}</span>
                        <span className="lyric-screen__hit-artist">{hit.artist}</span>
                      </span>
                      <svg className="lyric-screen__chev" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="m9 6 6 6-6 6" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {/* 2 · Versos ------------------------------------------------------ */}
      {selected && (
        <div className="lyric-screen__track" ref={trackBlockRef}>
          <div className="lyric-screen__now">
            {selected.cover ? (
              <img className="lyric-screen__now-cover" src={selected.cover} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span className="lyric-screen__now-cover" aria-hidden="true" />
            )}
            <span className="lyric-screen__hit-text">
              <span className="lyric-screen__now-title">{selected.title}</span>
              <span className="lyric-screen__hit-artist">{selected.artist}</span>
            </span>
            <button type="button" className="lyric-screen__change" onClick={changeTrack}>
              Trocar
            </button>
          </div>

          {lyrics.status === 'loading' && (
            <div className="lyric-screen__pad">
              <EchoLoadingText />
            </div>
          )}
          {lyrics.status === 'error' && (
            <div className="lyric-screen__pad">
              <ErrorText>{lyrics.message}</ErrorText>
              <button type="button" className="lyric-screen__change lyric-screen__change--solo" onClick={changeTrack}>
                Escolher outra música
              </button>
            </div>
          )}
          {lines && (
            <>
              <div className="lyric-screen__counter" aria-live="polite">
                <HintText>Toque nos versos que quer destacar.</HintText>
                <span className="lyric-screen__dots" aria-label={`${picked.size} de ${MAX_SELECTED_LINES} versos`}>
                  {Array.from({ length: MAX_SELECTED_LINES }, (_, n) => (
                    <i key={n} className={n < picked.size ? 'is-on' : ''} />
                  ))}
                </span>
              </div>
              <div className="lyric-screen__reader">
                <ul className="lyric-screen__lines" aria-label="Versos da letra">
                  {lines.map((line, i) => {
                    const on = picked.has(i)
                    return (
                      <li key={i}>
                        <button
                          type="button"
                          className={`lyric-screen__line${on ? ' is-picked' : ''}${!on && full ? ' is-locked' : ''}`}
                          aria-pressed={on}
                          onClick={() => toggleLine(i)}
                        >
                          <span className="lyric-screen__order" aria-hidden="true">
                            {pickOrder.get(i)}
                          </span>
                          <span>{line}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
              {picked.size > 0 && (
                <div className="lyric-screen__pickbar">
                  <button type="button" className="lyric-screen__change" onClick={() => setPicked(new Set())}>
                    Limpar
                  </button>
                  <button
                    type="button"
                    className="lyric-screen__see"
                    onClick={() => cardRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })}
                  >
                    Ver card ↓
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 3 · Card -------------------------------------------------------- */}
      {hasVerse && (
        <div className="lyric-screen__style" ref={cardRef}>
          <MonoLabel>Seu card</MonoLabel>
          <Segmented items={FORMAT_ITEMS} value={format} onChange={setFormat} ariaLabel="Formato do card" />
          <ScaledPreview width={w} height={h}>
            {renderCard()}
          </ScaledPreview>
          <ModelPicker
            title="Estilo do card"
            items={styleItems}
            value={style}
            onChange={setStyle}
            thumbHeight={format === 'story' ? 128 : 84}
          />
          <Offscreen>{renderCard(captureRef)}</Offscreen>
          <div className="lyric-screen__actions">
            <SecondaryButton disabled={exporting || !coverReady} onClick={() => exportCard(false)}>
              Salvar
            </SecondaryButton>
            <PrimaryButton disabled={exporting || !coverReady} onClick={() => exportCard(true)}>
              Compartilhar
            </PrimaryButton>
          </div>
        </div>
      )}
    </div>
  )
}
