import type { Recap } from '../types'
import type { AlbumRecommendation } from './recommend'
import type { HomeData, HomeModel, HomeStat } from './home'
import { fmt } from './format'
import { spotifyHomeStats } from './spotify'
import type { SpotifyData } from './spotify'

const defined = (x: string | undefined | null): x is string => !!x

const EMPTY_STAT = (label: string, note: string): HomeStat => ({ label, value: '—', note, covers: [] })

/** Last.fm → Início: hero artist, minutes + scrobbles, top tracks, album covers, today's pick. */
export function lastfmHomeModel(user: string, data: HomeData | null): HomeModel {
  const r: Recap | null = data?.recap ?? null
  const trackCovers = (r?.topTracks ?? []).map((t) => t.image).filter(defined)
  const covers = [...(r?.topTracks.map((t) => t.image) ?? []), ...(r?.topArtists.map((a) => a.image) ?? [])].slice(0, 9)
  return {
    source: 'lastfm',
    userLabel: 'USUÁRIO DO LAST.FM',
    userName: user,
    avatar: data?.avatar,
    editableUser: true,
    heroName: r?.heroArtist?.name ?? 'Nome do artista',
    heroDetail: r?.heroArtist?.playcount != null ? `${fmt(r.heroArtist.playcount)} scrobbles` : '',
    heroImage: r?.heroImage,
    statAccent: {
      label: 'Minutos',
      value: r?.minutes != null ? fmt(r.minutes) : '—',
      note: 'estimado',
      covers: data?.albumCovers ?? [],
    },
    stat: {
      label: 'Scrobbles',
      value: r?.scrobbles != null ? fmt(r.scrobbles) : '—',
      note: 'tocadas no período',
      covers: trackCovers,
    },
    recap: r,
    collageCovers: covers,
    tracks: (r?.topTracks ?? []).slice(0, 3).map((t) => ({
      title: t.name,
      sub: [t.artist, t.playcount != null ? `${t.playcount}×` : ''].filter(Boolean).join(' · '),
      cover: t.image,
    })),
    rec: data?.rec ?? null,
  }
}

/**
 * Spotify → Início. The API has no play counts, so the number cards become
 * "Gêneros" / "Gênero nº 1" (or "Artistas" / "Músicas" when no genres come back),
 * exactly like the Android app.
 */
export function spotifyHomeModel(
  data: SpotifyData | null,
  recap: Recap | null,
  rec: AlbumRecommendation | null,
): HomeModel {
  const artists = data?.topArtists ?? []
  const tracks = data?.topTracks ?? []
  const artistCovers = artists.map((a) => a.imageUrl).filter(defined).slice(0, 5)
  const trackCovers = [...new Set(tracks.map((t) => t.album.imageUrl).filter(defined))].slice(0, 5)
  const stats = data ? spotifyHomeStats(data) : null

  let statAccent: HomeStat
  let stat: HomeStat
  if (!data) {
    statAccent = EMPTY_STAT('Artistas', 'no seu top')
    stat = EMPTY_STAT('Músicas', 'no seu top')
  } else if (stats?.hasGenres) {
    statAccent = { label: 'Gêneros', value: fmt(stats.genreCount), note: 'nos seus artistas', covers: artistCovers }
    stat = { label: 'Gênero nº 1', value: stats.topGenre, covers: trackCovers }
  } else {
    statAccent = { label: 'Artistas', value: fmt(artists.length), note: 'no seu top', covers: artistCovers }
    stat = { label: 'Músicas', value: fmt(tracks.length), note: 'no seu top', covers: trackCovers }
  }

  const profile = data?.profile
  return {
    source: 'spotify',
    userLabel: 'CONTA DO SPOTIFY',
    userName: profile?.displayName?.trim() || profile?.id || '',
    avatar: profile?.imageUrl,
    editableUser: false,
    heroName: artists[0]?.name ?? 'Nome do artista',
    heroDetail: '',
    heroImage: artists[0]?.imageUrl,
    statAccent,
    stat,
    recap,
    collageCovers: tracks.map((t) => t.album.imageUrl).slice(0, 9),
    tracks: tracks.slice(0, 3).map((t) => ({
      title: t.name,
      sub: t.artistLine,
      cover: t.album.imageUrl,
    })),
    rec,
  }
}
