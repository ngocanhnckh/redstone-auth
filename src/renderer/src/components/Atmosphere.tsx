import { useEffect, useRef } from 'react'

/**
 * The living backdrop. Glass is invisible without something colourful behind
 * it, so three long-cycle blobs drift underneath everything, plus a clay aura
 * that trails the pointer. Purely decorative — never interactive.
 */
export function Atmosphere({ intense = false }: { intense?: boolean }): React.JSX.Element {
  const auraRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const move = (event: PointerEvent): void => {
      const element = auraRef.current
      if (!element) return
      element.style.setProperty('--cursor-x', `${event.clientX}px`)
      element.style.setProperty('--cursor-y', `${event.clientY}px`)
    }
    window.addEventListener('pointermove', move, { passive: true })
    return () => window.removeEventListener('pointermove', move)
  }, [])

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      <div
        className="absolute inset-0 transition-opacity duration-700"
        style={{ opacity: intense ? 1 : 0.82 }}
      >
        <div className="blob blob--a" />
        <div className="blob blob--b" />
        <div className="blob blob--c" />
      </div>

      <div ref={auraRef} className="cursor-aura" style={{ opacity: intense ? 0.9 : 0.55 }} />

      {/* huge thin arcs bleeding off-edge — depth without decoration */}
      <div className="arc absolute -left-[28vw] top-[12vh] h-[86vw] w-[86vw]" />
      <div className="arc absolute -right-[36vw] -bottom-[40vh] h-[92vw] w-[92vw]" />
    </div>
  )
}
