'use client'

import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Contenedor con scroll vertical cuya barra flota sobre el contenido: no le
 * quita ancho, aparece solo mientras se desplaza y se oculta sola.
 * La rueda, el touch y el teclado siguen siendo los nativos; la barra además
 * se puede arrastrar.
 *
 * `maxElementos`: alto máximo = hasta donde termina ese elemento de la lista
 * (el primer hijo). En una cuadrícula de 3 columnas, 5 elementos son 2 filas;
 * en una sola columna, 5 tarjetas. Sirve dentro de un contenedor flex en
 * columna (ocupa el alto que le dejen) o suelto.
 */
export function ScrollSuperpuesto({ className, maxElementos, children }: {
  className?: string
  maxElementos?: number
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [barra, setBarra] = useState({ top: 0, alto: 0, visible: false })
  const [altoMaximo, setAltoMaximo] = useState<number | null>(null)
  const [activa, setActiva] = useState(false)
  const ocultar = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const arrastre = useRef<{ y: number; scroll: number } | null>(null)

  const medir = useCallback(() => {
    const el = ref.current
    if (!el) return
    if (maxElementos) {
      const elementos = el.firstElementChild?.children
      const limite = elementos && elementos.length > maxElementos ? (elementos[maxElementos - 1] as HTMLElement) : null
      // offsetTop es relativo al contenedor externo (relative) y no cambia con el scroll.
      const alto = limite ? limite.offsetTop + limite.offsetHeight + 4 : null
      setAltoMaximo((a) => (a === alto ? a : alto))
    }
    const { scrollTop, scrollHeight, clientHeight } = el
    if (scrollHeight <= clientHeight + 1) {
      setBarra((b) => (b.visible ? { ...b, visible: false } : b))
      return
    }
    const alto = Math.max(28, (clientHeight / scrollHeight) * clientHeight)
    const top = (scrollTop / (scrollHeight - clientHeight)) * (clientHeight - alto)
    setBarra({ top, alto, visible: true })
  }, [maxElementos])

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
    ocultar.current = setTimeout(() => setActiva(false), 1000)
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
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={ref}
        onScroll={alDesplazar}
        className={cn('min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', className)}
        style={altoMaximo ? { maxHeight: altoMaximo } : undefined}
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
            'absolute right-0.5 z-20 w-1.5 cursor-pointer touch-none rounded-full bg-gray-500/60 transition-opacity duration-200 hover:bg-gray-600/70 hover:opacity-100',
            // Solo se ve mientras se desplaza (o con el mouse encima, para arrastrarla).
            activa ? 'opacity-100' : 'opacity-0',
          )}
          style={{ top: barra.top, height: barra.alto }}
        />
      )}
    </div>
  )
}
