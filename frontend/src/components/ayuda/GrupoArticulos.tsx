import Link from 'next/link'
import { FileText, PlayCircle } from 'lucide-react'

import type { ArticuloAyudaLista, CategoriaAyuda } from '@/types/ayuda'

interface GrupoArticulosProps {
  categoria: CategoriaAyuda
  articulos: ArticuloAyudaLista[]
  /** Si se pasa, corta la lista y agrega "Ver todos" que expande el tema completo. */
  limite?: number
  onVerTodos?: () => void
}

export function GrupoArticulos({ categoria, articulos, limite, onVerTodos }: GrupoArticulosProps) {
  if (articulos.length === 0) return null
  const visibles = limite ? articulos.slice(0, limite) : articulos
  const hayMas = limite != null && articulos.length > limite

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-foreground">{categoria.nombre}</h2>
        {hayMas && (
          <button onClick={onVerTodos} className="text-xs font-medium text-muted-foreground hover:text-rose-600">
            Ver los {articulos.length} →
          </button>
        )}
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        {visibles.map((a, i) => (
          <Link
            key={a.id}
            href={`/ayuda/articulo/${a.slug}`}
            className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-muted/60"
            style={i > 0 ? { borderTop: '1px solid hsl(var(--border))' } : undefined}
          >
            {a.tiene_video ? (
              <PlayCircle className="h-3.5 w-3.5 shrink-0 text-rose-500" />
            ) : (
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0 flex-1 truncate text-foreground">{a.titulo}</span>
            {a.tiene_video && (
              <span className="shrink-0 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-600">
                VIDEO
              </span>
            )}
          </Link>
        ))}
      </div>
    </section>
  )
}
