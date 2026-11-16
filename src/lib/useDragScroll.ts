import { useCallback, useRef } from 'react'

/**
 * Lets a horizontally scrolling row be dragged with the mouse (touch already
 * scrolls natively). Returns a callback ref — works even when the row mounts
 * later. A drag longer than 5px swallows the click that ends it, so releasing
 * over a card doesn't also activate it.
 */
export function useDragScroll<T extends HTMLElement>() {
  const cleanup = useRef<(() => void) | null>(null)
  return useCallback((el: T | null) => {
    cleanup.current?.()
    cleanup.current = null
    if (!el) return

    let down = false
    let moved = false
    let startX = 0
    let startLeft = 0
    let pointerId = -1

    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return
      down = true
      moved = false
      startX = e.clientX
      startLeft = el.scrollLeft
      pointerId = e.pointerId
    }
    const onMove = (e: PointerEvent) => {
      if (!down) return
      const dx = e.clientX - startX
      if (!moved && Math.abs(dx) > 5) {
        moved = true
        el.setPointerCapture(pointerId)
        el.classList.add('is-dragging')
      }
      if (moved) el.scrollLeft = startLeft - dx
    }
    const swallowClick = (e: Event) => {
      e.stopPropagation()
      e.preventDefault()
    }
    const onEnd = () => {
      if (!down) return
      down = false
      if (!moved) return
      el.classList.remove('is-dragging')
      el.addEventListener('click', swallowClick, { capture: true, once: true })
      // If no click follows (released outside), don't leave the guard armed.
      setTimeout(() => el.removeEventListener('click', swallowClick, { capture: true }), 0)
    }
    // Images and links start a native drag that would cancel ours.
    const onDragStart = (e: Event) => e.preventDefault()

    // Mouse wheel over the row scrolls it sideways; at either end the page scrolls on.
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      const max = el.scrollWidth - el.clientWidth
      if (max <= 0) return
      const next = el.scrollLeft + e.deltaY
      if ((e.deltaY < 0 && el.scrollLeft <= 0) || (e.deltaY > 0 && el.scrollLeft >= max - 1)) return
      e.preventDefault()
      el.scrollLeft = Math.max(0, Math.min(max, next))
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onEnd)
    el.addEventListener('pointercancel', onEnd)
    el.addEventListener('dragstart', onDragStart)
    cleanup.current = () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onEnd)
      el.removeEventListener('pointercancel', onEnd)
      el.removeEventListener('dragstart', onDragStart)
    }
  }, [])
}
