import { forwardRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { Recap } from '../types'
import { periodLabel } from '../types'
import { fmt } from '../lib/format'
import {
  CREAM, DEEP, DIM, GREY, INK, MUTED, PANEL, TINTS,
  accentOf, heroFigure, phraseTail, rgba, statsOf,
} from '../lib/recapTheme'
import { posterState } from '../lib/posterTiming'
import { EchoMark } from './EchoMark'
import './RecapTemplates.css'

// Story templates 1080×1920 (Cartaz, Dash, Mini), ported from the Android
// RecapTemplates.kt. Every number is a pixel of the exported PNG; the cards are
// rendered at full size and only scaled down by <ScaledPreview>.

// ---- Primitives -------------------------------------------------------------

type Align = 'left' | 'right' | 'center'

interface TextProps {
  /** Top-left offset (px) inside the nearest positioned parent. Omit for in-flow text. */
  x?: number
  y?: number
  /** Fixed box width (px); enables ellipsis. */
  w?: number
  size: number
  color: string
  align?: Align
  style?: CSSProperties
  /** Marks an animated Cartaz element; the MP4 export captures it once as a sprite (see posterVideo.ts). */
  sprite?: string
  children: ReactNode
}

/** Space Mono: bold by default, letter-spacing 1px, one line with ellipsis. */
export function Mono({
  x, y, w, size, color, align, bold = true, ls = 1, style, sprite, children,
}: TextProps & { bold?: boolean; ls?: number }) {
  const abs = x !== undefined && y !== undefined
  return (
    <div
      className={`rt-mono${w !== undefined ? ' rt-clip' : ''}`}
      data-sprite={sprite}
      style={{
        position: abs ? 'absolute' : undefined,
        left: abs ? x : undefined,
        top: abs ? y : undefined,
        width: w,
        fontSize: size,
        color,
        fontWeight: bold ? 700 : 400,
        letterSpacing: ls,
        textAlign: align,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/** Bricolage Grotesque: ExtraBold by default, line-height 1.1, glyphs centered in the line box. */
export function Display({
  x, y, w, size, color, align, weight = 800, ls = 0, lh, lines = 1, style, sprite, children,
}: TextProps & { weight?: number; ls?: number; lh?: number; lines?: number }) {
  const abs = x !== undefined && y !== undefined
  const multi = lines > 1
  return (
    <div
      className="rt-display rt-clip"
      data-sprite={sprite}
      style={{
        position: abs ? 'absolute' : undefined,
        left: abs ? x : undefined,
        top: abs ? y : undefined,
        width: w,
        fontSize: size,
        lineHeight: `${lh ?? size * 1.1}px`,
        fontWeight: weight,
        letterSpacing: ls,
        color,
        textAlign: align,
        ...(multi
          ? {
              display: '-webkit-box',
              WebkitLineClamp: lines,
              WebkitBoxOrient: 'vertical',
              whiteSpace: 'normal',
              // No bottom padding: it would let a clamped 3rd line peek through.
              padding: '0.15em 0 0',
              margin: '-0.15em 0 0',
            }
          : null),
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/** EchoMark (0.72h × h box) + "echo". `markHeight`/`textSize` as in the Android Brand helper. */
export function Brand({ color, markHeight, textSize, x, y, style, sprite }: {
  color: string
  markHeight: number
  textSize: number
  x: number
  y: number
  style?: CSSProperties
  sprite?: string
}) {
  const boxW = markHeight * 0.72
  // The glyph keeps its aspect ratio inside the box (scale = min(w/GW, h/GH)).
  const glyphH = Math.min(markHeight, (boxW * 178.75) / 152.27)
  return (
    <div
      className="rt-brand"
      data-sprite={sprite}
      style={{ left: x, top: y, height: Math.max(markHeight, textSize * 1.1), color, ...style }}
    >
      <span className="rt-brand__mark" style={{ width: boxW, height: markHeight }}>
        <EchoMark size={glyphH} />
      </span>
      <span
        className="rt-brand__word"
        style={{ fontSize: textSize, letterSpacing: -textSize * 0.016, lineHeight: `${textSize * 1.1}px`, marginLeft: markHeight * 0.4 }}
      >
        echo
      </span>
    </div>
  )
}

/** Square/round image box with a tint fallback; the photo is center-cropped. */
export function Cover({ url, tint, size, radius, style }: {
  url?: string
  tint: string
  size?: number
  radius: number
  style?: CSSProperties
}) {
  return (
    <div className="rt-cover" style={{ width: size, height: size, borderRadius: radius, background: tint, ...style }}>
      {url ? <img src={url} alt="" /> : null}
    </div>
  )
}

const reveal = (t: number, rise = 40): CSSProperties => ({
  opacity: t,
  transform: `translateY(${(1 - t) * rise}px)`,
})

interface CardProps {
  recap: Recap
}

// ---- T3 · Cartaz ------------------------------------------------------------

export interface CartazProps extends CardProps {
  /** Intro animation 0..1 (1 = final card). */
  progress?: number
  /** Word loop 0..1 (0 = at rest). */
  loop?: number
  /** Seconds of animation time; drives the cover drift inside the orange block. */
  clock?: number
}

function PosterWord({ text, x, y, color, size = 330, alpha = 1, sprite }: {
  sprite: string
  text: string
  x: number
  y: number
  color: string
  size?: number
  alpha?: number
}) {
  return (
    <div
      className="rt-word"
      data-sprite={sprite}
      style={{
        left: x,
        top: y,
        fontSize: size,
        letterSpacing: (-14 * size) / 330,
        lineHeight: `${(240 * size) / 330}px`,
        color,
        opacity: alpha,
      }}
    >
      {text}
    </div>
  )
}

/**
 * Cartaz. The defaults (progress 1, loop 0, clock 0) render the finished static
 * card — what the PNG captures; the live preview and the MP4 export drive the props.
 */
export const CartazCard = forwardRef<HTMLDivElement, CartazProps>(function CartazCard(
  { recap, progress = 1, loop = 0, clock = 0 },
  ref,
) {
  const accent = accentOf(recap)
  const s = posterState(progress, loop, clock)
  const period = periodLabel(recap.source, recap.period).toUpperCase()
  const name = recap.user.trim().toUpperCase() || 'SEU'
  const nameSize = Math.min(330, Math.trunc((330 * 5) / Math.max(name.length, 5)))
  const covers = Array.from(new Set(recap.topTracks.map((t) => t.image).filter((u): u is string => !!u)))
  const level = 0.26 * s.block
  const hero = recap.heroArtist

  return (
    <div
      ref={ref}
      className="rt rt--cartaz"
      style={{
        background: `radial-gradient(circle 900px at 540px 1689.6px, ${rgba(accent, 0.22 * s.glow)}, ${rgba(accent, 0)}), #0F0D0C`,
      }}
    >
      <Brand sprite="brand" color={accent} markHeight={72} textSize={86} x={60} y={170} style={reveal(s.brand, 24)} />
      <Mono sprite="period" x={720} y={196} w={300} size={36} color="rgba(168, 159, 146, 0.9)" align="right" style={reveal(s.period, 24)}>
        {period}
      </Mono>

      <div
        className="rt-block"
        style={{
          background: accent,
          opacity: s.block,
          transform: `scale(${0.92 + 0.08 * s.block})`,
        }}
      >
        {covers.length > 0 && (
          <>
            <img
              className="rt-drift"
              src={covers[s.driftIdx % covers.length]}
              alt=""
              style={{ opacity: level * (1 - s.driftFade) }}
            />
            {s.driftFade > 0 && (
              <img
                className="rt-drift"
                src={covers[(s.driftIdx + 1) % covers.length]}
                alt=""
                style={{ opacity: level * s.driftFade }}
              />
            )}
          </>
        )}
        <PosterWord
          sprite="ghost"
          text="RECAP"
          x={-50}
          y={-30 + Math.trunc((1 - s.ghostT) * 120) + Math.trunc(s.ghostDy / 3)}
          color={INK}
          alpha={0.14 * s.ghostT * s.ghostA}
        />
        <PosterWord
          sprite="name"
          text={name}
          x={-40}
          y={190 + Math.trunc((1 - s.nameT) * 360) + s.nameDy}
          color={INK}
          size={nameSize}
          alpha={s.nameA}
        />
        <PosterWord
          sprite="recap"
          text="RECAP"
          x={-40}
          y={420 + Math.trunc((1 - s.recapT) * 360) + s.recapDy}
          color={INK}
          alpha={s.recapA}
        />
        <Mono sprite="tag" x={70} y={760} size={34} color={INK} style={reveal(s.tag, 20)}>
          {`${period} · STORY`}
        </Mono>
        <div className="rt-dot" style={{ transform: `scale(${s.dot})` }} />
      </div>

      <Mono sprite="artistLabel" x={70} y={1190} size={30} color={GREY} style={reveal(s.artistLabel, 24)}>
        ARTISTA Nº 1
      </Mono>
      <Display sprite="artistName" x={66} y={1230} w={940} size={118} color={CREAM} ls={-4} style={reveal(s.artistName, 50)}>
        {hero?.name ?? '—'}
      </Display>

      <div className="rt-col" style={{ left: 70, top: 1410 }}>
        {recap.topTracks.slice(0, 5).map((t, i) => (
          <div className="rt-row" key={`t${i}`} data-sprite={`track${i}`} style={reveal(s.trackRows[i], 30)}>
            <Display w={56} size={52} color={i === 0 ? accent : '#4A423B'} ls={-2} style={{ flex: 'none' }}>
              {i + 1}
            </Display>
            <Cover url={t.image} tint="#2A2420" size={60} radius={12} style={{ flex: 'none' }} />
            <div className="rt-stack" style={{ width: 400, marginLeft: 22 }}>
              <Display size={32} color={CREAM} weight={600}>
                {t.name}
              </Display>
              <Mono size={20} color={GREY} bold={false} w={400}>
                {t.artist.toUpperCase()}
              </Mono>
            </div>
          </div>
        ))}
      </div>

      <Mono sprite="tracksLabel" x={640} y={1372} size={22} color={GREY} style={reveal(s.tracksLabel, 20)}>
        TOP ARTISTAS
      </Mono>
      <div className="rt-col" style={{ left: 640, top: 1410 }}>
        {recap.topArtists.slice(0, 5).map((a, i) => (
          <div className="rt-row" key={`a${i}`} data-sprite={`artist${i}`} style={reveal(s.artistRows[i], 30)}>
            <Cover url={a.image} tint="#2A2420" size={60} radius={30} style={{ flex: 'none' }} />
            <div className="rt-stack" style={{ width: 290, marginLeft: 20 }}>
              <Display size={30} color={CREAM} weight={600}>
                {a.name}
              </Display>
              {a.playcount != null && (
                <Mono size={20} color={GREY} bold={false} w={290}>
                  {`${fmt(a.playcount)} PLAYS`}
                </Mono>
              )}
            </div>
          </div>
        ))}
      </div>

      <Mono sprite="footer" x={60} y={1824} size={26} color="#6F665B" style={reveal(s.footer, 16)}>
        GERADO NO ECHO
      </Mono>
    </div>
  )
})

// ---- T2 · Dash --------------------------------------------------------------

function StatBox({ x, value, label }: { x: number; value: string; label: string }) {
  return (
    <div className="rt-box" style={{ left: x, top: 1620, width: 468, height: 150, borderRadius: 20, background: PANEL }}>
      <Mono x={30} y={22} w={420} size={60} color={CREAM}>
        {value}
      </Mono>
      <Mono x={30} y={100} w={420} size={20} color={MUTED} bold={false}>
        {label}
      </Mono>
    </div>
  )
}

export const DashCard = forwardRef<HTMLDivElement, CardProps>(function DashCard({ recap }, ref) {
  const accent = accentOf(recap)
  const period = periodLabel(recap.source, recap.period)
  const figure = heroFigure(recap)
  const stats = statsOf(recap)
  const box1 = recap.scrobbles != null
    ? { value: fmt(recap.scrobbles), label: 'scrobbles' }
    : { value: fmt(recap.topArtists.length), label: 'artistas no top' }
  const box2 = stats[1] ?? { value: fmt(recap.topTracks.length), label: 'músicas no top' }

  return (
    <div
      ref={ref}
      className="rt rt--dash"
      style={{
        background: `radial-gradient(circle 900px at 540px 40px, ${rgba(accent, 0.28)}, ${rgba(accent, 0)}), ${DEEP}`,
      }}
    >
      <Brand color={accent} markHeight={54} textSize={65} x={60} y={110} />
      <Mono x={720} y={140} w={300} size={36} color={MUTED} align="right">
        {period.toUpperCase()}
      </Mono>

      <Display x={60} y={300} size={96} color={MUTED} weight={600}>
        Você ouviu
      </Display>
      <Display x={54} y={410} w={980} size={250} color={accent} ls={-8}>
        {figure.value}
      </Display>
      <Display x={60} y={670} size={96} color={CREAM} weight={700}>
        {figure.label}
      </Display>
      <Display x={60} y={780} size={96} color={MUTED} weight={600}>
        {phraseTail(period)}
      </Display>

      <Mono x={60} y={960} size={26} color={MUTED}>
        SEUS TOP ARTISTAS
      </Mono>
      {recap.topArtists.slice(0, 3).map((a, i) => (
        <div
          className="rt-box"
          key={i}
          style={{ left: 60 + i * 328, top: 1020, width: 304, height: 560, borderRadius: 28, background: TINTS[i % TINTS.length] }}
        >
          {a.image ? <img className="rt-fill" src={a.image} alt="" /> : null}
          <div
            className="rt-fill"
            style={{ background: 'linear-gradient(to bottom, rgba(13, 11, 10, 0) 200px, rgba(13, 11, 10, 0.8) 560px)' }}
          />
          <Display x={22} y={6} size={130} color={CREAM}>
            {i + 1}
          </Display>
          <Display x={24} y={458} w={256} size={28} color={CREAM} weight={700}>
            {a.name}
          </Display>
          {a.playcount != null && (
            <Mono x={24} y={500} size={18} color={MUTED} bold={false}>
              {`${fmt(a.playcount)} plays`}
            </Mono>
          )}
        </div>
      ))}

      <StatBox x={60} value={box1.value} label={box1.label} />
      <StatBox x={552} value={box2.value} label={box2.label} />

      <Mono x={60} y={1824} size={26} color={DIM}>
        GERADO NO ECHO
      </Mono>
      <Mono x={500} y={1824} w={520} size={26} color={DIM} bold={false} align="right">
        {`@${recap.user}`}
      </Mono>
    </div>
  )
})

// ---- T4 · Mini --------------------------------------------------------------

function NumberCard({ x, label, value, note, valueColor }: {
  x: number
  label: string
  value: string
  note: string
  valueColor: string
}) {
  return (
    <div className="rt-box" style={{ left: x, top: 820, width: 482, height: 280, borderRadius: 36, background: PANEL }}>
      <Mono x={36} y={34} size={24} color={MUTED}>
        {label}
      </Mono>
      <Mono x={32} y={96} w={430} size={96} color={valueColor}>
        {value}
      </Mono>
      <Mono x={36} y={216} w={420} size={26} color={MUTED} bold={false}>
        {note}
      </Mono>
    </div>
  )
}

/** Spotify variant of Mini: top-5 artists as photos, #1 large, bottoms aligned (a "skyline"). */
function ArtistFacesCard({ recap, accent }: { recap: Recap; accent: string }) {
  return (
    <div className="rt-box" style={{ left: 48, top: 820, width: 984, height: 300, borderRadius: 36, background: PANEL }}>
      <Mono x={36} y={28} size={24} color={MUTED}>
        TOP ARTISTAS
      </Mono>
      {recap.topArtists.slice(0, 5).map((a, i) => {
        const size = i === 0 ? 168 : 124
        const x = i === 0 ? 36 : 36 + 168 + 36 + (i - 1) * 168
        const w = i === 0 ? 168 : 150
        return (
          <div key={i}>
            <div
              className="rt-box"
              style={{
                left: x,
                top: 236 - size,
                width: size,
                height: size,
                borderRadius: '50%',
                background: TINTS[i % TINTS.length],
                border: i === 0 ? `4px solid ${accent}` : undefined,
              }}
            >
              {a.image ? <img className="rt-fill" src={a.image} alt="" /> : null}
            </div>
            <Display
              x={x - (w - size) / 2}
              y={246}
              w={w}
              size={i === 0 ? 24 : 20}
              color={i === 0 ? CREAM : MUTED}
              weight={600}
              align="center"
            >
              {a.name}
            </Display>
          </div>
        )
      })}
    </div>
  )
}

export const MiniCard = forwardRef<HTMLDivElement, CardProps>(function MiniCard({ recap }, ref) {
  const accent = accentOf(recap)
  const period = periodLabel(recap.source, recap.period).toUpperCase()
  const hero = recap.heroArtist
  const hasNumbers = recap.minutes != null || recap.scrobbles != null
  const tracksY = hasNumbers ? 1120 : 1140
  const tracksH = hasNumbers ? 420 : 400
  const step = hasNumbers ? 66 : 62
  const albumCovers = Array.from(new Set(recap.topTracks.map((t) => t.image).filter((u): u is string => !!u))).slice(0, 5)
  const topTrack = recap.topTracks[0]

  return (
    <div ref={ref} className="rt rt--mini" style={{ background: DEEP }}>
      <Brand color={accent} markHeight={54} textSize={65} x={48} y={90} />
      <Mono x={720} y={110} w={312} size={36} color={MUTED} align="right">
        {period}
      </Mono>

      <div className="rt-box" style={{ left: 48, top: 240, width: 984, height: 560, borderRadius: 36, background: accent }}>
        {recap.heroImage ? (
          <>
            <img className="rt-fill" src={recap.heroImage} alt="" />
            <div className="rt-fill" style={{ background: rgba(accent, 0.8) }} />
          </>
        ) : (
          <>
            <div className="rt-box" style={{ left: 560, top: -40, width: 520, height: 520, borderRadius: '50%', background: 'rgba(13, 11, 10, 0.16)' }} />
            <div className="rt-box" style={{ left: 470, top: 330, width: 700, height: 640, borderRadius: '50%', background: 'rgba(13, 11, 10, 0.16)' }} />
          </>
        )}
        <Mono x={40} y={40} size={28} color="rgba(20, 16, 13, 0.7)">
          ARTISTA Nº 1
        </Mono>
        <Display x={40} y={262} w={900} size={120} color={INK} lh={112} lines={2}>
          {hero?.name ?? '—'}
        </Display>
        {hero?.playcount != null && (
          <Mono x={40} y={500} size={28} color={INK}>
            {`${fmt(hero.playcount)} plays`}
          </Mono>
        )}
      </div>

      {hasNumbers ? (
        <>
          {recap.minutes != null && (
            <NumberCard x={48} label="MINUTOS" value={fmt(recap.minutes)} note={`~${fmt(Math.trunc(recap.minutes / 60))} horas`} valueColor={accent} />
          )}
          {recap.scrobbles != null && (
            <NumberCard x={550} label="SCROBBLES" value={fmt(recap.scrobbles)} note="tocadas" valueColor={CREAM} />
          )}
        </>
      ) : (
        <ArtistFacesCard recap={recap} accent={accent} />
      )}

      <div className="rt-box" style={{ left: 48, top: tracksY, width: 984, height: tracksH, borderRadius: 36, background: PANEL }}>
        <Mono x={36} y={32} size={24} color={MUTED}>
          TOP MÚSICAS
        </Mono>
        {recap.topTracks.slice(0, 5).map((t, i) => {
          const y = 76 + i * step
          return (
            <div key={i}>
              <Mono x={36} y={y + 16} size={26} color={i === 0 ? accent : MUTED}>
                {i + 1}
              </Mono>
              <Cover url={t.image} tint="#2A221C" size={56} radius={10} style={{ position: 'absolute', left: 80, top: y }} />
              <Display x={156} y={y + 2} w={780} size={28} color={CREAM} weight={600}>
                {t.name}
              </Display>
              <Mono x={156} y={y + 34} w={780} size={18} color={MUTED} bold={false}>
                {t.artist}
              </Mono>
            </div>
          )
        })}
      </div>

      <div className="rt-box" style={{ left: 48, top: 1560, width: 482, height: 240, borderRadius: 36, background: PANEL }}>
        {hasNumbers ? (
          <>
            <Mono x={32} y={26} size={22} color={MUTED}>
              TOP ARTISTAS
            </Mono>
            {recap.topArtists.slice(0, 5).map((a, i) => (
              <Display
                key={i}
                x={32}
                y={66 + i * 34}
                w={420}
                size={24}
                color={i === 0 ? CREAM : MUTED}
                weight={600}
                style={{ whiteSpace: 'pre' }}
              >
                {`${i + 1}  ${a.name}`}
              </Display>
            ))}
          </>
        ) : (
          <>
            <Mono x={32} y={26} size={22} color={MUTED}>
              MÚSICA Nº 1
            </Mono>
            <Cover url={topTrack?.image} tint={TINTS[1]} size={138} radius={16} style={{ position: 'absolute', left: 32, top: 70 }} />
            <Display x={186} y={74} w={270} size={28} color={CREAM} weight={700} lh={32} lines={3}>
              {topTrack?.name ?? '—'}
            </Display>
            <Mono x={186} y={178} w={270} size={18} color={accent} bold={false}>
              {topTrack?.artist ?? ''}
            </Mono>
          </>
        )}
      </div>

      <div className="rt-box" style={{ left: 550, top: 1560, width: 482, height: 240, borderRadius: 36, background: PANEL }}>
        <Mono x={32} y={26} size={22} color={MUTED}>
          TOP ÁLBUNS
        </Mono>
        {[0, 1, 2, 3, 4].map((i) => (
          <Cover
            key={i}
            url={albumCovers[i]}
            tint={TINTS[i % TINTS.length]}
            size={76}
            radius={12}
            style={{ position: 'absolute', left: 32 + i * 84, top: 90 }}
          />
        ))}
      </div>

      <Mono x={48} y={1840} size={26} color={DIM}>
        GERADO NO ECHO
      </Mono>
      <Mono x={500} y={1840} w={532} size={26} color={DIM} bold={false} align="right">
        {`@${recap.user}`}
      </Mono>
    </div>
  )
})
