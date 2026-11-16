// Timeline of the "Cartaz" recap template (ported from Android RecapTemplates.kt).
// Pure functions so the same numbers drive the live preview, the static PNG and
// the frame-by-frame MP4 export.

/** Length of the intro animation; `progress` 0..1 spans this. */
export const POSTER_ANIM_MS = 4200
/** One pass of the in-card word loop (words leave upward and re-enter from below). */
export const POSTER_LOOP_MS = 2400
/** Pause between loop passes in the live preview. */
export const POSTER_LOOP_WAIT_MS = 1800
export const POSTER_FPS = 30
/** entry (126) + 1s hold (30) + one loop pass (72) + 1s hold (30). */
export const POSTER_FRAMES = 258

function makeBezier(x1: number, y1: number, x2: number, y2: number) {
  return (t: number): number => {
    if (t <= 0) return 0
    if (t >= 1) return 1
    let lo = 0
    let hi = 1
    let s = t
    for (let i = 0; i < 28; i++) {
      const x = 3 * (1 - s) * (1 - s) * s * x1 + 3 * (1 - s) * s * s * x2 + s * s * s
      if (x < t) lo = s
      else hi = s
      s = (lo + hi) / 2
    }
    return 3 * (1 - s) * (1 - s) * s * y1 + 3 * (1 - s) * s * s * y2 + s * s * s
  }
}

const ease = makeBezier(0.16, 1, 0.3, 1)

/** 0..1 for `progress` inside [start, end], eased (cubic-bezier .16,1,.3,1). */
export function stage(progress: number, start: number, end: number): number {
  return ease(Math.min(1, Math.max(0, (progress - start) / (end - start))))
}

/** Vertical offset (px, + = down) and alpha of a word in the loop at `loop` 0..1, delayed by `delay`. */
export function loopOffset(loop: number, delay: number): { dy: number; a: number } {
  if (loop <= 0) return { dy: 0, a: 1 }
  const l = Math.min(1, Math.max(0, loop - delay))
  if (l < 0.4) {
    const out = stage(l, 0, 0.35)
    return { dy: Math.trunc(-out * 360), a: 1 - out }
  }
  const inn = stage(l, 0.4, 0.8)
  return { dy: Math.trunc((1 - inn) * 360), a: inn }
}

export interface PosterState {
  glow: number
  brand: number
  period: number
  block: number
  ghostT: number
  ghostDy: number
  ghostA: number
  nameT: number
  nameA: number
  nameDy: number
  recapT: number
  recapA: number
  recapDy: number
  tag: number
  dot: number
  artistLabel: number
  artistName: number
  tracksLabel: number
  trackRows: number[]
  artistRows: number[]
  footer: number
  /** Cover-drift: index of the shown cover and the crossfade amount to the next one. */
  driftIdx: number
  driftFade: number
}

export function posterState(progress: number, loop: number, clock: number): PosterState {
  const ghost = loopOffset(loop, 0)
  const name = loopOffset(loop, 0.05)
  const recap = loopOffset(loop, 0.15)
  const step = 2
  const driftIdx = Math.floor(Math.max(0, clock) / step)
  const within = clock - driftIdx * step
  return {
    glow: stage(progress, 0, 0.3),
    brand: stage(progress, 0, 0.12),
    period: stage(progress, 0.03, 0.15),
    block: stage(progress, 0.04, 0.26),
    ghostT: stage(progress, 0.12, 0.34),
    ghostDy: ghost.dy,
    ghostA: ghost.a,
    nameT: stage(progress, 0.16, 0.4),
    nameA: stage(progress, 0.16, 0.3) * name.a,
    nameDy: name.dy,
    recapT: stage(progress, 0.24, 0.48),
    recapA: stage(progress, 0.24, 0.36) * recap.a,
    recapDy: recap.dy,
    tag: stage(progress, 0.42, 0.54),
    dot: stage(progress, 0.46, 0.6),
    artistLabel: stage(progress, 0.5, 0.62),
    artistName: stage(progress, 0.53, 0.7),
    tracksLabel: stage(progress, 0.6, 0.72),
    trackRows: [0, 1, 2, 3, 4].map((i) => stage(progress, 0.64 + i * 0.055, 0.8 + i * 0.055)),
    artistRows: [0, 1, 2, 3, 4].map((i) => stage(progress, 0.66 + i * 0.055, 0.82 + i * 0.055)),
    footer: stage(progress, 0.9, 1),
    driftIdx,
    driftFade: Math.min(1, Math.max(0, (within - (step - 0.8)) / 0.8)),
  }
}

/** Two frames with the same key render pixel-identical (lets the MP4 export reuse a capture). */
export function posterStateKey(s: PosterState): string {
  const parts: number[] = [
    s.glow, s.brand, s.period, s.block, s.ghostT, s.ghostDy, s.ghostA, s.nameT, s.nameA, s.nameDy,
    s.recapT, s.recapA, s.recapDy, s.tag, s.dot, s.artistLabel, s.artistName, s.tracksLabel,
    ...s.trackRows, ...s.artistRows, s.footer, s.driftIdx, s.driftFade,
  ]
  // 4 decimals is below 1/255 of any alpha and 0.01px of any translation.
  return parts.map((n) => Math.round(n * 10000)).join(',')
}

/** Inputs (progress, loop, clock) of video frame `i` of POSTER_FRAMES. */
export function posterFrameInputs(i: number): { progress: number; loop: number; clock: number } {
  const entry = 126
  const hold1 = 30
  const loopFrames = 72
  const clock = i / POSTER_FPS
  if (i < entry) return { progress: i / entry, loop: 0, clock }
  if (i < entry + hold1) return { progress: 1, loop: 0, clock }
  if (i < entry + hold1 + loopFrames) return { progress: 1, loop: (i - entry - hold1) / loopFrames, clock }
  return { progress: 1, loop: 0, clock }
}

/**
 * Whether the browser can encode the poster video: needs WebCodecs. Firefox is
 * excluded on purpose (its WebCodecs H.264 encoder support is not dependable).
 */
export function posterVideoSupported(): boolean {
  if (typeof window === 'undefined') return false
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return false
  if (typeof navigator !== 'undefined' && /firefox|fxios/i.test(navigator.userAgent)) return false
  return true
}
