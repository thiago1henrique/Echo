import { forwardRef } from 'react'
import type { CSSProperties } from 'react'
import type { AlbumStat, Period, Source } from '../types'
import { fmt } from '../lib/format'
import { EchoMark } from './EchoMark'
import { FadeImg } from './cardMedia'
import './CollageCard.css'

import { collageTitle } from '../lib/collageFormats'
import type { CollageFormat } from '../lib/collageFormats'

/** Brand name of each data source, printed next to the title. */
const SOURCE_LABEL: Record<Source, string> = {
  lastfm: 'Last.fm',
  spotify: 'Spotify',
}

const ACCENT: Record<Source, string> = {
  lastfm: '#E0472D',
  spotify: '#1DB954',
}

/** Width of the grid in each layout, so captions scale with the real cell size. */
const GRID_W: Partial<Record<CollageFormat, number>> = {
  square: 1080,
  story: 1016,
  retrato: 984,
  painel: 900,
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

interface Props {
  albums: AlbumStat[]
  /** Grid side N — grid layouts are N×N cells. */
  size: number
  format: CollageFormat
  /** Handle printed in the headers (without the "@"). */
  user: string
  source: Source
  /** Period the albums cover; decides the title (Semaninha / <Mês> Recap / Top álbuns). */
  period: Period
  /** Footer / subtitle text, e.g. "Semana · 16 álbuns". */
  metaText: string
}

function Brand({ mark = 49, text = 52 }: { mark?: number; text?: number }) {
  return (
    <span className="collage__brand" style={{ fontSize: text }}>
      <EchoMark size={mark} />
      echo
    </span>
  )
}

/** "12 plays" — only when the source has play counts (Last.fm). */
const plays = (a: AlbumStat | undefined) =>
  a?.playcount ? `${fmt(a.playcount)} ${a.playcount === 1 ? 'play' : 'plays'}` : ''

/** Long handles shrink so they stay on one line in the painel's text column. */
const panelHandleSize = (len: number) => (len <= 8 ? 128 : len <= 11 ? 100 : len <= 15 ? 76 : 58)

export const CollageCard = forwardRef<HTMLDivElement, Props>(
  ({ albums, size, format, user, source, period, metaText }, ref) => {
    const cells = size * size
    // Always render a full N×N so a short result set still lays out as a grid.
    const items: (AlbumStat | null)[] = []
    for (let i = 0; i < cells; i++) items.push(albums[i] ?? null)

    // Caption sizes scale with the cell width (spec §2.4).
    const cell = (GRID_W[format] ?? 1016) / size
    const vars = {
      '--col-accent': ACCENT[source],
      '--cap-artist': `${clamp(cell * 0.085, 15, 34)}px`,
      '--cap-album': `${clamp(cell * 0.075, 13, 30)}px`,
      '--cap-pad': `${clamp(cell * 0.04, 6, 16)}px`,
    } as CSSProperties

    const grid = (
      <div
        className="collage__grid"
        style={{
          gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${size}, minmax(0, 1fr))`,
        }}
      >
        {items.map((a, i) => (
          <div className="collage__cell" key={i}>
            {a?.image ? (
              <FadeImg className="collage__cover" src={a.image} />
            ) : (
              <div className="collage__cover collage__cover--empty" />
            )}
            {a && (
              <div className="collage__caption">
                <span className="collage__artist">{a.artist}</span>
                <span className="collage__album">{a.name}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    )

    const { eyebrow: title, lines: titleLines } = collageTitle(period, source)
    const root = `collage collage--${format}`

    // ── Grade ──────────────────────────────────────────────────────────────
    if (format === 'square') {
      return (
        <div ref={ref} className={root} style={vars}>
          {grid}
        </div>
      )
    }

    // ── Pôster ─────────────────────────────────────────────────────────────
    if (format === 'story') {
      return (
        <div ref={ref} className={root} style={vars}>
          <div className="collage__head">
            <span className="collage__eyebrow">{title}</span>
            <span className="collage__handle">@{user}</span>
          </div>
          <div className="collage__grid-wrap">{grid}</div>
          <div className="collage__foot">
            <Brand />
            <span className="collage__foot-meta">{metaText}</span>
          </div>
        </div>
      )
    }

    // ── Destaque: #1 as a hero, the next eight below ───────────────────────
    if (format === 'destaque') {
      const top = albums[0]
      const next = Array.from({ length: 8 }, (_, i) => albums[i + 1] ?? null)
      return (
        <div ref={ref} className={root} style={vars}>
          <div className="cs-bar">
            <span className="collage__eyebrow">{title}</span>
            <span className="cs-meta">{metaText}</span>
          </div>
          <div className="cs-hero">
            {top?.image ? <img className="cs-hero__img" src={top.image} alt="" /> : <div className="cs-hero__img cs-empty" />}
            <span className="cs-hero__ghost" aria-hidden="true">1</span>
            <span className="cs-hero__scrim" aria-hidden="true" />
            <span className="cs-hero__chip">ÁLBUM Nº 1</span>
            <div className="cs-hero__text">
              <span className="cs-hero__title">{top?.name ?? '—'}</span>
              <span className="cs-hero__artist">{top?.artist ?? ''}</span>
              {plays(top) && <span className="cs-hero__plays">{plays(top)}</span>}
            </div>
          </div>
          <div className="cs-next">
            <span className="cs-label">Em seguida</span>
            <div className="cs-next__grid">
              {next.map((a, i) => (
                <div className="cs-next__cell" key={i}>
                  {a?.image ? <img src={a.image} alt="" /> : <div className="cs-empty" />}
                </div>
              ))}
            </div>
          </div>
          <div className="collage__foot">
            <Brand />
            <span className="cs-handle">@{user}</span>
          </div>
        </div>
      )
    }

    // ── Mural: a tilted wall of covers ─────────────────────────────────────
    if (format === 'mural') {
      const covers = albums.map((a) => a.image).filter((u): u is string => !!u)
      const WALL = 5 * 9
      return (
        <div ref={ref} className={root} style={vars}>
          <div className="cs-wall" aria-hidden="true">
            {Array.from({ length: WALL }, (_, i) => {
              const src = covers.length ? covers[(i * 5 + Math.floor(i / 5) * 3) % covers.length] : undefined
              return (
                <div className="cs-wall__cell" key={i}>
                  {src ? <img src={src} alt="" /> : <div className="cs-empty" />}
                </div>
              )
            })}
          </div>
          <span className="cs-fade" aria-hidden="true" />
          <div className="cs-mural__brand">
            <EchoMark size={44} />
          </div>
          <div className="cs-mural__text">
            <span className="collage__eyebrow">
              @{user} · {SOURCE_LABEL[source]}
            </span>
            <span className="cs-mural__title">
              {titleLines.map((l, i) => (
                <span key={i} style={{ display: 'block' }}>
                  {l}
                </span>
              ))}
            </span>
            <span className="cs-meta">{metaText}</span>
          </div>
        </div>
      )
    }

    // ── Retrato 4:5: titled square grid ────────────────────────────────────
    if (format === 'retrato') {
      return (
        <div ref={ref} className={root} style={vars}>
          <div className="cs-bar cs-bar--title">
            <div className="cs-titleblock">
              <span className="collage__eyebrow">{title}</span>
              <span className="cs-handle cs-handle--big">@{user}</span>
            </div>
            <Brand mark={40} text={44} />
          </div>
          <div className="cs-square">{grid}</div>
          <div className="cs-meta cs-meta--foot">{metaText}</div>
        </div>
      )
    }

    // ── Ranking 4:5: editorial list ────────────────────────────────────────
    if (format === 'ranking') {
      const rows = Array.from({ length: 8 }, (_, i) => albums[i] ?? null)
      return (
        <div ref={ref} className={root} style={vars}>
          <div className="cs-bar cs-bar--title">
            <div className="cs-titleblock">
              <span className="collage__eyebrow">{title}</span>
              <span className="cs-handle cs-handle--big">@{user}</span>
            </div>
            <Brand mark={40} text={44} />
          </div>
          <ol className="cs-rank">
            {rows.map((a, i) => (
              <li className={`cs-rank__row${i === 0 ? ' is-first' : ''}`} key={i}>
                <span className="cs-rank__n">{i + 1}</span>
                {a?.image ? <img className="cs-rank__cover" src={a.image} alt="" /> : <div className="cs-rank__cover cs-empty" />}
                <span className="cs-rank__text">
                  <span className="cs-rank__album">{a?.name ?? '—'}</span>
                  <span className="cs-rank__artist">{a?.artist ?? ''}</span>
                </span>
                <span className="cs-rank__plays">{plays(a ?? undefined)}</span>
              </li>
            ))}
          </ol>
          <div className="cs-meta cs-meta--foot">{metaText}</div>
        </div>
      )
    }

    // ── Painel 16:9: text column + flush grid ──────────────────────────────
    const lead = albums.slice(0, 3)
    return (
      <div ref={ref} className={root} style={vars}>
        <div className="cs-panel">
          <Brand mark={44} text={48} />
          <div className="cs-panel__main">
            <span className="collage__eyebrow">{title}</span>
            <span className="cs-panel__handle" style={{ fontSize: panelHandleSize(user.length + 1) }}>
              @{user}
            </span>
            <span className="cs-meta">{metaText}</span>
          </div>
          <ol className="cs-panel__list">
            {lead.map((a, i) => (
              <li key={i}>
                <span className="cs-panel__n">{i + 1}</span>
                <span className="cs-panel__name">
                  {a.name}
                  <em>{a.artist}</em>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="cs-panel__grid">{grid}</div>
      </div>
    )
  },
)

CollageCard.displayName = 'CollageCard'
