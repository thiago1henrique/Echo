import { useEffect, useRef, useState } from 'react'

/**
 * <img> that fades (and, on the hero, gently zooms) in once the pixels are
 * decoded, so photos don't pop in abruptly. Cached images fire no onLoad, so we
 * also check `complete` via the ref. crossOrigin is kept for canvas export.
 */
export function FadeImg({ className, src }: { className: string; src: string }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <img
      className={`${className} fade-img${loaded ? ' is-loaded' : ''}`}
      src={src}
      crossOrigin="anonymous"
      alt=""
      onLoad={() => setLoaded(true)}
      ref={(el) => {
        if (el?.complete) setLoaded(true)
      }}
    />
  )
}

/**
 * Loops the chosen [start, start+duration] segment of the uploaded video.
 * Optionally reports the current playback time (via rAF, so lyric highlighting
 * stays smooth) to `onTime`.
 */
export function HeroVideo({
  src,
  start,
  duration,
  onTime,
  paused = false,
}: {
  src: string
  start: number
  duration: number
  onTime?: (currentTime: number) => void
  paused?: boolean
}) {
  const ref = useRef<HTMLVideoElement>(null)
  // Keep the latest onTime without re-running the effect (which would reseek).
  const onTimeRef = useRef(onTime)

  useEffect(() => {
    onTimeRef.current = onTime
  }, [onTime])

  useEffect(() => {
    const v = ref.current
    if (!v) return
    const seekStart = () => {
      try {
        v.currentTime = start
      } catch {
        /* not ready yet */
      }
    }
    const onLoaded = () => {
      seekStart()
      if (!paused) v.play().catch(() => {})
    }
    const onTimeUpdate = () => {
      if (v.currentTime >= start + duration || v.currentTime < start - 0.1) v.currentTime = start
    }
    v.addEventListener('loadedmetadata', onLoaded)
    v.addEventListener('timeupdate', onTimeUpdate)
    seekStart()
    if (!paused) {
      v.play().catch(() => {})
    } else {
      v.pause()
    }

    // rAF pump: report currentTime smoothly for lyric syncing in the preview.
    let raf = 0
    if (!paused) {
      const tick = () => {
        onTimeRef.current?.(v.currentTime)
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }

    return () => {
      if (raf) cancelAnimationFrame(raf)
      v.removeEventListener('loadedmetadata', onLoaded)
      v.removeEventListener('timeupdate', onTimeUpdate)
    }
  }, [src, start, duration, paused])

  return (
    <video
      ref={ref}
      className="card__hero-img"
      src={src}
      muted
      loop={!paused}
      playsInline
      autoPlay={!paused}
    />
  )
}
