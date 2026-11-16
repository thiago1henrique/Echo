import { useCallback, useRef, useState } from 'react'
import { ErrorText, HintText, PrimaryButton } from '../components/ui'
import { RecommendError, currentSlot } from '../lib/recommend'
import { useDragScroll } from '../lib/useDragScroll'
import type { AlbumRecommendation } from '../lib/recommend'
import type { ScreenCtx } from '../lib/screenCtx'
import './DiscoverScreen.css'

const GENERIC_ERROR = 'Erro ao buscar recomendação.'

/** Descobrir: one album pick per day-part, seeded from the user's own taste. */
export function DiscoverScreen({ ctx }: { ctx: ScreenCtx }) {
  // Shown straight from the day-part cache — no network until the button is pressed.
  const [rec, setRec] = useState<AlbumRecommendation | null>(() => ctx.cachedRecommendation())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function discover() {
    if (loading || !ctx.ready) return
    setError(null)
    setLoading(true)
    try {
      setRec(await ctx.loadRecommendation())
    } catch (err) {
      setError(err instanceof RecommendError && err.message ? err.message : GENERIC_ERROR)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {ctx.source === 'spotify' && (
        <HintText>Um álbum novo, escolhido a partir dos artistas que você mais ouve.</HintText>
      )}
      <PrimaryButton loading={loading} disabled={!ctx.ready} onClick={discover}>
        Ver recomendação
      </PrimaryButton>
      {error && <ErrorText>{error}</ErrorText>}
      {loading && !rec && <DiscoverSkeleton />}
      {rec && <RecommendationCard rec={rec} />}
    </>
  )
}

function DiscoverSkeleton() {
  return (
    <div className="discover discover--skeleton" aria-hidden="true">
      <div className="discover__row">
        <span className="discover__cover discover__sk" />
        <div className="discover__meta">
          <span className="discover__sk discover__sk-line" style={{ width: '70%', height: 20 }} />
          <span className="discover__sk discover__sk-line" style={{ width: '48%' }} />
          <span className="discover__sk discover__sk-line" style={{ width: '30%', height: 12 }} />
        </div>
      </div>
      <hr className="discover__divider" />
      <div className="discover__lines">
        <span className="discover__sk discover__sk-line" />
        <span className="discover__sk discover__sk-line" />
        <span className="discover__sk discover__sk-line" style={{ width: '60%' }} />
      </div>
    </div>
  )
}

function RecommendationCard({ rec }: { rec: AlbumRecommendation }) {
  const dragRef = useDragScroll<HTMLUListElement>()
  const meta = [rec.year, rec.genre].filter(Boolean).join(' · ')
  const related = rec.related ?? []
  return (
    <article className="discover">
      <div className="discover__row">
        {rec.image ? (
          <img className="discover__cover" src={rec.image} alt={`Capa de ${rec.album}`} />
        ) : (
          <span className="discover__cover" aria-hidden="true" />
        )}
        <div className="discover__meta">
          <h3 className="discover__album">{rec.album}</h3>
          <p className="discover__artist">{rec.artist}</p>
          {meta && <p className="discover__info">{meta}</p>}
        </div>
      </div>

      <hr className="discover__divider" />

      {/* key: collapse back to the clamp whenever a new pick arrives */}
      <Description key={`${rec.artist}|${rec.album}`} rec={rec} />

      <p className="discover__seed">Porque você ouve muito {rec.seedArtist}</p>
      <p className="discover__note">
        A dica muda a cada período do dia — essa é a da {currentSlot()}.
      </p>

      {related.length > 0 && (
        <>
          <h3 className="discover__related-title">Você pode gostar também</h3>
          <ul className="discover__related" ref={dragRef}>
            {related.map((r) => (
              <li key={`${r.artist}|${r.album}`} className="discover__item">
                {r.image ? (
                  <img
                    className="discover__item-cover"
                    src={r.image}
                    alt={`Capa de ${r.album}`}
                    loading="lazy"
                  />
                ) : (
                  <span className="discover__item-cover" aria-hidden="true" />
                )}
                <span className="discover__item-album">{r.album}</span>
                <span className="discover__item-artist">{r.artist}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </article>
  )
}

/** Description clamped to 6 lines; "Ler mais" only shows when the text really overflows. */
function Description({ rec }: { rec: AlbumRecommendation }) {
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)
  const expandedRef = useRef(false)
  const roRef = useRef<ResizeObserver | null>(null)

  const measureRef = useCallback((node: HTMLParagraphElement | null) => {
    roRef.current?.disconnect()
    roRef.current = null
    if (!node) return
    const measure = () => {
      // Expanded text never overflows its own box; keep the last clamped verdict.
      if (expandedRef.current) return
      setOverflowing(node.scrollHeight > node.clientHeight + 1)
    }
    roRef.current = new ResizeObserver(measure)
    roRef.current.observe(node)
    void document.fonts?.ready.then(measure)
  }, [])

  function toggle() {
    expandedRef.current = !expandedRef.current
    setExpanded(expandedRef.current)
  }

  return (
    <div className="discover__desc-block">
      {rec.description && rec.descriptionIsArtist && (
        <span className="discover__desc-label">Sobre o artista</span>
      )}
      <p
        ref={measureRef}
        className={`discover__desc${expanded ? ' discover__desc--open' : ''}`}
      >
        {rec.description ?? 'Sem descrição disponível para este álbum.'}
      </p>
      {overflowing && (
        <button type="button" className="discover__more" onClick={toggle} aria-expanded={expanded}>
          {expanded ? 'Ler menos' : 'Ler mais'}
        </button>
      )}
    </div>
  )
}
