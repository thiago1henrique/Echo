import { useEffect, useRef, useState } from 'react'
import type { TrackStat } from '../types'
import type { ScreenCtx } from '../lib/screenCtx'
import { fmt } from '../lib/format'
import { EchoLoadingText } from '../components/Home'
import { ErrorText, HintText } from '../components/ui'
import './TracksScreen.css'

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; tracks: TrackStat[] }

/** "Top músicas": ranked list of the period's most played tracks. */
export function TracksScreen({ ctx }: { ctx: ScreenCtx }) {
  const [state, setState] = useState<State>({ status: 'loading' })

  // A different user/period/source restarts the load (derived during render, not in an effect).
  const [prevKey, setPrevKey] = useState(ctx.fileKey)
  if (ctx.fileKey !== prevKey) {
    setPrevKey(ctx.fileKey)
    setState({ status: 'loading' })
  }

  // Keep the latest loader without making it an effect dependency.
  const loadRef = useRef(ctx.loadTracks)
  useEffect(() => {
    loadRef.current = ctx.loadTracks
  }, [ctx.loadTracks])

  useEffect(() => {
    let active = true
    loadRef
      .current()
      .then((tracks) => active && setState({ status: 'ok', tracks }))
      .catch(
        (e: unknown) =>
          active &&
          setState({
            status: 'error',
            message: e instanceof Error && e.message ? e.message : 'Não foi possível carregar as músicas.',
          }),
      )
    return () => {
      active = false
    }
  }, [ctx.fileKey])

  if (state.status === 'loading') return <EchoLoadingText />
  if (state.status === 'error') return <ErrorText>{state.message}</ErrorText>
  if (state.tracks.length === 0) return <HintText>Sem dados para este período ainda.</HintText>

  return (
    <ol className="tracks-screen__list">
      {state.tracks.map((t, i) => {
        const sub = [t.artist, t.playcount != null ? `${fmt(t.playcount)}×` : '']
          .filter(Boolean)
          .join(' · ')
        return (
          <li className="tracks-screen__row" key={`${i}-${t.artist}-${t.name}`}>
            <span className="tracks-screen__rank">{i + 1}</span>
            <span className="tracks-screen__cover">
              {t.image && <img src={t.image} alt="" loading="lazy" />}
            </span>
            <span className="tracks-screen__meta">
              <span className="tracks-screen__title">{t.name}</span>
              {sub && <span className="tracks-screen__sub">{sub}</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
