'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Plus, FileText, Loader2, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cotizacionesApi } from '@/lib/api/cotizaciones'
import { PageHeader } from '@/components/shared/PageHeader'
import { LoadingState } from '@/components/shared/LoadingState'
import { PuestaEnMarchaButton } from '@/components/shared/PuestaEnMarchaButton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CotizacionEstadoBadge } from '@/components/cotizaciones/CotizacionEstadoBadge'
import { cn, formatFechaLocal } from '@/lib/utils'
import { useDebounce } from '@/hooks/useDebounce'
import { useAuthStore } from '@/store/authStore'
import { hasPermission, PERM } from '@/lib/permissions'
import type { Cotizacion, EstadoComercial } from '@/types/cotizaciones'

// Solo propuestas: las aceptadas son ventas y viven en /ventas ("Convertidas"
// queda para ver qué cotizaciones se cerraron).
const ESTADO_TABS: { value: string; label: string }[] = [
  { value: 'abiertas',   label: 'Abiertas'    },
  { value: 'enviada',    label: 'Enviadas'    },
  { value: 'vencida',    label: 'Vencidas'    },
  { value: 'descartada', label: 'Descartadas' },
  { value: 'aceptada',   label: 'Convertidas' },
  { value: 'todas',      label: 'Todas'       },
]

const PAGE_SIZE = 25

function formatCOP(value: string | number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(Number(value))
}

function formatFechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ─── Paginación ───────────────────────────────────────────────

