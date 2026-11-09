'use client'

/*
 * Selector de una sala o un equipo para el modal de cita. Con buscador y lista
 * de alto fijo (cómodo con 2 o con 40 equipos), agrupado en Salas / Equipos si
 * hay de los dos, y se maneja con el teclado: escribir filtra, flechas mueven,
 * Enter elige y Esc cierra.
 */

import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Check, ChevronDown, DoorOpen, Search, Zap } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { cn, scrollWheelFallback } from '@/lib/utils'
import type { RecursoLibre } from '@/types/agenda'

/** Desde cuántas opciones se muestra el buscador (con pocas estorba). */
const CON_BUSCADOR = 6

export interface OpcionAuto {
  /** "La que esté libre" / "El que esté libre". */
  texto: string
}

function normalizar(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function SelectorRecurso({
  opciones, valor, auto, onElegir, trigger, ariaLabel, ayuda,
}: {
  opciones: RecursoLibre[]
  /** Id elegido; null = la opción automática. */
  valor?: string | null
  /** Primera opción "la que esté libre" (para lo que pide el procedimiento). */
  auto?: OpcionAuto
  onElegir: (id: string | null) => void
  /** Botón propio (p. ej. "Reservar otra sala o equipo"); sin él, un campo tipo select. */
  trigger?: ReactNode
  ariaLabel: string
  /** Texto corto arriba de la lista. */
  ayuda?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [q, setQ] = useState('')
  const [activo, setActivo] = useState(0)
  const listaRef = useRef<HTMLDivElement>(null)

  const filtradas = useMemo(() => {
    const n = normalizar(q.trim())
    return n ? opciones.filter((o) => normalizar(o.nombre).includes(n)) : opciones
  }, [opciones, q])
  const mixtas = new Set(opciones.map((o) => o.tipo)).size > 1
  // Orden de navegación con el teclado: la automática (si no hay búsqueda) y luego las filtradas.
  const filas: Array<{ id: string | null; nombre: string; tipo?: 'sala' | 'equipo' }> = [
    ...(auto && !q ? [{ id: null, nombre: auto.texto }] : []),
    ...(mixtas
      ? [...filtradas.filter((o) => o.tipo === 'sala'), ...filtradas.filter((o) => o.tipo === 'equipo')]
      : filtradas),
  ]
  const seleccionada = opciones.find((o) => o.id === valor)

  const cerrar = () => { setAbierto(false); setQ(''); setActivo(0) }
  const elegir = (id: string | null) => { onElegir(id); cerrar() }

  const mover = (paso: number) => {
    if (!filas.length) return
    const siguiente = (activo + paso + filas.length) % filas.length
    setActivo(siguiente)
    listaRef.current?.querySelector<HTMLElement>(`[data-indice="${siguiente}"]`)?.scrollIntoView({ block: 'nearest' })
  }
  const alTeclear = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); mover(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); mover(-1) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      const fila = filas[activo]
      if (fila) elegir(fila.id)
    }
  }

  let indice = -1
  const fila = (f: (typeof filas)[number]) => {
    indice += 1
    const i = indice
    const marcada = f.id === (valor ?? null) && (f.id !== null || !!auto)
    const Icono = f.tipo === 'sala' ? DoorOpen : f.tipo === 'equipo' ? Zap : null
    return (
      <button
        key={f.id ?? '__auto'}
        type="button"
        data-indice={i}
        onMouseEnter={() => setActivo(i)}
        onClick={() => elegir(f.id)}
        className={cn(
          'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
          i === activo ? 'bg-accent' : 'hover:bg-accent',
        )}
      >
        <Check className={cn('h-3.5 w-3.5 shrink-0', marcada ? 'opacity-100' : 'opacity-0')} />
        {Icono && <Icono className="h-4 w-4 shrink-0 text-muted-foreground" />}
        <span className={cn('truncate', f.id === null && 'text-muted-foreground')}>{f.nombre}</span>
      </button>
    )
  }

  const salas = filas.filter((f) => f.tipo === 'sala')
  const equipos = filas.filter((f) => f.tipo === 'equipo')
  const autoFila = filas.find((f) => f.id === null)

  return (
    <Popover open={abierto} onOpenChange={(v) => (v ? setAbierto(true) : cerrar())}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            aria-label={ariaLabel}
            className="flex h-9 w-60 max-w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <span className={cn('truncate', !seleccionada && 'text-muted-foreground')}>
              {seleccionada?.nombre ?? auto?.texto ?? 'Elegir'}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={12}
        className="w-72 max-w-[calc(100vw-2rem)] overflow-hidden p-0"
        onKeyDown={alTeclear}
      >
        {ayuda && <p className="border-b px-3 py-2 text-xs text-muted-foreground">{ayuda}</p>}
        {opciones.length >= CON_BUSCADOR && (
          <div className="relative border-b p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => { setQ(e.target.value); setActivo(0) }}
              placeholder={mixtas ? 'Buscar sala o equipo…' : opciones[0]?.tipo === 'sala' ? 'Buscar sala…' : 'Buscar equipo…'}
              className="h-8 pl-7 text-sm"
              aria-label={`Buscar en ${ariaLabel}`}
            />
          </div>
        )}
        <div ref={listaRef} className="max-h-64 overflow-y-auto py-1" onWheel={scrollWheelFallback} role="listbox" aria-label={ariaLabel}>
          {autoFila && fila(autoFila)}
          {filas.length === (autoFila ? 1 : 0) && q ? (
            <p className="px-3 py-3 text-center text-sm text-muted-foreground">Ninguna coincide con «{q}»</p>
          ) : mixtas ? (
            <>
              {salas.length > 0 && <p className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Salas</p>}
              {salas.map(fila)}
              {equipos.length > 0 && <p className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Equipos</p>}
              {equipos.map(fila)}
            </>
          ) : (
            filas.filter((f) => f.id !== null).map(fila)
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
