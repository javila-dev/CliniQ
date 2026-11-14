'use client'

// Piezas para las barras de filtros de los listados: una sola línea con buscar,
// periodo y un menú "Filtros", y debajo los filtros activos como chips que se
// quitan con un clic. Pensado para Ventas y reutilizable en Cotizaciones,
// Cartera o Ingresos (antes cada filtro iba con su etiqueta y la fila se partía).

import { useState, type ReactNode } from 'react'
import { CalendarDays, Check, ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn, scrollWheelFallback } from '@/lib/utils'

// ── Periodo ──────────────────────────────────────────────────────────────────

function iso(d: Date) {
  return d.toLocaleDateString('en-CA')
}

function presets(): { clave: string; label: string; desde: string; hasta: string }[] {
  const hoy = new Date()
  const y = hoy.getFullYear()
  const m = hoy.getMonth()
  const hace = (dias: number) => { const d = new Date(hoy); d.setDate(d.getDate() - dias); return iso(d) }
  return [
    { clave: 'mes', label: 'Este mes', desde: iso(new Date(y, m, 1)), hasta: iso(hoy) },
    { clave: 'mes_anterior', label: 'Mes anterior', desde: iso(new Date(y, m - 1, 1)), hasta: iso(new Date(y, m, 0)) },
    { clave: '30', label: 'Últimos 30 días', desde: hace(29), hasta: iso(hoy) },
    { clave: '90', label: 'Últimos 90 días', desde: hace(89), hasta: iso(hoy) },
    { clave: 'anio', label: 'Este año', desde: iso(new Date(y, 0, 1)), hasta: iso(hoy) },
  ]
}

