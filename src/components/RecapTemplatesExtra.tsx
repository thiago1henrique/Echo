import { forwardRef } from 'react'
import type { CSSProperties } from 'react'
import type { Recap } from '../types'
import { periodLabel } from '../types'
import { fmt } from '../lib/format'
import {
  CREAM, DEEP, DIM, INK, MUTED, PANEL, TINTS,
  accentOf, fitSize, heroFigure, periodTail, phraseTail, rgba,
} from '../lib/recapTheme'
import { Brand, Cover, Display, Mono } from './RecapTemplates'
import './RecapTemplatesExtra.css'

// Story templates 1080×1920 — Recibo, Mosaico, Barras, Aura, Capa. Same rules as
// RecapTemplates.tsx: every number is a pixel of the exported PNG, the cards render at
// full size and <ScaledPreview> scales them down. They only use what Recap carries, and
// fall back gracefully for Spotify (no plays / minutes / scrobbles).

interface CardProps {
  recap: Recap
}

const abs = (x: number, y: number, w?: number, h?: number, extra?: CSSProperties): CSSProperties => ({
  position: 'absolute',
  left: x,
  top: y,
  width: w,
  height: h,
  ...extra,
})

const stripCovers = (recap: Recap) => recap.topTracks.slice(0, 5).map((t) => t.image)

// ---- T5 · Recibo ------------------------------------------------------------

const PAPER_W = 780
const TOOTH = 26

function Zigzag({ flip }: { flip?: boolean }) {
  const n = PAPER_W / TOOTH
  let d = 'M0,0'
  for (let i = 0; i < n; i++) d += ` L${i * TOOTH + TOOTH / 2},22 L${(i + 1) * TOOTH},0`
  return (
    <svg
      width={PAPER_W}
      height={22}
      viewBox={`0 0 ${PAPER_W} 22`}
      style={{ display: 'block', transform: flip ? 'scaleY(-1)' : undefined }}
    >
      <path d={`${d} Z`} fill={CREAM} />
    </svg>
  )
}

function ReceiptLine({ left, right, size, rightSize, rightColor, rightMax }: {
  left: string
  right: string
  size: number
  rightSize?: number
  rightColor?: string
  rightMax?: number
}) {
  return (
    <div className="rx-line" style={{ fontSize: size }}>
      <span className="rx-line__l">{left}</span>
      <i className="rx-line__dots" />
      <span className="rx-line__r" style={{ color: rightColor, maxWidth: rightMax, fontSize: rightSize }}>
        {right}
      </span>
    </div>
  )
}

const RECEIPT_DASH = <div className="rx-dash" />

export const ReciboCard = forwardRef<HTMLDivElement, CardProps>(function ReciboCard({ recap }, ref) {
  const accent = accentOf(recap)
  const period = periodLabel(recap.source, recap.period).toUpperCase()
  const figure = heroFigure(recap)
  const hero = recap.heroArtist
  const tracks = recap.topTracks.slice(0, 6)
  const extra = recap.scrobbles != null
    ? { label: 'SCROBBLES', value: fmt(recap.scrobbles) }
    : { label: 'GÊNERO Nº 1', value: (recap.genres?.[0] ?? '—').toUpperCase() }

  return (
    <div
      ref={ref}
      className="rt rt--recibo"
      style={{ background: `radial-gradient(circle 900px at 540px 1700px, ${rgba(accent, 0.22)}, ${rgba(accent, 0)}), #0F0D0C` }}
    >
      <Brand color={accent} markHeight={54} textSize={65} x={60} y={90} />
      <Mono x={720} y={110} w={300} size={36} color={MUTED} align="right">
        {period}
      </Mono>

      <div className="rx-paper" style={abs(150, 215, PAPER_W)}>
        <Zigzag flip />
        <div className="rx-body">
          <div className="rx-title">** RECIBO DE ESCUTA **</div>
          <div className="rx-sub">{`${period} · @${recap.user}`.toUpperCase()}</div>
          {RECEIPT_DASH}
          <div className="rx-head">ITEM</div>
          {tracks.map((t, i) => (
            <div className="rx-item" key={i}>
              <ReceiptLine
                size={32}
                left={`${String(i + 1).padStart(2, '0')} ${t.name}`}
                right={t.playcount != null ? `${fmt(t.playcount)}x` : ''}
              />
              <div className="rx-item__artist">{t.artist}</div>
            </div>
          ))}
          {RECEIPT_DASH}
          <div className="rx-head">ARTISTA Nº 1</div>
          <div className="rx-hero">{hero?.name ?? '—'}</div>
          <ReceiptLine size={28} left={extra.label} right={extra.value} rightMax={300} />
          {RECEIPT_DASH}
          <ReceiptLine size={34} rightSize={fitSize(figure.value, 300, 84, 0.62)} left={`TOTAL ${figure.label.toUpperCase()}`} right={figure.value} rightColor={accent} />
          <div className="rx-bars" />
          <div className="rx-thanks">OBRIGADO POR OUVIR</div>
          <div className="rx-foot">GERADO NO ECHO</div>
        </div>
        <Zigzag />
      </div>
    </div>
  )
})

