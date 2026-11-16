import type { Recap } from '../types'
import { fmt } from './format'

// Palette + pure helpers shared by every story template (RecapTemplates.tsx and
// RecapTemplatesExtra.tsx). Kept out of the component files so they can export
// components only.

export const CREAM = '#F3EDE2'
export const MUTED = '#A89F92'
export const DIM = '#70665C'
export const PANEL = '#1F1712'
export const INK = '#14100D'
export const DEEP = '#131010'
export const GREY = '#9B938A'
export const TINTS = ['#2D4A3A', '#3A2D26', '#2A3A4A', '#4F4137', '#2A221C']

const LASTFM_ACCENT = '#E0472D'
const SPOTIFY_ACCENT = '#1DB954'

export function accentOf(recap: Recap): string {
  return recap.source === 'spotify' ? SPOTIFY_ACCENT : LASTFM_ACCENT
}

export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

export interface Stat {
  value: string
  label: string
}

/** Spotify has no minutes/scrobbles; its genres stand in (Android SpotifyRecapMapper.stats). */
export function statsOf(recap: Recap): Stat[] {
  const genres = recap.genres ?? []
  if (genres.length === 0) return []
  return [
    { value: String(genres.length), label: 'gêneros' },
    { value: genres[0], label: 'gênero #1' },
  ]
}

/** "minutos" / "nos últimos 7 dias." reads naturally for each period label. */
export function phraseTail(label: string): string {
  switch (label.toLowerCase()) {
    case 'semana':
      return 'nos últimos 7 dias.'
    case 'mês':
      return 'no último mês.'
    case 'ano':
    case '1 ano':
      return 'no último ano.'
    case 'sempre':
      return 'desde sempre.'
    case '4 semanas':
      return 'nas últimas 4 semanas.'
    case '6 meses':
      return 'nos últimos 6 meses.'
    default:
      return `em ${label.toLowerCase()}.`
  }
}

/** Short "who ruled the …" tail: "no mês", "na semana", "desde sempre". */
export function periodTail(label: string): string {
  switch (label.toLowerCase()) {
    case 'semana':
      return 'na semana'
    case 'mês':
      return 'no mês'
    case 'ano':
      return 'no ano'
    case 'sempre':
      return 'desde sempre'
    case '1 ano':
      return 'em 1 ano'
    default:
      return `em ${label.toLowerCase()}`
  }
}

/** The big-number figure and its unit: minutes when the source has them, otherwise the genre count. */
export function heroFigure(recap: Recap): Stat {
  if (recap.minutes != null) return { value: fmt(recap.minutes), label: 'minutos' }
  const first = statsOf(recap)[0]
  if (first) return first
  return { value: fmt(recap.topTracks.length), label: 'músicas' }
}

/** Largest font size (≤ max) at which `text` fits `width`, given an average glyph width ratio. */
export function fitSize(text: string, width: number, max: number, ratio = 0.6): number {
  return Math.max(24, Math.min(max, Math.floor(width / (Math.max(text.length, 1) * ratio))))
}
