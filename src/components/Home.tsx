import { useEffect, useState } from 'react'
import type { CSSProperties, FormEvent, ReactNode } from 'react'
import type { Recap } from '../types'
import type { AlbumRecommendation } from '../lib/recommend'
import type { HomeModel, HomeStat, HomeTrack, PeriodOption, Route } from '../lib/home'
import { EchoMark } from './EchoMark'
import { RecapCard } from './RecapCard'
import './Home.css'


/** Staggered-entrance helper: each card drifts up, fades in and settles one after another. */
const stagger = (i: number): CSSProperties => ({ ['--i' as string]: i })

// ---- Small shared pieces --------------------------------------------------

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor" aria-hidden="true">
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
    </svg>
  )
}

/** Round accent button with an arrow — the "go" affordance on bento cards. */
function ActionCircle({ size = 52, play = false }: { size?: number; play?: boolean }) {
  return (
    <span className="action-circle" style={{ width: size, height: size }} aria-hidden="true">
      <span style={{ width: size * 0.46, height: size * 0.46, display: 'block' }}>
        {play ? <PlayIcon /> : <ArrowIcon />}
      </span>
    </span>
  )
}

function Label({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`bento-label ${className}`}>{children}</span>
}

/** A square cover with a tinted placeholder underneath while the image loads (or if there is none). */
function CoverTile({ url, index, className = '' }: { url?: string; index: number; className?: string }) {
  return (
    <span className={`cover-tile cover-tile--${index % 8} ${className}`}>
      {url && <img src={url} alt="" loading="lazy" decoding="async" />}
    </span>
  )
}

const LOADING_MESSAGES = [
  'Puxando seus Grammys…',
  'Um segundo… a Taylor Swift acabou de lançar mais um álbum',
  'Contando quantas vezes você deu replay naquela música…',
  'Afinando os violões e organizando seus artistas…',
  'Procurando aquela música que você não para de ouvir…',
  'Mais um tweet duvidoso do Kanye West…',
  'Passando o som no seu histórico…',
  'Pedindo pro DJ não pular sua faixa favorita…',
]

/** Friendly rotating loading line: a new message fades in every few seconds. */
export function EchoLoadingText() {
  const [i, setI] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % LOADING_MESSAGES.length), 2600)
    return () => clearInterval(id)
  }, [])
  return (
    <p className="loading-text" role="status">
      <span key={i}>{LOADING_MESSAGES[i]}</span>
    </p>
  )
}

// ---- Header + period chip + sheet ----------------------------------------

export function PeriodChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="period-chip" onClick={onClick} aria-haspopup="dialog">
      <span>{label}</span>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-label="Trocar período">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
  )
}


