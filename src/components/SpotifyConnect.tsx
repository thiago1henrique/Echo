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
  comingSoon = false,
}: {
  auth: SpotifyAuth
  onConnect: () => void
  /** Spotify login is not available yet: show "Em breve" instead of the connect flow. */
  comingSoon?: boolean
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
        <p className="compact-head__sub">
          {comingSoon
            ? 'O recap do que você mais ouve no Spotify chega em breve.'
            : 'Conecte sua conta do Spotify e veja o que você mais ouve.'}
        </p>
        <hr className="compact-head__rule" />
      </header>

      {comingSoon ? (
        <div className="spotify-soon stagger" style={{ ['--i' as string]: 1 }}>
          <span className="spotify-soon__badge">Em breve</span>
          <h2 className="spotify-connect__title">Spotify</h2>
          <p className="ui-hint">
            Estamos finalizando a conexão com o Spotify. Enquanto isso, use o Last.fm para gerar o seu recap.
          </p>
        </div>
      ) : auth.status === 'checking' ? (
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
