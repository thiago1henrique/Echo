import type { AlbumStat, Period, Recap, Source, TrackStat } from '../types'
import type { AlbumRecommendation } from './recommend'

/**
 * Everything a sub-screen needs from the shell, already resolved for the active
 * source (Last.fm or Spotify) and period. Screens never talk to Last.fm/Spotify
 * directly — that is what keeps each screen source-agnostic.
 */
export interface ScreenCtx {
  source: Source
  /** Last.fm username ('' on Spotify). */
  user: string
  /** Last.fm: Semana/Mês/Ano/Sempre. Spotify: Mês(short)/6 meses(medium → 'year')/Ano(long → 'all'). */
  period: Period
  /** Human label for cards/meta lines ("Mês", "4 semanas", "6 meses"…). */
  periodText: string
  /**
   * Stable slug for export filenames, without extension. Last.fm: `${user}-${1month}`;
   * Spotify: `spotify-${short_term}`. Use as `echo-recap-${fileKey}.png`.
   */
  fileKey: string
  /** True when the source is usable (Last.fm user set / Spotify connected). */
  ready: boolean
  /** Recap for the active source+period; null while loading or on error. */
  recap: Recap | null
  recapLoading: boolean
  recapError: string | null
  /** Forces a refetch of the recap ("Atualizar recap"). */
  reloadRecap: () => void
  /** Top-albums grid of `count` items. Last.fm: user.getTopAlbums; Spotify: derived from top tracks. */
  loadAlbums: (count: number) => Promise<AlbumStat[]>
  /** Full top-tracks list (Last.fm 30 / Spotify 20). */
  loadTracks: () => Promise<TrackStat[]>
  /** The pick already cached for the current day-part, or null. */
  cachedRecommendation: () => AlbumRecommendation | null
  /** Fetches (and caches) the pick for the current day-part. Deterministic per source-key + day-part. */
  loadRecommendation: () => Promise<AlbumRecommendation>
}

/** A lyric verse chosen to be printed on a recap/video card (Android: LyricQuote). */
export interface LyricQuote {
  text: string
  trackTitle: string
  artist: string
  album: string
  coverUrl?: string
}