/** Bottom sheet with one row per period; the selected row is filled with the accent. */
export function PeriodSheet<T extends string>({
  options,
  selected,
  onSelect,
  onClose,
}: {
  options: PeriodOption<T>[]
  selected: T
  onSelect: (p: T) => void
  onClose: () => void
}) {
  const [closing, setClosing] = useState(false)
  function close(after?: () => void) {
    setClosing(true)
    setTimeout(() => {
      after?.()
      onClose()
    }, 220)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className={`sheet${closing ? ' is-closing' : ''}`}>
      <div className="sheet__scrim" onClick={() => close()} />
      <div className="sheet__panel" role="dialog" aria-modal="true" aria-label="Período">
        <span className="sheet__grabber" aria-hidden="true" />
        <Label>Período</Label>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`sheet__row${o.value === selected ? ' is-selected' : ''}`}
            onClick={() => close(() => onSelect(o.value))}
          >
            <span className="sheet__row-text">
              <span className="sheet__row-title">{o.label}</span>
              <span className="sheet__row-desc">{o.description}</span>
            </span>
            {o.value === selected && (
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-label="Selecionado">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Sub-screen chrome: "← INÍCIO", a big title, then the screen's own content. */
export function CreateScaffold({
  title,
  onBack,
  children,
}: {
  title: string
  onBack: () => void
  children: ReactNode
}) {
  return (
    <div className="scaffold">
      <button type="button" className="scaffold__back" onClick={onBack} aria-label="Voltar ao início">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5" />
          <path d="M11 6l-6 6 6 6" />
        </svg>
        <span>INÍCIO</span>
      </button>
      <h1 className="scaffold__title">{title.toUpperCase()}</h1>
      {children}
    </div>
  )
}

// ---- Cards ----------------------------------------------------------------

/** The username field + round "save" button that replaces the row while editing. */
function UserEdit({ initial, onSave }: { initial: string; onSave: (value: string) => void }) {
  const [draft, setDraft] = useState(initial)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (draft.trim()) onSave(draft.trim())
  }
  return (
    <form className="user-edit stagger" style={stagger(1)} onSubmit={submit}>
      <input
        className="input"
        placeholder="Usuário do Last.fm"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        autoFocus
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        aria-label="Usuário do Last.fm"
      />
      <button type="submit" className="user-edit__save" disabled={!draft.trim()} aria-label="Salvar usuário">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </button>
    </form>
  )
}

function UserRow({
  label,
  name,
  avatar,
  editable,
  editing,
  onEdit,
  onSave,
}: {
  label: string
  name: string
  avatar?: string
  editable: boolean
  editing: boolean
  onEdit: () => void
  onSave: (value: string) => void
}) {
  if (editing && editable) return <UserEdit initial={name} onSave={onSave} />
  const Tag = editable ? 'button' : 'div'
  return (
    <Tag
      {...(editable ? { type: 'button' as const, onClick: onEdit } : {})}
      className={`user-row stagger${editable ? '' : ' is-static'}`}
      style={stagger(1)}
    >
      <span className="user-row__avatar">
        <span>{name.slice(0, 1).toUpperCase() || '?'}</span>
        {avatar && <img src={avatar} alt="Foto de perfil" />}
      </span>
      <span className="user-row__text">
        <span className="user-row__label">{label}</span>
        <span className="user-row__name">{name || 'toque para informar'}</span>
      </span>
      {editable && (
        <span className="user-row__edit" aria-label="Editar usuário">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
          </svg>
        </span>
      )}
    </Tag>
  )
}

/** Hero: artist #1 with the photo behind a dark gradient, a ghosted "1", the chip and the name. */
function HeroArtistCard({ name, detail, image }: { name: string; detail: string; image?: string }) {
  return (
    <div className="hero-artist stagger" style={stagger(2)}>
      {image && <img className="hero-artist__img" src={image} alt="" />}
      <span className="hero-artist__ghost" aria-hidden="true">1</span>
      <span className="hero-artist__scrim" aria-hidden="true" />
      <span className="hero-artist__chip">ARTISTA Nº 1</span>
      <div className="hero-artist__text">
        <h2 className="hero-artist__name">{name}</h2>
        {detail && <span className="hero-artist__detail">{detail.toUpperCase()}</span>}
      </div>
    </div>
  )
}

/** Number card whose cover shows through a scrim; with several covers it crossfades between them. */
function StatCard({
  accent = false,
  stat,
  phase = 0,
}: {
  accent?: boolean
  stat: HomeStat
  phase?: number
}) {
  const { label, value, note, covers } = stat
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (covers.length < 2) return
    let id: ReturnType<typeof setInterval> | undefined
    const start = setTimeout(() => {
      id = setInterval(() => setIndex((n) => (n + 1) % covers.length), 4000)
    }, phase)
    return () => {
      clearTimeout(start)
      if (id) clearInterval(id)
    }
  }, [covers, phase])

  return (
    <div className={`stat-card${accent ? ' stat-card--accent' : ''}`}>
      {covers.map((src, i) => (
        <img key={src} className={`stat-card__cover${i === index ? ' is-on' : ''}`} src={src} alt="" />
      ))}
      {covers.length > 0 && <span className="stat-card__scrim" aria-hidden="true" />}
      <div className="stat-card__body">
        <Label>{label}</Label>
        <span className={`stat-card__value${value.length > 7 ? ' is-long' : ''}`}>{value}</span>
        {note && <span className="stat-card__note">{note}</span>}
      </div>
    </div>
  )
}

