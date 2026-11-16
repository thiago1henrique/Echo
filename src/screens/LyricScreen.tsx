import { useEffect, useMemo, useRef, useState } from 'react'
import { EchoLoadingText } from '../components/Home'
import { LyricCard } from '../components/LyricCard'
import type { CardStyle } from '../components/LyricCard'
import { ModelPicker, ModelThumb, Offscreen, PrimaryButton, ScaledPreview, SecondaryButton, Segmented, TextField, ErrorText, HintText, useToast } from '../components/ui'
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

  return (
    <div className="lyric-screen">
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

      <Segmented items={FORMAT_ITEMS} value={format} onChange={setFormat} ariaLabel="Formato do card" />

      {results && results.length > 0 && !selected && (
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
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <div className="lyric-screen__track" ref={trackBlockRef}>
          <p className="lyric-screen__track-title">
            {selected.title} · {selected.artist}
          </p>
          {lyrics.status === 'loading' && (
            <div className="lyric-screen__pad">
              <EchoLoadingText />
            </div>
          )}
          {lyrics.status === 'error' && (
            <div className="lyric-screen__pad lyric-screen__pad--error">
              <ErrorText>{lyrics.message}</ErrorText>
            </div>
          )}
          {lines && (
            <>
              <div className="lyric-screen__tip">
                <HintText>Toque em até 4 versos para destacá-los:</HintText>
              </div>
              <ul className="lyric-screen__lines" aria-label="Versos da letra">
                {lines.map((line, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      className={`lyric-screen__line${picked.has(i) ? ' is-picked' : ''}`}
                      aria-pressed={picked.has(i)}
                      onClick={() => toggleLine(i)}
                    >
                      {line}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {hasVerse && (
        <div className="lyric-screen__style">
          <ModelPicker
            title="Estilo do card"
            items={styleItems}
            value={style}
            onChange={setStyle}
            thumbHeight={format === 'story' ? 128 : 84}
          />
          <ScaledPreview width={w} height={h}>
            {renderCard()}
          </ScaledPreview>
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
