'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Plus, Search, AlertTriangle, Package, ChevronLeft, ChevronRight,
  TrendingDown, Layers,
} from 'lucide-react'
import { inventarioApi } from '@/lib/api/inventario'
import { clinicasApi } from '@/lib/api/clinicas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { useDebounce } from '@/hooks/useDebounce'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { PageHeader } from '@/components/shared/PageHeader'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import { InsumoSheet } from '@/components/inventario/InsumoSheet'
import { mensajeDeError } from '@/lib/errores'
import { canAccess, hasPermission, PERM } from '@/lib/permissions'
import { useAuthStore } from '@/store/authStore'
import { cn, formatCantidad } from '@/lib/utils'
import { UNIDAD_LABEL } from '@/lib/inventarioLabels'
import type { Insumo } from '@/types/inventario'

// ─── constants ───────────────────────────────────────────────

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

// ─── Insumo row ───────────────────────────────────────────────

function usoLabel(insumo: Insumo): string {
  return [
    insumo.es_consumo_interno && 'Consumo interno',
    insumo.es_venta_retail && 'Venta retail',
  ].filter(Boolean).join(' & ')
}

function InsumoRow({ insumo, sede }: { insumo: Insumo; sede: string }) {
  const stockBajo = insumo.stock_bajo
  const router = useRouter()

  return (
    <tr
      onClick={() => router.push(`/inventario/${insumo.id}?sede=${sede}`)}
      className="border-b border-gray-100 last:border-0 hover:bg-muted/30 cursor-pointer"
    >
      <td className={cn('px-5 py-3 font-medium truncate', !insumo.activo && 'text-muted-foreground')}>{insumo.nombre}</td>
      <td className="px-5 py-3 hidden md:table-cell text-muted-foreground">{usoLabel(insumo)}</td>
      <td className={cn('px-5 py-3 text-right whitespace-nowrap font-semibold tabular-nums', stockBajo ? 'text-red-600' : 'text-foreground')}>
        {formatCantidad(insumo.stock_actual)}
      </td>
      <td className="px-5 py-3 hidden sm:table-cell text-right text-muted-foreground whitespace-nowrap tabular-nums">
        {formatCantidad(insumo.stock_minimo)}
      </td>
      <td className="px-5 py-3 hidden md:table-cell text-muted-foreground">{UNIDAD_LABEL[insumo.unidad_medida]}</td>
      <td className="px-5 py-3 hidden sm:table-cell text-right text-muted-foreground whitespace-nowrap tabular-nums">{COP.format(Number(insumo.costo_promedio))}</td>
      <td className="px-5 py-3 hidden lg:table-cell text-right text-muted-foreground whitespace-nowrap tabular-nums">{COP.format(Number(insumo.valor_stock))}</td>
      <td className="px-5 py-3">
        {!insumo.activo ? (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700 ring-1 ring-gray-200 whitespace-nowrap">
            Inactivo
          </span>
        ) : stockBajo && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-red-50 text-red-600 ring-1 ring-red-200 whitespace-nowrap">
            <TrendingDown className="h-3 w-3" />
            Stock bajo
          </span>
        )}
      </td>
    </tr>
  )
}

// ─── Resumen card ───────────────────────────────────────────────

function ResumenCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType
  label: string
  value: React.ReactNode
  color: string
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start gap-3">
          <div className={cn('rounded-lg p-2.5', color)}>
            <Icon className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-bold tabular-nums mt-0.5">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Pagination ───────────────────────────────────────────────