/** "Seu recap" hero with two tilted story cards peeking out and the go button. */
function RecapHeroCard({ recap, onClick }: { recap: Recap | null; onClick: () => void }) {
  return (
    <button type="button" className="recap-hero stagger" style={stagger(4)} onClick={onClick}>
      <span className="recap-hero__sheet recap-hero__sheet--back" aria-hidden="true" />
      <span className="recap-hero__sheet recap-hero__sheet--front" aria-hidden="true">
        {recap ? (
          <span className="recap-hero__preview">
            <span className="recap-hero__scaler">
              <RecapCard recap={recap} variant="story" />
            </span>
          </span>
        ) : (
          <span className="recap-hero__fallback">SEU{'\n'}RECAP</span>
        )}
      </span>
      <span className="recap-hero__text">
        <Label>Recap</Label>
        <span className="recap-hero__title">Seu{'\n'}recap</span>
        <Label>Story · Feed</Label>
      </span>
      <span className="recap-hero__go">
        <ActionCircle size={56} />
      </span>
    </button>
  )
}

function CollageTile({ covers, onClick }: { covers: (string | undefined)[]; onClick: () => void }) {
  return (
    <button type="button" className="bento bento--tile" onClick={onClick}>
      <span className="collage-grid" aria-hidden="true">
        {Array.from({ length: 9 }, (_, i) => (
          <CoverTile key={i} url={covers[i]} index={i} />
        ))}
      </span>
      <span className="bento-spacer" />
      <span className="tile-title">Colagem</span>
      <span className="tile-sub tile-sub--accent">3×3 · 4×4 · 5×5</span>
    </button>
  )
}

function VideoTile({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="bento bento--tile bento--cream" onClick={onClick}>
      <span className="video-play" aria-hidden="true">
        <span><PlayIcon /></span>
      </span>
      <span className="video-bar" aria-hidden="true"><span /></span>
      <span className="bento-spacer" />
      <span className="tile-title">Vídeo</span>
      <span className="tile-sub">ARQUIVO OU LINK</span>
    </button>
  )
}

/** Top 3 tracks with big rank numbers and covers. */
function TopTracksCard({ rows, onClick }: { rows: HomeTrack[]; onClick: () => void }) {
  return (
    <button type="button" className="bento top-tracks stagger" style={stagger(6)} onClick={onClick}>
      <span className="top-tracks__head">
        <Label>Top músicas</Label>
        <span className="pill-link">VER TODAS →</span>
      </span>
      {rows.map((t, i) => (
        <span className="top-tracks__row" key={`${t.title}-${i}`}>
          <span className={`top-tracks__rank${i === 0 ? ' is-first' : ''}`}>{i + 1}</span>
          <CoverTile url={t.cover} index={i} className="top-tracks__cover" />
          <span className="top-tracks__meta">
            <span className="top-tracks__title">{t.title}</span>
            <span className="top-tracks__sub">{t.sub.toUpperCase()}</span>
          </span>
        </span>
      ))}
      {rows.length === 0 && <span className="top-tracks__empty">Sem dados para este período ainda.</span>}
    </button>
  )
}

/** "Descobrir" with a cover block on the left, text and a go button. */
function DiscoverCard({ rec, onClick }: { rec: AlbumRecommendation | null; onClick: () => void }) {
  return (
    <button type="button" className="home-discover stagger" style={stagger(7)} onClick={onClick}>
      <CoverTile url={rec?.image} index={2} className="home-discover__cover" />
      <span className="home-discover__text">
        <Label>Descobrir</Label>
        <span className={`home-discover__title${rec ? ' is-album' : ''}`}>{rec?.album ?? `Um álbum\nnovo`}</span>
        <span className="home-discover__sub">{rec?.artist ?? 'escolhido do que você mais ouve'}</span>
      </span>
      <span className="home-discover__go">
        <ActionCircle size={48} />
      </span>
    </button>
  )
}

