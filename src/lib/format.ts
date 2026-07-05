const nf = new Intl.NumberFormat('pt-BR')

export const fmt = (n: number) => nf.format(n)

export function minutesLabel(minutes: number): { minutes: string; hours: string } {
  return {
    minutes: fmt(minutes),
    hours: fmt(Math.round(minutes / 60)),
  }
}

export const plays = (n: number) => `${fmt(n)} ${n === 1 ? 'play' : 'plays'}`