function fechaCorta(fecha: string) {
  return new Date(`${fecha}T00:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Texto del periodo: el nombre del atajo si coincide, o las fechas. */
export function etiquetaPeriodo(desde: string, hasta: string, sinFechas = 'Todas las fechas') {
  if (!desde && !hasta) return sinFechas
  const preset = presets().find((p) => p.desde === desde && p.hasta === hasta)
  if (preset) return preset.label
  if (desde && hasta) return `${fechaCorta(desde)} – ${fechaCorta(hasta)}`
  return desde ? `Desde ${fechaCorta(desde)}` : `Hasta ${fechaCorta(hasta)}`
}

export function FiltroPeriodo({
  desde, hasta, onChange, permitirSinFechas = true, sinFechas = 'Todas las fechas',
}: {
  desde: string
  hasta: string
  onChange: (desde: string, hasta: string) => void
  /** Ofrece "Todas las fechas" (sin rango). */
  permitirSinFechas?: boolean
  sinFechas?: string
}) {
  const [open, setOpen] = useState(false)
  const [d, setD] = useState(desde)
  const [h, setH] = useState(hasta)
  const elegir = (nd: string, nh: string) => { onChange(nd, nh); setOpen(false) }

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) { setD(desde); setH(hasta) } }}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5 font-normal">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <span>{etiquetaPeriodo(desde, hasta, sinFechas)}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <div className="space-y-0.5">
          {permitirSinFechas && (
            <OpcionLista activa={!desde && !hasta} onClick={() => elegir('', '')}>{sinFechas}</OpcionLista>
          )}
          {presets().map((p) => (
            <OpcionLista key={p.clave} activa={p.desde === desde && p.hasta === hasta} onClick={() => elegir(p.desde, p.hasta)}>
              {p.label}
            </OpcionLista>
          ))}
        </div>
        <div className="mt-2 border-t pt-2 space-y-2">
          <p className="px-1 text-xs font-medium text-muted-foreground">Personalizado</p>
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" aria-label="Desde" value={d} max={h || undefined} onChange={(e) => setD(e.target.value)} className="h-8 text-xs" />
            <Input type="date" aria-label="Hasta" value={h} min={d || undefined} onChange={(e) => setH(e.target.value)} className="h-8 text-xs" />
          </div>
          <Button size="sm" className="w-full h-8" disabled={!d && !h} onClick={() => elegir(d, h)}>Aplicar</Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ── Menú "Filtros" ───────────────────────────────────────────────────────────

export function MenuFiltros({ activos, children }: { activos: number; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn('h-9 gap-1.5 font-normal', activos > 0 && 'border-primary/40')}>
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          Filtros
          {activos > 0 && (
            <span className="ml-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] font-semibold text-white">
              {activos}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(22rem,calc(100vw-2rem))] max-h-[min(70vh,36rem)] overflow-y-auto p-0"
        onWheel={scrollWheelFallback}
      >
        <div className="divide-y">{children}</div>
      </PopoverContent>
    </Popover>
  )
}

export function SeccionFiltro({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="space-y-2 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      {children}
    </div>
  )
}

/** Pocas opciones excluyentes (p. ej. Todas / En mora). */
export function Segmentado<T extends string>({ opciones, valor, onChange }: {
  opciones: { value: T; label: string }[]
  valor: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup">
      {opciones.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={valor === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
            valor === o.value ? 'border-primary bg-primary text-white' : 'border-gray-200 bg-white text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function OpcionLista({ activa, onClick, children, detalle }: {
  activa: boolean; onClick: () => void; children: ReactNode; detalle?: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
    >
      <Check className={cn('h-3.5 w-3.5 shrink-0 text-primary', activa ? 'opacity-100' : 'opacity-0')} />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {detalle && <span className="shrink-0 text-xs text-muted-foreground">{detalle}</span>}
    </button>
  )
}

export interface OpcionFiltro {
  id: string
  nombre: string
  /** Encabezado bajo el que se agrupa (p. ej. Tratamientos / Procedimientos). */
  grupo?: string
  detalle?: string
}

/** Nombres repetidos (dos usuarios que se llaman igual): el detalle los distingue. */
export function nombresRepetidos(opciones: { nombre: string }[]): Set<string> {
  const vistos = new Set<string>()
  const repetidos = new Set<string>()
  for (const o of opciones) {
    const n = o.nombre.trim().toLowerCase()
    if (vistos.has(n)) repetidos.add(n)
    vistos.add(n)
  }
  return repetidos
}

/** Lista con buscador. Sin selección = todos. */
export function ListaSeleccion({ opciones, seleccion, onChange, multiple = false, todos = 'Todos', buscar = 'Buscar…', vacio = 'Sin opciones' }: {
  opciones: OpcionFiltro[]
  seleccion: string[]
  onChange: (ids: string[]) => void
  multiple?: boolean
  todos?: string
  buscar?: string
  vacio?: string
}) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const filtradas = q ? opciones.filter((o) => o.nombre.toLowerCase().includes(q)) : opciones
  const grupos = Array.from(new Set(filtradas.map((o) => o.grupo ?? '')))
  const toggle = (id: string) => {
    if (!multiple) return onChange(seleccion[0] === id ? [] : [id])
    onChange(seleccion.includes(id) ? seleccion.filter((x) => x !== id) : [...seleccion, id])
  }

  return (
    <div className="space-y-1.5">
      {opciones.length > 7 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={buscar} aria-label={buscar} className="h-8 pl-8 text-sm" />
        </div>
      )}
      <div className="max-h-44 overflow-y-auto" onWheel={scrollWheelFallback}>
        {!q && <OpcionLista activa={seleccion.length === 0} onClick={() => onChange([])}>{todos}</OpcionLista>}
        {filtradas.length === 0 ? (
          <p className="px-2 py-2 text-xs text-muted-foreground">{opciones.length === 0 ? vacio : 'Sin resultados'}</p>
        ) : grupos.map((g) => (
          <div key={g || 'sin-grupo'}>
            {g && <p className="px-2 pt-2 pb-0.5 text-[11px] font-medium text-muted-foreground">{g}</p>}
            {filtradas.filter((o) => (o.grupo ?? '') === g).map((o) => (
              <OpcionLista key={o.id} activa={seleccion.includes(o.id)} onClick={() => toggle(o.id)} detalle={o.detalle}>
                {o.nombre}
              </OpcionLista>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Chips de filtros activos ─────────────────────────────────────────────────

export interface ChipFiltro {
  clave: string
  label: string
  onQuitar: () => void
}

export function ChipsFiltros({ chips, onLimpiar }: { chips: ChipFiltro[]; onLimpiar: () => void }) {
  if (!chips.length) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <span key={c.clave} className="inline-flex items-center gap-1 rounded-full bg-primary/[0.07] py-0.5 pl-2.5 pr-1 text-xs font-medium text-primary ring-1 ring-inset ring-primary/15">
          {c.label}
          <button
            type="button"
            onClick={c.onQuitar}
            className="grid h-4 w-4 place-items-center rounded-full hover:bg-primary/15"
            aria-label={`Quitar filtro ${c.label}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {chips.length > 1 && (
        <button type="button" onClick={onLimpiar} className="px-1.5 text-xs text-muted-foreground hover:text-foreground">
          Limpiar todo
        </button>
      )}
    </div>
  )
}
