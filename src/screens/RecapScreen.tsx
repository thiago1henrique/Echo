import { useEffect, useMemo, useRef, useState } from 'react'
import type { Ref } from 'react'
import type { Recap } from '../types'
import type { LyricQuote, ScreenCtx } from '../lib/screenCtx'
import { nodeToPngBlob } from '../lib/exportPng'
import { proxied, toDataUrl } from '../lib/images'
import { saveBlob, shareBlob } from '../lib/share'
import { POSTER_ANIM_MS, POSTER_LOOP_MS, POSTER_LOOP_WAIT_MS, posterVideoSupported } from '../lib/posterTiming'
import { RecapCard } from '../components/RecapCard'
import { CartazCard, DashCard, MiniCard } from '../components/RecapTemplates'
import { AuraCard, BarrasCard, CapaCard, MosaicoCard, ReciboCard } from '../components/RecapTemplatesExtra'
import { VersePicker } from '../components/VersePicker'
import {
  ErrorText,
  ModelPicker,
  ModelThumb,
  Offscreen,
  PrimaryButton,
  ScaledPreview,
  SecondaryButton,
} from '../components/ui'
import type { ModelItem } from '../components/ui'
import './RecapScreen.css'

type Format = 'story' | 'feed'
type Template = 'cartaz' | 'foto' | 'dash' | 'mini' | 'recibo' | 'mosaico' | 'barras' | 'aura' | 'capa'

const TEMPLATE_LABELS: Record<Template, string> = {
  cartaz: 'Cartaz',
  foto: 'Foto',
  dash: 'Dash',
  mini: 'Mini',
  recibo: 'Recibo',
  mosaico: 'Mosaico',
  barras: 'Barras',
  aura: 'Aura',
  capa: 'Capa',
}

/** One story card per template; `anim` drives the Cartaz intro, `verse` the Foto quote. */
function storyCard(
  template: Template,
  recap: Recap,
  ref?: Ref<HTMLDivElement>,
  anim: Anim = FINAL,
  verse?: LyricQuote,
) {
  switch (template) {
    case 'cartaz':
      return <CartazCard ref={ref} recap={recap} {...anim} />
    case 'foto':
      return <RecapCard ref={ref} recap={recap} variant="story" verse={verse} />
    case 'dash':
      return <DashCard ref={ref} recap={recap} />
    case 'mini':
      return <MiniCard ref={ref} recap={recap} />
    case 'recibo':
      return <ReciboCard ref={ref} recap={recap} />
    case 'mosaico':
      return <MosaicoCard ref={ref} recap={recap} />
    case 'barras':
      return <BarrasCard ref={ref} recap={recap} />
    case 'aura':
      return <AuraCard ref={ref} recap={recap} />
    case 'capa':
      return <CapaCard ref={ref} recap={recap} />
  }
}

const SIZE: Record<Format, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  feed: { width: 1600, height: 900 },
}

interface Anim {
  progress: number
  loop: number
  clock: number
}
const FINAL: Anim = { progress: 1, loop: 0, clock: 0 }

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * Live animation of the Cartaz preview: the 4.2s intro, then only the words of
 * the orange block loop (1.8s wait + 2.4s pass), while the covers drift with `clock`.
 * When inactive (or with reduced motion) it returns the final static state.
 */
function usePosterAnim(active: boolean): Anim {
  const [anim, setAnim] = useState<Anim>({ progress: 0, loop: 0, clock: 0 })
  const animate = active && !prefersReducedMotion()
  useEffect(() => {
    if (!animate) return
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = now - start
      const after = t - POSTER_ANIM_MS
      let loop = 0
      if (after > 0) {
        const c = after % (POSTER_LOOP_WAIT_MS + POSTER_LOOP_MS)
        loop = c < POSTER_LOOP_WAIT_MS ? 0 : (c - POSTER_LOOP_WAIT_MS) / POSTER_LOOP_MS
      }
      setAnim({ progress: Math.min(1, t / POSTER_ANIM_MS), loop, clock: t / 1000 })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [animate])
  return animate ? anim : FINAL
}

// rAF is paused in background tabs; the timeout keeps an export from stalling there.
const nextFrame = () =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, 100)
    requestAnimationFrame(() => {
      clearTimeout(t)
      resolve()
    })
  })