// ---- T6 · Mosaico -----------------------------------------------------------

function RankTile({ url, tint, x, y, w, h, rank, big }: {
  url?: string
  tint: string
  x: number
  y: number
  w: number
  h: number
  rank: number
  big?: boolean
}) {
  return (
    <div className="rt-box" style={{ left: x, top: y, width: w, height: h, borderRadius: 28, background: tint }}>
      {url ? <img className="rt-fill" src={url} alt="" /> : null}
      <div
        className="rt-fill"
        style={{ background: 'linear-gradient(to bottom, rgba(13, 11, 10, 0) 55%, rgba(13, 11, 10, 0.6) 100%)' }}
      />
      <Display x={big ? 30 : 22} y={h - (big ? 250 : 140)} size={big ? 220 : 120} color={CREAM} ls={-4}>
        {rank}
      </Display>
    </div>
  )
}

export const MosaicoCard = forwardRef<HTMLDivElement, CardProps>(function MosaicoCard({ recap }, ref) {
  const accent = accentOf(recap)
  const period = periodLabel(recap.source, recap.period).toUpperCase()
  const figure = heroFigure(recap)
  const covers = stripCovers(recap)
  const tracks = recap.topTracks.slice(0, 5)
  const figSize = fitSize(figure.value, 260, 130, 0.6)

  return (
    <div ref={ref} className="rt rt--mosaico" style={{ background: DEEP }}>
      <Brand color={accent} markHeight={54} textSize={65} x={60} y={100} />
      <Mono x={720} y={122} w={300} size={34} color={MUTED} align="right">
        {period}
      </Mono>
      <Mono x={60} y={252} size={28} color={MUTED}>
        SUAS MÚSICAS EM CAPAS
      </Mono>

      <RankTile url={covers[0]} tint={TINTS[0]} x={60} y={310} w={640} h={640} rank={1} big />
      <RankTile url={covers[1]} tint={TINTS[1]} x={720} y={310} w={300} h={314} rank={2} />
      <RankTile url={covers[2]} tint={TINTS[2]} x={720} y={636} w={300} h={314} rank={3} />
      <RankTile url={covers[3]} tint={TINTS[3]} x={60} y={970} w={300} h={300} rank={4} />
      <RankTile url={covers[4]} tint={TINTS[4]} x={380} y={970} w={300} h={300} rank={5} />

      <div className="rt-box" style={{ left: 700, top: 970, width: 320, height: 300, borderRadius: 28, background: PANEL }}>
        <Mono x={30} y={30} size={22} color={MUTED}>
          {figure.label.toUpperCase()}
        </Mono>
        <Display x={26} y={90} w={270} size={figSize} color={accent} ls={-5}>
          {figure.value}
        </Display>
        <Mono x={30} y={236} w={260} size={20} color={MUTED} bold={false}>
          {phraseTail(period).replace(/\.$/, '')}
        </Mono>
      </div>

      {tracks.map((t, i) => (
        <div key={i}>
          <Mono x={60} y={1338 + i * 90} size={i === 0 ? 34 : 28} color={i === 0 ? accent : MUTED}>
            {i + 1}
          </Mono>
          <Display x={116} y={1332 + i * 90} w={560} size={i === 0 ? 46 : 40} color={i === 0 ? CREAM : MUTED} weight={i === 0 ? 800 : 600}>
            {t.name}
          </Display>
          <Mono x={690} y={1342 + i * 90} w={330} size={24} color={DIM} bold={false} align="right">
            {t.artist}
          </Mono>
        </div>
      ))}

      <Mono x={60} y={1824} size={26} color={DIM}>
        GERADO NO ECHO
      </Mono>
      <Mono x={500} y={1824} w={520} size={26} color={DIM} bold={false} align="right">
        {`@${recap.user}`}
      </Mono>
    </div>
  )
})

