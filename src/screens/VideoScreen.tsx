import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { ClipTimeline } from '../components/ClipTimeline'
import { RecapCard } from '../components/RecapCard'
import { VersePicker } from '../components/VersePicker'
import {
  ErrorText,
  HintText,
  MonoLabel,
  Offscreen,
  PrimaryButton,
  ScaledPreview,
  SecondaryButton,
  Segmented,
  useToast,
} from '../components/ui'
import { exportCardVideo } from '../lib/videoExport'
import { saveBlob, shareBlob } from '../lib/share'
import type { LyricQuote, ScreenCtx } from '../lib/screenCtx'
import './VideoScreen.css'

// Video tab (Android VideoRecapEditor): pick a clip, slide a fixed-length window
// along it, preview it playing behind the recap card's hero, export an MP4.

type Format = 'story' | 'feed'
type ClipLength = 7 | 10 | 15

/** Canvas + hero rect per format. The hero must match the card CSS (see VideoScreen.css). */
const EXPORT: Record<Format, { canvasW: number; canvasH: number; hero: { x: number; y: number; w: number; h: number } }> = {
  story: { canvasW: 1080, canvasH: 1920, hero: { x: 0, y: 0, w: 1080, h: 760 } },
  feed: { canvasW: 1600, canvasH: 900, hero: { x: 0, y: 0, w: 620, h: 900 } },
}

const MIN_CLIP = 1
const DEFAULT_CLIP: ClipLength = 10

// Firefox can't record MP4 natively and the slow ffmpeg fallback isn't shipped
// for it, so video export is disabled there (the legacy app did the same).
const IS_FIREFOX =
  typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('firefox')

const READ_ERROR = 'Não foi possível ler esse vídeo. Escolha outro arquivo.'
const EXPORT_ERROR = 'Falha ao exportar o vídeo. Tente novamente com outro trecho ou arquivo.'

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

/** Reads a video's duration via a detached <video> (handles containers that report Infinity). */
function readDuration(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = document.createElement('video')
    probe.preload = 'metadata'
    const timer = window.setTimeout(() => settle(new Error('timeout')), 10_000)
    function settle(err: Error | null, value = 0) {
      window.clearTimeout(timer)
      probe.onloadedmetadata = null
      probe.onseeked = null
      probe.onerror = null
      probe.removeAttribute('src')
      probe.load()
      if (err) reject(err)
      else resolve(value)
    }
    const valid = (d: number) => Number.isFinite(d) && d > 0
    probe.onerror = () => settle(new Error('read'))
    probe.onloadedmetadata = () => {
      if (valid(probe.duration)) return settle(null, probe.duration)
      // Some containers (e.g. WebM from MediaRecorder) report Infinity until a seek to the end.
      probe.onseeked = () => (valid(probe.duration) ? settle(null, probe.duration) : settle(new Error('duration')))
      probe.currentTime = 1e101
    }
    probe.src = url
  })
}

function PlayIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="#111111" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

