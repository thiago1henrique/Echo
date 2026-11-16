import type { Source } from '../types'
import { LASTFM_ICON, SPOTIFY_ICON } from '../lib/icons'

const ITEMS: { value: Source; label: string }[] = [
  { value: 'spotify', label: 'Spotify' },
  { value: 'lastfm', label: 'Last.fm' },
]

function DockIcon({ source }: { source: Source }) {
  if (source === 'spotify') {
    return (
      <svg viewBox={SPOTIFY_ICON.viewBox} width="24" height="24" fill="currentColor" fillRule="evenodd" aria-hidden="true">
        <path d={SPOTIFY_ICON.d} />
      </svg>
    )
  }
  return (
    <svg viewBox={LASTFM_ICON.viewBox} width="24" height="24" fill="currentColor" aria-hidden="true">
      <g transform={`translate(0 ${LASTFM_ICON.translateY})`}>
        <path d={LASTFM_ICON.d} />
      </g>
    </svg>
  )
}

/**
 * Icon-only floating pill to switch between Spotify and Last.fm (ported from the
 * Android EchoModeDock). The accent slider moves behind the active icon and the
 * whole app takes the source's accent color.
 */
export function Dock({ source, onChange }: { source: Source; onChange: (s: Source) => void }) {
  const index = ITEMS.findIndex((i) => i.value === source)
  return (
    <nav className="dock" aria-label="Fonte dos dados">
      <div className="dock__pill" style={{ ['--i' as string]: index }}>
        <span className="dock__slider" aria-hidden="true" />
        {ITEMS.map((it) => (
          <button
            key={it.value}
            type="button"
            className={`dock__slot${it.value === source ? ' is-active' : ''}`}
            aria-label={it.label}
            aria-pressed={it.value === source}
            onClick={() => onChange(it.value)}
          >
            <DockIcon source={it.value} />
          </button>
        ))}
      </div>
    </nav>
  )
}
