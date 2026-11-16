// MP4 export of the "Cartaz" recap template.
//
// 258 frames @ 30fps (~8.6s: 4.2s intro + 1s hold + one 2.4s word-loop pass +
// 1s hold, so it loops cleanly), H.264 1080×1920 via mediabunny.
//
// Capturing the whole DOM card once per frame (html-to-image re-clones,
// re-serialises and makes the browser re-decode fonts + images for every frame)
// cost ~1s/frame. Every animated thing in the Cartaz is only an opacity /
// translate / scale of a piece, so instead:
//   1. each animated piece (brand, words, track rows…) is captured ONCE, in its
//      final state, as a transparent sprite (~21 captures instead of ~200);
//   2. every frame is composited on a plain 2D canvas from `posterState`: glow
//      gradient, the orange block (clipped group with the drifting covers, the
//      words, tag and dot) and the sprites with their per-frame offset/alpha.
// The final state is the same DOM the PNG export captures, so it matches it.

import { createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { getFontEmbedCSS, toCanvas } from 'html-to-image'
import { BufferTarget, CanvasSource, Mp4OutputFormat, Output } from 'mediabunny'
import type { Recap } from '../types'
import { CartazCard } from '../components/RecapTemplates'
import {
  POSTER_FPS,
  POSTER_FRAMES,
  posterFrameInputs,
  posterState,
  posterStateKey,
  posterVideoSupported,
} from './posterTiming'
import type { PosterState } from './posterTiming'

const WIDTH = 1080
const HEIGHT = 1920
// H.264 Main profile, level 4.0 (1080×1920 = 8160 macroblocks, the level's max).
const AVC_CODEC = 'avc1.4D0028'
const VIDEO_BITRATE = 8_000_000
const BG = '#0F0D0C'
// Orange block geometry (page coordinates), same numbers as RecapTemplates.css.
const BLOCK = { x: 60, y: 280, w: 960, h: 860, r: 96 }
/** Share of the progress bar given to the sprite capture phase. */
const CAPTURE_SHARE = 0.25

/** img.decode() needs the page to be painting; cap the wait so a background tab never stalls the export. */
const decodeSoon = (img: HTMLImageElement) =>
  Promise.race([img.decode().catch(() => undefined), new Promise<void>((r) => setTimeout(r, 2000))])

// rAF is paused in background tabs; the timeout keeps an export from stalling there.
const nextFrame = () =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, 100)
    requestAnimationFrame(() => {
      clearTimeout(t)
      resolve()
    })
  })

interface Sprite {
  canvas: HTMLCanvasElement
  /** Top-left of the crop in page coordinates. */
  x: number
  y: number
}

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

function roundRectPath(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath()
  c.moveTo(x + r, y)
  c.arcTo(x + w, y, x + w, y + h, r)
  c.arcTo(x + w, y + h, x, y + h, r)
  c.arcTo(x, y + h, x, y, r)
  c.arcTo(x, y, x + w, y, r)
  c.closePath()
}

/** object-fit: cover, centered. */
function drawCover(c: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const k = Math.max(w / img.naturalWidth, h / img.naturalHeight)
  const dw = img.naturalWidth * k
  const dh = img.naturalHeight * k
  c.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.src = src
  await img.decode()
  return img
}

export interface PosterVideoOptions {
  /** 0..100, called as the export advances. */
  onProgress?: (percent: number) => void
  signal?: AbortSignal
}