// ---- T7 · Barras ------------------------------------------------------------

export const BarrasCard = forwardRef<HTMLDivElement, CardProps>(function BarrasCard({ recap }, ref) {
  const accent = accentOf(recap)
  const label = periodLabel(recap.source, recap.period)
  const artists = recap.topArtists.slice(0, 5)
  const withPlays = artists.length > 0 && artists.every((a) => a.playcount != null)
  const max = Math.max(1, ...artists.map((a) => a.playcount ?? 0))
  const figure = heroFigure(recap)
  const metrics: { label: string; value: string; color: string }[] = recap.scrobbles != null
    ? [
        { label: figure.label.toUpperCase(), value: figure.value, color: accent },
        { label: 'SCROBBLES', value: fmt(recap.scrobbles), color: CREAM },
        { label: 'ARTISTAS NO TOP', value: fmt(recap.topArtists.length), color: CREAM },
      ]
    : [
        { label: figure.label.toUpperCase(), value: figure.value, color: accent },
        { label: 'GÊNERO Nº 1', value: recap.genres?.[0] ?? '—', color: CREAM },
        { label: 'ARTISTAS NO TOP', value: fmt(recap.topArtists.length), color: CREAM },
      ]

  return (
    <div
      ref={ref}
      className="rt rt--barras"
      style={{ background: `radial-gradient(circle 900px at 1080px 0px, ${rgba(accent, 0.2)}, ${rgba(accent, 0)}), ${DEEP}` }}
    >
      <Brand color={accent} markHeight={54} textSize={65} x={60} y={110} />
      <Mono x={720} y={132} w={300} size={34} color={MUTED} align="right">
        {label.toUpperCase()}
      </Mono>

      <Display x={56} y={290} size={130} color={CREAM} ls={-5} lh={132}>
        Quem
      </Display>
      <Display x={56} y={422} size={130} color={CREAM} ls={-5} lh={132}>
        mandou
      </Display>
      <Display x={56} y={554} w={960} size={130} color={accent} ls={-5} lh={132}>
        {periodTail(label)}
      </Display>

      {metrics.map((m, i) => (
        <div key={i}>
          <div className="rt-box" style={{ left: 60 + i * 330, top: 740, width: 300, height: 3, background: '#3A322B' }} />
          <Mono x={60 + i * 330} y={762} w={300} size={22} color={MUTED} bold={false}>
            {m.label}
          </Mono>
          <Mono x={60 + i * 330} y={806} w={300} size={fitSize(m.value, 300, 70, 0.7)} color={m.color}>
            {m.value}
          </Mono>
        </div>
      ))}

      <Mono x={60} y={960} size={26} color={MUTED}>
        {withPlays ? 'TOP ARTISTAS · PLAYS' : 'TOP ARTISTAS · RANKING'}
      </Mono>
      {artists.map((a, i) => {
        const y = 1020 + i * 150
        const w = withPlays ? Math.max(60, Math.round(((a.playcount ?? 0) / max) * 760)) : 760 - i * 90
        return (
          <div key={i}>
            <Display x={60} y={y} w={960} size={i === 0 ? 48 : 40} color={i === 0 ? CREAM : MUTED} weight={i === 0 ? 800 : 600}>
              {a.name}
            </Display>
            <div
              className="rt-box"
              style={{ left: 60, top: y + 66, width: w, height: 56, borderRadius: 14, background: i === 0 ? accent : '#3A322B' }}
            />
            {withPlays && (
              <Mono x={60 + w + 22} y={y + 76} size={i === 0 ? 34 : 30} color={i === 0 ? CREAM : MUTED}>
                {fmt(a.playcount ?? 0)}
              </Mono>
            )}
          </div>
        )
      })}

      <Mono x={60} y={1840} size={26} color={DIM}>
        GERADO NO ECHO
      </Mono>
      <Mono x={500} y={1840} w={520} size={26} color={DIM} bold={false} align="right">
        {`@${recap.user}`}
      </Mono>
    </div>
  )
})

