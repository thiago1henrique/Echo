import { useCallback, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import './ClipTimeline.css'

// Ported from the Android ClipTimeline: a 44px panel with decorative bars and a
// fixed-length "window" (the preset 7/10/15 s) that the user drags — or taps —
// along the video. There are no start/end handles. The m:ss labels sit under
// the window edges and merge into one "início – fim" label when it is narrow.

const BAR_HEIGHTS = [8, 18, 28, 13, 23]
const BAR_W = 4
const BAR_STEP = 9.5
const BAR_FIRST_X = 11
const PANEL_H = 44
const LABEL_W = 34
const MERGE_W = LABEL_W * 2 + 8 // 76: below this the two labels become one
const MERGED_LABEL_W = 86
const MIN_WINDOW_PX = 12
const DRAG_SLOP = 4

/** `m:ss`, rounding to the nearest second (Android `formatClock`). */
function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

export function ClipTimeline({
  duration,
  start,
  window: windowSeconds,
  onStartChange,
  disabled = false,
}: {
  /** Total video length (s). */
  duration: number
  /** Window start (s). */
  start: number
  /** Window length (s) — fixed by the duration preset. */
  window: number
  onStartChange: (start: number) => void
  disabled?: boolean
}) {
  const [width, setWidth] = useState(0)
  const roRef = useRef<ResizeObserver | null>(null)
  const dragRef = useRef<{ x: number; start: number; moved: boolean } | null>(null)

  const panelCallback = useCallback((node: HTMLDivElement | null) => {
    roRef.current?.disconnect()
    if (!node) return
    setWidth(node.clientWidth)
    roRef.current = new ResizeObserver(() => setWidth(node.clientWidth))
    roRef.current.observe(node)
  }, [])

  const maxStart = Math.max(duration - windowSeconds, 0)
  const clampStart = (t: number) => clamp(t, 0, maxStart)

  const windowLeft = width * clamp(start / duration, 0, 1)
  const windowW = Math.max(width * clamp(windowSeconds / duration, 0, 1), MIN_WINDOW_PX)
  const windowRight = windowLeft + windowW

  // Decorative bars: x + 4 <= width - 11 + 4.
  const bars: { x: number; h: number }[] = []
  for (let x = BAR_FIRST_X, i = 0; x + BAR_W <= width - BAR_FIRST_X + BAR_W; x += BAR_STEP, i++) {
    bars.push({ x, h: BAR_HEIGHTS[i % BAR_HEIGHTS.length] })
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (disabled || !width) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { x: e.clientX, start, moved: false }
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = dragRef.current
    if (!d || !width) return
    const dx = e.clientX - d.x
    if (!d.moved && Math.abs(dx) < DRAG_SLOP) return
    d.moved = true
    onStartChange(clampStart(d.start + (dx / width) * duration))
  }
  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const d = dragRef.current
    dragRef.current = null
    if (!d || d.moved || !width) return
    // Tap: centre the window on the touched point.
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    onStartChange(clampStart((x / width) * duration - windowSeconds / 2))
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return
    const step = e.shiftKey ? 5 : 1
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      onStartChange(clampStart(start - step))
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      onStartChange(clampStart(start + step))
    } else if (e.key === 'Home') {
      e.preventDefault()
      onStartChange(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      onStartChange(maxStart)
    }
  }

  const startLabel = formatClock(start)
  const endLabel = formatClock(start + windowSeconds)
  const merged = windowRight - windowLeft < MERGE_W
  const mergedLeft = clamp(windowLeft - 12, 0, Math.max(width - MERGED_LABEL_W, 0))

  return (
    <div className="clip-timeline">
      <div
        ref={panelCallback}
        className={`clip-timeline__panel${disabled ? ' is-disabled' : ''}`}
        style={{ height: PANEL_H }}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="Trecho do vídeo"
        aria-valuemin={0}
        aria-valuemax={Math.round(maxStart)}
        aria-valuenow={Math.round(start)}
        aria-valuetext={`${startLabel} a ${endLabel}`}
        aria-disabled={disabled || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          dragRef.current = null
        }}
        onKeyDown={onKeyDown}
      >
        <svg className="clip-timeline__bars" width={width} height={PANEL_H} aria-hidden="true">
          {bars.map((b) => (
            <rect key={b.x} x={b.x} y={(PANEL_H - b.h) / 2} width={BAR_W} height={b.h} rx={2} />
          ))}
        </svg>
        <div className="clip-timeline__window" style={{ left: windowLeft, width: windowW }} />
      </div>

      <div className="clip-timeline__labels" aria-hidden="true">
        {merged ? (
          <span className="clip-timeline__label" style={{ left: mergedLeft }}>
            {startLabel} – {endLabel}
          </span>
        ) : (
          <>
            <span className="clip-timeline__label" style={{ left: windowLeft }}>
              {startLabel}
            </span>
            <span
              className="clip-timeline__label clip-timeline__label--end"
              style={{ left: windowRight - LABEL_W, width: LABEL_W }}
            >
              {endLabel}
            </span>
          </>
        )}
      </div>
    </div>
  )
}
