'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import Fuse from 'fuse.js'
import { Search, Loader2, FileText, PlayCircle } from 'lucide-react'

import { ayudaApi } from '@/lib/api/ayuda'
import { cn } from '@/lib/utils'
import type { ArticuloAyudaLista } from '@/types/ayuda'

// Búsqueda fuzzy client-side: el corpus (artículos publicados) se trae una sola
// vez y se cachea; cada tecla solo recalcula el índice en memoria, sin red.
const FUSE_OPTIONS: Fuse.IFuseOptions<ArticuloAyudaLista> = {
  keys: [
    { name: 'titulo', weight: 0.5 },
    { name: 'resumen', weight: 0.3 },
    { name: 'keywords', weight: 0.2 },
  ],
  threshold: 0.35,
  ignoreLocation: true,
  minMatchCharLength: 2,
}

export function AyudaSearchBar({ className }: { className?: string }) {
  const [q, setQ] = useState('')
  const [abierto, setAbierto] = useState(false)
  const contenedorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setAbierto(false)
      }
    }
    document.addEventListener('mousedown', onClickFuera)
    return () => document.removeEventListener('mousedown', onClickFuera)
  }, [])

  const { data: articulos, isLoading } = useQuery({
    queryKey: ['ayuda', 'articulos', 'todos'],
    queryFn: () => ayudaApi.articulosTodos(),
    staleTime: 5 * 60 * 1000,
  })

  const fuse = useMemo(() => new Fuse<ArticuloAyudaLista>(articulos ?? [], FUSE_OPTIONS), [articulos])

  const resultados = useMemo(() => {
    const query = q.trim()
    if (query.length < 2) return []
    return fuse.search(query, { limit: 8 }).map((r) => r.item)
  }, [fuse, q])

  return (
    <div ref={contenedorRef} className={cn('relative', className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setAbierto(true) }}
          onFocus={() => setAbierto(true)}
          placeholder="Buscar en el centro de ayuda…"
          className="h-12 w-full rounded-xl border bg-card pl-10 pr-10 text-sm shadow-sm outline-none transition-colors focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
        />
        {isLoading && (
          <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {abierto && q.trim().length >= 2 && (
        <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border bg-popover shadow-lg">
          {resultados.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              Sin resultados para “{q.trim()}”.
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1">
              {resultados.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/ayuda/articulo/${a.slug}`}
                    onClick={() => setAbierto(false)}
                    className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-muted"
                  >
                    {a.tiene_video ? (
                      <PlayCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                    ) : (
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">{a.titulo}</span>
                      <span className="block truncate text-xs text-muted-foreground">{a.categoria_nombre}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
