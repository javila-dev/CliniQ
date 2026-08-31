'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Plus, FileText, Download, Loader2, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cotizacionesApi } from '@/lib/api/cotizaciones'
import { PageHeader } from '@/components/shared/PageHeader'
import { LoadingState } from '@/components/shared/LoadingState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CotizacionEstadoBadge } from '@/components/cotizaciones/CotizacionEstadoBadge'
import { formatDate, cn } from '@/lib/utils'
import { useDebounce } from '@/hooks/useDebounce'
import { useAuthStore } from '@/store/authStore'
import { hasPermission, PERM } from '@/lib/permissions'
import type { Cotizacion, EstadoCotizacion } from '@/types/cotizaciones'

const ESTADO_TABS: { value: string; label: string }[] = [
  { value: 'todas',      label: 'Todas'       },
  { value: 'borrador',   label: 'Borrador'    },
  { value: 'aceptada',   label: 'Aceptadas'   },
  { value: 'vencida',    label: 'Vencidas'    },
  { value: 'descartada', label: 'Descartadas' },
]

const PAGE_SIZE = 25

function formatCOP(value: string | number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(Number(value))
}

// ─── Progreso de sesiones ─────────────────────────────────────

function resumenSesiones(c: Cotizacion) {
  let total = 0
  let agendadas = 0
  let completadas = 0
  for (const item of c.items) {
    const ag = item.citas_agendadas ?? 0
    const comp = item.citas_completadas ?? 0
    const rest = item.citas_restantes ?? 0
    total += ag + rest
    agendadas += ag
    completadas += comp
  }
  return { total, agendadas, completadas }
}

function ProgresoSesiones({ cotizacion }: { cotizacion: Cotizacion }) {
  const { total, agendadas, completadas } = resumenSesiones(cotizacion)
  if (total === 0) {
    return <span className="text-xs text-muted-foreground">—</span>
  }
  const pctCompletadas = Math.min(100, Math.round((completadas / total) * 100))
  const pctAgendadas = Math.min(100, Math.round((agendadas / total) * 100))
  const help = `${completadas} de ${total} sesiones completadas · ${agendadas} agendada${agendadas !== 1 ? 's' : ''}`

  return (
    <div className="w-32 space-y-1" title={help}>
      <div className="flex items-center justify-between text-xs tabular-nums">
        <span className="font-medium text-foreground">{completadas}/{total}</span>
        <span className="text-muted-foreground">sesiones</span>
      </div>
      <div
        className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={completadas}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={help}
      >
        {/* Agendadas (fondo tenue) */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-primary/30"
          style={{ width: `${pctAgendadas}%` }}
        />
        {/* Completadas (relleno sólido) */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all"
          style={{ width: `${pctCompletadas}%` }}
        />
      </div>
    </div>
  )
}

// ─── Paginación ───────────────────────────────────────────────

function Pagination({
  page, total, pageSize, onPage,
}: {
  page: number; total: number; pageSize: number; onPage: (p: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (totalPages <= 1) return null

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
      <div className="flex items-center gap-1">
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
  const [tabEstado, setTabEstado] = useState('todas')
  const [busqueda, setBusqueda] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [page, setPage] = useState(1)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [loadingNueva, setLoadingNueva] = useState(false)
  const debouncedBusqueda = useDebounce(busqueda, 350)

  const params: {
    estado?: EstadoCotizacion
    search?: string
    fecha_desde?: string
    fecha_hasta?: string
    page: number
  } = { page }
  if (tabEstado !== 'todas') params.estado = tabEstado as EstadoCotizacion
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
    router.push(`/cotizaciones/${c.id}`)
  }

  async function descargarPdf(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    const blob = await cotizacionesApi.descargarPdf(id)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cotizacion-${id.slice(0, 8)}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Cotizaciones"
        description="Gestiona las propuestas comerciales para los pacientes"
        action={
          canGestionar ? (
            <Button onClick={abrirNueva} disabled={loadingNueva}>
              {loadingNueva
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <Plus className="h-4 w-4 mr-2" />}
              Nueva cotización
            </Button>
          ) : undefined
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
      </div>

      {/* Tabs de estado */}
      <Tabs value={tabEstado} onValueChange={cambiarTab}>
        <TabsList className="h-9">
          {ESTADO_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="text-xs">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Lista */}
      {isLoading ? (
        <LoadingState rows={4} />
      ) : !data?.results?.length ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">
              {tabEstado !== 'todas' || hayFiltros
                ? 'Sin cotizaciones para los filtros seleccionados'
                : 'Aún no hay cotizaciones creadas'}
            </p>
            {canGestionar && !hayFiltros && tabEstado === 'todas' && (
              <Button variant="outline" size="sm" className="mt-4" onClick={abrirNueva}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Crear la primera
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Paciente</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Estado</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Total</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden sm:table-cell">Pagado</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden sm:table-cell">Pendiente</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden lg:table-cell">Sesiones</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">Profesional</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">Fecha</th>
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
                      <p className="text-xs text-muted-foreground">{c.items.length} servicio{c.items.length !== 1 ? 's' : ''}</p>
                    </td>
                    <td className="px-4 py-3">
                      <CotizacionEstadoBadge estado={c.estado} />
                    </td>
                    <td className="px-4 py-3 font-semibold tabular-nums">
                      {formatCOP(c.total)}
                    </td>
                    <td className="px-4 py-3 tabular-nums hidden sm:table-cell">
                      {c.total_pagado == null
                        ? <span className="text-muted-foreground">—</span>
                        : <span className={Number(c.total_pagado) > 0 ? 'text-green-600 font-medium' : 'text-muted-foreground'}>{formatCOP(c.total_pagado)}</span>}
                    </td>
                    <td className="px-4 py-3 tabular-nums hidden sm:table-cell">
                      {c.saldo_pendiente == null
                        ? <span className="text-muted-foreground">—</span>
                        : <span className={Number(c.saldo_pendiente) > 0 ? 'text-amber-600 font-medium' : 'text-green-600'}>{formatCOP(c.saldo_pendiente)}</span>}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <ProgresoSesiones cotizacion={c} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                      {c.profesional_nombre ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                      {formatDate(c.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      {loadingId === c.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Descargar PDF"
                          onClick={(e) => descargarPdf(e, c.id)}
                        >
                          <Download className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
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
