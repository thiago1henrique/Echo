import { useEffect, useRef, useState } from 'react'
import type { AlbumStat } from '../types'
import type { ScreenCtx } from '../lib/screenCtx'
import { CollageCard } from '../components/CollageCard'
import { COLLAGE_SIZE } from '../lib/collageFormats'
import { EchoLoadingText } from '../components/Home'
import type { CollageFormat } from '../lib/collageFormats'
import {
  ErrorText,
  Offscreen,
  PrimaryButton,
  ScaledPreview,
  ModelPicker,
  Segmented,
  ModelThumb,
  SecondaryButton,
  useToast,
} from '../components/ui'
import type { ModelItem } from '../components/ui'
import { nodeToPngBlob } from '../lib/exportPng'
import { saveBlob, shareBlob } from '../lib/share'
import './CollageScreen.css'

const GRID_SIZES = [3, 4, 5] as const

type Platform = 'instagram' | 'x'
const PLATFORMS: { value: Platform; label: string }[] = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'x', label: 'X' },
]

/** Layouts per platform: Instagram = square feed + 9:16 stories; X = 4:5 and 16:9 (the square works there too). */
const FORMATS: Record<Platform, { value: CollageFormat; label: string; sub: string }[]> = {
  instagram: [
    { value: 'square', label: 'Grade', sub: 'Feed 1:1' },
    { value: 'story', label: 'Pôster', sub: 'Story' },
    { value: 'destaque', label: 'Destaque', sub: 'Story' },
    { value: 'mural', label: 'Mural', sub: 'Story' },
  ],
  x: [
    { value: 'retrato', label: 'Retrato', sub: '4:5' },
    { value: 'ranking', label: 'Ranking', sub: '4:5' },
    { value: 'painel', label: 'Painel', sub: '16:9' },
    { value: 'square', label: 'Grade', sub: '1:1' },
  ],
}
/** Layouts that are an N×N grid (the others ignore the grid size). */
const GRID_FORMATS: CollageFormat[] = ['square', 'story', 'retrato', 'painel']

const TINTS = ['#3a2a26', '#3a2a22', '#3a1f1a', '#3a332d', '#2d4a3a', '#2a3a4a', '#4f4137', '#3a2d26']

/** Miniature of a collage: an N×N grid of covers (tinted blocks until real covers exist), with the story frame when asked. */
function CollageThumb({ n, story, covers }: { n: number; story: boolean; covers: (string | undefined)[] }) {
  const grid = (
    <span className="collage-thumb__grid" style={{ ['--n' as string]: n }}>
      {Array.from({ length: n * n }, (_, i) => (
        <span key={i} className="collage-thumb__cell" style={{ background: TINTS[i % TINTS.length] }}>
          {covers[i] && <img src={covers[i]} alt="" />}
        </span>
      ))}
    </span>
  )
  if (!story) return <span className="collage-thumb">{grid}</span>
  return (
    <span className="collage-thumb collage-thumb--story">
      <span className="collage-thumb__bar collage-thumb__bar--a" />
      <span className="collage-thumb__bar collage-thumb__bar--b" />
      {grid}
      <span className="collage-thumb__foot" />
    </span>
  )
}

type ExportKind = 'save' | 'instagram' | 'share'

