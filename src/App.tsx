import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import type { Period, Recap, Source } from './types'
import { periodLabel, SOURCE_PERIODS } from './types'
import { fetchRecap, getApiKey, setApiKey } from './lib/lastfm'
import * as spotify from './lib/spotify'
import { fetchLyricLines } from './lib/lyrics'
import { downloadNodeAsPng } from './lib/exportPng'
import { exportCardVideo, downloadBlob } from './lib/videoExport'
import { RecapCard } from './components/RecapCard'
import './App.css'

const MAX_CLIP = 15

/** Dispatches the recap fetch to the selected source. */
function fetchFor(source: Source, user: string, period: Period): Promise<Recap> {
  return source === 'spotify' ? spotify.fetchRecap(user, period) : fetchRecap(user, period)
}

// Firefox can't record MP4 natively and we no longer ship the slow ffmpeg
// fallback path for it, so video export is disabled there — PNG still works.
const IS_FIREFOX =
  typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('firefox')

// Hero rectangles per format (must match RecapCard.css hero sizes).
const DIMS = {
  story: { canvasW: 1080, canvasH: 1920, hero: { x: 0, y: 0, w: 1080, h: 620 } },
  feed: { canvasW: 1600, canvasH: 900, hero: { x: 0, y: 0, w: 620, h: 900 } },
}