/** Renders the Cartaz of `recap` to a 1080×1920 H.264 MP4. */
export async function renderPosterVideo(recap: Recap, opts: PosterVideoOptions = {}): Promise<Blob> {
  const { onProgress, signal } = opts
  if (!posterVideoSupported()) throw new Error('WebCodecs indisponível neste navegador.')
  const accent = recap.source === 'spotify' ? '#1DB954' : '#E0472D'
  const throwIfAborted = () => {
    if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError')
  }

  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${WIDTH}px;height:${HEIGHT}px;pointer-events:none;`
  document.body.appendChild(host)
  const root = createRoot(host)

  try {
    flushSync(() => {
      root.render(createElement(CartazCard, { recap }))
    })
    const node = host.firstElementChild as HTMLElement | null
    if (!node) throw new Error('Falha ao montar o cartaz.')

    await document.fonts.ready
    await Promise.all([
      document.fonts.load('800 100px "Bricolage Grotesque Variable"'),
      document.fonts.load('600 100px "Bricolage Grotesque Variable"'),
      document.fonts.load('700 20px "Space Mono"'),
      document.fonts.load('400 20px "Space Mono"'),
    ]).catch(() => undefined)
    await Promise.all(Array.from(node.querySelectorAll('img')).map(decodeSoon))
    await nextFrame()

    // ---- 1. Sprites: one transparent capture per animated piece ----
    node.classList.add('rt--sprites')
    const fontEmbedCSS = await getFontEmbedCSS(node, { preferredFontFormat: 'woff2' })
    const nodeRect = node.getBoundingClientRect()
    const els = Array.from(node.querySelectorAll<HTMLElement>('[data-sprite]'))
    const sprites = new Map<string, Sprite>()
    for (let i = 0; i < els.length; i++) {
      throwIfAborted()
      const el = els[i]
      const id = el.dataset.sprite as string
      const r = el.getBoundingClientRect()
      // Padding covers glyph overhang past the line box; words get extra room.
      const pad = id === 'ghost' || id === 'name' || id === 'recap' ? 80 : 24
      const x0 = Math.max(0, Math.floor(r.left - nodeRect.left - pad))
      const y0 = Math.max(0, Math.floor(r.top - nodeRect.top - pad))
      const x1 = Math.min(WIDTH, Math.ceil(r.right - nodeRect.left + pad))
      const y1 = Math.min(HEIGHT, Math.ceil(r.bottom - nodeRect.top + pad))
      const shot = await toCanvas(node, {
        pixelRatio: 1,
        fontEmbedCSS,
        width: WIDTH,
        height: HEIGHT,
        cacheBust: false,
        // Keep only `el` (with its ancestors and descendants), on a transparent card.
        filter: (n) => el.contains(n) || n.contains(el),
        style: { background: 'transparent' },
      })
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, x1 - x0)
      canvas.height = Math.max(1, y1 - y0)
      canvas.getContext('2d')?.drawImage(shot, x0, y0, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height)
      sprites.set(id, { canvas, x: x0, y: y0 })
      onProgress?.(Math.round(((i + 1) / els.length) * CAPTURE_SHARE * 100))
    }

    // Covers that drift behind the words are drawn directly (no DOM needed).
    const coverUrls = Array.from(
      new Set(recap.topTracks.map((t) => t.image).filter((u): u is string => !!u)),
    )
    const covers = (await Promise.all(coverUrls.map((u) => loadImage(u).catch(() => null)))).filter(
      (img): img is HTMLImageElement => img !== null,
    )

    // ---- 2. Compositor ----
    const canvas = document.createElement('canvas')
    canvas.width = WIDTH
    canvas.height = HEIGHT
    const ctx = canvas.getContext('2d')
    const blockCanvas = document.createElement('canvas')
    blockCanvas.width = BLOCK.w
    blockCanvas.height = BLOCK.h
    const bctx = blockCanvas.getContext('2d')
    if (!ctx || !bctx) throw new Error('Canvas 2D indisponível.')
    ctx.imageSmoothingQuality = 'high'
    bctx.imageSmoothingQuality = 'high'

    /** Draws sprite `id` shifted by `dy`, with `alpha`, into `c` whose origin is page (ox, oy). */
    const put = (c: CanvasRenderingContext2D, id: string, dy: number, alpha: number, ox = 0, oy = 0) => {
      const sp = sprites.get(id)
      if (!sp || alpha <= 0) return
      c.globalAlpha = Math.min(1, alpha)
      c.drawImage(sp.canvas, sp.x - ox, sp.y - oy + dy)
      c.globalAlpha = 1
    }
    const rise = (t: number, px: number) => (1 - t) * px

    const compose = (s: PosterState) => {
      ctx.globalAlpha = 1
      ctx.fillStyle = BG
      ctx.fillRect(0, 0, WIDTH, HEIGHT)
      const glow = ctx.createRadialGradient(540, 1689.6, 0, 540, 1689.6, 900)
      glow.addColorStop(0, rgba(accent, 0.22 * s.glow))
      glow.addColorStop(1, rgba(accent, 0))
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, WIDTH, HEIGHT)

      put(ctx, 'brand', rise(s.brand, 24), s.brand)
      put(ctx, 'period', rise(s.period, 24), s.period)

      // Orange block, composed as one group (like the CSS opacity/scale on the element).
      if (s.block > 0) {
        bctx.globalAlpha = 1
        bctx.clearRect(0, 0, BLOCK.w, BLOCK.h)
        bctx.save()
        roundRectPath(bctx, 0, 0, BLOCK.w, BLOCK.h, BLOCK.r)
        bctx.clip()
        bctx.fillStyle = accent
        bctx.fillRect(0, 0, BLOCK.w, BLOCK.h)
        if (covers.length > 0) {
          const level = 0.26 * s.block
          bctx.globalAlpha = level * (1 - s.driftFade)
          drawCover(bctx, covers[s.driftIdx % covers.length], BLOCK.w, BLOCK.h)
          if (s.driftFade > 0) {
            bctx.globalAlpha = level * s.driftFade
            drawCover(bctx, covers[(s.driftIdx + 1) % covers.length], BLOCK.w, BLOCK.h)
          }
          bctx.globalAlpha = 1
        }
        const ox = BLOCK.x
        const oy = BLOCK.y
        put(bctx, 'ghost', Math.trunc((1 - s.ghostT) * 120) + Math.trunc(s.ghostDy / 3), 0.14 * s.ghostT * s.ghostA, ox, oy)
        put(bctx, 'name', Math.trunc((1 - s.nameT) * 360) + s.nameDy, s.nameA, ox, oy)
        put(bctx, 'recap', Math.trunc((1 - s.recapT) * 360) + s.recapDy, s.recapA, ox, oy)
        put(bctx, 'tag', rise(s.tag, 20), s.tag, ox, oy)
        if (s.dot > 0) {
          bctx.fillStyle = '#0B0B0B'
          bctx.beginPath()
          bctx.arc(840, 760, 60 * s.dot, 0, Math.PI * 2) // dot is placed in block coordinates
          bctx.fill()
        }
        bctx.restore()

        const sc = 0.92 + 0.08 * s.block
        const cx = BLOCK.x + BLOCK.w / 2
        const cy = BLOCK.y + BLOCK.h / 2
        ctx.save()
        ctx.globalAlpha = s.block
        ctx.translate(cx, cy)
        ctx.scale(sc, sc)
        ctx.translate(-cx, -cy)
        ctx.drawImage(blockCanvas, BLOCK.x, BLOCK.y)
        ctx.restore()
      }

      put(ctx, 'artistLabel', rise(s.artistLabel, 24), s.artistLabel)
      put(ctx, 'artistName', rise(s.artistName, 50), s.artistName)
      for (let i = 0; i < 5; i++) {
        put(ctx, `track${i}`, rise(s.trackRows[i], 30), s.trackRows[i])
        put(ctx, `artist${i}`, rise(s.artistRows[i], 30), s.artistRows[i])
      }
      put(ctx, 'tracksLabel', rise(s.tracksLabel, 20), s.tracksLabel)
      put(ctx, 'footer', rise(s.footer, 16), s.footer)
    }

    // ---- 3. Encode ----
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
      target: new BufferTarget(),
    })
    const source = new CanvasSource(canvas, {
      codec: 'avc',
      bitrate: VIDEO_BITRATE,
      fullCodecString: AVC_CODEC,
      keyFrameInterval: 2,
    })
    output.addVideoTrack(source, { frameRate: POSTER_FPS })
    await output.start()

    try {
      let lastKey = ''
      const frameDur = 1 / POSTER_FPS
      for (let i = 0; i < POSTER_FRAMES; i++) {
        throwIfAborted()
        const { progress, loop, clock } = posterFrameInputs(i)
        const state = posterState(progress, loop, clock)
        const key = posterStateKey(state)
        if (key !== lastKey) {
          compose(state)
          lastKey = key
        }
        // Awaiting add() applies encoder back-pressure.
        await source.add(i * frameDur, frameDur)
        onProgress?.(Math.round((CAPTURE_SHARE + ((i + 1) / POSTER_FRAMES) * (1 - CAPTURE_SHARE)) * 100))
      }
      source.close()
      await output.finalize()
    } catch (err) {
      await output.cancel().catch(() => undefined)
      throw err
    }

    const { buffer } = output.target as BufferTarget
    if (!buffer) throw new Error('Falha ao gerar o MP4 (buffer vazio).')
    return new Blob([buffer], { type: 'video/mp4' })
  } finally {
    root.unmount()
    host.remove()
  }
}