// ---- T8 · Aura --------------------------------------------------------------

function GlassCard({ x, y, label, value }: { x: number; y: number; label: string; value: string }) {
  return (
    <div
      className="rt-box"
      style={{
        left: x,
        top: y,
        width: 468,
        height: 236,
        borderRadius: 44,
        background: 'rgba(255, 255, 255, 0.08)',
        border: '2px solid rgba(255, 255, 255, 0.12)',
      }}
    >
      <Mono x={40} y={36} size={22} color="rgba(255, 255, 255, 0.65)" bold={false}>
        {label}
      </Mono>
      <Display x={40} y={86} w={388} size={52} color="#FFFFFF" weight={700} lh={56} lines={2}>
        {value}
      </Display>
    </div>
  )
}

export const AuraCard = forwardRef<HTMLDivElement, CardProps>(function AuraCard({ recap }, ref) {
  const accent = accentOf(recap)
  const label = periodLabel(recap.source, recap.period)
  const figure = heroFigure(recap)
  const covers = stripCovers(recap).slice(0, 4)
  const bigSize = fitSize(figure.value, 960, 380, 0.56)
  // Companion hues for the soft background; the accent stays the source's colour.
  const [c2, c3] = recap.source === 'spotify' ? ['#2D6A8F', '#C8D65A'] : ['#7B5FB3', '#F0A15A']
  const third = recap.scrobbles != null
    ? { label: 'SCROBBLES', value: fmt(recap.scrobbles) }
    : { label: 'GÊNERO Nº 1', value: recap.genres?.[0] ?? '—' }

  return (
    <div
      ref={ref}
      className="rt rt--aura"
      style={{
        background: [
          `radial-gradient(circle 760px at 120px 220px, ${rgba(accent, 0.8)}, ${rgba(accent, 0)} 72%)`,
          `radial-gradient(circle 700px at 980px 900px, ${rgba(c2, 0.6)}, ${rgba(c2, 0)} 72%)`,
          `radial-gradient(circle 700px at 160px 1700px, ${rgba(c3, 0.45)}, ${rgba(c3, 0)} 72%)`,
          '#14100F',
        ].join(', '),
      }}
    >
      <Brand color="#FFFFFF" markHeight={54} textSize={65} x={60} y={110} />
      <Mono x={720} y={132} w={300} size={34} color="rgba(255, 255, 255, 0.75)" align="right">
        {label.toUpperCase()}
      </Mono>

      {[0, 1, 2, 3].map((i) => (
        <Cover
          key={i}
          url={covers[i]}
          tint={TINTS[i % TINTS.length]}
          size={250}
          radius={30}
          style={{
            position: 'absolute',
            left: 60 + i * 230,
            top: [300, 270, 310, 280][i],
            transform: `rotate(${[-6, 3, -2, 5][i]}deg)`,
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.35)',
          }}
        />
      ))}

      <Display x={56} y={640} w={980} size={bigSize} color="#FFFFFF" weight={300} ls={-bigSize * 0.045}>
        {figure.value}
      </Display>
      <Display x={64} y={1010} w={960} size={80} color="rgba(255, 255, 255, 0.88)" weight={500} lh={88}>
        {figure.label}
      </Display>
      <Display x={64} y={1098} w={960} size={80} color="rgba(255, 255, 255, 0.88)" weight={500} lh={88}>
        {phraseTail(label)}
      </Display>

      <GlassCard x={60} y={1290} label="TOP ARTISTA" value={recap.heroArtist?.name ?? '—'} />
      <GlassCard x={552} y={1290} label="TOP MÚSICA" value={recap.topTracks[0]?.name ?? '—'} />
      <GlassCard x={60} y={1550} label="ARTISTA Nº 2" value={recap.topArtists[1]?.name ?? '—'} />
      <GlassCard x={552} y={1550} label={third.label} value={third.value} />

      <Mono x={60} y={1836} w={960} size={26} color="rgba(255, 255, 255, 0.5)">
        {`GERADO NO ECHO · @${recap.user}`}
      </Mono>
    </div>
  )
})

// ---- T9 · Capa --------------------------------------------------------------

