'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search, ArrowLeft } from 'lucide-react'

import { ayudaApi, ayudaAdminApi } from '@/lib/api/ayuda'
import { AREAS_AYUDA } from '@/types/ayuda'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { CategoriaRail } from '@/components/ayuda/gestion/CategoriaRail'
import { ArticulosTable } from '@/components/ayuda/gestion/ArticulosTable'

export default function GestionAyudaPage() {
  const [categoria, setCategoria] = useState<string | null>(null)
  const [area, setArea] = useState<string>('todas')
  const [estado, setEstado] = useState<string>('todos')
  const [search, setSearch] = useState('')

  const categoriasQ = useQuery({
    queryKey: ['ayuda', 'gestion', 'categorias'],
    queryFn: ayudaApi.categorias,
  })

  const articulosQ = useQuery({
    queryKey: ['ayuda', 'gestion', 'articulos', { categoria, area, estado, search }],
    queryFn: () =>
      ayudaApi.articulosTodos({
        categoria: categoria ?? undefined,
        area: area === 'todas' ? undefined : area,
        estado: estado === 'todos' ? undefined : estado,
        search: search.trim() || undefined,
      }),
  })

  const categorias = categoriasQ.data ?? []
  const nombreCategoria = useMemo(
    () => categorias.find((c) => c.slug === categoria)?.nombre ?? 'Todos los artículos',
    [categorias, categoria],
  )

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <Link href="/ayuda" className="mb-1.5 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver al centro de ayuda
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Gestión del centro de ayuda</h1>
        </div>
        <Button asChild>
          <Link href="/ayuda/gestion/articulo/nuevo">
            <Plus className="mr-1.5 h-4 w-4" />
            Nuevo artículo
          </Link>
        </Button>
      </div>

      {categoriasQ.isLoading ? (
        <LoadingState rows={6} />
      ) : categoriasQ.isError ? (
        <ErrorState onRetry={() => categoriasQ.refetch()} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <CategoriaRail
              categorias={categorias}
              seleccionada={categoria}
              onSeleccionar={setCategoria}
            />
          </aside>

          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <h2 className="mr-auto text-sm font-semibold text-muted-foreground">{nombreCategoria}</h2>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar…"
                  className="h-9 w-40 pl-8"
                />
              </div>
              <Select value={estado} onValueChange={setEstado}>
                <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los estados</SelectItem>
                  <SelectItem value="publicado">Publicado</SelectItem>
                  <SelectItem value="borrador">Borrador</SelectItem>
                  <SelectItem value="archivado">Archivado</SelectItem>
                </SelectContent>
              </Select>
              <Select value={area} onValueChange={setArea}>
                <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas las áreas</SelectItem>
                  {AREAS_AYUDA.map((a) => (
                    <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {articulosQ.isLoading ? (
              <LoadingState rows={5} />
            ) : articulosQ.isError ? (
              <ErrorState onRetry={() => articulosQ.refetch()} />
            ) : (
              <ArticulosTable articulos={articulosQ.data ?? []} categoriaSlug={categoria} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
