/**
 * Every collage layout. Each one renders at exact export pixels (see COLLAGE_SIZE):
 * - square    1080×1080  the bare grid, edge to edge
 * - story     1080×1920  "Pôster": header + tall grid + footer
 * - destaque  1080×1920  album #1 as a hero, the next eight in a strip
 * - mural     1080×1920  a tilted wall of covers under a big headline
 * - retrato   1080×1350  4:5 (best portrait crop in the X feed): titled square grid
 * - ranking   1080×1350  4:5 editorial list of the top albums
 * - painel    1600×900   16:9 (X feed): text panel on the left, grid on the right
 */
export type CollageFormat = 'square' | 'story' | 'destaque' | 'mural' | 'retrato' | 'ranking' | 'painel'

export const COLLAGE_SIZE: Record<CollageFormat, { width: number; height: number }> = {
  square: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
  destaque: { width: 1080, height: 1920 },
  mural: { width: 1080, height: 1920 },
  retrato: { width: 1080, height: 1350 },
  ranking: { width: 1080, height: 1350 },
  painel: { width: 1600, height: 900 },
}


const SOURCE_NAME = { lastfm: 'Last.fm', spotify: 'Spotify' } as const

const MONTHS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

/**
 * What the collage calls itself, from the period it covers:
 * - Semana → "Semaninha · Last.fm"
 * - Mês    → "Novembro Recap" (current month's name)
 * - others → "Top álbuns"
 * `lines` is the big headline of the Mural layout.
 */
export function collageTitle(
  period: 'week' | 'month' | 'year' | 'all',
  source: 'lastfm' | 'spotify',
  now: Date = new Date(),
): { eyebrow: string; lines: string[] } {
  if (period === 'week') return { eyebrow: `Semaninha · ${SOURCE_NAME[source]}`, lines: ['Semaninha'] }
  if (period === 'month') {
    const month = MONTHS[now.getMonth()]
    return { eyebrow: `${month} Recap`, lines: [month, 'Recap'] }
  }
  return { eyebrow: 'Top álbuns', lines: ['Top', 'álbuns'] }
}
