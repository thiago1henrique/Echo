import { useEffect, useRef, useState } from 'react'
import { EchoMark } from './EchoMark'
import { markSplashSeen } from '../lib/home'

// Timeline, ported from the Android EchoSplash: the mark morphs (250ms hold +
// 900ms carve), then the front card zooms until it fills the screen and the
// overlay fades out, revealing the app that is already rendered underneath.
const MORPH_MS = 1250
const ZOOM_MS = 650
const FADE_MS = 250
const MARK_H = 120

const GLYPH_W = 152.27
const GLYPH_H = 178.75
const CARD_W = 86.07
const CARD_H = 152.27
const CARD_R = 21.52
const FRONT_X = 66.2


interface Rect {
  left: number
  top: number
  width: number
  height: number
  radius: number
}

export function Splash({ onFinished }: { onFinished: () => void }) {
  const markRef = useRef<HTMLSpanElement>(null)
  const [phase, setPhase] = useState<'mark' | 'zoom' | 'fade'>('mark')
  const [from, setFrom] = useState<Rect | null>(null)
  const [to, setTo] = useState<Rect | null>(null)
  const [go, setGo] = useState(false)

  useEffect(() => {
    markSplashSeen()
    const t1 = setTimeout(() => {
      const el = markRef.current
      if (!el) return
      const box = el.getBoundingClientRect()
      const sc = box.width / GLYPH_W
      const start: Rect = {
        left: box.left + FRONT_X * sc,
        top: box.top,
        width: CARD_W * sc,
        height: CARD_H * sc,
        radius: CARD_R * sc,
      }
      // Overshoot the viewport so the (still rounded) corners end off-screen.
      const vw = window.innerWidth
      const vh = window.innerHeight
      const margin = 0.4 * (start.radius * (vw / start.width)) + 8
      const w = vw + 2 * margin
      const h = vh + 2 * margin
      setFrom(start)
      setTo({
        left: -margin,
        top: -margin,
        width: w,
        height: h,
        radius: Math.min((start.radius * w) / start.width, Math.min(w, h) / 2),
      })
      setPhase('zoom')
      // Next frame: flip to the end rect so the CSS transition runs.
      requestAnimationFrame(() => requestAnimationFrame(() => setGo(true)))
    }, MORPH_MS)
    const t2 = setTimeout(() => setPhase('fade'), MORPH_MS + ZOOM_MS)
    const t3 = setTimeout(onFinished, MORPH_MS + ZOOM_MS + FADE_MS)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [onFinished])

  const r = go && to ? to : from
  return (
    <div className={`splash${phase === 'fade' ? ' is-fading' : ''}`} aria-hidden="true">
      <span
        ref={markRef}
        className={`splash__mark${phase !== 'mark' ? ' is-leaving' : ''}`}
        style={{ height: MARK_H, width: (MARK_H * GLYPH_W) / GLYPH_H }}
      >
        <EchoMark size={MARK_H} animate />
      </span>
      {r && (
        <span
          className="splash__zoom"
          style={{
            left: r.left,
            top: r.top,
            width: r.width,
            height: r.height,
            borderRadius: r.radius,
          }}
        />
      )}
    </div>
  )
}