export function VideoScreen({ ctx }: { ctx: ScreenCtx }) {
  const toast = useToast()
  const recap = ctx.recap

  const [format, setFormat] = useState<Format>('story')
  const [quote, setQuote] = useState<LyricQuote | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Video + trim window. The effective window is derived (see `len`/`start`).
  const [videoUrl, setVideoUrl] = useState('')
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [videoDur, setVideoDur] = useState(0)
  const [clipLength, setClipLength] = useState<ClipLength>(DEFAULT_CLIP)
  const [trimStart, setTrimStart] = useState(0)
  const [previewPlaying, setPreviewPlaying] = useState(true)

  // Export state.
  const [exporting, setExporting] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [exported, setExported] = useState<{ blob: Blob; ext: 'mp4' | 'webm' } | null>(null)
  const [sharing, setSharing] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewVideoRef = useRef<HTMLVideoElement>(null)
  const exportVideoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  const hasVideo = videoUrl !== '' && videoDur > 0
  const hasRecap = recap != null

  // Effective window (Android: len = min(preset, max(dur, 1)), start clamped to fit).
  const len = Math.min(clipLength, Math.max(videoDur, MIN_CLIP))
  const start = clamp(trimStart, 0, Math.max(videoDur - len, 0))
  const trimEnd = start + len

  // Release the object URL when it is replaced or the screen goes away.
  useEffect(() => {
    if (!videoUrl) return
    return () => URL.revokeObjectURL(videoUrl)
  }, [videoUrl])

  // Preview loop: stay inside [start, trimEnd]. Seek whenever the window moves.
  useEffect(() => {
    const v = previewVideoRef.current
    if (!v || !videoUrl) return
    const seek = () => {
      try {
        v.currentTime = start
      } catch {
        /* metadata not ready yet */
      }
    }
    seek()
    v.addEventListener('loadedmetadata', seek)
    const id = window.setInterval(() => {
      if (v.currentTime >= trimEnd || v.currentTime < start - 0.25) seek()
    }, 200)
    return () => {
      window.clearInterval(id)
      v.removeEventListener('loadedmetadata', seek)
    }
  }, [videoUrl, hasRecap, start, trimEnd])

  // Preview play/pause: user toggle, paused while exporting and while the tab is hidden.
  const playing = previewPlaying && !exporting
  useEffect(() => {
    const v = previewVideoRef.current
    if (!v || !videoUrl) return
    const play = () => {
      v.play().catch((err: unknown) => {
        // Autoplay with sound can be refused; fall back to muted rather than not playing.
        if ((err as DOMException)?.name === 'NotAllowedError') {
          v.muted = true
          v.play().catch(() => {})
        }
      })
    }
    const sync = () => {
      if (document.hidden || !playing) v.pause()
      else play()
    }
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => {
      document.removeEventListener('visibilitychange', sync)
      v.pause()
    }
  }, [videoUrl, hasRecap, playing])

  const invalidate = useCallback(() => setExported(null), [])

  function changeFormat(f: Format) {
    setFormat(f)
    invalidate()
  }
  function changeQuote(q: LyricQuote | null) {
    setQuote(q)
    invalidate()
  }
  function changeStart(t: number) {
    setTrimStart(t)
    invalidate()
  }
  function changeLength(n: ClipLength) {
    const nextLen = Math.min(n, Math.max(videoDur, MIN_CLIP))
    setClipLength(n)
    setTrimStart(clamp(trimStart, 0, Math.max(videoDur - nextLen, 0)))
    invalidate()
  }

  async function onPickVideo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    invalidate()
    const url = URL.createObjectURL(file)
    try {
      const d = await readDuration(url)
      setVideoUrl(url)
      setVideoFile(file)
      setVideoDur(Math.max(d, MIN_CLIP))
      setTrimStart(0)
      setPreviewPlaying(true)
    } catch {
      URL.revokeObjectURL(url)
      setVideoUrl('')
      setVideoFile(null)
      setVideoDur(0)
      setTrimStart(0)
      setError(READ_ERROR)
    }
  }

  async function handleExport() {
    const overlayNode = overlayRef.current
    const video = exportVideoRef.current
    if (!overlayNode || !video || !videoFile || IS_FIREFOX) return
    setError(null)
    setExported(null)
    setExporting(true)
    setStatus('Preparando…')
    try {
      const { blob, ext } = await exportCardVideo({
        overlayNode,
        video,
        file: videoFile,
        ...EXPORT[format],
        start,
        duration: len,
        onStatus: setStatus,
      })
      setExported({ blob, ext })
      if (ext === 'webm') {
        setError('Não consegui gerar MP4 neste navegador, então o arquivo saiu em WebM. Tente no Chrome ou no Edge para obter MP4.')
      }
    } catch (err) {
      console.error('Falha ao exportar o vídeo:', err)
      setError(EXPORT_ERROR)
    } finally {
      setExporting(false)
      setStatus(null)
    }
  }

  const fileName = `echo-video-${ctx.fileKey}.${exported?.ext ?? 'mp4'}`

  function handleSave() {
    if (!exported) return
    setError(null)
    try {
      saveBlob(exported.blob, fileName)
      toast('Vídeo salvo.')
    } catch {
      setError('Falha ao salvar o vídeo.')
    }
  }

  async function handleShare() {
    if (!exported) return
    setError(null)
    setSharing(true)
    try {
      const result = await shareBlob(exported.blob, fileName)
      if (result === 'downloaded') toast('Vídeo salvo.')
    } catch {
      setError('Falha ao compartilhar o vídeo.')
    } finally {
      setSharing(false)
    }
  }

  if (!recap) {
    return ctx.recapLoading ? null : <HintText>Ainda não há dados suficientes para montar isto.</HintText>
  }

  const quoteText = quote?.text
  const quoteSong = quote ? [quote.trackTitle, quote.artist].filter(Boolean).join(', ') : undefined
  const size = EXPORT[format]
  const busy = exporting || sharing

  return (
    <div className="video-screen">
      <div className="video-screen__group" inert={exporting}>
        <Segmented
          ariaLabel="Formato"
          items={[
            { value: 'story' as Format, label: 'Story' },
            { value: 'feed' as Format, label: 'Feed' },
          ]}
          value={format}
          onChange={changeFormat}
        />

        <VersePicker value={quote} onChange={changeQuote} />

        {error && <ErrorText center>{error}</ErrorText>}

        <div className="video-screen__preview">
          <ScaledPreview width={size.canvasW} height={size.canvasH}>
            <div className="video-screen__card">
              {videoUrl && (
                <video
                  ref={previewVideoRef}
                  className={`video-screen__hero-video video-screen__hero-video--${format}`}
                  style={{ width: size.hero.w, height: size.hero.h }}
                  src={videoUrl}
                  loop
                  playsInline
                  preload="auto"
                  aria-hidden="true"
                />
              )}
              <div className="video-screen__layer">
                <RecapCard
                  recap={recap}
                  variant={format}
                  quote={quoteText}
                  quoteSong={quoteSong}
                  mode={videoUrl ? 'overlay' : 'normal'}
                />
              </div>
            </div>
          </ScaledPreview>
          {videoUrl && (
            <button
              type="button"
              className={`video-screen__hit video-screen__hit--${format}`}
              aria-label={previewPlaying ? 'Pausar' : 'Reproduzir'}
              onClick={() => setPreviewPlaying((p) => !p)}
            >
              {!previewPlaying && (
                <span className="video-screen__disc">
                  <PlayIcon />
                </span>
              )}
            </button>
          )}
        </div>

        {IS_FIREFOX && (
          <HintText>
            Indisponível no Firefox: ele não consegue gravar vídeo em MP4, então o clipe não pode ser exportado por aqui.
            Abra no Chrome, Edge ou Safari para usar o vídeo.
          </HintText>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          hidden
          onChange={onPickVideo}
          disabled={IS_FIREFOX}
        />
        <SecondaryButton onClick={() => fileInputRef.current?.click()} disabled={IS_FIREFOX}>
          {videoUrl ? 'Trocar vídeo' : 'Escolher vídeo do aparelho'}
        </SecondaryButton>

        {hasVideo && (
          <>
            <MonoLabel>Trecho</MonoLabel>
            <ClipTimeline duration={videoDur} start={start} window={len} onStartChange={changeStart} />

            <MonoLabel>Duração</MonoLabel>
            <Segmented
              ariaLabel="Duração do trecho"
              items={[
                { value: 7 as ClipLength, label: '7 S' },
                { value: 10 as ClipLength, label: '10 S' },
                { value: 15 as ClipLength, label: '15 S' },
              ]}
              value={clipLength}
              onChange={changeLength}
            />
          </>
        )}
      </div>

      {hasVideo && (
        <PrimaryButton onClick={handleExport} loading={exporting} disabled={IS_FIREFOX || sharing}>
          Exportar vídeo
        </PrimaryButton>
      )}
      {status && (
        <p className="video-screen__status" role="status" aria-live="polite">
          {status}
        </p>
      )}

      {exported && (
        <div className="video-screen__actions">
          <SecondaryButton onClick={handleSave} disabled={busy}>
            Salvar
          </SecondaryButton>
          <PrimaryButton onClick={handleShare} disabled={busy}>
            Compartilhar
          </PrimaryButton>
        </div>
      )}

      {/* Off-screen capture targets: the transparent-hero card and the clip the exporter decodes. */}
      {hasVideo && (
        <Offscreen>
          <div className="video-screen__card">
            <RecapCard
              ref={overlayRef}
              recap={recap}
              variant={format}
              quote={quoteText}
              quoteSong={quoteSong}
              mode="overlay"
              videoUrl={videoUrl}
              paused
            />
          </div>
          <video ref={exportVideoRef} src={videoUrl} muted playsInline preload="auto" />
        </Offscreen>
      )}
    </div>
  )
}
