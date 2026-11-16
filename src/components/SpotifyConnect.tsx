import { useState } from 'react'
import * as spotify from '../lib/spotify'
import type { SpotifyAuth } from '../lib/spotify'
import { EchoMark } from './EchoMark'
import { ErrorText, PrimaryButton, TextField } from './ui'

/**
 * Spotify tab before the account is connected: compact header + "Conectar com
 * Spotify". The web has no baked-in client id like the Android app, so when
 * VITE_SPOTIFY_CLIENT_ID is missing the user can paste their own app's Client ID.
 */
export function SpotifyConnect({
  auth,
  onConnect,
}: {
  auth: SpotifyAuth
  onConnect: () => void
}) {
  const [clientId, setClientId] = useState(spotify.getClientId())
  const needsId = !spotify.hasClientId()
  const connecting = auth.status === 'connecting'

  function connect() {
    if (needsId) spotify.setClientId(clientId)
    onConnect()
  }

  return (
    <div className="spotify-connect">
      <header className="compact-head stagger" style={{ ['--i' as string]: 0 }}>
        <div className="compact-head__brand">
          <EchoMark className="compact-head__mark" size={28} animate />
          <span className="compact-head__word echo-wordmark">echo</span>
        </div>
        <p className="compact-head__sub">Conecte sua conta do Spotify e veja o que você mais ouve.</p>
        <hr className="compact-head__rule" />
      </header>

      {auth.status === 'checking' ? (
        <p className="ui-hint">Carregando…</p>
      ) : (
        <>
          <h2 className="spotify-connect__title stagger" style={{ ['--i' as string]: 1 }}>
            Spotify
          </h2>
          {auth.status === 'failed' && <ErrorText>{auth.message}</ErrorText>}
          {needsId && (
            <div className="spotify-connect__id stagger" style={{ ['--i' as string]: 2 }}>
              <p className="ui-hint">
                Cole o <strong>Client ID</strong> do seu app do Spotify (crie em{' '}
                <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">
                  developer.spotify.com/dashboard
                </a>
                ) e cadastre esta URL como <em>Redirect URI</em>:
              </p>
              <code className="spotify-connect__uri">{window.location.origin + window.location.pathname}</code>
              <TextField
                value={clientId}
                onChange={setClientId}
                placeholder="Spotify Client ID"
                autoComplete="off"
                spellCheck={false}
                onEnter={clientId.trim() ? connect : undefined}
              />
            </div>
          )}
          <PrimaryButton
            className="stagger"
            style={{ ['--i' as string]: 3 }}
            loading={connecting}
            disabled={needsId && !clientId.trim()}
            onClick={connect}
          >
            Conectar com Spotify
          </PrimaryButton>
        </>
      )}
    </div>
  )
}
