import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import { useDragScroll } from '../lib/useDragScroll'
import './ui.css'

// Shared controls for the Início's sub-screens. Ported from the Android
// EchoComponents (segmented control, primary/secondary buttons, text field),
// so every screen reads as one system. All of them follow --accent, which is
// crimson on Last.fm and green on Spotify.

// ---- Segmented control ----------------------------------------------------

export interface SegmentItem<T extends string | number> {
  value: T
  label: ReactNode
}

/** Pill track with an accent slider behind the selected item (white label when active). */
export function Segmented<T extends string | number>({
  items,
  value,
  onChange,
  ariaLabel,
  className = '',
}: {
  items: SegmentItem<T>[]
  value: T
  onChange: (v: T) => void
  ariaLabel?: string
  className?: string
}) {
  const index = Math.max(0, items.findIndex((i) => i.value === value))
  return (
    <div
      className={`ui-seg ${className}`}
      role="group"
      aria-label={ariaLabel}
      style={{ ['--n' as string]: items.length, ['--i' as string]: index } as CSSProperties}
    >
      <span className="ui-seg__slider" aria-hidden="true" />
      {items.map((it) => (
        <button
          key={String(it.value)}
          type="button"
          className={`ui-seg__opt${it.value === value ? ' is-active' : ''}`}
          aria-pressed={it.value === value}
          onClick={() => onChange(it.value)}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}

// ---- Buttons --------------------------------------------------------------

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  loading?: boolean
  children: ReactNode
}

/** Full-width accent button, mono uppercase label. `loading` swaps the label for a spinner. */
export function PrimaryButton({ loading, disabled, children, className = '', ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={`ui-btn ui-btn--primary ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? <span className="ui-spinner" aria-label="Carregando" /> : children}
    </button>
  )
}

/** Full-width outlined button on the surface color. */
export function SecondaryButton({ loading, disabled, children, className = '', ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={`ui-btn ui-btn--secondary ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? <span className="ui-spinner ui-spinner--ink" aria-label="Carregando" /> : children}
    </button>
  )
}

// ---- Text field / feedback ------------------------------------------------

/** Flat input: the label is the placeholder (no floating label), accent ring on focus. */
export function TextField({
  value,
  onChange,
  placeholder,
  onEnter,
  ...rest
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  onEnter?: () => void
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'placeholder'>) {
  return (
    <input
      {...rest}
      className={`ui-field ${rest.className ?? ''}`}
      value={value}
      placeholder={placeholder}
      aria-label={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        rest.onKeyDown?.(e)
        if (e.key === 'Enter' && onEnter) {
          e.preventDefault()
          onEnter()
        }
      }}
    />
  )
}

/** Inline error line (red). */
export function ErrorText({ children, center = false }: { children: ReactNode; center?: boolean }) {
  return (
    <p className={`ui-error${center ? ' ui-error--center' : ''}`} role="alert">
      {children}
    </p>
  )
}

/** Muted helper text (14px). */
export function HintText({ children }: { children: ReactNode }) {
  return <p className="ui-hint">{children}</p>
}

/** Small uppercase mono label ("TRECHO", "DURAÇÃO"…). */
export function MonoLabel({ children }: { children: ReactNode }) {
  return <span className="ui-mono-label">{children}</span>
}

// ---- Toast ----------------------------------------------------------------

const ToastCtx = createContext<(message: string) => void>(() => {})

/** Returns `toast(message)` — a short bottom snackbar (2.6s). */
// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  return useContext(ToastCtx)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<{ id: number; text: string } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const show = useCallback((text: string) => {
    clearTimeout(timer.current)
    setMsg({ id: Date.now(), text })
    timer.current = setTimeout(() => setMsg(null), 2600)
  }, [])
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div className="ui-toast" role="status" key={msg.id}>
          {msg.text}
        </div>
      )}
    </ToastCtx.Provider>
  )
}

// ---- Scaled card preview --------------------------------------------------

