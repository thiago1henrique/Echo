import { forwardRef } from 'react'
import type { AlbumStat, Period, Source } from '../types'
import { periodLabel } from '../types'
import { fmt } from '../lib/format'
import { FadeImg } from './cardMedia'
import './CollageCard.css'

export type CollageFormat = 'square' | 'story'

interface Props {
  albums: AlbumStat[]
  /** Grid side N — the collage is N×N cells. */
  size: number
  format: CollageFormat
  /** Show the artist/album caption overlay on each cover. */
  captions: boolean
  /** Show the "Plays: N" line inside the caption (only when captions are on). */
  playcount: boolean
  user: string
  period: Period
  source: Source
}

/**
 * The album-cover collage — a tapmusic-style N×N grid of top albums. Renders at
 * exact export pixels so html-to-image captures it 1:1. Two formats: `square`
 * (1080×1080, the classic grid) and `story` (1080×1920, the grid framed with a
 * header/footer to fill Instagram's 9:16).
 */
export const CollageCard = forwardRef<HTMLDivElement, Props>(
  ({ albums, size, format, captions, playcount, user, period, source }, ref) => {
    const cells = size * size
    // Always render a full N×N so a short result set still lays out as a grid.
    const items: (AlbumStat | null)[] = []
    for (let i = 0; i < cells; i++) items.push(albums[i] ?? null)

    const grid = (
      <div
        className="collage__grid"
        data-size={size}
        style={{
          gridTemplateColumns: `repeat(${size}, 1fr)`,
          gridTemplateRows: `repeat(${size}, 1fr)`,
        }}
      >
        {items.map((a, i) => (
          <div className="collage__cell" key={i}>
            {a?.image ? (
              <FadeImg className="collage__cover" src={a.image} />
            ) : (
              <div className="collage__cover collage__cover--empty" />
            )}
            {captions && a && (
              <div className="collage__caption">
                <span className="collage__artist">{a.artist}</span>
                <span className="collage__album">{a.name}</span>
                {playcount && a.playcount != null && (
                  <span className="collage__plays">Plays: {fmt(a.playcount)}</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    )

    if (format === 'square') {
      return (
        <div ref={ref} className="collage collage--square" data-size={size}>
          {grid}
        </div>
      )
    }

    return (
      <div ref={ref} className={`collage collage--story card--${source}`} data-size={size}>
        <div className="collage__head">
          <span className="collage__eyebrow">Top álbuns · {periodLabel(source, period)}</span>
          <span className="collage__handle">@{user}</span>
        </div>
        <div className="collage__grid-wrap">{grid}</div>
        <div className="collage__foot">
          <span className="collage__brand">
            <svg className="collage__mark" viewBox="0 0 12 17" fill="currentColor" aria-hidden>
              <path d="M4 10H2V17H4V10Z" />
              <path d="M9.00004 2.04L8.04004 3V9L9.00004 9.94L11.04 11.94V0L9.00004 2.04Z" />
              <path d="M7.04 3H0V9H7.04V3Z" />
            </svg>
            Echo
          </span>
          <span className="collage__foot-meta">
            {size}×{size} · last.fm
          </span>
        </div>
      </div>
    )
  },
)

CollageCard.displayName = 'CollageCard'
