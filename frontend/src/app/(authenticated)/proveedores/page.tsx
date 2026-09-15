'use client'

import { useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Plus, Search, Truck, ChevronLeft, ChevronRight } from 'lucide-react'
import { proveedoresApi } from '@/lib/api/proveedores'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useDebounce } from '@/hooks/useDebounce'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { PageHeader } from '@/components/shared/PageHeader'
import { LoadingState } from '@/components/shared/LoadingState'
import { canAccess, hasPermission, PERM } from '@/lib/permissions'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'
import { NuevoProveedorDialog, CATEGORIA_LABEL } from '@/components/proveedores/NuevoProveedorDialog'

const PAGE_SIZE = 25

// ─── Main ─────────────────────────────────────────────────────

export default function ProveedoresPage() {
  return <RoleGuard check={canAccess.proveedores}><ProveedoresContent /></RoleGuard>
}

function ProveedoresContent() {
  const { user } = useAuthStore()
  const puedeGestionarProveedores = hasPermission(user, PERM.PROVEEDORES_GESTIONAR)

  const [search, setSearch] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('todas')
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [page, setPage] = useState(1)
  const [nuevoProvOpen, setNuevoProvOpen] = useState(false)
  const debouncedSearch = useDebounce(search, 350)

  const reset = (fn: () => void) => { fn(); setPage(1) }

  const params = {
    search: debouncedSearch || undefined,
    categoria: filtroCategoria !== 'todas' ? filtroCategoria : undefined,
    activo: filtroEstado !== 'todos' ? filtroEstado === 'activos' : undefined,
    page,
    page_size: PAGE_SIZE,
  }
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['proveedores', params],
    queryFn: () => proveedoresApi.listProveedores(params),
    placeholderData: keepPreviousData,
  })
  const proveedores = data?.results ?? []
  const total = data?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-5">
      <PageHeader
        title="Proveedores"
        description="Gestiona los proveedores de insumos de la clínica. Las compras se registran aparte, en Compras."
        helpSlug="proveedores-y-ordenes-de-compra"
        action={
          puedeGestionarProveedores ? (
            <Button onClick={() => setNuevoProvOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Nuevo proveedor
            </Button>
          ) : undefined
        }
      />

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, NIT…"
            value={search}
            onChange={(e) => reset(() => setSearch(e.target.value))}
            className="pl-9 bg-white"
          />
        </div>
        <Select value={filtroCategoria} onValueChange={(v) => reset(() => setFiltroCategoria(v))}>
          <SelectTrigger className="w-48 bg-white"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas las categorías</SelectItem>
            {Object.entries(CATEGORIA_LABEL).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtroEstado} onValueChange={(v) => reset(() => setFiltroEstado(v))}>
          <SelectTrigger className="w-40 bg-white"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los estados</SelectItem>
            <SelectItem value="activos">Activos</SelectItem>
            <SelectItem value="inactivos">Inactivos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabla */}
      {isLoading ? (
        <LoadingState rows={5} />
      ) : !proveedores.length ? (
        <Card><CardContent className="py-16 text-center">
          <Truck className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-semibold">Sin proveedores</p>
          {puedeGestionarProveedores && (
            <p className="text-sm text-muted-foreground mt-1">Agrega el primer proveedor usando el botón de arriba</p>
          )}
        </CardContent></Card>
      ) : (
        <div className={cn('rounded-xl border bg-white shadow-sm overflow-hidden transition-opacity', isFetching && 'opacity-60')}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/60 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                <th className="text-left px-5 py-2.5">Proveedor</th>
                <th className="text-left px-5 py-2.5 hidden sm:table-cell">NIT</th>
                <th className="text-left px-5 py-2.5 hidden md:table-cell">Contacto</th>
                <th className="text-left px-5 py-2.5 hidden lg:table-cell">Categoría</th>
                <th className="text-left px-5 py-2.5">Estado</th>
              </tr>
            </thead>
            <tbody>
              {proveedores.map((p) => (
                <tr key={p.id} className="border-b border-gray-100 last:border-0 hover:bg-muted/30">
                  <td className="px-5 py-3">
                    <p className="font-medium">{p.nombre}</p>
                    <p className="text-[11px] text-muted-foreground sm:hidden">NIT: {p.nit}</p>
                  </td>
                  <td className="px-5 py-3 hidden sm:table-cell text-muted-foreground">{p.nit}</td>
                  <td className="px-5 py-3 hidden md:table-cell text-muted-foreground">
                    <p>{p.contacto || '—'}</p>
                    <p className="text-[11px]">{p.telefono || p.email || ''}</p>
                  </td>
                  <td className="px-5 py-3 hidden lg:table-cell text-muted-foreground">
                    {CATEGORIA_LABEL[p.categoria] ?? p.categoria}
                  </td>
                  <td className="px-5 py-3">
                    <span className={cn(
                      'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ring-1',
                      p.activo ? 'bg-green-50 text-green-700 ring-green-200' : 'bg-gray-100 text-gray-700 ring-gray-200'
                    )}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', p.activo ? 'bg-green-500' : 'bg-gray-400')} />
                      {p.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginación */}
      {!isLoading && total > 0 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} de {total}</p>
          <div className={cn('flex items-center gap-2', totalPages <= 1 && 'hidden')}>
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-muted-foreground tabular-nums">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      <NuevoProveedorDialog open={nuevoProvOpen} onClose={() => setNuevoProvOpen(false)} />
    </div>
  )
}
