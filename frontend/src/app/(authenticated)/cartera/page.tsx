'use client'

import { Fragment, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import {
  Wallet, AlertTriangle, TrendingUp, TrendingDown, ExternalLink, User, Download, X,
  Search, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, ChevronsUpDown,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { carteraApi } from '@/lib/api/cartera'
import { PageHeader } from '@/components/shared/PageHeader'
import { LoadingState } from '@/components/shared/LoadingState'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useDebounce } from '@/hooks/useDebounce'
import { cn, formatDate } from '@/lib/utils'
import type { CarteraPaciente } from '@/types/cartera'

// Columnas ordenables → clave `ordering` del listado por paciente.
const SORT_COLS = {
  paciente: 'paciente',
  total: 'total',
  cobrado: 'cobrado',
  saldo: 'saldo',
  prox: 'prox',
} as const
type SortCol = keyof typeof SORT_COLS

const PAGE_SIZE = 25

type PeriodoResumen = 'mes' | 'mes_pasado' | '6m' | '1a' | 'todos'

const PERIODOS_RESUMEN: { value: PeriodoResumen; label: string }[] = [
  { value: 'mes', label: 'Este mes' },
  { value: 'mes_pasado', label: 'Desde mes pasado' },
  { value: '6m', label: 'Desde hace 6 meses' },
  { value: '1a', label: 'Desde hace 1 año' },
  { value: 'todos', label: 'Todos' },
]

/** Fecha `desde` (ISO YYYY-MM-DD) para el periodo del resumen; undefined = sin límite. */
function desdeResumen(p: PeriodoResumen): string | undefined {
  const now = new Date()
  const iso = (d: Date) => d.toLocaleDateString('en-CA')
  switch (p) {
    case 'mes': return iso(new Date(now.getFullYear(), now.getMonth(), 1))
    case 'mes_pasado': return iso(new Date(now.getFullYear(), now.getMonth() - 1, 1))
    case '6m': return iso(new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()))
    case '1a': return iso(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()))
    case 'todos': return undefined
  }
}

function formatCOP(value: string | number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0,
  }).format(Number(value))
}

