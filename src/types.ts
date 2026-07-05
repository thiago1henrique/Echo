export type Source = 'lastfm' | 'spotify'

export type Period = 'week' | 'month' | 'year' | 'all'

export interface ArtistStat {
  name: string
  /** Undefined when the source doesn't expose play counts (Spotify). */
  playcount?: number
  image?: string
}

export interface TrackStat {
  name: string
  artist: string
  /** Undefined when the source doesn't expose play counts (Spotify). */
  playcount?: number
  image?: string
}

export interface Recap {
  source: Source
  /** Display handle: Last.fm username, or Spotify display name. */
  user: string
  period: Period
  topArtists: ArtistStat[]
  topTracks: TrackStat[]
  heroArtist: ArtistStat | null
  heroImage?: string
  /** Undefined for sources without play data (Spotify). */
  scrobbles?: number
  /** Undefined for sources without play data (Spotify). */
  minutes?: number
}

// Which period windows each source can actually serve. Spotify only offers
// three fixed windows (short/medium/long term) and no weekly view.
export const SOURCE_PERIODS: Record<Source, Period[]> = {
  lastfm: ['week', 'month', 'year', 'all'],
  spotify: ['month', 'year', 'all'],
}

const LASTFM_PERIOD_LABEL: Record<Period, string> = {
  week: 'Semana',
  month: 'Mês',
  year: 'Ano',
  all: 'Sempre',
}

// Spotify's windows are approximate and fixed, so we label them honestly.
const SPOTIFY_PERIOD_LABEL: Record<Period, string> = {
  week: '4 semanas',
  month: '4 semanas',
  year: '6 meses',
  all: '1 ano',
}

export function periodLabel(source: Source, period: Period): string {
  return (source === 'spotify' ? SPOTIFY_PERIOD_LABEL : LASTFM_PERIOD_LABEL)[period]
}

export const SOURCE_LABEL: Record<Source, string> = {
  lastfm: 'last.fm',
  spotify: 'spotify',
}
