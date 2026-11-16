import type { Period, Recap, Source } from '../types'
import type { AlbumRecommendation } from './recommend'

/** The screens the Início's bento cards open. */
export type Route = 'recap' | 'collage' | 'video' | 'tracks' | 'discover' | 'lyric'

export const ROUTE_TITLE: Record<Route, string> = {
  recap: 'Recap',
  collage: 'Colagem',
  video: 'Vídeo',
  tracks: 'Top músicas',
  discover: 'Descobrir',
  lyric: 'Letra',
}

/** Everything the Last.fm Início loads for one user + period. */
export interface HomeData {
  recap: Recap
  avatar?: string
  albumCovers: string[]
  rec: AlbumRecommendation | null
}

export interface PeriodOption<T extends string = Period> {
  value: T
  label: string
  description: string
}

export const PERIOD_OPTIONS: PeriodOption[] = [
  { value: 'week', label: 'Semana', description: 'Últimos 7 dias' },
  { value: 'month', label: 'Mês', description: 'Último mês' },
  { value: 'year', label: 'Ano', description: 'Últimos 12 meses' },
  { value: 'all', label: 'Sempre', description: 'Todo o histórico' },
]

/** A number card on the Início (minutes / scrobbles / genres…). */
export interface HomeStat {
  label: string
  value: string
  note?: string
  /** Covers that crossfade behind the number. */
  covers: string[]
}

export interface HomeTrack {
  title: string
  sub: string
  cover?: string
}

/**
 * Source-agnostic view model of the Início. Both Last.fm and Spotify are mapped
 * to this, so the bento layout is written once (see lib/homeModel.ts).
 */
export interface HomeModel {
  source: Source
  userLabel: string
  userName: string
  avatar?: string
  /** Last.fm lets you change the username; Spotify shows the connected account. */
  editableUser: boolean
  heroName: string
  heroDetail: string
  heroImage?: string
  statAccent: HomeStat
  stat: HomeStat
  /** Drives the preview inside the "Seu recap" card. */
  recap: Recap | null
  collageCovers: (string | undefined)[]
  tracks: HomeTrack[]
  rec: AlbumRecommendation | null
}

const SPLASH_SEEN_KEY = 'echo_splash_seen'

/** True when the intro splash should play: once per tab session, never with reduced motion. */
export function shouldShowSplash(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  try {
    return sessionStorage.getItem(SPLASH_SEEN_KEY) !== '1'
  } catch {
    return true
  }
}

export function markSplashSeen(): void {
  try {
    sessionStorage.setItem(SPLASH_SEEN_KEY, '1')
  } catch {
    /* storage unavailable — the splash just replays next load */
  }
}
