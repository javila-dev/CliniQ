'use client'

/**
 * Piezas de las tablas de listados (cotizaciones, ventas): un mismo lenguaje
 * visual. Contenedor con borde suave, encabezado fijo en versalitas grises,
 * filas cómodas a 13 px, números tabulares alineados a la derecha, fechas
 * dd/mm/aaaa y paginación dentro de la tarjeta.
 */

import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronRight as Flecha, Loader2 } from 'lucide-react'
import { cn, diasRelativos, formatFechaDMY } from '@/lib/utils'

// ── Avatar de iniciales (color fijo por nombre) ──

const AVATARES = [
  'bg-rose-100 text-rose-700', 'bg-amber-100 text-amber-800', 'bg-emerald-100 text-emerald-800',
  'bg-sky-100 text-sky-800', 'bg-violet-100 text-violet-800', 'bg-teal-100 text-teal-800',
]

export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase() || '?'
}

export function colorAvatar(nombre: string): string {
  let h = 0
  for (const c of nombre) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return AVATARES[h % AVATARES.length]
}

// ── Contenedor ──

export function TablaContenedor({ children, pie }: { children: ReactNode; pie?: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">{children}</table>
      </div>
      {pie && <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-2.5">{pie}</div>}
    </div>
  )
}

export function Encabezado({ children }: { children: ReactNode }) {
  return (
    <thead className="sticky top-0 z-10 bg-gray-50/90 backdrop-blur-sm">
      <tr className="border-b border-gray-200/80">{children}</tr>
    </thead>
  )
}

/** Celda de encabezado; con `onOrdenar` es una columna ordenable. */
export function Th({ children, align = 'left', className, orden, onOrdenar }: {
  children?: ReactNode
  align?: 'left' | 'right'
  className?: string
  /** 'asc' | 'desc' si es la columna activa; null si se puede ordenar pero no está activa. */
  orden?: 'asc' | 'desc' | null
  onOrdenar?: () => void
}) {
  const base = 'h-9 px-4 text-[11px] font-medium uppercase tracking-[0.04em] text-gray-500 whitespace-nowrap'
  const contenido = onOrdenar ? (
    <button
      type="button"
      onClick={onOrdenar}
      className={cn(
        'inline-flex items-center gap-1 rounded uppercase tracking-[0.04em] transition-colors hover:text-gray-900',
        orden && 'text-gray-900',
        align === 'right' && 'flex-row-reverse',
      )}
    >
      {children}
      {orden === 'asc' ? <ArrowUp className="h-3 w-3" /> : orden === 'desc' ? <ArrowDown className="h-3 w-3" /> : (
        <ArrowDown className="h-3 w-3 opacity-0 transition-opacity group-hover/th:opacity-40" />
      )}
    </button>
  ) : children
  return (
    <th
      className={cn('group/th', base, align === 'right' ? 'text-right' : 'text-left', className)}
      aria-sort={onOrdenar ? (orden === 'asc' ? 'ascending' : orden === 'desc' ? 'descending' : 'none') : undefined}
    >
      {contenido}
    </th>
  )
}

/** Fila que abre el detalle: toda la fila es clicable y muestra una flecha al pasar el mouse. */
export function FilaClic({ children, onClick, cargando }: { children: ReactNode; onClick: () => void; cargando?: boolean }) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        'group/fila cursor-pointer border-b border-gray-100 transition-colors last:border-0 hover:bg-gray-50/80',
        cargando && 'pointer-events-none opacity-60',
      )}
    >
      {children}
      <td className="w-10 pr-3 text-right">
        {cargando
          ? <Loader2 className="ml-auto h-4 w-4 animate-spin text-gray-400" />
          : <Flecha className="ml-auto h-4 w-4 text-gray-300 opacity-0 transition-opacity group-hover/fila:opacity-100" />}
      </td>
    </tr>
  )
}

export function Td({ children, align = 'left', className }: { children?: ReactNode; align?: 'left' | 'right'; className?: string }) {
  return <td className={cn('h-14 px-4 align-middle', align === 'right' && 'text-right', className)}>{children}</td>
}

// ── Celdas tipo ──

export function CeldaPersona({ nombre, detalle }: { nombre: string; detalle?: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold', colorAvatar(nombre))} aria-hidden>
        {iniciales(nombre)}
      </span>
      <div className="min-w-0">
        <p className="truncate font-medium text-gray-900">{nombre}</p>
        {detalle && <p className="truncate text-xs text-gray-500">{detalle}</p>}
      </div>
    </div>
  )
}

/** Fecha dd/mm/aaaa con la distancia a hoy debajo ("hace 3 días"). */
export function CeldaFecha({ fecha, tono, nota }: { fecha: string | null | undefined; tono?: 'aviso'; nota?: string }) {
  if (!fecha) return <span className="text-gray-400">—</span>
  return (
    <div className="leading-tight">
      <p className={cn('tabular-nums text-gray-900', tono === 'aviso' && 'text-amber-700')}>{formatFechaDMY(fecha)}</p>
      <p className={cn('text-[11px] text-gray-500', tono === 'aviso' && 'text-amber-600')}>{nota ?? diasRelativos(fecha)}</p>
    </div>
  )
}

export function Dinero({ valor, className }: { valor: string | number; className?: string }) {
  return (
    <span className={cn('tabular-nums', className)}>
      {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(Number(valor))}
    </span>
  )
}

// ── Pie: conteo y páginas ──

export function Paginacion({ page, total, pageSize, onPage }: {
  page: number
  total: number
  pageSize: number
  onPage: (p: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const paginas: (number | '…')[] = []
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= 1) paginas.push(p)
    else if (paginas[paginas.length - 1] !== '…') paginas.push('…')
  }
  const boton = 'flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-xs font-medium tabular-nums transition-colors'
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs text-gray-500">
        {total === 0 ? 'Sin resultados' : (
          <>
            <span className="font-medium text-gray-900 tabular-nums">{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)}</span>
            {' '}de <span className="font-medium text-gray-900 tabular-nums">{total}</span>
          </>
        )}
      </p>
      {totalPages > 1 && (
        <nav className="flex items-center gap-0.5" aria-label="Páginas">
          <button className={cn(boton, 'text-gray-500 hover:bg-white hover:text-gray-900 disabled:pointer-events-none disabled:opacity-30')}
            disabled={page === 1} onClick={() => onPage(page - 1)} aria-label="Página anterior">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          {paginas.map((p, i) => p === '…' ? (
            <span key={`gap-${i}`} className="px-1 text-xs text-gray-400">…</span>
          ) : (
            <button key={p} onClick={() => onPage(p)} aria-current={p === page ? 'page' : undefined}
              className={cn(boton, p === page ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200' : 'text-gray-500 hover:bg-white hover:text-gray-900')}>
              {p}
            </button>
          ))}
          <button className={cn(boton, 'text-gray-500 hover:bg-white hover:text-gray-900 disabled:pointer-events-none disabled:opacity-30')}
            disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Página siguiente">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </nav>
      )}
    </div>
  )
}

/** Estado vacío o de error dentro de la tarjeta de la tabla. */
export function TablaVacia({ icono, titulo, texto, accion }: { icono?: ReactNode; titulo: string; texto?: string; accion?: ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200/80 bg-white px-6 py-16 text-center shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      {icono && <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-400">{icono}</div>}
      <p className="text-sm font-medium text-gray-900">{titulo}</p>
      {texto && <p className="mx-auto mt-1 max-w-sm text-xs text-gray-500">{texto}</p>}
      {accion && <div className="mt-4">{accion}</div>}
    </div>
  )
}
