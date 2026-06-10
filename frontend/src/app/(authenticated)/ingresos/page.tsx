'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search, Receipt, CreditCard, ChevronLeft, ChevronRight,
  CheckCircle2, Clock, AlertCircle, XCircle, Banknote,
  CalendarDays, ClipboardList, PlusCircle, TrendingUp, CalendarRange, X,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { cobrosApi } from '@/lib/api/cobros'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { useDebounce } from '@/hooks/useDebounce'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { canAccess } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import type { Cobro, EstadoCobro, MedioPago, OrigenCobro } from '@/types/cobros'

// ─── constants ───────────────────────────────────────────────

const ESTADO_CONFIG: Record<EstadoCobro, { label: string; icon: React.ElementType; className: string }> = {
  pendiente:      { label: 'Pendiente',    icon: Clock,        className: 'bg-amber-50 text-amber-600 ring-amber-200'  },
  pagado_parcial: { label: 'Pago parcial', icon: AlertCircle,  className: 'bg-blue-50 text-blue-600 ring-blue-200'    },
  pagado:         { label: 'Pagado',       icon: CheckCircle2, className: 'bg-green-50 text-green-700 ring-green-200' },
  anulado:        { label: 'Anulado',      icon: XCircle,      className: 'bg-gray-100 text-gray-500 ring-gray-200'   },
}

const MEDIO_PAGO_LABEL: Record<MedioPago, string> = {
  efectivo:        'Efectivo',
  tarjeta_debito:  'Tarjeta débito',
  tarjeta_credito: 'Tarjeta crédito',
  transferencia:   'Transferencia',
  otro:            'Otro',
}

const ORIGEN_CONFIG: Record<OrigenCobro, { label: string; icon: React.ElementType; className: string }> = {
  cita:        { label: 'Cita',        icon: CalendarDays,  className: 'bg-violet-50 text-violet-600 ring-violet-200' },
  cotizacion:  { label: 'Cotización',  icon: ClipboardList, className: 'bg-sky-50 text-sky-600 ring-sky-200'          },
  libre:       { label: 'Libre',       icon: PlusCircle,    className: 'bg-gray-50 text-gray-600 ring-gray-200'       },
}

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// ─── Registrar pago sheet ─────────────────────────────────────

const pagoSchema = z.object({
  medio_pago: z.enum(['efectivo', 'tarjeta_debito', 'tarjeta_credito', 'transferencia', 'otro']),
  valor: z.string().min(1, 'Ingresa el valor'),
  referencia: z.string().optional(),
})

