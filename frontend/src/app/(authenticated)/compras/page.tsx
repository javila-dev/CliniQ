'use client'

import { useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Search, ShoppingCart, ChevronLeft, ChevronRight, Clock, CheckCircle2, XCircle } from 'lucide-react'
import { proveedoresApi } from '@/lib/api/proveedores'
import { clinicasApi } from '@/lib/api/clinicas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { PageHeader } from '@/components/shared/PageHeader'
import { LoadingState } from '@/components/shared/LoadingState'
import { canAccess, hasPermission, PERM } from '@/lib/permissions'
import { useAuthStore } from '@/store/authStore'
import { useDebounce } from '@/hooks/useDebounce'
import { cn } from '@/lib/utils'
import type { EstadoOrdenCompra } from '@/types/proveedores'

const PAGE_SIZE = 25
const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Solo "borrador" y "recibida_total" se producen desde este flujo. Los demás
// estados (enviada, recibida_parcial, cancelada) quedan mapeados por si hay
// datos históricos, pero no son alcanzables desde esta UI.
const ESTADO_CONFIG: Record<EstadoOrdenCompra, { label: string; icon: React.ElementType; className: string }> = {
  borrador:         { label: 'Borrador',  icon: Clock,        className: 'bg-gray-50 text-gray-600 ring-gray-200' },
  enviada:          { label: 'Enviada',   icon: Clock,        className: 'bg-blue-50 text-blue-600 ring-blue-200' },
  recibida_parcial: { label: 'Rec. parcial', icon: Clock,     className: 'bg-amber-50 text-amber-600 ring-amber-200' },
  recibida_total:   { label: 'Recibida',  icon: CheckCircle2, className: 'bg-green-50 text-green-700 ring-green-200' },
  cancelada:        { label: 'Cancelada', icon: XCircle,      className: 'bg-red-50 text-red-600 ring-red-200' },
}

export default function ComprasPage() {
  return <RoleGuard check={canAccess.compras}><ComprasContent /></RoleGuard>
}

function ComprasContent() {
  const router = useRouter()
  const { user } = useAuthStore()
  const puedeRegistrar = hasPermission(user, PERM.PROVEEDORES_ORDENES_GESTIONAR)

  const [search, setSearch] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [filtroProveedor, setFiltroProveedor] = useState('todos')
  const [filtroSede, setFiltroSede] = useState('todos')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounce(search, 350)

  const reset = (fn: () => void) => { fn(); setPage(1) }

  const { data: proveedoresData } = useQuery({
    queryKey: ['proveedores-select'],
    queryFn: () => proveedoresApi.listProveedores({ activo: true, page_size: 100 }),
  })
  const { data: sedesData } = useQuery({
    queryKey: ['sedes-select'],
    queryFn: () => clinicasApi.sedes.list({ activa: true }),
  })

  const params = {
    search: debouncedSearch || undefined,
    estado: filtroEstado !== 'todos' ? filtroEstado : undefined,
    proveedor: filtroProveedor !== 'todos' ? filtroProveedor : undefined,
    sede: filtroSede !== 'todos' ? filtroSede : undefined,
    page,
    page_size: PAGE_SIZE,
  }
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['compras', params],
    queryFn: () => proveedoresApi.listOrdenes(params),
    placeholderData: keepPreviousData,
  })
  const compras = data?.results ?? []
  const total = data?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-5">
      <PageHeader
        title="Compras"
        description="Registra las compras de insumos a tus proveedores y su recepción en stock."
        helpSlug="proveedores-y-ordenes-de-compra"
        action={
          puedeRegistrar ? (
            <Button asChild>
              <Link href="/compras/nueva">
                <Plus className="h-4 w-4 mr-1.5" />
                Registrar compra
              </Link>
            </Button>
          ) : undefined
        }
      />

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Número, proveedor…"
            value={search}
            onChange={(e) => reset(() => setSearch(e.target.value))}
            className="pl-9 bg-white"
          />
        </div>
        <Select value={filtroEstado} onValueChange={(v) => reset(() => setFiltroEstado(v))}>
          <SelectTrigger className="w-44 bg-white"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los estados</SelectItem>
            {Object.entries(ESTADO_CONFIG).map(([v, cfg]) => (
              <SelectItem key={v} value={v}>{cfg.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtroProveedor} onValueChange={(v) => reset(() => setFiltroProveedor(v))}>
          <SelectTrigger className="w-48 bg-white"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los proveedores</SelectItem>
            {proveedoresData?.results.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(sedesData?.results.length ?? 0) > 1 && (
          <Select value={filtroSede} onValueChange={(v) => reset(() => setFiltroSede(v))}>
            <SelectTrigger className="w-40 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas las sedes</SelectItem>
              {sedesData?.results.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Tabla */}
      {isLoading ? (
        <LoadingState rows={5} />
      ) : !compras.length ? (
        <Card><CardContent className="py-16 text-center">
          <ShoppingCart className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-semibold">Sin compras registradas</p>
          {puedeRegistrar && (
            <p className="text-sm text-muted-foreground mt-1">Registra la primera compra usando el botón de arriba</p>
          )}
        </CardContent></Card>
      ) : (
        <div className={cn('rounded-xl border bg-white shadow-sm overflow-hidden transition-opacity', isFetching && 'opacity-60')}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/60 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                <th className="text-left px-5 py-2.5">N.° factura</th>
                <th className="text-left px-5 py-2.5">Proveedor</th>
                <th className="text-left px-5 py-2.5 hidden md:table-cell">Sede</th>
                <th className="text-left px-5 py-2.5 hidden sm:table-cell">Fecha</th>
                <th className="text-right px-5 py-2.5">Total</th>
                <th className="text-left px-5 py-2.5">Estado</th>
              </tr>
            </thead>
            <tbody>
              {compras.map((c) => {
                const cfg = ESTADO_CONFIG[c.estado]
                const Icon = cfg.icon
                return (
                  <tr
                    key={c.id}
                    onClick={() => router.push(`/compras/${c.id}`)}
                    className="border-b border-gray-100 last:border-0 hover:bg-muted/30 cursor-pointer"
                  >
                    <td className="px-5 py-3 font-medium whitespace-nowrap">{c.numero_factura_proveedor || c.numero}</td>
                    <td className="px-5 py-3 truncate">{c.proveedor_nombre ?? '—'}</td>
                    <td className="px-5 py-3 hidden md:table-cell text-muted-foreground">{c.sede_nombre ?? '—'}</td>
                    <td className="px-5 py-3 hidden sm:table-cell text-muted-foreground whitespace-nowrap">{fmtDate(c.fecha)}</td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums whitespace-nowrap">{COP.format(Number(c.total))}</td>
                    <td className="px-5 py-3">
                      <span className={cn('inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ring-1', cfg.className)}>
                        <Icon className="h-3 w-3" />
                        {cfg.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
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
    </div>
  )
}
