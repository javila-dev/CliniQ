'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, ExternalLink, LifeBuoy } from 'lucide-react'

import { ayudaApi, ayudaAdminApi } from '@/lib/api/ayuda'
import { AREAS_AYUDA } from '@/types/ayuda'
import { coreApi } from '@/lib/api/core'
import { authApi } from '@/lib/api/auth'
import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/hooks/use-toast'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { CategoriaRail } from '@/components/ayuda/gestion/CategoriaRail'
import { ArticulosTable } from '@/components/ayuda/gestion/ArticulosTable'

function VisibilidadToggle() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const setUser = useAuthStore((s) => s.setUser)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'configuracion-global'],
    queryFn: coreApi.configuracionGlobal.get,
  })

  const mutation = useMutation({
    mutationFn: (centro_ayuda_habilitado: boolean) =>
      coreApi.configuracionGlobal.update({ centro_ayuda_habilitado }),
    onSuccess: async (nuevo) => {
      qc.setQueryData(['admin', 'configuracion-global'], nuevo)
      toast({ title: nuevo.centro_ayuda_habilitado ? 'Centro de ayuda activado' : 'Centro de ayuda desactivado' })
      // Refresca al superadmin actual para que su propio sidebar refleje el cambio ya mismo.
      try {
        setUser(await authApi.me())
      } catch {
        /* no crítico: el resto de las sesiones lo ven en su próximo /auth/me */
      }
    },
    onError: () => toast({ title: 'No se pudo guardar el cambio', variant: 'destructive' }),
  })

  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-500">
        <LifeBuoy className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">Visible para las clínicas</p>
        <p className="text-xs text-muted-foreground">
          Mientras está apagado, solo lo ven superadmin y el equipo interno (para preparar
          contenido); al activarlo queda visible para todas las clínicas.
        </p>
      </div>
      <Switch
        checked={data?.centro_ayuda_habilitado ?? false}
        onCheckedChange={(v) => mutation.mutate(v)}
        disabled={isLoading || mutation.isPending}
      />
    </div>
  )
}

export default function GestionAyudaConsolePage() {
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
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Centro de ayuda</h1>
          <p className="text-sm text-muted-foreground">FAQ y videos de ayuda dentro de la app.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/ayuda" target="_blank">
              <ExternalLink className="mr-1.5 h-4 w-4" />
              Ver centro de ayuda
            </Link>
          </Button>
          <Button asChild>
            <Link href="/console/ayuda/articulo/nuevo">
              <Plus className="mr-1.5 h-4 w-4" />
              Nuevo artículo
            </Link>
          </Button>
        </div>
      </div>

      <VisibilidadToggle />

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
