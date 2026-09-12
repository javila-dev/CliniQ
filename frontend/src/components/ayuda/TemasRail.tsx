'use client'

import { Layers } from 'lucide-react'

import type { CategoriaAyuda } from '@/types/ayuda'
import { cn } from '@/lib/utils'
import { DynamicIcon } from './DynamicIcon'

interface TemasRailProps {
  categorias: CategoriaAyuda[]
  seleccionado: string | null
  onSeleccionar: (slug: string | null) => void
  className?: string
}

/**
 * Columna de temas del centro de ayuda: fija a la izquierda en escritorio,
 * fila de chips scrolleable en mobile. Filtra en el momento, sin navegar.
 */
export function TemasRail({ categorias, seleccionado, onSeleccionar, className }: TemasRailProps) {
  return (
    <nav
      className={cn(
        'flex gap-1.5 overflow-x-auto pb-1 lg:w-full lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0',
        className,
      )}
    >
      <Boton activo={seleccionado === null} onClick={() => onSeleccionar(null)}>
        <Layers className="h-3.5 w-3.5" />
        <span>Todos</span>
      </Boton>
      {categorias.map((c) => (
        <Boton key={c.id} activo={seleccionado === c.slug} onClick={() => onSeleccionar(c.slug)}>
          <DynamicIcon name={c.icono} className="h-3.5 w-3.5" />
          <span className="truncate">{c.nombre}</span>
          <span className="ml-auto shrink-0 text-[11px] text-muted-foreground/60 lg:inline hidden">
            {c.articulos_count}
          </span>
        </Boton>
      ))}
    </nav>
  )
}

function Boton({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition-colors',
        'lg:w-full lg:justify-start lg:rounded-lg lg:border-0 lg:px-2.5 lg:py-2',
        activo
          ? 'border-rose-200 bg-rose-50 font-medium text-rose-700'
          : 'border-border bg-card text-muted-foreground hover:bg-muted lg:hover:bg-muted lg:bg-transparent lg:border-transparent',
      )}
    >
      {children}
    </button>
  )
}