const ABRIL: CSSProperties = { fontFamily: "'Abril Fatface', Georgia, serif" }

function Hair({ y }: { y: number }) {
  return <div className="rt-box" style={{ left: 60, top: y, width: 960, height: 3, background: INK }} />
}

function CapaColumn({ x, title, rows }: { x: number; title: string; rows: string[] }) {
  return (
    <>
      <Mono x={x} y={1372} size={22} color={INK}>
        {title}
      </Mono>
      {rows.map((name, i) => (
        <div key={i}>
          <Mono x={x} y={1428 + i * 66} size={26} color={i === 0 ? '#B8321C' : INK}>
            {i + 1}
          </Mono>
          <Display x={x + 44} y={1424 + i * 66} w={400} size={34} color={INK} weight={600}>
            {name}
          </Display>
        </div>
      ))}
    </>
  )
}

export const CapaCard = forwardRef<HTMLDivElement, CardProps>(function CapaCard({ recap }, ref) {
  const accent = accentOf(recap)
  const label = periodLabel(recap.source, recap.period)
  const figure = heroFigure(recap)
  const hero = recap.heroArtist
  const name = (hero?.name ?? '—').toUpperCase()
  const nameSize = name.length > 16 ? 120 : name.length > 10 ? 160 : 200

  return (
    <div ref={ref} className="rt rt--capa" style={{ background: CREAM, color: INK }}>
      <Display x={52} y={70} size={270} color={INK} weight={400} ls={-10} lh={230} style={ABRIL}>
        echo
      </Display>
      <Hair y={338} />
      <Mono x={60} y={358} size={26} color={INK}>
        {`EDIÇÃO · ${label.toUpperCase()}`}
      </Mono>
      <Mono x={420} y={358} w={600} size={26} color={INK} align="right">
        {`${figure.value} ${figure.label.toUpperCase()}`}
      </Mono>
      <Hair y={414} />

      <div className="rt-box" style={{ left: 60, top: 450, width: 960, height: 690, background: accent }}>
        {recap.heroImage ? (
          <>
            <img className="rt-fill" src={recap.heroImage} alt="" style={{ filter: 'grayscale(1) contrast(1.15)' }} />
            <div className="rt-fill" style={{ background: rgba(accent, 0.58) }} />
          </>
        ) : (
          <>
            <div className="rt-box" style={{ left: 560, top: -60, width: 560, height: 560, borderRadius: '50%', background: 'rgba(20, 16, 13, 0.14)' }} />
            <div className="rt-box" style={{ left: 430, top: 340, width: 760, height: 700, borderRadius: '50%', background: 'rgba(20, 16, 13, 0.14)' }} />
          </>
        )}
        <div className="rt-fill" style={{ background: 'linear-gradient(to bottom, rgba(20, 16, 13, 0) 45%, rgba(20, 16, 13, 0.6) 100%)' }} />
        <Mono x={32} y={32} size={26} color={CREAM}>
          {`ARTISTA Nº 1${hero?.playcount != null ? ` · ${fmt(hero.playcount)} PLAYS` : ''}`}
        </Mono>
        <div style={{ position: 'absolute', left: 32, bottom: 34, width: 896 }}>
          <Display size={nameSize} color={CREAM} ls={-nameSize * 0.04} lh={nameSize * 0.9} lines={2}>
            {name}
          </Display>
        </div>
      </div>

      <Display x={60} y={1170} w={960} size={66} color={INK} weight={400} lh={74} lines={2} style={ABRIL}>
        {`${figure.value} ${figure.label} ${phraseTail(label)}`}
      </Display>

      <Hair y={1346} />
      <CapaColumn x={60} title="MÚSICAS" rows={recap.topTracks.slice(0, 5).map((t) => t.name)} />
      <div className="rt-box" style={{ left: 540, top: 1372, width: 3, height: 360, background: INK }} />
      <CapaColumn x={580} title="ARTISTAS" rows={recap.topArtists.slice(0, 5).map((a) => a.name)} />
      <Hair y={1780} />

      <Mono x={60} y={1806} size={24} color={INK}>
        GERADO NO ECHO
      </Mono>
      <Mono x={420} y={1806} w={600} size={24} color={INK} bold={false} align="right">
        {`@${recap.user}`}
      </Mono>
    </div>
  )
})