function Pagination({
  page, total, pageSize, onPage,
}: {
  page: number; total: number; pageSize: number; onPage: (p: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const pages: number[] = []
  const addPage = (p: number) => {
    if (p >= 1 && p <= totalPages && !pages.includes(p)) pages.push(p)
  }
  addPage(1)
  for (let p = page - 2; p <= page + 2; p++) addPage(p)
  addPage(totalPages)

  const withGaps: (number | '…')[] = []
  let prev = 0
  for (const p of pages) {
    if (prev && p - prev > 1) withGaps.push('…')
    withGaps.push(p)
    prev = p
  }

  return (
    <div className="flex items-center justify-between px-1">
      <p className="text-sm text-muted-foreground">
        {total === 0 ? 'Sin resultados' : (
          <>Mostrando <span className="font-medium text-foreground">{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)}</span> de <span className="font-medium text-foreground">{total}</span></>
        )}
      </p>
      <div className={cn('flex items-center gap-1', totalPages <= 1 && 'hidden')}>
        <button
          onClick={() => onPage(page - 1)}
          disabled={page === 1}
          className="flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {withGaps.map((p, i) =>
          p === '…' ? (
            <span key={`gap-${i}`} className="px-1 text-muted-foreground text-sm select-none">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPage(p)}
              className={cn(
                'flex items-center justify-center h-8 min-w-[2rem] px-1 rounded-lg text-sm font-medium transition-colors',
                p === page
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {p}
            </button>
          )
        )}
        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
          className="flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

export default function CotizacionesPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const canGestionar = hasPermission(user, PERM.COTIZACIONES_GESTIONAR)
  const [tabEstado, setTabEstado] = useState('abiertas')
  const [busqueda, setBusqueda] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [page, setPage] = useState(1)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [loadingNueva, setLoadingNueva] = useState(false)
  const debouncedBusqueda = useDebounce(busqueda, 350)

  const params: {
    estado_comercial?: EstadoComercial | 'abiertas'
    search?: string
    fecha_desde?: string
    fecha_hasta?: string
    page: number
  } = { page }
  if (tabEstado !== 'todas') params.estado_comercial = tabEstado as EstadoComercial | 'abiertas'
  if (debouncedBusqueda) params.search = debouncedBusqueda
  if (fechaDesde) params.fecha_desde = fechaDesde
  if (fechaHasta) params.fecha_hasta = fechaHasta

  const { data, isLoading } = useQuery({
    queryKey: ['cotizaciones', params],
    queryFn: () => cotizacionesApi.list(params),
  })

  const total = data?.count ?? 0
  const hayFiltros = Boolean(debouncedBusqueda || fechaDesde || fechaHasta)

  function cambiarTab(v: string) {
    setTabEstado(v)
    setPage(1)
  }

  function cambiarBusqueda(v: string) {
    setBusqueda(v)
    setPage(1)
  }

  function cambiarFecha(campo: 'desde' | 'hasta', v: string) {
    if (campo === 'desde') setFechaDesde(v)
    else setFechaHasta(v)
    setPage(1)
  }

  function limpiarFiltros() {
    setBusqueda('')
    setFechaDesde('')
    setFechaHasta('')
    setPage(1)
  }

  function abrirNueva() {
    setLoadingNueva(true)
    router.push('/cotizaciones/nueva')
  }

  function abrirDetalle(c: Cotizacion) {
    setLoadingId(c.id)
    router.push(c.estado === 'aceptada' ? `/ventas/${c.id}` : `/cotizaciones/${c.id}`)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Cotizaciones"
        description="Propuestas enviadas a los pacientes. Las aceptadas pasan a Ventas."
        helpSlug="crear-y-enviar-una-cotizacion"
        action={
          <div className="flex items-center gap-2">
            <PuestaEnMarchaButton />
            {canGestionar && (
              <Button onClick={abrirNueva} disabled={loadingNueva}>
                {loadingNueva
                  ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  : <Plus className="h-4 w-4 mr-2" />}
                Nueva cotización
              </Button>
            )}
          </div>
        }
      />

      {/* Filtros */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Buscar</label>
          <Input
            placeholder="Nombre del paciente…"
            value={busqueda}
            onChange={(e) => cambiarBusqueda(e.target.value)}
            className="w-64 h-9"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Desde</label>
          <Input
            type="date"
            value={fechaDesde}
            max={fechaHasta || undefined}
            onChange={(e) => cambiarFecha('desde', e.target.value)}
            className="w-40 h-9"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Hasta</label>
          <Input
            type="date"
            value={fechaHasta}
            min={fechaDesde || undefined}
            onChange={(e) => cambiarFecha('hasta', e.target.value)}
            className="w-40 h-9"
          />
        </div>
        {hayFiltros && (
          <Button variant="ghost" size="sm" className="h-9" onClick={limpiarFiltros}>
            <X className="h-3.5 w-3.5 mr-1.5" />
            Limpiar
          </Button>
        )}

        {/* Filtro de estado — en la misma fila, alineado a la derecha */}
        <Tabs value={tabEstado} onValueChange={cambiarTab} className="ml-auto">
          <TabsList className="h-9">
            {ESTADO_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="text-xs">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Lista */}
      {isLoading ? (
        <LoadingState rows={4} />
      ) : !data?.results?.length ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">
              {tabEstado === 'abiertas' && !hayFiltros
                ? 'No hay cotizaciones abiertas'
                : tabEstado !== 'todas' || hayFiltros
                  ? 'Sin cotizaciones para los filtros seleccionados'
                  : 'Aún no hay cotizaciones creadas'}
            </p>
            {canGestionar && !hayFiltros && (tabEstado === 'todas' || tabEstado === 'abiertas') && (
              <Button variant="outline" size="sm" className="mt-4" onClick={abrirNueva}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Crear la primera
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="rounded-lg border bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Paciente</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Estado</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Total</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden sm:table-cell">Vence</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">Profesional</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">Creada</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {data.results.map((c) => (
                  <tr
                    key={c.id}
                    className={`border-b last:border-0 hover:bg-muted/20 cursor-pointer transition-colors${loadingId === c.id ? ' opacity-60 pointer-events-none' : ''}`}
                    onClick={() => abrirDetalle(c)}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium">{c.paciente_nombre}</p>
                    </td>
                    <td className="px-4 py-3">
                      <CotizacionEstadoBadge estado={c.estado_comercial ?? c.estado} />
                    </td>
                    <td className="px-4 py-3 font-semibold tabular-nums">
                      {formatCOP(c.total)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums hidden sm:table-cell">
                      {c.estado === 'aceptada'
                        ? <span className="text-green-700">Vendida</span>
                        : c.estado === 'descartada' || !c.fecha_vencimiento
                          ? '—'
                          : <span className={c.estado_comercial === 'vencida' ? 'text-amber-700' : undefined}>{formatFechaLocal(c.fecha_vencimiento)}</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                      {c.profesional_nombre ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                      {formatFechaCorta(c.created_at)}
                    </td>
                    <td className="px-4 py-3 w-8">
                      {loadingId === c.id && (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination page={page} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
        </>
      )}

    </div>
  )
}
