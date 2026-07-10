import { describe, expect, it } from 'vitest'
import { estimateMinutes } from './lastfm'

describe('estimateMinutes', () => {
  it('uses the average of valid track durations', () => {
    // avg = (200 + 220 + 240) / 3 = 220s; 100 scrobbles * 220s / 60 = 366.67 -> 367
    expect(estimateMinutes(100, [200, 220, 240])).toBe(367)
  })

  it('falls back to the default average when no duration is valid', () => {
    // AVG_TRACK_SECONDS = 210; 100 * 210 / 60 = 350
    expect(estimateMinutes(100, [0, 0, 0])).toBe(350)
    expect(estimateMinutes(100, [])).toBe(350)
  })

  it('ignores zero and negative durations when averaging', () => {
    // Only the 300 is valid -> avg = 300; 10 * 300 / 60 = 50
    expect(estimateMinutes(10, [0, -5, 300])).toBe(50)
  })

  it('returns 0 minutes when there are no scrobbles', () => {
    expect(estimateMinutes(0, [200, 220])).toBe(0)
  })

  it('rounds to the nearest minute', () => {
    // avg = 200s; 9 scrobbles * 200s / 60 = 30 -> exact, no rounding needed
    expect(estimateMinutes(9, [200])).toBe(30)
    // avg = 210s (fallback); 1 scrobble * 210 / 60 = 3.5 -> rounds to 4
    expect(estimateMinutes(1, [])).toBe(4)
  })
})
