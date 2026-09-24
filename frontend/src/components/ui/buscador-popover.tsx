'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const TAMANO_PAGINA = 8
const MARGEN_VIEWPORT = 8

export interface OpcionBuscadorPopover {
  id: string
  label: string
  sublabel?: string
  hint?: string
}

interface BuscadorPopoverProps {
  etiqueta: string | null | undefined
  placeholder: string
  icono: LucideIcon
  opciones: OpcionBuscadorPopover[]
  cargando?: boolean
  invalido?: boolean
  disabled?: boolean
  /** Si se pasa, la búsqueda la resuelve el padre (servidor) y no se filtra en local. */
  onBuscar?: (q: string) => void
  onSelect: (id: string) => void
  /** Clase de ancho tailwind del card flotante. */
  ancho?: string
}

/**
 * Selector con búsqueda que se muestra flotando sobre el contenido. Se monta
 * en un portal a document.body (posición `fixed`, calculada desde el botón)
 * para no quedar recortado por contenedores con `overflow-hidden` ni por
 * problemas de stacking context, y pagina los resultados visibles de a poco;
 * el filtrado en sí siempre corre sobre todas las `opciones` recibidas (o
 * sobre lo que devuelva `onBuscar`), así que nunca se "pierde" un resultado
 * por quedar fuera de una primera página.
 */
export function BuscadorPopover({
  etiqueta, placeholder, icono: Icono, opciones, cargando, invalido, disabled,
  onBuscar, onSelect, ancho = 'w-[26rem]',
}: BuscadorPopoverProps) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [pagina, setPagina] = useState(0)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const filtradas = !onBuscar && q
    ? opciones.filter((o) => `${o.label} ${o.sublabel ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    : opciones

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / TAMANO_PAGINA))
  const paginaActual = Math.min(pagina, totalPaginas - 1)
  const visibles = filtradas.slice(paginaActual * TAMANO_PAGINA, paginaActual * TAMANO_PAGINA + TAMANO_PAGINA)

  function abrir() {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) setPos({ top: rect.bottom + 4, left: rect.left })
    setOpen(true)
  }

  function cerrar() {
    setOpen(false)
    setQ('')
    setPagina(0)
    onBuscar?.('')
  }

  // Ajusta la posición tras medir el card real: lo evita salirse por la derecha
  // o por abajo del viewport (y lo voltea arriba del botón si no cabe debajo).
  useLayoutEffect(() => {
    if (!open) return
    const trigger = triggerRef.current
    const el = popoverRef.current
    if (!trigger || !el) return
    const rect = trigger.getBoundingClientRect()
    const elRect = el.getBoundingClientRect()

    let left = rect.left
    if (left + elRect.width > window.innerWidth - MARGEN_VIEWPORT) {
      left = Math.max(MARGEN_VIEWPORT, window.innerWidth - elRect.width - MARGEN_VIEWPORT)
    }

    let top = rect.bottom + 4
    if (top + elRect.height > window.innerHeight - MARGEN_VIEWPORT) {
      const arriba = rect.top - elRect.height - 4
      top = arriba > MARGEN_VIEWPORT ? arriba : Math.max(MARGEN_VIEWPORT, window.innerHeight - elRect.height - MARGEN_VIEWPORT)
    }

    if (pos === null || Math.abs(pos.top - top) > 0.5 || Math.abs(pos.left - left) > 0.5) {
      setPos({ top, left })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, visibles.length, cargando])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => (open ? cerrar() : abrir())}
        className={cn(
          'flex h-8 w-full items-center gap-1.5 rounded-md border border-dashed border-input bg-transparent px-2 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors disabled:opacity-50 disabled:hover:border-input disabled:hover:text-muted-foreground',
          invalido && 'border-destructive',
        )}
      >
        <Icono className="h-3 w-3 shrink-0" />
        <span className="truncate">{etiqueta || placeholder}</span>
      </button>

      {open && pos && typeof document !== 'undefined' && createPortal(
        <>
          {/* Overlay: cierra el buscador sin bloquear el resto de la página. */}
          <div className="fixed inset-0 z-[100]" onClick={cerrar} />
          <div
            ref={popoverRef}
            style={{ top: pos.top, left: pos.left }}
            className={cn('fixed rounded-lg border bg-white shadow-lg overflow-hidden z-[101]', ancho)}
          >
            <div className="flex items-center gap-2 px-3 py-2 border-b">
              <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <input
                autoFocus
                value={q}
                onChange={(e) => { setQ(e.target.value); setPagina(0); onBuscar?.(e.target.value) }}
                placeholder="Buscar…"
                className="flex-1 text-sm outline-none bg-transparent"
                onKeyDown={(e) => { if (e.key === 'Escape') cerrar() }}
              />
            </div>
            <div className="max-h-80 overflow-y-auto divide-y">
              {visibles.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => { onSelect(o.id); cerrar() }}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium truncate">{o.label}</span>
                    {o.sublabel && <span className="block text-xs text-muted-foreground truncate">{o.sublabel}</span>}
                  </span>
                  {o.hint && <span className="text-xs text-muted-foreground shrink-0">{o.hint}</span>}
                </button>
              ))}
              {!cargando && visibles.length === 0 && (
                <p className="px-3 py-3 text-sm text-muted-foreground">Sin resultados</p>
              )}
              {cargando && <p className="px-3 py-3 text-sm text-muted-foreground">Buscando…</p>}
            </div>
            {totalPaginas > 1 && (
              <div className="flex items-center justify-between px-3 py-1.5 border-t text-xs text-muted-foreground">
                <button
                  type="button"
                  disabled={paginaActual === 0}
                  onClick={() => setPagina((p) => Math.max(0, p - 1))}
                  className="px-1.5 py-1 disabled:opacity-30 hover:text-foreground"
                >
                  Anterior
                </button>
                <span>Página {paginaActual + 1} de {totalPaginas}</span>
                <button
                  type="button"
                  disabled={paginaActual >= totalPaginas - 1}
                  onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
                  className="px-1.5 py-1 disabled:opacity-30 hover:text-foreground"
                >
                  Siguiente
                </button>
              </div>
            )}
            <div className="border-t px-3 py-1.5 flex justify-end">
              <button type="button" onClick={cerrar} className="text-xs text-muted-foreground hover:text-foreground">Cerrar</button>
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  )
}
