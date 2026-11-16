import { describe, expect, it } from 'vitest'
import {
  SPOTIFY_RANGES,
  parseSpotifyArtists,
  parseSpotifyProfile,
  parseSpotifyTracks,
  rateLimitWaitMessage,
  rateLimitWaitPhrase,
  spotifyFileKey,
  spotifyHomeStats,
  spotifyRangeForPeriod,
  spotifyToAlbums,
  spotifyToRecap,
  spotifyTracksList,
  topGenres,
  type SpotifyData,
  type SpotifyTopArtist,
  type SpotifyTopTrack,
} from './spotify'

function artist(name: string, genres: string[] = [], imageUrl?: string): SpotifyTopArtist {
  return { id: name, name, genres, imageUrl }
}

function track(
  name: string,
  albumId: string,
  opts: { albumName?: string; albumArtist?: string; artists?: string[]; img?: string } = {},
): SpotifyTopTrack {
  const artists = opts.artists ?? ['A']
  return {
    id: name,
    name,
    artists,
    artistLine: artists.join(', '),
    album: {
      id: albumId,
      name: opts.albumName ?? `Album ${albumId}`,
      artist: opts.albumArtist ?? '',
      imageUrl: opts.img ?? `big-${albumId}`,
      thumbUrl: `small-${albumId}`,
    },
  }
}

function data(partial: Partial<SpotifyData> = {}): SpotifyData {
  return { profile: null, topTracks: [], topArtists: [], error: null, ...partial }
}

describe('rateLimitWaitPhrase / rateLimitWaitMessage', () => {
  it('uses "em instantes" when Retry-After is unknown or < 1', () => {
    expect(rateLimitWaitPhrase(null)).toBe('em instantes')
    expect(rateLimitWaitPhrase(undefined)).toBe('em instantes')
    expect(rateLimitWaitPhrase(0)).toBe('em instantes')
  })

  it('formats seconds, minutes (ceil) and hours (ceil)', () => {
    expect(rateLimitWaitPhrase(1)).toBe('em 1s')
    expect(rateLimitWaitPhrase(59)).toBe('em 59s')
    expect(rateLimitWaitPhrase(60)).toBe('em ~1 min')
    expect(rateLimitWaitPhrase(61)).toBe('em ~2 min')
    expect(rateLimitWaitPhrase(3599)).toBe('em ~60 min')
    expect(rateLimitWaitPhrase(3600)).toBe('em ~1 h')
    expect(rateLimitWaitPhrase(3601)).toBe('em ~2 h')
  })

  it('builds the literal 429 message', () => {
    expect(rateLimitWaitMessage(30)).toBe('O Spotify limitou as requisições (429). Tente de novo em 30s.')
    expect(rateLimitWaitMessage(null)).toBe('O Spotify limitou as requisições (429). Tente de novo em instantes.')
  })
})

describe('ranges', () => {
  it('maps windows to app periods with the spec labels', () => {
    expect(SPOTIFY_RANGES.map((r) => [r.value, r.chip, r.cardLabel, r.period])).toEqual([
      ['short_term', 'Mês', '4 semanas', 'month'],
      ['medium_term', '6 meses', '6 meses', 'year'],
      ['long_term', 'Ano', '1 ano', 'all'],
    ])
  })

  it('maps periods back to a range and builds the file key', () => {
    expect(spotifyRangeForPeriod('month')).toBe('short_term')
    expect(spotifyRangeForPeriod('year')).toBe('medium_term')
    expect(spotifyRangeForPeriod('all')).toBe('long_term')
    expect(spotifyFileKey('medium_term')).toBe('spotify-medium_term')
  })
})

describe('parsers', () => {
  it('parses profile: display name falls back to empty, image is the largest', () => {
    expect(parseSpotifyProfile({ id: 'u1', display_name: null, images: [{ url: 'a' }, { url: 'b' }] })).toEqual({
      id: 'u1',
      displayName: '',
      imageUrl: 'a',
    })
  })

  it('parses tracks: largest cover for imageUrl, smallest for thumbUrl, artists joined', () => {
    const [t] = parseSpotifyTracks([
      {
        id: 't1',
        name: 'Song',
        artists: [{ name: 'X' }, { name: 'Y' }],
        album: { id: 'al', name: 'Alb', images: [{ url: 'L' }, { url: 'M' }, { url: 'S' }], artists: [{ name: 'X' }] },
      },
      null,
    ])
    expect(t.artistLine).toBe('X, Y')
    expect(t.artists).toEqual(['X', 'Y'])
    expect(t.album).toEqual({ id: 'al', name: 'Alb', artist: 'X', imageUrl: 'L', thumbUrl: 'S' })
  })

  it('parses artists, dropping nulls and defaulting genres', () => {
    const list = parseSpotifyArtists([{ id: '1', name: 'A', images: [{ url: 'p' }] }, null])
    expect(list).toEqual([{ id: '1', name: 'A', imageUrl: 'p', genres: [] }])
  })
})