/**
 * Cards render at exact export pixels (1080×1920, 1600×900, 1080×1080); this
 * wraps one and scales it down (never up) to the available width, top-left
 * origin, with the 20px rounded corners the preview has (the PNG stays square).
 * `children` is the full-size card; keep a separate off-screen copy (see
 * <Offscreen>) as the capture target so scaling/animation never leak into exports.
 */
export function ScaledPreview({
  width,
  height,
  children,
  className = '',
  onClick,
}: {
  width: number
  height: number
  children: ReactNode
  className?: string
  onClick?: () => void
}) {
  const [boxW, setBoxW] = useState(0)
  const roRef = useRef<ResizeObserver | null>(null)
  const ref = useCallback((node: HTMLDivElement | null) => {
    roRef.current?.disconnect()
    if (!node) return
    setBoxW(node.clientWidth)
    roRef.current = new ResizeObserver(([e]) => setBoxW(e.contentRect.width))
    roRef.current.observe(node)
  }, [])
  const scale = boxW ? Math.min(boxW / width, 1) : 0
  return (
    <div
      ref={ref}
      className={`ui-preview ${className}`}
      style={{ height: boxW ? height * scale : undefined, aspectRatio: boxW ? undefined : `${width} / ${height}` }}
      onClick={onClick}
    >
      <div
        className="ui-preview__inner"
        style={{ width, height, transform: `scale(${scale})`, visibility: scale ? 'visible' : 'hidden' }}
      >
        {children}
      </div>
    </div>
  )
}

/** Holds the full-size capture copy of a card, out of view (still laid out, so it renders). */
export function Offscreen({ children }: { children: ReactNode }) {
  return (
    <div className="ui-offscreen" aria-hidden="true">
      {children}
    </div>
  )
}

// ---- Model picker ---------------------------------------------------------

export interface ModelItem<T extends string | number> {
  value: T
  label: string
  /** Width / height of the thumbnail (9/16 for a story, 16/9 for a feed card…). */
  aspect: number
  /** Small caption under the name ("9:16", "X 16:9"…). */
  sub?: string
  /** Thumbnail content, already sized to fill the frame (see <ModelThumb>). */
  thumb: ReactNode
}

/**
 * "MODELO"-style picker: a panel with one thumbnail per option and its name
 * underneath; the selected thumbnail gets an accent outline, the others dim.
 * Pattern from the Mobbin "Select a style" strip (TikTok text posts).
 */
export function ModelPicker<T extends string | number>({
  title,
  items,
  value,
  onChange,
  thumbHeight = 128,
}: {
  title: string
  items: ModelItem<T>[]
  value: T
  onChange: (v: T) => void
  thumbHeight?: number
}) {
  const dragRef = useDragScroll<HTMLDivElement>()
  return (
    <section className="ui-model" aria-label={title}>
      <MonoLabel>{title}</MonoLabel>
      <div className="ui-model__row" role="radiogroup" aria-label={title} ref={dragRef}>
        {items.map((it) => {
          const active = it.value === value
          return (
            <button
              key={String(it.value)}
              type="button"
              role="radio"
              aria-checked={active}
              className={`ui-model__item${active ? ' is-active' : ''}`}
              style={{ ['--ar' as string]: it.aspect, ['--h' as string]: `${thumbHeight}px` } as CSSProperties}
              onClick={() => onChange(it.value)}
            >
              <span className="ui-model__thumb">{it.thumb}</span>
              <span className="ui-model__label">{it.label}</span>
              {it.sub && <span className="ui-model__sub">{it.sub}</span>}
            </button>
          )
        })}
      </div>
    </section>
  )
}

/** Scales a native-size card (`width`×`height` px) down to fill its thumbnail frame. */
export function ModelThumb({ width, height, children }: { width: number; height: number; children: ReactNode }) {
  return (
    <ScaledPreview width={width} height={height} className="ui-model__scaled">
      {children}
    </ScaledPreview>
  )
}
