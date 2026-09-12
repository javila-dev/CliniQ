'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Settings2 } from 'lucide-react'

import { ayudaApi } from '@/lib/api/ayuda'
import { canAccess } from '@/lib/permissions'
import { useAuthStore } from '@/store/authStore'
import { PageHeader } from '@/components/shared/PageHeader'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import { Button } from '@/components/ui/button'
import { AyudaSearchBar } from '@/components/ayuda/AyudaSearchBar'
import { TemasRail } from '@/components/ayuda/TemasRail'
import { ArticuloDestacado } from '@/components/ayuda/ArticuloDestacado'
import { GrupoArticulos } from '@/components/ayuda/GrupoArticulos'

const TOPE_HUB = 4 // artículos por categoría cuando se ven "Todos" los temas

export default function AyudaHomePage() {
  const { user } = useAuthStore()
  const puedeGestionar = canAccess.ayudaAdmin(user)
  const router = useRouter()
  const tema = useSearchParams().get('tema')

  const categoriasQ = useQuery({ queryKey: ['ayuda', 'categorias'], queryFn: ayudaApi.categorias })
  const articulosQ = useQuery({
    queryKey: ['ayuda', 'articulos', 'todos'],
    queryFn: () => ayudaApi.articulosTodos(),
    staleTime: 60 * 1000,
  })

  function seleccionarTema(slug: string | null) {
    router.replace(slug ? `/ayuda?tema=${slug}` : '/ayuda', { scroll: false })
  }

  const articulos = articulosQ.data ?? []
  const destacado = useMemo(
    () => articulos.find((a) => a.destacado) ?? articulos[0],
    [articulos],
  )
  const categorias = categoriasQ.data ?? []
  const categoriasVisibles = tema ? categorias.filter((c) => c.slug === tema) : categorias
  const iconoDestacado = destacado
    ? categorias.find((c) => c.slug === destacado.categoria_slug)?.icono
    : undefined

  if (categoriasQ.isLoading || articulosQ.isLoading) return <LoadingState rows={6} />
  if (categoriasQ.isError || articulosQ.isError) {
    return <ErrorState onRetry={() => { categoriasQ.refetch(); articulosQ.refetch() }} />
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="Centro de ayuda"
        description="Guías, preguntas frecuentes y videos para sacarle el máximo a CliniQ."
        action={
          puedeGestionar ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/ayuda/gestion">
                <Settings2 className="mr-1.5 h-4 w-4" />
                Gestionar contenido
              </Link>
            </Button>
          ) : undefined
        }
      />

      <AyudaSearchBar className="mb-6" />

      <div className="grid gap-6 lg:grid-cols-[190px_1fr] lg:gap-8">
        <TemasRail categorias={categorias} seleccionado={tema} onSeleccionar={seleccionarTema} />

        <div className="min-w-0">
          {destacado && <ArticuloDestacado articulo={destacado} icono={iconoDestacado} />}

          {categoriasVisibles.map((c) => (
            <GrupoArticulos
              key={c.id}
              categoria={c}
              articulos={articulos.filter((a) => a.categoria_slug === c.slug)}
              limite={tema ? undefined : TOPE_HUB}
              onVerTodos={() => seleccionarTema(c.slug)}
            />
          ))}

          {tema && categoriasVisibles.length === 0 && (
            <p className="text-sm text-muted-foreground">No encontramos ese tema.</p>
          )}
        </div>
      </div>
    </div>
  )
}
