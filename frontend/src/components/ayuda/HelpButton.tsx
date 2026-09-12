'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { HelpCircle, ExternalLink } from 'lucide-react'

import { ayudaApi } from '@/lib/api/ayuda'
import { canAccess } from '@/lib/permissions'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { ArticuloView } from './ArticuloView'

interface HelpButtonProps {
  /** Slug del artículo de ayuda relevante para esta pantalla. */
  slug: string
  className?: string
}

/**
 * Ayuda contextual: un "?" que abre el artículo relacionado en un panel lateral,
 * sin salir de la pantalla actual. Se oculta si el centro de ayuda todavía no está
 * habilitado globalmente, o si el artículo no existe o no está publicado — nunca
 * queda un botón muerto.
 */
export function HelpButton({ slug, className }: HelpButtonProps) {
  const [open, setOpen] = useState(false)
  const { user } = useAuthStore()
  const habilitado = canAccess.ayudaCentro(user)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['ayuda', 'articulo', slug],
    queryFn: () => ayudaApi.articulo(slug),
    staleTime: 5 * 60 * 1000,
    retry: false,
    enabled: habilitado,
  })

  if (!habilitado || isError) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Ver ayuda de esta sección"
        aria-label="Ver ayuda de esta sección"
        disabled={isLoading}
        className={cn(
          'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground disabled:opacity-0',
          className,
        )}
      >
        <HelpCircle className="h-4 w-4" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex flex-col overflow-hidden p-0 sm:max-w-md">
          {data ? (
            <>
              <SheetHeader>
                <SheetTitle>{data.titulo}</SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto p-6 pt-4">
                <ArticuloView contenido={data.contenido} videoUrl={data.video_url} className="max-w-none" />
              </div>
              <div className="border-t p-4">
                <a
                  href={`/ayuda/articulo/${data.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-rose-600 hover:text-rose-700"
                >
                  Ver en el centro de ayuda
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </>
          ) : (
            <div className="space-y-3 p-6">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
