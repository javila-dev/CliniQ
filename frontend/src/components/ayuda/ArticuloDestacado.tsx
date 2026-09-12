import Link from 'next/link'
import { Sparkles } from 'lucide-react'

import type { ArticuloAyudaLista } from '@/types/ayuda'
import { DynamicIcon } from './DynamicIcon'

interface ArticuloDestacadoProps {
  articulo: ArticuloAyudaLista
  icono?: string
}

/** Spotlight del artículo más relevante (destacado, o si no hay, el más visto). */
export function ArticuloDestacado({ articulo, icono }: ArticuloDestacadoProps) {
  return (
    <Link
      href={`/ayuda/articulo/${articulo.slug}`}
      className="mb-6 flex items-center gap-4 rounded-2xl border bg-gradient-to-br from-rose-50 via-card to-card p-5 transition-shadow hover:shadow-md"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-rose-500 text-white">
        <DynamicIcon name={icono} className="h-6 w-6" />
      </div>
      <div className="min-w-0">
        <p className="mb-1 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-rose-600">
          <Sparkles className="h-3 w-3" />
          El más consultado
        </p>
        <h3 className="font-semibold text-foreground">{articulo.titulo}</h3>
        {articulo.resumen && (
          <p className="mt-0.5 max-w-xl truncate text-sm text-muted-foreground">{articulo.resumen}</p>
        )}
      </div>
    </Link>
  )
}