/** Album-cover collage: it builds itself on open; pick grid + format, then save/share the PNG. */
export function CollageScreen({ ctx }: { ctx: ScreenCtx }) {
  const toast = useToast()
  const [n, setN] = useState(4)
  const [platform, setPlatform] = useState<Platform>('instagram')
  const [format, setFormat] = useState<CollageFormat>('square')
  // The grid side the current `albums` were fetched for — the preview keeps using
  // it until a refetch lands, so switching the chip never shows empty cells.
  const [result, setResult] = useState<{ albums: AlbumStat[]; n: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const captureRef = useRef<HTMLDivElement>(null)

  // Same user/period → same data; a different one invalidates the collage.
  const [prevKey, setPrevKey] = useState(ctx.fileKey)
  if (ctx.fileKey !== prevKey) {
    setPrevKey(ctx.fileKey)
    setResult(null)
    setError(null)
  }

  // Drops responses that arrive after a newer request or a user/period change.
  const requestId = useRef(0)
  const keyRef = useRef(ctx.fileKey)
  useEffect(() => {
    keyRef.current = ctx.fileKey
  }, [ctx.fileKey])

  // Opens already generated; a different user/period/source regenerates.
  useEffect(() => {
    if (!ctx.ready) return
    const t = setTimeout(() => void generate(n), 0)
    return () => clearTimeout(t)
    // generate/n are read once per user/period change; the grid chips call generate themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.fileKey, ctx.ready])

  async function generate(size: number) {
    const id = ++requestId.current
    const key = ctx.fileKey
    setLoading(true)
    setError(null)
    try {
      const albums = await ctx.loadAlbums(Math.max(size * size, 16))
      if (id !== requestId.current || key !== keyRef.current) return
      setResult({ albums, n: size })
    } catch (e) {
      if (id !== requestId.current || key !== keyRef.current) return
      setResult(null)
      setError(e instanceof Error && e.message ? e.message : 'Não foi possível carregar os álbuns. Tente novamente.')
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }

  function pickGrid(size: number) {
    if (size === n) return
    setN(size)
    // Refetch for the new grid so no cell is left empty.
    if (ctx.ready) void generate(size)
  }

  async function runExport(kind: ExportKind) {
    const node = captureRef.current
    if (!node || exporting) return
    setExporting(true)
    try {
      await document.fonts?.ready
      const blob = await nodeToPngBlob(node)
      const filename = `echo-collage-${Date.now()}.png`
      if (kind === 'save') {
        saveBlob(blob, filename)
        toast('Colagem salva.')
      } else {
        await shareBlob(blob, filename)
      }
    } catch {
      toast(kind === 'instagram' ? 'Falha ao compartilhar no Instagram.' : 'Falha ao exportar a colagem.')
    } finally {
      setExporting(false)
    }
  }

  function changePlatform(next: Platform) {
    setPlatform(next)
    // Start on the platform's first layout so the selection is always in view.
    setFormat(FORMATS[next][0].value)
  }

  const covers = (result?.albums ?? []).map((a) => a.image)
  const gridItems: ModelItem<number>[] = GRID_SIZES.map((g) => ({
    value: g,
    label: `${g}×${g}`,
    aspect: 1,
    thumb: <CollageThumb n={g} story={false} covers={covers} />,
  }))
  const metaFor = (f: CollageFormat) =>
    GRID_FORMATS.includes(f) ? `${ctx.periodText} · ${n * n} álbuns` : ctx.periodText
  const albums = result?.albums ?? []
  // Real thumbnails of every layout (striped placeholders until the first collage lands).
  const formatItems: ModelItem<CollageFormat>[] = FORMATS[platform].map((f) => {
    const dim = COLLAGE_SIZE[f.value]
    return {
      value: f.value,
      label: f.label,
      sub: f.sub,
      aspect: dim.width / dim.height,
      thumb: (
        <ModelThumb width={dim.width} height={dim.height}>
          <CollageCard albums={albums} size={n} format={f.value} user={ctx.user} source={ctx.source} period={ctx.period} metaText={metaFor(f.value)} />
        </ModelThumb>
      ),
    }
  })

  const px = COLLAGE_SIZE[format]
  const card = result && (
    <CollageCard
      albums={result.albums}
      size={result.n}
      format={format}
      user={ctx.user}
      source={ctx.source} period={ctx.period}
      metaText={metaFor(format)}
    />
  )

  return (
    <>
      <Segmented
        items={PLATFORMS}
        value={platform}
        onChange={changePlatform}
        ariaLabel="Onde vai postar"
      />
      <ModelPicker title="Modelo" items={formatItems} value={format} onChange={setFormat} thumbHeight={112} />
      {GRID_FORMATS.includes(format) && (
        <ModelPicker title="Grade" items={gridItems} value={n} onChange={pickGrid} thumbHeight={72} />
      )}

      {!result && loading && <EchoLoadingText />}
      {(result || error) && (
        <SecondaryButton loading={loading} disabled={!ctx.ready} onClick={() => void generate(n)}>
          {error ? 'Tentar de novo' : 'Atualizar colagem'}
        </SecondaryButton>
      )}

      {error && <ErrorText>{error}</ErrorText>}

      {result && (
        <div className="collage-screen__result">
          <ScaledPreview width={px.width} height={px.height}>
            {card}
          </ScaledPreview>
          <Offscreen>
            <CollageCard
              ref={captureRef}
              albums={result.albums}
              size={result.n}
              format={format}
              user={ctx.user}
              source={ctx.source} period={ctx.period}
              metaText={metaFor(format)}
            />
          </Offscreen>
          <div className="collage-screen__actions">
            <SecondaryButton disabled={exporting} onClick={() => void runExport('save')}>
              Salvar
            </SecondaryButton>
            {platform === 'instagram' && px.height === 1920 && (
              <PrimaryButton disabled={exporting} onClick={() => void runExport('instagram')}>
                Instagram
              </PrimaryButton>
            )}
            <PrimaryButton disabled={exporting} onClick={() => void runExport('share')}>
              Compartilhar
            </PrimaryButton>
          </div>
        </div>
      )}
    </>
  )
}