function Pagination({ page, total, pageSize, onPage }: {
  page: number; total: number; pageSize: number; onPage: (p: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between px-1 mt-5">
      <p className="text-sm text-muted-foreground">
        {total === 0 ? 'Sin resultados' : (
          <>Mostrando <span className="font-medium">{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)}</span> de <span className="font-medium">{total}</span></>
        )}
      </p>
      <div className="flex items-center gap-1">
        <button onClick={() => onPage(page - 1)} disabled={page === 1} className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button onClick={() => onPage(page + 1)} disabled={page >= totalPages} className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────

export default function InventarioPage() {
  return <RoleGuard check={canAccess.inventario}><InventarioContent /></RoleGuard>
}

function InventarioContent() {
  const { user } = useAuthStore()
  const puedeGestionarInsumos = hasPermission(user, PERM.INVENTARIO_INSUMOS_GESTIONAR)

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'consumo_interno' | 'venta_retail'>('todos')
  // Por defecto solo activos; los inactivos se consultan aparte para poder reactivarlos.
  const [filtroEstado, setFiltroEstado] = useState<'activos' | 'inactivos' | 'todos'>('activos')
  const [tab, setTab] = useState<'insumos' | 'alertas'>('insumos')
  const [nuevoOpen, setNuevoOpen] = useState(false)
  const [sede, setSede] = useState<string>('')
  const debouncedSearch = useDebounce(search, 400)

  const sedesQ = useQuery({
    queryKey: ['sedes-select'],
    queryFn: () => clinicasApi.sedes.list({ activa: true }),
  })
  const sedesData = sedesQ.data
  const sedes = sedesData?.results ?? []

  // Primera sede activa por defecto, una sola vez que carguen.
  useEffect(() => {
    if (!sede && sedes.length > 0) setSede(sedes[0].id)
  }, [sede, sedes])

  const params = {
    search: debouncedSearch || undefined,
    es_consumo_interno: filtroTipo === 'consumo_interno' ? true : undefined,
    es_venta_retail: filtroTipo === 'venta_retail' ? true : undefined,
    activo: filtroEstado === 'todos' ? undefined : filtroEstado === 'activos',
    sede: sede || undefined,
    page,
    page_size: 25,
  }

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['insumos', params],
    queryFn: () => inventarioApi.listInsumos(params),
    enabled: !!sede,
  })

  const alertasQ = useQuery({
    queryKey: ['alertas-stock', sede],
    queryFn: () => inventarioApi.alertasStock(sede),
    enabled: !!sede,
  })
  const alertas = alertasQ.data

  const alertasCount = alertas?.length ?? 0
  // Sin datos de alertas no se puede afirmar que el stock esté bien.
  const alertasDesconocidas = alertasQ.isError || !alertas
  const sinSedes = sedesQ.isSuccess && sedes.length === 0
  const total = data?.count ?? 0

  return (
    <div className="space-y-5">

      <PageHeader
        title="Inventario"
        description="Gestiona el catálogo de insumos y el stock de cada sede."
        helpSlug="inventario-de-insumos"
        action={
          puedeGestionarInsumos ? (
            <Button onClick={() => setNuevoOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Nuevo insumo
            </Button>
          ) : undefined
        }
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3">
        <ResumenCard icon={Layers} label="Total insumos" value={isLoading || isError ? '—' : total} color="bg-slate-500" />
        <ResumenCard
          icon={AlertTriangle}
          label="Stock bajo"
          value={alertasDesconocidas ? '—' : alertasCount}
          color={alertasDesconocidas ? 'bg-slate-400' : alertasCount > 0 ? 'bg-red-500' : 'bg-emerald-500'}
        />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="insumos">Todos</TabsTrigger>
          <TabsTrigger value="alertas" className="relative">
            Alertas de stock
            {alertasCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-[1rem] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
                {alertasCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="insumos" className="mt-4 space-y-3">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar insumo…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className="pl-9 bg-white"
              />
            </div>
            <Select value={filtroTipo} onValueChange={(v) => { setFiltroTipo(v as typeof filtroTipo); setPage(1) }}>
              <SelectTrigger className="w-44 bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los tipos</SelectItem>
                <SelectItem value="consumo_interno">Consumo interno</SelectItem>
                <SelectItem value="venta_retail">Venta retail</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroEstado} onValueChange={(v) => { setFiltroEstado(v as typeof filtroEstado); setPage(1) }}>
              <SelectTrigger className="w-40 bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="activos">Activos</SelectItem>
                <SelectItem value="inactivos">Inactivos</SelectItem>
                <SelectItem value="todos">Todos los estados</SelectItem>
              </SelectContent>
            </Select>
            {sedes.length > 1 && (
              <Select value={sede} onValueChange={(v) => { setSede(v); setPage(1) }}>
                <SelectTrigger className="w-44 bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {sedes.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Table */}
          {sedesQ.isError ? (
            <ErrorState message={mensajeDeError(sedesQ.error, 'No se pudieron cargar las sedes.')} onRetry={() => sedesQ.refetch()} />
          ) : sinSedes ? (
            <Card><CardContent className="py-16 text-center">
              <Package className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-semibold">No hay sedes activas</p>
              <p className="text-sm text-muted-foreground mt-1">
                Crea una sede primero en{' '}
                <Link href="/configuracion/sedes" className="text-primary underline-offset-2 hover:underline">
                  Configuración → Sedes
                </Link>
                .
              </p>
            </CardContent></Card>
          ) : isLoading || !sede ? (
            <LoadingState rows={6} />
          ) : isError ? (
            <ErrorState message={mensajeDeError(error, 'No se pudieron cargar los insumos.')} onRetry={() => refetch()} />
          ) : data?.results.length === 0 ? (
            <Card><CardContent className="py-16 text-center">
              <Package className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-semibold">{filtroEstado === 'inactivos' ? 'No hay insumos inactivos' : 'Sin insumos'}</p>
              {puedeGestionarInsumos && filtroEstado !== 'inactivos' && (
                <p className="text-sm text-muted-foreground mt-1">Crea el primer insumo usando el botón de arriba</p>
              )}
            </CardContent></Card>
          ) : (
            <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/60 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    <th className="text-left px-5 py-2.5">Insumo</th>
                    <th className="text-left px-5 py-2.5 hidden md:table-cell">Uso</th>
                    <th className="text-right px-5 py-2.5">Stock</th>
                    <th className="text-right px-5 py-2.5 hidden sm:table-cell">Stock mín.</th>
                    <th className="text-left px-5 py-2.5 hidden md:table-cell">Unidad</th>
                    <th className="text-right px-5 py-2.5 hidden sm:table-cell">Costo prom.</th>
                    <th className="text-right px-5 py-2.5 hidden lg:table-cell">Valor stock</th>
                    <th className="text-left px-5 py-2.5">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.results.map((i) => (
                    <InsumoRow key={i.id} insumo={i} sede={sede} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Pagination page={page} total={total} pageSize={25} onPage={setPage} />
        </TabsContent>

        <TabsContent value="alertas" className="mt-4">
          {alertasQ.isError ? (
            <ErrorState message={mensajeDeError(alertasQ.error, 'No se pudieron cargar las alertas de stock.')} onRetry={() => alertasQ.refetch()} />
          ) : !alertas ? (
            sedesQ.isError || sinSedes
              ? <p className="py-10 text-center text-sm text-muted-foreground">No hay una sede seleccionada.</p>
              : <LoadingState rows={4} />
          ) : alertas.length === 0 ? (
            <Card><CardContent className="py-16 text-center">
              <div className="flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mx-auto mb-3">
                <Package className="h-6 w-6 text-green-600" />
              </div>
              <p className="text-sm font-semibold text-green-700">Todo en orden</p>
              <p className="text-sm text-muted-foreground mt-1">Ningún insumo tiene stock bajo</p>
            </CardContent></Card>
          ) : (
            <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/60 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    <th className="text-left px-5 py-2.5">Insumo</th>
                    <th className="text-left px-5 py-2.5 hidden md:table-cell">Uso</th>
                    <th className="text-right px-5 py-2.5">Stock</th>
                    <th className="text-right px-5 py-2.5 hidden sm:table-cell">Stock mín.</th>
                    <th className="text-left px-5 py-2.5 hidden md:table-cell">Unidad</th>
                    <th className="text-right px-5 py-2.5 hidden sm:table-cell">Costo prom.</th>
                    <th className="text-right px-5 py-2.5 hidden lg:table-cell">Valor stock</th>
                    <th className="text-left px-5 py-2.5">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {alertas.map((i) => (
                    <InsumoRow key={i.id} insumo={i} sede={sede} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <InsumoSheet open={nuevoOpen} onClose={() => setNuevoOpen(false)} />
    </div>
  )
}