/** "Letra" with a giant quote mark and a go button. */
function LyricTile({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="lyric-tile stagger" style={stagger(8)} onClick={onClick}>
      <span className="lyric-tile__quote" aria-hidden="true">“</span>
      <span className="lyric-tile__text">
        <Label>Letra</Label>
        <span className="lyric-tile__title">Escolha um verso{'\n'}e crie o card</span>
      </span>
      <span className="lyric-tile__go">
        <ActionCircle size={48} />
      </span>
    </button>
  )
}

/** Small credit line at the end of the Início: X icon + handle, opens the profile. */
function XCredit({ handle }: { handle: string }) {
  return (
    <a className="x-credit" href={`https://x.com/${handle}`} target="_blank" rel="noreferrer">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-label="X (Twitter)">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
      <span>@{handle}</span>
    </a>
  )
}

// ---- The Início screen ----------------------------------------------------

interface HomeProps {
  model: HomeModel
  onSaveUser: (user: string) => void
  periodLabel: string
  onOpenPeriod: () => void
  loading: boolean
  error: string | null
  onOpen: (route: Route) => void
  /** Spotify only: "Atualizar" / "Desconectar" under the cards. */
  onRefresh?: () => void
  onLogout?: () => void
}

/**
 * The bento "Início": one shared account + period feeding every creation
 * (recap, collage, video, top músicas, descobrir) plus the source-independent
 * lyric card. Layout ported from the Android app's LastfmScreen / SpotifyScreen.
 */
export function Home({
  model,
  onSaveUser,
  periodLabel,
  onOpenPeriod,
  loading,
  error,
  onOpen,
  onRefresh,
  onLogout,
}: HomeProps) {
  // First run (no Last.fm user saved yet): open the field once. After saving, only the pencil reopens it.
  const [editing, setEditing] = useState(model.editableUser && model.userName.trim().length === 0)

  return (
    <div className="home">
      <header className="home-head">
        <EchoMark className="home-head__mark" size={26} animate />
        <span className="home-head__word echo-wordmark">echo</span>
        <PeriodChip label={periodLabel} onClick={onOpenPeriod} />
      </header>

      <div className="home-body">
        <UserRow
          label={model.userLabel}
          name={model.userName}
          avatar={model.avatar}
          editable={model.editableUser}
          editing={editing}
          onEdit={() => setEditing(true)}
          onSave={(u) => {
            onSaveUser(u)
            setEditing(false)
          }}
        />

        {error && <p className="error home-error">{error}</p>}
        {loading && <EchoLoadingText />}

        <HeroArtistCard name={model.heroName} detail={model.heroDetail} image={model.heroImage} />

        <div className="bento-row stagger" style={stagger(3)}>
          <StatCard accent stat={model.statAccent} />
          <StatCard stat={model.stat} phase={2000} />
        </div>

        <RecapHeroCard recap={model.recap} onClick={() => onOpen('recap')} />

        <div className="bento-row stagger" style={stagger(5)}>
          <CollageTile covers={model.collageCovers} onClick={() => onOpen('collage')} />
          <VideoTile onClick={() => onOpen('video')} />
        </div>

        <TopTracksCard rows={model.tracks} onClick={() => onOpen('tracks')} />
        <DiscoverCard rec={model.rec} onClick={() => onOpen('discover')} />
        <LyricTile onClick={() => onOpen('lyric')} />

        {onRefresh && onLogout && (
          <div className="bento-row home-actions">
            <button type="button" className="ui-btn ui-btn--secondary" onClick={onRefresh}>
              Atualizar
            </button>
            <button type="button" className="ui-btn ui-btn--secondary" onClick={onLogout}>
              Desconectar
            </button>
          </div>
        )}
        <XCredit handle="Thiagoapk" />
      </div>
    </div>
  )
}