function CuotasVencidasModal({ open, onClose, desde }: { open: boolean; onClose: () => void; desde?: string }) {
  const { data: cuotas, isLoading } = useQuery({
    queryKey: ['cuotas-vencidas', desde ?? 'todos'],
    queryFn: () => carteraApi.cuotasVencidas(desde),
    enabled: open,
  })

  function exportarExcel() {
    if (!cuotas?.length) return
    const hoy = new Date()
    const filas = cuotas.map((c) => ({
      Paciente: c.paciente_nombre,
      Cuota: `Cuota ${c.numero_cuota} de ${c.total_cuotas}`,
      Cotización: `#${c.cotizacion_id.slice(0, 8).toUpperCase()}`,
      Descripción: c.descripcion || c.tipo,
      'Fecha esperada': c.fecha_esperada ? formatDate(c.fecha_esperada) : '—',
      'Días de mora': c.dias_vencida,
      'Valor esperado': Number(c.valor_esperado),
    }))
    const ws = XLSX.utils.json_to_sheet(filas)
    ws['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 22 }, { wch: 16 }, { wch: 12 }, { wch: 18 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Cuotas vencidas')
    XLSX.writeFile(wb, `cuotas_vencidas_${hoy.toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="h-5 w-5" />
              Cuotas vencidas
            </DialogTitle>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={!cuotas?.length}
              onClick={exportarExcel}
            >
              <Download className="h-3.5 w-3.5" />
              Exportar Excel
            </Button>
          </div>
        </DialogHeader>

        <div className="overflow-y-auto flex-1">
          {isLoading ? (
            <div className="px-6 py-8"><LoadingState rows={4} /></div>
          ) : !cuotas?.length ? (
            <div className="px-6 py-16 text-center">
              <AlertTriangle className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No hay cuotas vencidas</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Paciente</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden sm:table-cell">Descripción</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Fecha esperada</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Días mora</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Valor</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {cuotas.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <p className="font-medium">{c.paciente_nombre}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Cuota {c.numero_cuota} de {c.total_cuotas} · Cot. #{c.cotizacion_id.slice(0, 8).toUpperCase()}
                      </p>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">
                      {c.descripcion || c.tipo}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {c.fecha_esperada ? formatDate(c.fecha_esperada) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Badge variant="destructive" className="text-xs tabular-nums">
                        {c.dias_vencida}d
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-rose-600">
                      {formatCOP(c.valor_esperado)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/cartera/${c.cartera_id}`}
                        className="text-xs text-primary hover:underline flex items-center gap-1 whitespace-nowrap"
                        onClick={onClose}
                      >
                        Ver <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {cuotas?.length ? (
          <div className="px-6 py-3 border-t bg-muted/20 flex items-center justify-between text-xs text-muted-foreground">
            <span>{cuotas.length} cuota{cuotas.length !== 1 ? 's' : ''} vencida{cuotas.length !== 1 ? 's' : ''}</span>
            <span className="font-semibold text-rose-600">
              {formatCOP(cuotas.reduce((sum, c) => sum + Number(c.valor_esperado), 0))}
            </span>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function ResumenCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
  onClick,
}: {
  icon: React.ElementType
  label: string
  value: string
  sub?: string
  color: string
  onClick?: () => void
}) {
  return (
    <Card
      className={cn(
        'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
        onClick && 'cursor-pointer',
      )}
      onClick={onClick}
    >
      <CardContent className="pt-5">
        <div className="flex items-start gap-3">
          <div className={`rounded-lg p-2.5 ${color}`}>
            <Icon className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-bold tabular-nums mt-0.5">
              {value}
              {sub && <span className="text-xs font-normal text-muted-foreground ml-1.5">· {sub}</span>}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Celdas compartidas entre la fila del paciente y la de cada cotización ──

type FilaMontos = Pick<CarteraPaciente, 'saldo_pendiente' | 'en_mora' | 'mora_dias' | 'mora_valor' | 'proxima_cuota_fecha' | 'proxima_cuota_valor'>

function LinkCotizacion({ id }: { id: string }) {
  return (
    <Link
      href={`/cotizaciones/${id}`}
      className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-mono"
      onClick={(e) => e.stopPropagation()}
    >
      #{id.slice(0, 8).toUpperCase()}
      <ExternalLink className="h-3 w-3" />
    </Link>
  )
}

function Saldo({ fila }: { fila: FilaMontos }) {
  if (Number(fila.saldo_pendiente) <= 0) {
    return <span className="text-emerald-600 text-xs font-medium">Al día</span>
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={fila.en_mora ? 'text-rose-600 font-semibold' : 'text-amber-600 font-medium'}>
        {formatCOP(fila.saldo_pendiente)}
      </span>
      {fila.en_mora && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-0.5 rounded bg-rose-100 text-rose-700 px-1 py-0.5 text-[10px] font-semibold leading-none">
              <AlertTriangle className="h-3 w-3" />
              {fila.mora_dias}d
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            En mora · {fila.mora_dias} día{fila.mora_dias !== 1 ? 's' : ''} · {formatCOP(fila.mora_valor)}
          </TooltipContent>
        </Tooltip>
      )}
    </span>
  )
}

function ProximoPago({ fila }: { fila: FilaMontos }) {
  if (!fila.proxima_cuota_fecha && !fila.proxima_cuota_valor) {
    return <span className="text-muted-foreground">—</span>
  }
  return (
    <>
      <span className={fila.en_mora ? 'text-rose-600 font-medium' : 'text-muted-foreground'}>
        {fila.proxima_cuota_fecha ? formatDate(fila.proxima_cuota_fecha) : 'Sin fecha'}
      </span>
      {fila.proxima_cuota_valor && (
        <span className="text-foreground font-medium"> · {formatCOP(fila.proxima_cuota_valor)}</span>
      )}
    </>
  )
}

export default function CarteraPage() {
  const router = useRouter()
  const [modalVencidas, setModalVencidas] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [periodo, setPeriodo] = useState<PeriodoResumen>('mes')
  const [sort, setSort] = useState<{ col: SortCol; dir: 'asc' | 'desc' } | null>(null)
  const debouncedSearch = useDebounce(search, 400)
  const desde = desdeResumen(periodo)
  const ordering = sort ? (sort.dir === 'desc' ? '-' : '') + SORT_COLS[sort.col] : undefined

  const { data: resumen, isLoading: cargandoResumen } = useQuery({
    queryKey: ['cartera-resumen', periodo],
    queryFn: () => carteraApi.resumen({ desde }),
    placeholderData: keepPreviousData,
  })

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['cartera', 'por-paciente', { search: debouncedSearch, page, ordering }],
    queryFn: () => carteraApi.porPaciente({ search: debouncedSearch || undefined, page, ordering, page_size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })
  const pacientes = data?.results ?? []
  // Pacientes con varias cotizaciones abiertos para ver cada una.
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const toggleExpandido = (id: string) => setExpandidos((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const total = data?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const handleSearch = (v: string) => { setSearch(v); setPage(1) }
  const handleSort = (col: SortCol) => {
    setPage(1)
    setSort((prev) => {
      if (!prev || prev.col !== col) return { col, dir: 'asc' }
      if (prev.dir === 'asc') return { col, dir: 'desc' }
      return null
    })
  }
  const sortTh = (col: SortCol, label: string, extra = '') => {
    const active = sort?.col === col
    return (
      <th className={cn('px-4 py-2.5 text-left', extra)}>
        <button
          type="button"
          onClick={() => handleSort(col)}
          className="group inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          {label}
          {active
            ? (sort!.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
            : <ChevronsUpDown className="h-3 w-3 opacity-0 group-hover:opacity-40 transition-opacity" />}
        </button>
      </th>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cartera"
        description="Control de cuentas por cobrar y formas de pago acordadas"
        helpSlug="registrar-un-pago"
      />

      {/* Cards resumen */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">Resumen</h2>
        <Select value={periodo} onValueChange={(v) => setPeriodo(v as PeriodoResumen)}>
          <SelectTrigger className="w-[190px] h-8 text-xs bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODOS_RESUMEN.map((p) => (
              <SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {cargandoResumen ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-5"><LoadingState rows={2} /></CardContent></Card>
          ))}
        </div>
      ) : resumen ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <ResumenCard
            icon={Wallet}
            label="Total cartera"
            value={formatCOP(resumen.total_cartera)}
            color="bg-blue-500"
          />
          <ResumenCard
            icon={TrendingUp}
            label="Total cobrado"
            value={formatCOP(resumen.total_cobrado)}
            color="bg-emerald-500"
          />
          <ResumenCard
            icon={TrendingDown}
            label="Saldo pendiente"
            value={formatCOP(resumen.saldo_pendiente)}
            color="bg-amber-500"
          />
          <ResumenCard
            icon={AlertTriangle}
            label="Cuotas vencidas"
            value={String(resumen.cuotas_vencidas)}
            sub={formatCOP(resumen.cuotas_vencidas_valor)}
            color="bg-rose-500"
            onClick={() => setModalVencidas(true)}
          />
        </div>
      ) : null}

      {/* Búsqueda */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre o documento del paciente…"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="pl-9 bg-white"
        />
      </div>

      {/* Tabla */}
      {isLoading ? (
        <LoadingState rows={5} />
      ) : !pacientes.length ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Wallet className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            {debouncedSearch ? (
              <>
                <p className="text-muted-foreground">Sin resultados</p>
                <p className="text-xs text-muted-foreground mt-1">
                  No hay carteras que coincidan con «{debouncedSearch}»
                </p>
              </>
            ) : (
              <>
                <p className="text-muted-foreground">No hay registros de cartera aún</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Se crean automáticamente al aprobar una cotización
                </p>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <TooltipProvider delayDuration={200}>
        <div className={cn(
          'rounded-xl border bg-white shadow-sm overflow-hidden transition-opacity',
          isFetching && 'opacity-60',
        )}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/60">
                <th className="w-8" />
                {sortTh('paciente', 'Paciente')}
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground hidden lg:table-cell">Cotizaciones</th>
                {sortTh('total', 'Total')}
                {sortTh('cobrado', 'Cobrado')}
                {sortTh('saldo', 'Saldo')}
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground hidden sm:table-cell">Cuotas</th>
                {sortTh('prox', 'Próx. pago', 'hidden md:table-cell')}
              </tr>
            </thead>
            <tbody>
              {pacientes.map((p) => {
                const varias = p.carteras_count > 1
                const abierto = varias && expandidos.has(p.paciente_id)
                const unica = p.carteras[0]
                return (
                  <Fragment key={p.paciente_id}>
                    <tr
                      className={cn(
                        'border-b border-gray-100 hover:bg-muted/40 cursor-pointer transition-colors',
                        abierto && 'bg-muted/30',
                      )}
                      onClick={() => (varias ? toggleExpandido(p.paciente_id) : router.push(`/cartera/${unica.id}`))}
                      aria-expanded={varias ? abierto : undefined}
                    >
                      <td className="pl-3 py-2 text-muted-foreground">
                        {varias && (
                          <ChevronRight className={cn('h-4 w-4 transition-transform', abierto && 'rotate-90')} />
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <span className="font-medium">{p.paciente_nombre}</span>
                        {p.es_migracion && (
                          <span className="ml-2 align-middle text-[10px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            Datos previos
                          </span>
                        )}
                        {p.paciente_documento && (
                          <span className="block text-xs text-muted-foreground tabular-nums">{p.paciente_documento}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 hidden lg:table-cell">
                        {varias ? (
                          <span className="text-xs text-muted-foreground">{p.carteras_count} cotizaciones</span>
                        ) : (
                          <LinkCotizacion id={unica.cotizacion_id} />
                        )}
                      </td>
                      <td className="px-4 py-2 tabular-nums font-semibold">{formatCOP(p.total)}</td>
                      <td className="px-4 py-2 tabular-nums text-emerald-600">{formatCOP(p.total_pagado)}</td>
                      <td className="px-4 py-2 tabular-nums"><Saldo fila={p} /></td>
                      <td className="px-4 py-2 hidden sm:table-cell text-muted-foreground text-xs tabular-nums">
                        {p.cuotas_pagadas}/{p.cuotas_total}
                      </td>
                      <td className="px-4 py-2 hidden md:table-cell text-xs whitespace-nowrap"><ProximoPago fila={p} /></td>
                    </tr>

                    {abierto && p.carteras.map((c) => (
                      <tr
                        key={c.id}
                        className="border-b border-gray-100 bg-muted/20 hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => router.push(`/cartera/${c.id}`)}
                      >
                        <td />
                        <td className="py-2 pl-7 pr-4 text-xs text-muted-foreground">
                          <span className="lg:hidden"><LinkCotizacion id={c.cotizacion_id} /></span>
                          <span className="hidden lg:inline">Aprobada el {formatDate(c.created_at)}</span>
                          {c.profesional_nombre && (
                            <span className="ml-2 inline-flex items-center gap-1 align-middle">
                              <User className="h-3 w-3" />{c.profesional_nombre}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 hidden lg:table-cell"><LinkCotizacion id={c.cotizacion_id} /></td>
                        <td className="px-4 py-2 tabular-nums text-xs">{formatCOP(c.total)}</td>
                        <td className="px-4 py-2 tabular-nums text-xs text-emerald-600">{formatCOP(c.total_pagado)}</td>
                        <td className="px-4 py-2 tabular-nums text-xs"><Saldo fila={c} /></td>
                        <td className="px-4 py-2 hidden sm:table-cell text-muted-foreground text-xs tabular-nums">
                          {c.cuotas_pagadas}/{c.cuotas_total}
                        </td>
                        <td className="px-4 py-2 hidden md:table-cell text-xs whitespace-nowrap"><ProximoPago fila={c} /></td>
                      </tr>
                    ))}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        </TooltipProvider>
      )}

      {/* Paginación */}
      {!isLoading && total > 0 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            {total === 0
              ? 'Sin resultados'
              : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} de ${total}`}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-muted-foreground tabular-nums">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <CuotasVencidasModal open={modalVencidas} onClose={() => setModalVencidas(false)} desde={desde} />
    </div>
  )
}