export function RecapScreen({ ctx }: { ctx: ScreenCtx }) {
  const [format, setFormat] = useState<Format>('story')
  const [template, setTemplate] = useState<Template>('cartaz')
  const [quote, setQuote] = useState<LyricQuote | null>(null)
  const [exporting, setExporting] = useState(false)
  const [videoPct, setVideoPct] = useState<number | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const captureRef = useRef<HTMLDivElement>(null)
  const videoOk = posterVideoSupported()

  // Keep the preview while a refresh is loading; an error (recap null, not loading) clears it.
  const [last, setLast] = useState<Recap | null>(ctx.recap)
  if (ctx.recap && ctx.recap !== last) setLast(ctx.recap)
  const recap = ctx.recap ?? (ctx.recapLoading ? last : null)

  // The verse cover is baked into a data URL so the PNG export is not tainted.
  const [cover, setCover] = useState<{ src: string; data?: string } | null>(null)
  const coverSrc = quote?.coverUrl
  useEffect(() => {
    if (!coverSrc) return
    let live = true
    toDataUrl(proxied(coverSrc, 300)).then((data) => {
      if (live) setCover({ src: coverSrc, data })
    })
    return () => {
      live = false
    }
  }, [coverSrc])
  const verse: LyricQuote | undefined = quote
    ? { ...quote, coverUrl: coverSrc && cover?.src === coverSrc ? cover.data : undefined }
    : undefined

  const isStory = format === 'story'
  const isPoster = isStory && template === 'cartaz'
  const showVerse = !isStory || template === 'foto'
  const anim = usePosterAnim(isPoster && !exporting && !!recap)


  // Real (static, final-state) thumbnails of every layout. Memoized so the poster's
  // animation ticks, which re-render this screen every frame, don't re-render them.
  const templateItems = useMemo<ModelItem<Template>[]>(
    () =>
      (Object.keys(TEMPLATE_LABELS) as Template[]).map((value) => ({
        value,
        label: TEMPLATE_LABELS[value],
        aspect: 9 / 16,
        thumb: recap ? (
          <ModelThumb width={1080} height={1920}>
            {storyCard(value, recap)}
          </ModelThumb>
        ) : (
          <span className="ui-model__ph" />
        ),
      })),
    [recap],
  )
  const formatItems = useMemo<ModelItem<Format>[]>(() => {
    const story = recap ? storyCard(template, recap) : null
    return [
      {
        value: 'story',
        label: 'Story',
        aspect: 9 / 16,
        thumb: recap ? <ModelThumb width={1080} height={1920}>{story}</ModelThumb> : <span className="ui-model__ph" />,
      },
      {
        value: 'feed',
        label: 'Feed',
        aspect: 16 / 9,
        thumb: recap ? <ModelThumb width={1600} height={900}><RecapCard recap={recap} variant="feed" /></ModelThumb> : <span className="ui-model__ph" />,
      },
    ]
  }, [recap, template])

  const fileName = `echo-recap-${ctx.fileKey}`
  const error = exportError ?? ctx.recapError

  const renderCard = (r: Recap, ref?: Ref<HTMLDivElement>, live?: Anim) => {
    if (!isStory) return <RecapCard ref={ref} recap={r} variant="feed" verse={verse} />
    return storyCard(template, r, ref, live, verse)
  }

  const capturePng = async (): Promise<Blob> => {
    // Let fonts settle and the capture copy paint (2 frames) before snapshotting the final state.
    await document.fonts.ready
    await nextFrame()
    await nextFrame()
    const node = captureRef.current
    if (!node) throw new Error('Card indisponível.')
    return nodeToPngBlob(node)
  }

  const run = async (failure: string, job: () => Promise<void>) => {
    setExporting(true)
    setExportError(null)
    try {
      await job()
    } catch (err) {
      console.error(err)
      setExportError(failure)
    } finally {
      setExporting(false)
      setVideoPct(null)
    }
  }

  const makeVideo = async (): Promise<Blob> => {
    if (!recap) throw new Error('Sem recap.')
    const { renderPosterVideo } = await import('../lib/posterVideo')
    setVideoPct(0)
    return renderPosterVideo(recap, { onProgress: setVideoPct })
  }

  const savePng = () =>
    run('Falha ao salvar a imagem.', async () => {
      saveBlob(await capturePng(), `${fileName}.png`)
    })
  const saveVideo = () =>
    run('Falha ao gerar o vídeo.', async () => {
      saveBlob(await makeVideo(), `${fileName}.mp4`)
    })
  const shareVideo = () =>
    run('Falha ao gerar o vídeo.', async () => {
      await shareBlob(await makeVideo(), `${fileName}.mp4`)
    })
  // On the web "Instagram" is the system share sheet with the PNG (no ADD_TO_STORY intent).
  const shareInstagram = () =>
    run('Falha ao compartilhar no Instagram.', async () => {
      await shareBlob(await capturePng(), `${fileName}.png`)
    })
  const sharePng = () =>
    run('Falha ao compartilhar a imagem.', async () => {
      await shareBlob(await capturePng(), `${fileName}.png`)
    })

  const videoLabel = exporting ? `Gerando vídeo…${videoPct != null ? ` ${videoPct}%` : ''}` : 'Salvar vídeo'

  return (
    <div className="recap-screen">
      <ModelPicker title="Formato" items={formatItems} value={format} onChange={setFormat} thumbHeight={120} />
      {isStory && <ModelPicker title="Modelo" items={templateItems} value={template} onChange={setTemplate} />}
      {showVerse && <VersePicker value={quote} onChange={setQuote} />}

      <PrimaryButton
        onClick={() => {
          setExportError(null)
          ctx.reloadRecap()
        }}
        disabled={!ctx.ready || exporting}
        loading={ctx.recapLoading}
      >
        {recap ? 'Atualizar recap' : 'Gerar recap'}
      </PrimaryButton>

      {error && <ErrorText center>{error}</ErrorText>}

      {recap && (
        <div className="recap-screen__result">
          <ScaledPreview width={SIZE[format].width} height={SIZE[format].height}>
            {renderCard(recap, undefined, anim)}
          </ScaledPreview>
          <Offscreen>{renderCard(recap, captureRef)}</Offscreen>

          <div className="recap-screen__actions">
            <SecondaryButton disabled={exporting} onClick={savePng}>
              Salvar
            </SecondaryButton>
            {isPoster && videoOk && (
              <SecondaryButton disabled={exporting} onClick={saveVideo}>
                {videoLabel}
              </SecondaryButton>
            )}
            {isPoster && videoOk && (
              <PrimaryButton disabled={exporting} onClick={shareVideo}>
                Compartilhar vídeo
              </PrimaryButton>
            )}
            {isStory && (
              <PrimaryButton disabled={exporting} onClick={shareInstagram}>
                Instagram
              </PrimaryButton>
            )}
            <PrimaryButton disabled={exporting} onClick={sharePng}>
              Compartilhar
            </PrimaryButton>
          </div>
        </div>
      )}
    </div>
  )
}
