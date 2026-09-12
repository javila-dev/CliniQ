'use client'

import { use, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ThumbsUp, ThumbsDown, Eye, Clock, ChevronRight, PlayCircle, FileText } from 'lucide-react'

import { ayudaApi } from '@/lib/api/ayuda'
import { extractToc, estimarMinutosLectura } from '@/lib/ayuda/toc'
import { formatDate, cn } from '@/lib/utils'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import { Badge } from '@/components/ui/badge'
import { ArticuloView } from '@/components/ayuda/ArticuloView'

interface Props {
  params: Promise<{ slug: string }>
}

export default function ArticuloAyudaPage({ params }: Props) {
  const { slug } = use(params)
  const preview = useSearchParams().get('preview') === '1'
  const [voto, setVoto] = useState<null | boolean>(null)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['ayuda', 'articulo', slug, { preview }],
    queryFn: () => ayudaApi.articulo(slug, { preview }),
  })

  const relacionadosQ = useQuery({
    queryKey: ['ayuda', 'articulos', { categoria: data?.categoria_slug }],
    queryFn: () => ayudaApi.articulos({ categoria: data!.categoria_slug }),
    enabled: !!data,
  })

  const toc = useMemo(() => (data ? extractToc(data.contenido) : []), [data])
  const minutos = useMemo(() => (data ? estimarMinutosLectura(data.contenido) : 1), [data])
  const relacionados = (relacionadosQ.data?.results ?? []).filter((a) => a.slug !== slug).slice(0, 3)

  if (isLoading) return <LoadingState rows={4} />
  if (isError || !data) return <ErrorState message="No encontramos este artículo." onRetry={() => refetch()} />

  async function enviarVoto(util: boolean) {
    setVoto(util)
    try {
      await ayudaApi.feedback(slug, util)
    } catch {
      /* feedback best-effort */
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <nav className="mb-4 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <Link href="/ayuda" className="hover:text-foreground">Centro de ayuda</Link>
        <ChevronRight className="h-3 w-3 shrink-0" />
        <Link href={`/ayuda?tema=${data.categoria_slug}`} className="hover:text-foreground">
          {data.categoria_nombre}
        </Link>
        <ChevronRight className="h-3 w-3 shrink-0" />
        <span className="font-medium text-foreground">{data.titulo}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1fr_240px]">
        <div className="min-w-0">
          <h1 className="mb-2 text-2xl font-bold tracking-tight text-foreground">{data.titulo}</h1>
          <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {preview && data.estado !== 'publicado' && (
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                Vista previa · {data.estado}
              </Badge>
            )}
            <span>{minutos} min de lectura</span>
            {data.publicado_at && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Actualizado {formatDate(data.publicado_at)}
              </span>
            )}
            {data.vistas > 0 && (
              <span className="inline-flex items-center gap-1">
                <Eye className="h-3 w-3" />
                {data.vistas} vistas
              </span>
            )}
          </div>

          <ArticuloView contenido={data.contenido} videoUrl={data.video_url} className="max-w-none" />
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:h-fit">
          {toc.length > 0 && (
            <div className="rounded-xl border bg-card p-3.5">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                En este artículo
              </p>
              <ul className="space-y-0.5">
                {toc.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className={cn(
                        'block border-l-2 py-0.5 text-xs text-muted-foreground hover:text-foreground',
                        item.nivel === 2 ? 'pl-3 border-border' : 'pl-6 border-transparent',
                      )}
                    >
                      {item.texto}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {relacionados.length > 0 && (
            <div className="rounded-xl border bg-card p-3.5">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                También en {data.categoria_nombre}
              </p>
              <ul className="divide-y">
                {relacionados.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/ayuda/articulo/${a.slug}`}
                      className="flex items-start gap-2 py-2 text-xs text-foreground hover:text-rose-600"
                    >
                      {a.tiene_video ? (
                        <PlayCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
                      ) : (
                        <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      {a.titulo}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-xl border bg-card p-3.5">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">¿Sirvió?</p>
            {voto === null ? (
              <div className="flex gap-2">
                <button
                  onClick={() => enviarVoto(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs hover:border-emerald-300 hover:bg-emerald-50"
                >
                  <ThumbsUp className="h-3.5 w-3.5" /> Sí
                </button>
                <button
                  onClick={() => enviarVoto(false)}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs hover:border-rose-300 hover:bg-rose-50"
                >
                  <ThumbsDown className="h-3.5 w-3.5" /> No
                </button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {voto ? '¡Gracias por tu respuesta!' : 'Gracias. Vamos a mejorar este artículo.'}
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