function RegistrarPagoSheet({ cobro, open, onClose }: { cobro: Cobro | null; open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(pagoSchema),
    defaultValues: { medio_pago: 'efectivo' as MedioPago },
  })

  const mutation = useMutation({
    mutationFn: (data: { medio_pago: MedioPago; valor: string; referencia?: string }) =>
      cobrosApi.registrarPago(cobro!.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ingresos'] })
      qc.invalidateQueries({ queryKey: ['cobro', cobro?.id] })
      reset()
      onClose()
    },
  })

  if (!cobro) return null

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) { reset(); onClose() } }}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader><SheetTitle>Registrar pago</SheetTitle></SheetHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d as Parameters<typeof mutation.mutate>[0]))} className="mt-6 space-y-4">
          <div className="rounded-lg bg-muted/40 p-3 text-sm space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Paciente</span>
              <span className="font-medium">{cobro.paciente_nombre ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total</span>
              <span className="font-semibold">{COP.format(Number(cobro.total))}</span>
            </div>
            <div className="flex justify-between border-t pt-1.5 mt-0.5 font-semibold text-primary">
              <span>Saldo pendiente</span>
              <span>{COP.format(Number(cobro.saldo_pendiente))}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Medio de pago *</Label>
            <select {...register('medio_pago')} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
              {Object.entries(MEDIO_PAGO_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Valor *</Label>
            <Input
              type="number" step="0.01" min="0" placeholder="0.00"
              {...register('valor')} className={cn(errors.valor && 'border-red-400')}
            />
            {errors.valor && <p className="text-xs text-red-500">{errors.valor.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Referencia</Label>
            <Input placeholder="Ej. Caja 1, Recibo #..." {...register('referencia')} />
          </div>

          {mutation.isError && <p className="text-sm text-red-500">Error al registrar pago.</p>}

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => { reset(); onClose() }}>Cancelar</Button>
            <Button type="submit" className="flex-1" disabled={mutation.isPending}>
              {mutation.isPending ? 'Guardando…' : 'Registrar pago'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}

// ─── Ingreso detalle sheet ────────────────────────────────────

function IngresoDetalleSheet({ cobro, open, onClose }: { cobro: Cobro | null; open: boolean; onClose: () => void }) {
  const [pagoOpen, setPagoOpen] = useState(false)
  if (!cobro) return null

  const cfg = ESTADO_CONFIG[cobro.estado]
  const Icon = cfg.icon
  const puedePagar = cobro.estado === 'pendiente' || cobro.estado === 'pagado_parcial'
  const origenCfg = cobro.origen ? ORIGEN_CONFIG[cobro.origen] : null

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => { if (!v) onClose() }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 flex-wrap">
              Ingreso
              <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ring-1', cfg.className)}>
                <Icon className="h-3 w-3" />
                {cfg.label}
              </span>
              {origenCfg && (
                <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ring-1', origenCfg.className)}>
                  <origenCfg.icon className="h-3 w-3" />
                  {origenCfg.label}
                </span>
              )}
            </SheetTitle>
          </SheetHeader>

          <div className="mt-5 space-y-5">
            <div className="rounded-lg bg-muted/40 p-3 text-sm space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Paciente</span>
                <span className="font-medium">{cobro.paciente_nombre ?? '—'}</span>
              </div>
              {cobro.cotizacion_numero && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cotización</span>
                  <span className="font-medium">#{cobro.cotizacion_numero}</span>
                </div>
              )}
              {cobro.profesional_nombre && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Profesional</span>
                  <span>{cobro.profesional_nombre}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fecha</span>
                <span>{fmtDateTime(cobro.fecha)}</span>
              </div>
              <Separator className="my-1" />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{COP.format(Number(cobro.subtotal))}</span>
              </div>
              {Number(cobro.descuento) > 0 && (
                <div className="flex justify-between text-green-700">
                  <span>Descuento</span>
                  <span>-{COP.format(Number(cobro.descuento))}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base pt-0.5">
                <span>Total</span>
                <span>{COP.format(Number(cobro.total))}</span>
              </div>
              {cobro.estado !== 'pagado' && cobro.estado !== 'anulado' && (
                <div className="flex justify-between text-primary font-semibold">
                  <span>Saldo pendiente</span>
                  <span>{COP.format(Number(cobro.saldo_pendiente))}</span>
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Ítems</p>
              <div className="space-y-1.5">
                {cobro.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 text-sm">
                    <div>
                      <p className="font-medium text-foreground">{item.descripcion}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.cantidad} × {COP.format(Number(item.precio_unitario))}
                      </p>
                    </div>
                    <p className="font-semibold">{COP.format(Number(item.subtotal))}</p>
                  </div>
                ))}
                {cobro.items.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-3">Sin ítems</p>
                )}
              </div>
            </div>

            {cobro.pagos.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Pagos recibidos</p>
                <div className="space-y-1.5">
                  {cobro.pagos.map((pago) => (
                    <div key={pago.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-green-50 text-sm">
                      <div>
                        <p className="font-medium text-foreground">{MEDIO_PAGO_LABEL[pago.medio_pago]}</p>
                        <p className="text-xs text-muted-foreground">{fmtDateTime(pago.fecha)}{pago.referencia && ` · ${pago.referencia}`}</p>
                      </div>
                      <p className="font-semibold text-green-700">{COP.format(Number(pago.valor))}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {puedePagar && (
              <Button className="w-full" onClick={() => setPagoOpen(true)}>
                <Banknote className="h-4 w-4 mr-2" />
                Registrar pago
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <RegistrarPagoSheet cobro={cobro} open={pagoOpen} onClose={() => setPagoOpen(false)} />
    </>
  )
}

// ─── Row ──────────────────────────────────────────────────────

function IngresoRow({ cobro, onClick }: { cobro: Cobro; onClick: () => void }) {
  const cfg = ESTADO_CONFIG[cobro.estado]
  const Icon = cfg.icon
  const origenCfg = cobro.origen ? ORIGEN_CONFIG[cobro.origen] : null

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-4 px-5 py-3.5 border-b border-gray-100 last:border-0 hover:bg-gray-50/50 transition-colors cursor-pointer"
    >
      <div className={cn(
        'flex items-center justify-center h-9 w-9 rounded-lg shrink-0',
        origenCfg ? origenCfg.className.replace('ring-', 'ring-1 ring-').split(' ')[0] + ' bg-opacity-20' : 'bg-indigo-50'
      )}>
        {origenCfg
          ? <origenCfg.icon className={cn('h-4 w-4', origenCfg.className.split(' ')[1])} />
          : <Receipt className="h-4 w-4 text-indigo-600" />
        }
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-foreground truncate">{cobro.paciente_nombre ?? '—'}</p>
          {cobro.cotizacion_numero && (
            <span className="text-xs text-muted-foreground shrink-0">#{cobro.cotizacion_numero}</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{fmtDateTime(cobro.fecha)}</p>
      </div>

      <div className="hidden sm:block w-32 shrink-0 text-right">
        <p className="text-sm font-bold text-foreground">{COP.format(Number(cobro.total))}</p>
        {cobro.estado !== 'pagado' && cobro.estado !== 'anulado' && (
          <p className="text-xs text-primary">Saldo: {COP.format(Number(cobro.saldo_pendiente))}</p>
        )}
      </div>

      <span className={cn('inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ring-1 shrink-0', cfg.className)}>
        <Icon className="h-3 w-3" />
        {cfg.label}
      </span>
    </div>
  )
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 px-5 py-3.5 border-b border-gray-100 animate-pulse">
      <div className="h-9 w-9 rounded-lg bg-gray-100 shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 w-40 rounded bg-gray-100" />
        <div className="h-3 w-28 rounded bg-gray-100" />
      </div>
      <div className="hidden sm:block h-8 w-24 rounded bg-gray-100" />
      <div className="h-6 w-24 rounded bg-gray-100" />
    </div>
  )
}

function Pagination({ page, total, pageSize, onPage }: {
  page: number; total: number; pageSize: number; onPage: (p: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between px-1 mt-5">
      <p className="text-sm text-muted-foreground">
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total}
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

// ─── Date helpers ─────────────────────────────────────────────

function fmt(d: Date) { return d.toISOString().slice(0, 10) }

const DATE_SHORTCUTS: { label: string; desde: () => string; hasta: () => string }[] = [
  {
    label: 'Hoy',
    desde: () => fmt(new Date()),
    hasta: () => fmt(new Date()),
  },
  {
    label: 'Ayer',
    desde: () => { const d = new Date(); d.setDate(d.getDate() - 1); return fmt(d) },
    hasta: () => { const d = new Date(); d.setDate(d.getDate() - 1); return fmt(d) },
  },
  {
    label: 'Esta semana',
    desde: () => { const d = new Date(); d.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1)); return fmt(d) },
    hasta: () => fmt(new Date()),
  },
  {
    label: 'Este mes',
    desde: () => { const d = new Date(); return fmt(new Date(d.getFullYear(), d.getMonth(), 1)) },
    hasta: () => fmt(new Date()),
  },
]

// ─── Origin tabs ──────────────────────────────────────────────

const ORIGEN_TABS: { value: string; label: string }[] = [
  { value: 'todos',      label: 'Todos'      },
  { value: 'cita',       label: 'Citas'      },
  { value: 'cotizacion', label: 'Cotizaciones'},
  { value: 'libre',      label: 'Libre'      },
]

// ─── Main ─────────────────────────────────────────────────────

export default function IngresosPage() {
  return <RoleGuard check={canAccess.cobros}><IngresosContent /></RoleGuard>
}

function IngresosContent() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [filtroOrigen, setFiltroOrigen] = useState('todos')
  const [ingresoDetalle, setIngresoDetalle] = useState<Cobro | null>(null)
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [shortcutActivo, setShortcutActivo] = useState<string | null>(null)
  const debouncedSearch = useDebounce(search, 400)

  function aplicarShortcut(s: typeof DATE_SHORTCUTS[number]) {
    const desde = s.desde()
    const hasta = s.hasta()
    setFechaDesde(desde)
    setFechaHasta(hasta)
    setShortcutActivo(s.label)
    setPage(1)
  }

  function limpiarFechas() {
    setFechaDesde('')
    setFechaHasta('')
    setShortcutActivo(null)
    setPage(1)
  }

  const params = {
    estado:       filtroEstado !== 'todos' ? filtroEstado : undefined,
    origen:       filtroOrigen !== 'todos' ? filtroOrigen : undefined,
    search:       debouncedSearch || undefined,
    fecha_desde:  fechaDesde || undefined,
    fecha_hasta:  fechaHasta || undefined,
    page,
    page_size: 25,
  }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['ingresos', params],
    queryFn: () => cobrosApi.list(params),
  })

  const { data: resumen } = useQuery({
    queryKey: ['ingresos-resumen', {
      origen:      filtroOrigen !== 'todos' ? filtroOrigen : undefined,
      fecha_desde: fechaDesde || undefined,
      fecha_hasta: fechaHasta || undefined,
    }],
    queryFn: () => cobrosApi.resumen({
      origen:      filtroOrigen !== 'todos' ? filtroOrigen : undefined,
      fecha_desde: fechaDesde || undefined,
      fecha_hasta: fechaHasta || undefined,
    }),
  })

  const total = data?.count ?? 0

  const totalRecaudado = resumen ? Number(resumen.total_recaudado) : null
  const totalPendiente = resumen ? Number(resumen.total_pendiente) : null

  return (
    <div className="space-y-5">

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground">Ingresos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isLoading ? 'Cargando…' : `${total} registro${total !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 flex items-center gap-3">
          <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-white shadow-sm shrink-0">
            <Receipt className="h-4 w-4 text-foreground" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Registros</p>
            <p className="text-base font-bold text-foreground">{total}</p>
          </div>
        </div>
        <div className="rounded-xl border border-gray-100 bg-emerald-50 px-4 py-3 flex items-center gap-3">
          <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-white shadow-sm shrink-0">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Recaudado</p>
            <p className="text-sm font-bold text-emerald-700">
              {totalRecaudado !== null ? COP.format(totalRecaudado) : '—'}
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-gray-100 bg-amber-50 px-4 py-3 flex items-center gap-3">
          <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-white shadow-sm shrink-0">
            <CreditCard className="h-4 w-4 text-amber-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Por cobrar</p>
            <p className="text-sm font-bold text-amber-600">
              {totalPendiente !== null ? COP.format(totalPendiente) : '—'}
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-gray-100 bg-green-50 px-4 py-3 flex items-center gap-3">
          <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-white shadow-sm shrink-0">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Pagados</p>
            <p className="text-base font-bold text-green-700">{resumen?.total_pagados ?? '—'}</p>
          </div>
        </div>
      </div>

      {/* Origin tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {ORIGEN_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => { setFiltroOrigen(tab.value); setPage(1) }}
            className={cn(
              'px-3 py-1.5 rounded-md text-sm font-medium transition-all',
              filtroOrigen === tab.value
                ? 'bg-white text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Date filters */}
      <div className="flex flex-wrap items-center gap-2">
        <CalendarRange className="h-4 w-4 text-muted-foreground shrink-0" />
        {DATE_SHORTCUTS.map((s) => (
          <button
            key={s.label}
            onClick={() => aplicarShortcut(s)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
              shortcutActivo === s.label
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground'
            )}
          >
            {s.label}
          </button>
        ))}
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => { setFechaDesde(e.target.value); setShortcutActivo(null); setPage(1) }}
            className="h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <span className="text-xs text-muted-foreground">—</span>
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => { setFechaHasta(e.target.value); setShortcutActivo(null); setPage(1) }}
            className="h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {(fechaDesde || fechaHasta) && (
            <button onClick={limpiarFechas} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar paciente…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-9 bg-white"
          />
        </div>
        <Select value={filtroEstado} onValueChange={(v) => { setFiltroEstado(v); setPage(1) }}>
          <SelectTrigger className="w-44 bg-white"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los estados</SelectItem>
            <SelectItem value="pendiente">Pendiente</SelectItem>
            <SelectItem value="pagado_parcial">Pago parcial</SelectItem>
            <SelectItem value="pagado">Pagado</SelectItem>
            <SelectItem value="anulado">Anulado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-4 px-5 py-2.5 bg-gray-50/80 border-b border-gray-100">
          <div className="w-9 shrink-0" />
          <div className="flex-1"><span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Paciente / Fecha</span></div>
          <div className="hidden sm:block w-32 shrink-0 text-right"><span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Total</span></div>
          <div className="w-28 shrink-0"><span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Estado</span></div>
        </div>

        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm font-semibold">Error al cargar ingresos</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()}>Reintentar</Button>
          </div>
        ) : total === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Receipt className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-semibold">Sin ingresos</p>
            <p className="text-sm text-muted-foreground mt-1">Los ingresos se generan al registrar cobros en citas o cotizaciones</p>
          </div>
        ) : (
          data?.results.map((c) => (
            <IngresoRow key={c.id} cobro={c} onClick={() => setIngresoDetalle(c)} />
          ))
        )}
      </div>

      <Pagination page={page} total={total} pageSize={25} onPage={setPage} />

      <IngresoDetalleSheet
        cobro={ingresoDetalle}
        open={!!ingresoDetalle}
        onClose={() => setIngresoDetalle(null)}
      />
    </div>
  )
}
