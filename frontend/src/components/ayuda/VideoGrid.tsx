import Link from 'next/link'
import { PlayCircle } from 'lucide-react'

import type { ArticuloAyudaLista } from '@/types/ayuda'

function VideoCard({ articulo }: { articulo: ArticuloAyudaLista }) {
  return (
    <Link
      href={`/ayuda/articulo/${articulo.slug}`}
      className="group overflow-hidden rounded-xl border bg-card transition-colors hover:border-rose-200"
    >
      <div className="relative aspect-video bg-muted">
        {articulo.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={articulo.thumbnail_url}
            alt={articulo.titulo}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-zinc-100" />
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/10 opacity-0 transition-opacity group-hover:opacity-100">
          <PlayCircle className="h-12 w-12 text-white drop-shadow" />
        </div>
      </div>
      <div className="p-3">
        <h3 className="line-clamp-2 text-sm font-semibold text-foreground">{articulo.titulo}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{articulo.categoria_nombre}</p>
      </div>
    </Link>
  )
}

export function VideoGrid({ articulos }: { articulos: ArticuloAyudaLista[] }) {
  if (articulos.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no hay videos publicados.</p>
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {articulos.map((a) => (
        <VideoCard key={a.id} articulo={a} />
      ))}
    </div>
  )
}