export default function App() {
  const [source, setSource] = useState<Source>(
    () => (localStorage.getItem('recap_source') as Source) || 'lastfm',
  )
  const [user, setUser] = useState(() => localStorage.getItem('lastfm_user') ?? '')
  const [period, setPeriod] = useState<Period>('month')
  const [apiKey, setApiKeyState] = useState(getApiKey())
  // Spotify auth state.
  const [spClientId, setSpClientId] = useState(spotify.getClientId())
  const [spConnected, setSpConnected] = useState(spotify.isConnected())
  // All periods are fetched up front and cached here, so switching the period
  // tab is instant (no refetch). Keyed by Period.
  const [recaps, setRecaps] = useState<Partial<Record<Period, Recap>>>({})
  const recap = recaps[period] ?? null
  // True once a recap has been generated. Hides the "Gerar recap" button.
  const [generated, setGenerated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState<string | null>(null)
  const [vstatus, setVstatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Lyric-quote state
  const [quote, setQuote] = useState('')
  const [quoteSongIdx, setQuoteSongIdx] = useState(0)
  const [lyricLines, setLyricLines] = useState<string[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [lyricsLoading, setLyricsLoading] = useState(false)
  const [lyricsError, setLyricsError] = useState<string | null>(null)

  // Video-hero state
  const [videoUrl, setVideoUrl] = useState('')
  const [videoName, setVideoName] = useState('')
  const [videoDur, setVideoDur] = useState(0)
  const [clipStart, setClipStart] = useState(0)
  const [clipLen, setClipLen] = useState(MAX_CLIP)

  const storyRef = useRef<HTMLDivElement>(null)
  const feedRef = useRef<HTMLDivElement>(null)
  const overlayStoryRef = useRef<HTMLDivElement>(null)
  const overlayFeedRef = useRef<HTMLDivElement>(null)
  const exportVideoRef = useRef<HTMLVideoElement>(null)

  const hasKey = apiKey.trim().length > 0
  const hasClientId = spClientId.trim().length > 0
  const periods = SOURCE_PERIODS[source]
  // Ready to generate: Last.fm needs a username + API key; Spotify needs a
  // connected account.
  const ready = source === 'spotify' ? spConnected : hasKey && user.trim().length > 0
  const quoteSong = recap?.topTracks[quoteSongIdx]?.name
  const maxStart = Math.max(0, videoDur - clipLen)
  const start = Math.min(clipStart, maxStart)

  // On load, complete a Spotify OAuth redirect if we just came back from one.
  useEffect(() => {
    spotify.handleRedirect().then(setSpConnected).catch(() => {})
  }, [])

  // Fetch lyrics whenever the recap or the chosen song changes.
  useEffect(() => {
    if (!recap) return
    const song = recap.topTracks[quoteSongIdx]
    if (!song) {
      setLyricLines([])
      return
    }
    let active = true
    setLyricsLoading(true)
    setLyricsError(null)
    setLyricLines([])
    fetchLyricLines(song.artist, song.name)
      .then((lines) => active && setLyricLines(lines))
      .catch((e) => active && setLyricsError(e instanceof Error ? e.message : 'Erro na letra.'))
      .finally(() => active && setLyricsLoading(false))
    return () => {
      active = false
    }
  }, [recap, quoteSongIdx])

  // Switching to a different period shows a different dataset — clear the
  // lyric-quote selection so it isn't carried over.
  useEffect(() => {
    setQuote('')
    setSelected([])
    setQuoteSongIdx(0)
  }, [period])

  async function generate(e?: FormEvent) {
    e?.preventDefault()
    setError(null)
    setLoading(true)
    setRecaps({})
    setQuote('')
    setSelected([])
    setQuoteSongIdx(0)
    try {
      if (source === 'lastfm') localStorage.setItem('lastfm_user', user.trim())
      // Fetch every supported period in parallel so switching tabs is instant.
      const results = await Promise.allSettled(periods.map((p) => fetchFor(source, user, p)))
      const next: Partial<Record<Period, Recap>> = {}
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') next[periods[i]] = r.value
      })
      if (Object.keys(next).length === 0) {
        const rejected = results.find((r) => r.status === 'rejected')
        throw (rejected as PromiseRejectedResult | undefined)?.reason ?? new Error('Erro ao buscar dados.')
      }
      setRecaps(next)
      setGenerated(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao buscar dados.')
    } finally {
      setLoading(false)
    }
  }

  // ---- Quote helpers ----
  function selectSong(idx: number) {
    setQuoteSongIdx(idx)
    setSelected([])
    setQuote('')
  }
  function toggleLine(i: number) {
    const next = selected.includes(i) ? selected.filter((x) => x !== i) : [...selected, i]
    setSelected(next)
    setQuote([...next].sort((a, b) => a - b).map((idx) => lyricLines[idx]).join('\n'))
  }
  function clearQuote() {
    setQuote('')
    setSelected([])
  }

  // ---- Video helpers ----
  function onVideoFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    const url = URL.createObjectURL(file)
    setVideoUrl(url)
    setVideoName(file.name)
    setClipStart(0)
    const probe = document.createElement('video')
    probe.preload = 'metadata'
    probe.onloadedmetadata = () => {
      const d = probe.duration || 0
      setVideoDur(d)
      setClipLen(Math.min(MAX_CLIP, d || MAX_CLIP))
    }
    probe.src = url
  }
  function removeVideo() {
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    setVideoUrl('')
    setVideoName('')
    setVideoDur(0)
    setClipStart(0)
    setClipLen(MAX_CLIP)
  }

  // ---- Exports ----
  async function handlePngExport(kind: 'story' | 'feed') {
    const node = kind === 'story' ? storyRef.current : feedRef.current
    if (!node || !recap) return
    setExporting(kind)
    try {
      await downloadNodeAsPng(node, `recap-${recap.user}-${recap.period}-${kind}.png`)
    } catch {
      setError('Falha ao gerar o PNG. Tente gerar o recap novamente.')
    } finally {
      setExporting(null)
    }
  }

  async function handleVideoExport(kind: 'story' | 'feed') {
    const overlayNode = kind === 'story' ? overlayStoryRef.current : overlayFeedRef.current
    const video = exportVideoRef.current
    if (!overlayNode || !video || !recap) return
    setExporting(kind)
    setVstatus('Preparando…')
    try {
      const { blob, ext } = await exportCardVideo({
        overlayNode,
        video,
        ...DIMS[kind],
        start,
        duration: clipLen,
        onStatus: setVstatus,
      })
      downloadBlob(blob, `recap-${recap.user}-${recap.period}-${kind}.${ext}`)
      if (ext === 'webm') {
        setError(
          'Não consegui gerar MP4 neste navegador (o conversor falhou) — baixei em WebM. ' +
            'Tente no Chrome/Edge para MP4, ou veja o console para o erro do ffmpeg.',
        )
      }
    } catch (err) {
      console.error('Falha ao gerar o vídeo:', err)
      const detail =
        err instanceof Error ? `${err.name}: ${err.message}` : String(err)
      setError(`Falha ao gerar o vídeo — ${detail}`)
    } finally {
      setExporting(null)
      setVstatus(null)
    }
  }

  function saveKey() {
    setApiKey(apiKey)
    setApiKeyState(getApiKey())
  }

  function changeSource(next: Source) {
    if (next === source) return
    setSource(next)
    localStorage.setItem('recap_source', next)
    // Keep the period valid for the new source (Spotify has no weekly view).
    if (!SOURCE_PERIODS[next].includes(period)) setPeriod(SOURCE_PERIODS[next][0])
    // A different source is a different dataset — reset everything derived.
    setRecaps({})
    setGenerated(false)
    setError(null)
    setQuote('')
    setSelected([])
    setQuoteSongIdx(0)
  }

  async function connectSpotify() {
    setError(null)
    try {
      spotify.setClientId(spClientId)
      await spotify.login() // navigates away to Spotify
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao conectar ao Spotify.')
    }
  }

  function disconnectSpotify() {
    spotify.logout()
    setSpConnected(false)
    setRecaps({})
    setGenerated(false)
  }

  const videoProps = videoUrl
    ? { videoUrl, videoStart: start, videoDuration: clipLen }
    : {}

  return (
    <div className="app">
      <header className="masthead">
        <span className="masthead__cat">Relatório de escuta</span>
        <h1 className="masthead__title">Recap</h1>
        <p className="masthead__sub">
          Um retrato do que você andou ouvindo, prensado numa imagem pronta pra
          story do Instagram e feed do Twitter.
        </p>
      </header>

      {/* Source selector: choose between Last.fm and Spotify. */}
      <div className="segmented segmented--source">
        <span
          className="segmented__slider"
          style={{ width: '50%', transform: `translateX(${source === 'spotify' ? 100 : 0}%)` }}
        />
        <button
          type="button"
          className={`segmented__opt ${source === 'lastfm' ? 'is-active' : ''}`}
          onClick={() => changeSource('lastfm')}
        >
          Last.fm
        </button>
        <button
          type="button"
          className={`segmented__opt ${source === 'spotify' ? 'is-active' : ''}`}
          onClick={() => changeSource('spotify')}
        >
          Spotify
        </button>
      </div>

      {source === 'lastfm' && !hasKey && (
        <div className="keybox">
          <p className="keybox__hint">
            Cole sua <strong>API key do Last.fm</strong> (crie em{' '}
            <a href="https://www.last.fm/api/account/create" target="_blank" rel="noreferrer">
              last.fm/api/account/create
            </a>
            ). Fica salva só no seu navegador.
          </p>
          <div className="keybox__row">
            <input
              className="input"
              type="password"
              placeholder="API key"
              value={apiKey}
              onChange={(e) => setApiKeyState(e.target.value)}
            />
            <button className="btn" onClick={saveKey} disabled={!apiKey.trim()}>
              Salvar chave
            </button>
          </div>
        </div>
      )}

      {source === 'spotify' && !spConnected && (
        <div className="keybox">
          {hasClientId ? (
            <>
              <p className="keybox__hint">
                Entre com sua conta do Spotify para gerar o recap. Você é levado ao
                Spotify pra autorizar e volta pra cá.
              </p>
              <button className="btn btn--spotify" onClick={connectSpotify}>
                <span className="btn__spotify-mark" aria-hidden>♫</span> Entrar com Spotify
              </button>
            </>
          ) : (
            <>
              <p className="keybox__hint">
                Cole o <strong>Client ID</strong> do seu app do Spotify (crie em{' '}
                <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">
                  developer.spotify.com/dashboard
                </a>
                ) e cadastre esta URL como <em>Redirect URI</em>. Depois é só conectar.
              </p>
              <div className="keybox__row">
                <input
                  className="input"
                  type="text"
                  placeholder="Spotify Client ID"
                  value={spClientId}
                  onChange={(e) => setSpClientId(e.target.value)}
                />
                <button className="btn" onClick={connectSpotify} disabled={!spClientId.trim()}>
                  Conectar Spotify
                </button>
              </div>
              <p className="keybox__hint">
                Redirect URI: <code>{window.location.origin + window.location.pathname}</code>
              </p>
            </>
          )}
        </div>
      )}

      {source === 'spotify' && spConnected && (
        <div className="keybox keybox--row">
          <span className="keybox__hint">✓ Conta do Spotify conectada.</span>
          <button className="btn" onClick={disconnectSpotify}>
            Desconectar
          </button>
        </div>
      )}

      <form className="controls" onSubmit={generate}>
        {source === 'lastfm' && (
          <input
            className="input input--user"
            placeholder="usuário do Last.fm"
            value={user}
            onChange={(e) => {
              setUser(e.target.value)
              // Editing the user requires generating again — bring the button back.
              setGenerated(false)
            }}
          />
        )}
        <div className="segmented">
          <span
            className="segmented__slider"
            style={{
              width: `${100 / periods.length}%`,
              transform: `translateX(${periods.indexOf(period) * 100}%)`,
            }}
          />
          {periods.map((p) => (
            <button
              type="button"
              key={p}
              className={`segmented__opt ${p === period ? 'is-active' : ''}`}
              onClick={() => setPeriod(p)}
            >
              {periodLabel(source, p)}
            </button>
          ))}
        </div>
        {!generated && (
          <button
            className="btn btn--primary"
            type="submit"
            disabled={loading || !ready}
          >
            {loading ? 'Gerando…' : 'Gerar recap'}
          </button>
        )}
      </form>

      {error && <p className="error">{error}</p>}
      {generated && !recap && !loading && !error && (
        <p className="quote-editor__hint">Sem dados para este período.</p>
      )}

      {recap && (
        <>
          <div className="export-bar">
            {videoUrl && !IS_FIREFOX ? (
              <>
                <button
                  className="btn btn--primary"
                  onClick={() => handleVideoExport('story')}
                  disabled={!!exporting}
                >
                  {exporting === 'story' ? 'Gerando…' : 'MP4 Story · 1080×1920'}
                </button>
                <button
                  className="btn btn--primary"
                  onClick={() => handleVideoExport('feed')}
                  disabled={!!exporting}
                >
                  {exporting === 'feed' ? 'Gerando…' : 'MP4 Feed · 1600×900'}
                </button>
              </>
            ) : (
              <>
                {videoUrl && IS_FIREFOX && (
                  <>
                    <button
                      className="btn btn--primary"
                      disabled
                      title="Exportar vídeo não é suportado no Firefox. Use Chrome, Edge ou Safari."
                    >
                      MP4 Story · indisponível
                    </button>
                    <button
                      className="btn btn--primary"
                      disabled
                      title="Exportar vídeo não é suportado no Firefox. Use Chrome, Edge ou Safari."
                    >
                      MP4 Feed · indisponível
                    </button>
                  </>
                )}
                <button
                  className="btn btn--primary"
                  onClick={() => handlePngExport('story')}
                  disabled={!!exporting}
                >
                  {exporting === 'story' ? 'Gerando…' : 'PNG Story · 1080×1920'}
                </button>
                <button
                  className="btn btn--primary"
                  onClick={() => handlePngExport('feed')}
                  disabled={!!exporting}
                >
                  {exporting === 'feed' ? 'Gerando…' : 'PNG Feed · 1600×900'}
                </button>
              </>
            )}
          </div>
          {videoUrl && IS_FIREFOX && (
            <p className="quote-editor__hint">
              ⚠ Exportar vídeo não é suportado no Firefox. O clipe aparece no preview, mas o
              download aqui é o PNG (foto). Para gerar o MP4, abra no Chrome, Edge ou Safari.
            </p>
          )}
          {vstatus && <p className="quote-editor__hint">{vstatus}</p>}

          <div className="preview">
            <div className="preview__scaler">
              <RecapCard recap={recap} variant="story" quote={quote} quoteSong={quoteSong} {...videoProps} />
            </div>
          </div>

          <section
            className={`panel video-editor ${IS_FIREFOX ? 'is-disabled' : ''}`}
            aria-disabled={IS_FIREFOX}
          >
            <div className="panel__head">
              <span className="eyebrow">Lado B · opcional</span>
              <h2 className="panel__title">Vídeo no topo</h2>
            </div>
            <p className="panel__hint">
              Suba um clipe da música mais ouvida. Ele vira o fundo do topo e o download
              passa a ser MP4 (máx. {MAX_CLIP}s).
            </p>
            {IS_FIREFOX && (
              <p className="panel__note">
                ⚠ Indisponível no Firefox: ele não consegue gravar vídeo em MP4 (o navegador
                não suporta esse formato no MediaRecorder), então o clipe não pode ser
                exportado por aqui. Abra no Chrome, Edge ou Safari para usar o vídeo no topo —
                a foto (PNG) continua funcionando normalmente.
              </p>
            )}
            <div className="filepicker">
              <input
                id="video-file"
                className="filepicker__input"
                type="file"
                accept="video/*"
                onChange={onVideoFile}
                disabled={IS_FIREFOX}
              />
              <label htmlFor="video-file" className="filepicker__btn">
                {videoUrl ? 'Trocar vídeo' : 'Escolher vídeo'}
              </label>
              <span className="filepicker__name" title={videoName}>
                {videoName || 'Nenhum arquivo escolhido'}
              </span>
            </div>
            {videoUrl && !IS_FIREFOX && (
              <div className="video-editor__controls">
                <label className="video-editor__row">
                  <span>Início do trecho: {start.toFixed(1)}s</span>
                  <input
                    type="range"
                    min={0}
                    max={maxStart}
                    step={0.1}
                    value={start}
                    onChange={(e) => setClipStart(Number(e.target.value))}
                  />
                </label>
                <label className="video-editor__row">
                  <span>Duração: {clipLen.toFixed(1)}s (máx {MAX_CLIP})</span>
                  <input
                    type="range"
                    min={1}
                    max={Math.min(MAX_CLIP, videoDur || MAX_CLIP)}
                    step={0.5}
                    value={clipLen}
                    onChange={(e) => setClipLen(Number(e.target.value))}
                  />
                </label>
                <button className="btn" onClick={removeVideo}>
                  Remover vídeo
                </button>
              </div>
            )}
          </section>

          <section className="panel quote-editor">
            <div className="panel__head">
              <span className="eyebrow">Encarte</span>
              <h2 className="panel__title">Verso em destaque</h2>
            </div>

            <label className="quote-editor__field">
              <span className="field__label">Faixa</span>
              <div className="select-wrap">
                <select
                  className="select"
                  value={quoteSongIdx}
                  onChange={(e) => selectSong(Number(e.target.value))}
                >
                  {recap.topTracks.map((t, i) => (
                    <option key={i} value={i}>
                      {i + 1}. {t.name} — {t.artist}
                    </option>
                  ))}
                </select>
              </div>
            </label>

            {lyricsLoading && <p className="quote-editor__hint">Buscando letra…</p>}
            {lyricsError && <p className="error">{lyricsError}</p>}
            {!lyricsLoading && !lyricsError && lyricLines.length === 0 && (
              <p className="quote-editor__hint">
                Letra não encontrada. Escreva o verso manualmente abaixo.
              </p>
            )}

            {lyricLines.length > 0 && (
              <div className="lyric-lines">
                {lyricLines.map((line, i) => (
                  <button
                    type="button"
                    key={i}
                    className={`lyric-line ${selected.includes(i) ? 'is-selected' : ''}`}
                    onClick={() => toggleLine(i)}
                  >
                    {line}
                  </button>
                ))}
              </div>
            )}

            <textarea
              className="input quote-editor__text"
              rows={3}
              placeholder="Clique nas linhas acima ou escreva o verso aqui…"
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
            />
            {quote && (
              <button className="btn quote-editor__clear" onClick={clearQuote}>
                Limpar verso
              </button>
            )}
          </section>
        </>
      )}

      {/* Off-screen render targets (kept in DOM, out of view). */}
      {recap && (
        <div className="offscreen" aria-hidden>
          <RecapCard ref={storyRef} recap={recap} variant="story" quote={quote} quoteSong={quoteSong} {...videoProps} />
          <RecapCard ref={feedRef} recap={recap} variant="feed" quote={quote} quoteSong={quoteSong} {...videoProps} />
          <RecapCard ref={overlayStoryRef} recap={recap} variant="story" mode="overlay" quote={quote} quoteSong={quoteSong} />
          <RecapCard ref={overlayFeedRef} recap={recap} variant="feed" mode="overlay" quote={quote} quoteSong={quoteSong} />
          {videoUrl && (
            <video ref={exportVideoRef} src={videoUrl} muted playsInline preload="auto" />
          )}
        </div>
      )}

      {recap?.source === 'lastfm' && (
        <p className="disclaimer">
          * minutos são estimados (scrobbles no período × duração média das faixas) — o
          Last.fm não expõe tempo real de escuta.
        </p>
      )}
    </div>
  )
}