describe('topGenres / spotifyHomeStats', () => {
  const artists = [
    artist('A', ['rock', 'indie']),
    artist('B', ['pop', 'indie']),
    artist('C', ['pop', 'rock', 'jazz', 'soul', 'funk']),
  ]

  it('ranks by frequency, ties by first appearance, capped at 4', () => {
    // rock 2, indie 2, pop 2 (first seen order rock, indie, pop), jazz 1, soul 1, funk 1
    expect(topGenres(artists)).toEqual(['rock', 'indie', 'pop', 'jazz'])
  })

  it('computes home stats with genres', () => {
    expect(spotifyHomeStats(data({ topArtists: artists }))).toEqual({
      genreCount: 6,
      topGenre: 'rock',
      hasGenres: true,
    })
  })

  it('falls back to a dash without genres', () => {
    expect(spotifyHomeStats(data({ topArtists: [artist('A')] }))).toEqual({
      genreCount: 0,
      topGenre: '—',
      hasGenres: false,
    })
  })
})

describe('spotifyToRecap', () => {
  it('returns null when there is nothing to show', () => {
    expect(spotifyToRecap(data(), 'medium_term')).toBeNull()
  })

  it('takes 5 artists/tracks, hero from artist #1, raw image urls', () => {
    const topArtists = Array.from({ length: 7 }, (_, i) => artist(`Art${i}`, ['pop'], `img${i}`))
    const topTracks = Array.from({ length: 8 }, (_, i) => track(`T${i}`, `al${i}`, { artists: ['X', 'Y'] }))
    const recap = spotifyToRecap(
      data({ topArtists, topTracks, profile: { id: 'id1', displayName: 'Thi', imageUrl: 'u' } }),
      'long_term',
    )
    expect(recap).not.toBeNull()
    expect(recap!.source).toBe('spotify')
    expect(recap!.user).toBe('Thi')
    expect(recap!.period).toBe('all')
    expect(recap!.topArtists).toHaveLength(5)
    expect(recap!.topTracks).toHaveLength(5)
    expect(recap!.topTracks[0]).toEqual({ name: 'T0', artist: 'X, Y', image: 'big-al0' })
    expect(recap!.heroArtist).toEqual({ name: 'Art0', image: 'img0' })
    expect(recap!.heroImage).toBe('img0')
    expect(recap!.genres).toEqual(['pop'])
    expect(recap!.scrobbles).toBeUndefined()
    expect(recap!.minutes).toBeUndefined()
  })

  it('uses the id when the display name is empty', () => {
    const recap = spotifyToRecap(
      data({ topArtists: [artist('A')], profile: { id: 'abc', displayName: '' } }),
      'short_term',
    )
    expect(recap!.user).toBe('abc')
    expect(recap!.period).toBe('month')
  })
})

describe('spotifyToAlbums', () => {
  it('groups tracks by album, most tracks first, ties by first track index', () => {
    const topTracks = [
      track('t0', 'A'), // A: idx 0
      track('t1', 'B'), // B: idx 1
      track('t2', 'C'), // C: idx 2
      track('t3', 'B'),
      track('t4', 'C'),
      track('t5', 'D'),
    ]
    // B=2 (first 1), C=2 (first 2), A=1 (first 0), D=1 (first 5)
    expect(spotifyToAlbums(data({ topTracks }), 10).map((a) => a.name)).toEqual([
      'Album B',
      'Album C',
      'Album A',
      'Album D',
    ])
  })

  it('uses the album artist, falling back to the artist line; keys by name|artist without id', () => {
    const topTracks = [
      track('t0', 'A', { albumArtist: 'Main', artists: ['Main', 'Feat'] }),
      track('t1', '', { albumName: 'NoId', artists: ['Solo'] }),
      track('t2', '', { albumName: 'NoId', artists: ['Solo'] }),
    ]
    const albums = spotifyToAlbums(data({ topTracks }), 10)
    expect(albums).toEqual([
      { name: 'NoId', artist: 'Solo', image: 'big-' },
      { name: 'Album A', artist: 'Main', image: 'big-A' },
    ])
    expect(albums[0].playcount).toBeUndefined()
  })

  it('limits to count', () => {
    const topTracks = ['A', 'B', 'C', 'D'].map((id) => track(`t${id}`, id))
    expect(spotifyToAlbums(data({ topTracks }), 2)).toHaveLength(2)
  })
})

describe('spotifyTracksList', () => {
  it('limits to 20 by default and uses the small cover', () => {
    const topTracks = Array.from({ length: 30 }, (_, i) => track(`T${i}`, `al${i}`))
    const list = spotifyTracksList(data({ topTracks }))
    expect(list).toHaveLength(20)
    expect(list[0]).toEqual({ name: 'T0', artist: 'A', image: 'small-al0' })
    expect(spotifyTracksList(data({ topTracks }), 3)).toHaveLength(3)
  })
})
