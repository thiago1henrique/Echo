import { useId } from 'react'
import type { CSSProperties } from 'react'

// "Cartões em eco": three 9:16 cards cascading — the stories Echo exports.
// Geometry matches the Android mark (box 152.27 × 178.75).
const GLYPH_W = 152.27
const GLYPH_H = 178.75
const CARD_W = 86.07
const CARD_H = 152.27
const CARD_R = 21.52
const GAP = 9.93

const CARDS = [
  { x: 0, y: 26.48 }, // back
  { x: 33.1, y: 13.24 }, // middle
  { x: 66.2, y: 0 }, // front
]

// Final (carved) shape of the three cards, used when the mark isn't animated.
const MARK_PATHS = [
  'M 66.2 21.52 C 66.2 9.63 75.84 0 87.72 0 L 130.75 0 C 142.64 0 152.27 9.63 152.27 21.52 L 152.27 130.75 C 152.27 142.64 142.64 152.27 130.75 152.27 L 87.72 152.27 C 75.84 152.27 66.2 142.64 66.2 130.75 L 66.2 21.52 Z',
  'M 57.38 13.24 C 56.66 15.88 56.27 18.65 56.27 21.52 L 56.27 26.48 L 54.62 26.48 C 50.05 26.48 46.34 30.19 46.34 34.76 L 46.34 143.99 C 46.34 148.56 50.05 152.27 54.62 152.27 L 64.79 152.27 C 70.53 158.38 78.68 162.2 87.72 162.2 L 109.12 162.2 C 105.8 164.3 101.87 165.51 97.65 165.51 L 54.62 165.51 C 42.73 165.51 33.1 155.88 33.1 143.99 L 33.1 34.76 C 33.1 22.87 42.73 13.24 54.62 13.24 L 57.38 13.24 Z',
  'M 24.27 26.48 C 23.56 29.12 23.17 31.89 23.17 34.76 L 23.17 39.72 L 21.52 39.72 C 16.95 39.72 13.24 43.43 13.24 48 L 13.24 157.23 C 13.24 161.8 16.95 165.51 21.52 165.51 L 31.69 165.51 C 37.42 171.62 45.57 175.44 54.62 175.44 L 76.02 175.44 C 72.7 177.54 68.77 178.75 64.55 178.75 L 21.52 178.75 C 9.63 178.75 0 169.12 0 157.23 L 0 48 C 0 36.11 9.63 26.48 21.52 26.48 L 24.27 26.48 Z',
]

interface Props {
  /** Rendered height in px (width follows the glyph's aspect ratio). */
  size?: number
  /** Back cards start filled and the front card slides in, carving them down. */
  animate?: boolean
  className?: string
  style?: CSSProperties
}

/** The Echo brand mark, tinted with `currentColor`. */
export function EchoMark({ size = 28, animate = false, className, style }: Props) {
  const uid = useId().replace(/:/g, '')
  const w = (size * GLYPH_W) / GLYPH_H

  if (!animate) {
    return (
      <svg
        className={className}
        style={style}
        width={w}
        height={size}
        viewBox={`0 0 ${GLYPH_W} ${GLYPH_H}`}
        fill="currentColor"
        aria-hidden="true"
      >
        {MARK_PATHS.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    )
  }

  // Each back card is carved by the cards in front of it (inflated by GAP); the
  // cutouts slide in from the right, which is the "carving" animation.
  const cut = (i: number) => (
    <rect
      key={i}
      className="echo-mark__cut"
      x={CARDS[i].x - GAP}
      y={CARDS[i].y - GAP}
      width={CARD_W + 2 * GAP}
      height={CARD_H + 2 * GAP}
      rx={CARD_R + GAP}
      fill="#000"
    />
  )
  const full = <rect x="0" y="0" width={GLYPH_W} height={GLYPH_H} fill="#fff" />

  return (
    <svg
      className={className}
      style={style}
      width={w}
      height={size}
      viewBox={`0 0 ${GLYPH_W} ${GLYPH_H}`}
      fill="currentColor"
      aria-hidden="true"
    >
      <defs>
        <mask id={`${uid}a`} maskUnits="userSpaceOnUse" x="0" y="0" width={GLYPH_W} height={GLYPH_H}>
          {full}
          {cut(1)}
          {cut(2)}
        </mask>
        <mask id={`${uid}b`} maskUnits="userSpaceOnUse" x="0" y="0" width={GLYPH_W} height={GLYPH_H}>
          {full}
          {cut(2)}
        </mask>
      </defs>
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={CARDS[i].x}
          y={CARDS[i].y}
          width={CARD_W}
          height={CARD_H}
          rx={CARD_R}
          mask={i === 0 ? `url(#${uid}a)` : i === 1 ? `url(#${uid}b)` : undefined}
        />
      ))}
    </svg>
  )
}
