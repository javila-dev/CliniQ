'use client'

import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Contenedor con scroll vertical cuya barra flota sobre el contenido: no le
 * quita ancho, aparece al pasar el mouse o al desplazarse y se oculta sola.
 * La rueda, el touch y el teclado siguen siendo los nativos; la barra además
 * se puede arrastrar.
 */
export function ScrollSuperpuesto({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [barra, setBarra] = useState({ top: 0, alto: 0, visible: false })
  const [activa, setActiva] = useState(false)
  const ocultar = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const arrastre = useRef<{ y: number; scroll: number } | null>(null)

  const medir = useCallback(() => {
    const el = ref.current
    if (!el) return
    const { scrollTop, scrollHeight, clientHeight } = el
    if (scrollHeight <= clientHeight + 1) {
      setBarra((b) => (b.visible ? { ...b, visible: false } : b))
      return
    }
    const alto = Math.max(28, (clientHeight / scrollHeight) * clientHeight)
    const top = (scrollTop / (scrollHeight - clientHeight)) * (clientHeight - alto)
    setBarra({ top, alto, visible: true })
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(el)
    if (el.firstElementChild) observador.observe(el.firstElementChild)
    return () => {
      observador.disconnect()
      clearTimeout(ocultar.current)
    }
  }, [medir])

  function alDesplazar() {
    medir()
    setActiva(true)
    clearTimeout(ocultar.current)
    ocultar.current = setTimeout(() => setActiva(false), 900)
  }

  function alPresionar(e: PointerEvent<HTMLDivElement>) {
    if (!ref.current) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    arrastre.current = { y: e.clientY, scroll: ref.current.scrollTop }
  }

  function alMover(e: PointerEvent<HTMLDivElement>) {
    const el = ref.current
    if (!el || !arrastre.current) return
    const recorrido = el.clientHeight - barra.alto
    if (recorrido <= 0) return
    const proporcion = (el.scrollHeight - el.clientHeight) / recorrido
    el.scrollTop = arrastre.current.scroll + (e.clientY - arrastre.current.y) * proporcion
  }

  return (
    <div className="group/scroll relative min-h-0 flex-1">
      <div
        ref={ref}
        onScroll={alDesplazar}
        className={cn('h-full overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', className)}
      >
        {children}
      </div>
      {barra.visible && (
        <div
          aria-hidden
          onPointerDown={alPresionar}
          onPointerMove={alMover}
          onPointerUp={() => { arrastre.current = null }}
          className={cn(
            'absolute right-0.5 w-1.5 cursor-pointer touch-none rounded-full bg-gray-400/60 transition-opacity duration-200 hover:bg-gray-500/70',
            activa ? 'opacity-100' : 'opacity-0 group-hover/scroll:opacity-100',
          )}
          style={{ top: barra.top, height: barra.alto }}
        />
      )}
    </div>
  )
}
