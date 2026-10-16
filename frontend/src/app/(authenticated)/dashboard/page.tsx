'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CalendarDays, Users, CheckCircle2,
  ArrowRight, DollarSign,
  FileText, UserX, ChevronRight, AlertTriangle, Wallet, BellOff, Check,
  ChevronDown, Search, ShoppingBag, CalendarX,
} from 'lucide-react'
import Link from 'next/link'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { reportesApi } from '@/lib/api/reportes'
import { carteraApi } from '@/lib/api/cartera'
import { agendaApi } from '@/lib/api/agenda'
import { notificacionesFallidasApi, veEnviosFallidos } from '@/lib/api/notificaciones'
import { useUserSedes } from '@/hooks/useUserSedes'
import { useAuthStore } from '@/store/authStore'
import { ParaHoyResumen } from '@/components/seguimiento/ParaHoyResumen'
import { AvisoDatosProfesionales } from '@/components/shared/AvisoDatosProfesionales'
import { CitasHoyCard } from '@/components/dashboard/CitasHoyCard'
import { IngresosAcumuladosCard } from '@/components/dashboard/IngresosAcumuladosCard'
import { AutorizacionesPendientesBanner } from '@/components/cotizaciones/AutorizacionesPrecioAcceso'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { SetupChecklist, useSetupChecklist } from '@/components/shared/SetupChecklist'
import { PuestaEnMarchaBanner } from '@/components/shared/PuestaEnMarchaBanner'
import { canAccess, hasPermission, isAdminOrSuperAdmin, PERM, veDashboard } from '@/lib/permissions'
import { cn, scrollWheelFallback, todayISO, toTitleCase } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import { toast } from '@/hooks/use-toast'
import type { ComercialMetrics, PacienteSinReagendar, Vendedor } from '@/types/reportes'
import type { ResumenCartera } from '@/types/cartera'
import type { AuthUser } from '@/types/auth'

const STALE = 5 * 60 * 1000

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 0,
})

// Servicio se lleva el espacio sobrante; citas cabe en 3 dígitos y el % en "100.0%".
const COLS_SERVICIOS = 'grid grid-cols-[minmax(0,1fr)_2rem_6rem_3.5rem] gap-x-3 px-5'

function abrevCOP(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}k`
  return COP.format(value)
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 18) return 'Buenas tardes'
  return 'Buenas noches'
}

function todayLong() {
  return new Date().toLocaleDateString('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

type PeriodoKey = 'hoy' | 'mes' | '3m' | '6m' | '1a'

const PERIODOS: { key: PeriodoKey; label: string }[] = [
  { key: 'hoy', label: 'Hoy' },
  { key: 'mes', label: 'Este mes' },
  { key: '3m', label: 'Últimos 3 meses' },
  { key: '6m', label: 'Últimos 6 meses' },
  { key: '1a', label: 'Último año' },
]

const PERIODO_SUFIJO: Record<PeriodoKey, string> = {
  hoy: 'de hoy',
  mes: 'del mes',
  '3m': '· últimos 3 meses',
  '6m': '· últimos 6 meses',
  '1a': '· último año',
}

/** Rango [ini, fin] en ISO YYYY-MM-DD para el periodo elegido; `fin` = hoy. */
function rangoPeriodo(key: PeriodoKey): { ini: string; fin: string } {
  const hoy = new Date()
  const fin = hoy.toLocaleDateString('en-CA')
  let ini: Date
  switch (key) {
    case 'hoy': ini = hoy; break
    case 'mes': ini = new Date(hoy.getFullYear(), hoy.getMonth(), 1); break
    case '3m': ini = new Date(hoy.getFullYear(), hoy.getMonth() - 3, hoy.getDate()); break
    case '6m': ini = new Date(hoy.getFullYear(), hoy.getMonth() - 6, hoy.getDate()); break
    case '1a': ini = new Date(hoy.getFullYear() - 1, hoy.getMonth(), hoy.getDate()); break
  }
  return { ini: ini.toLocaleDateString('en-CA'), fin }
}

function KPICard({
  label, value, sub, icon: Icon, iconBg, iconColor, loading, alert, onClick, ayuda,
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ElementType
  iconBg: string
  iconColor: string
  loading?: boolean
  alert?: boolean
  /** Si viene, la tarjeta es un botón (p. ej. abre la lista detallada). */
  onClick?: () => void
  /** Detalle completo del número (tooltip), para no cargar el subtítulo. */
  ayuda?: string
}) {
  const Contenedor = onClick ? 'button' : 'div'
  return (
    <Contenedor
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={ayuda}
      className={cn(
        'bg-white rounded-xl border p-4 flex flex-col items-center justify-center gap-2 text-center transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
        alert ? 'border-amber-200' : 'border-gray-100',
        onClick && 'cursor-pointer',
      )}
    >
      <div className={cn('rounded-xl p-2.5 shrink-0', iconBg)}>
        <Icon className={cn('h-5 w-5', iconColor)} />
      </div>
      <div className="min-w-0 w-full">
        {loading ? (
          <>
            <Skeleton className="h-7 w-16 mb-1 mx-auto" />
            <Skeleton className="h-3 w-24 mx-auto" />
          </>
        ) : (
          <>
            <p className={cn('text-2xl font-bold truncate', alert && Number(value) > 0 ? 'text-amber-700' : 'text-foreground')}>
              {value}
            </p>
            <p className="text-xs text-muted-foreground">{label}</p>
            {sub && <p className="text-xs text-muted-foreground/70 mt-0.5">{sub}</p>}
          </>
        )}
      </div>
    </Contenedor>
  )
}

// ─── Comercial: KPI compactos + cotizado vs vendido ─────────────────────────

function MetricaComercial({
  label, value, sub, destacado, loading, ayuda,
}: {
  label: string
  value: string
  sub?: string
  destacado?: boolean
  loading?: boolean
  /** De dónde sale el número, en una frase (tooltip). */
  ayuda?: string
}) {
  return (
    <div className="px-4 py-3 cursor-help" title={ayuda}>
      <p className="text-xs text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className="h-6 w-20 mt-1 mx-auto" />
      ) : (
        <>
          <p className={cn('text-xl font-semibold tabular-nums text-center mt-0.5', destacado ? 'text-primary' : 'text-foreground')}>
            {value}
          </p>
          {sub && <p className="text-xs text-muted-foreground text-center mt-0.5">{sub}</p>}
        </>
      )}
    </div>
  )
}

// Cotizado es el contexto (gris) y vendido el dato que importa (color de la clínica).
const COLOR_COTIZADO = '#9ca3af'
const COLOR_VENDIDO = 'hsl(var(--primary))'

function fmtPeriodoComercial(periodo: string, granularidad: ComercialMetrics['granularidad']): string {
  const fecha = new Date(periodo + 'T00:00:00')
  if (granularidad === 'mes') return fecha.toLocaleDateString('es-CO', { month: 'short', year: '2-digit' })
  return fecha.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}

function TooltipComercial({ active, payload }: { active?: boolean; payload?: { payload: Record<string, number | string> }[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="font-medium text-foreground mb-1">{d.etiqueta}</p>
      <p className="flex items-center gap-1.5 text-muted-foreground">
        <span className="h-2 w-2 rounded-sm" style={{ background: COLOR_COTIZADO }} />
        Cotizado <span className="ml-auto pl-3 tabular-nums text-foreground">{COP.format(Number(d.cotizado))}</span>
        <span className="tabular-nums">({d.cotizadas})</span>
      </p>
      <p className="flex items-center gap-1.5 text-muted-foreground">
        <span className="h-2 w-2 rounded-sm" style={{ background: COLOR_VENDIDO }} />
        Vendido <span className="ml-auto pl-3 tabular-nums text-foreground">{COP.format(Number(d.vendido))}</span>
        <span className="tabular-nums">({d.vendidas})</span>
      </p>
    </div>
  )
}

function GraficaComercial({ data, loading }: { data?: ComercialMetrics; loading: boolean }) {
  if (loading || !data) return <Skeleton className="h-44 w-full rounded-lg" />

  const chartData = data.serie.map((p) => ({
    etiqueta: fmtPeriodoComercial(p.periodo, data.granularidad),
    cotizado: Number(p.cotizado_valor),
    vendido: Number(p.vendido_valor),
    cotizadas: p.cotizadas,
    vendidas: p.vendidas,
  }))
  const sinDatos = chartData.every((p) => p.cotizado === 0 && p.vendido === 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-muted-foreground">
          Cotizado vs vendido por {data.granularidad === 'dia' ? 'día' : data.granularidad}
        </p>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: COLOR_COTIZADO }} />Cotizado</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: COLOR_VENDIDO }} />Vendido</span>
        </div>
      </div>
      {sinDatos ? (
        <div className="h-40 grid place-items-center text-xs text-muted-foreground">Sin cotizaciones ni ventas en el periodo</div>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={chartData} margin={{ top: 4, right: 0, left: -12, bottom: 0 }} barGap={2} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke="#f0f0f0" />
            <XAxis dataKey="etiqueta" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} tickFormatter={(v: number) => abrevCOP(v)} width={52} />
            <Tooltip content={<TooltipComercial />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
            <Bar dataKey="cotizado" name="Cotizado" fill={COLOR_COTIZADO} radius={[4, 4, 0, 0]} maxBarSize={24} />
            <Bar dataKey="vendido" name="Vendido" fill={COLOR_VENDIDO} radius={[4, 4, 0, 0]} maxBarSize={24} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

// ─── Cartera: recaudo, antigüedad de la mora y lo que vence pronto ──────────

// Antigüedad de la mora: rampa secuencial de un solo tono (más oscuro = más viejo).
const TRAMOS_MORA: { tramo: string; label: string; color: string }[] = [
  { tramo: '1_30',   label: '1–30 días',  color: '#fca5a5' },
  { tramo: '31_60',  label: '31–60',      color: '#f87171' },
  { tramo: '61_90',  label: '61–90',      color: '#dc2626' },
  { tramo: '90_mas', label: '+90',        color: '#991b1b' },
]

function CarteraDetalle({ resumen, loading }: { resumen?: ResumenCartera; loading: boolean }) {
  if (loading || !resumen) {
    return (
      <div className="px-5 py-4 space-y-4 border-t">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }

  const pct = Math.min(100, Math.max(0, Number(resumen.cobrado_pct)))
  const vencido = Number(resumen.cuotas_vencidas_valor)
  const tramos = TRAMOS_MORA.map((t) => {
    const dato = resumen.mora_por_antiguedad.find((m) => m.tramo === t.tramo)
    return { ...t, valor: Number(dato?.valor ?? 0), cuotas: dato?.cuotas ?? 0 }
  })

  return (
    <div className="px-5 py-4 space-y-4 border-t">
      {/* Recaudo */}
      <div title="Lo abonado sobre el total vendido a crédito (todas las carteras activas).">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-muted-foreground">Recaudado</span>
          <span className="tabular-nums">
            <span className="font-semibold text-foreground">{pct.toFixed(0)}%</span>
            <span className="text-muted-foreground"> de {abrevCOP(Number(resumen.total_cartera))}</span>
          </span>
        </div>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-primary/10">
          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Antigüedad de la mora */}
      <div>
        <p className="text-xs text-muted-foreground">Mora por antigüedad</p>
        {vencido > 0 ? (
          <>
            <div className="mt-1.5 flex h-2 w-full gap-0.5 overflow-hidden rounded-full">
              {tramos.filter((t) => t.valor > 0).map((t) => (
                <div
                  key={t.tramo}
                  className="h-full first:rounded-l-full last:rounded-r-full"
                  style={{ width: `${(t.valor / vencido) * 100}%`, background: t.color }}
                  title={`${t.label}: ${COP.format(t.valor)} · ${t.cuotas} cuota${t.cuotas !== 1 ? 's' : ''}`}
                />
              ))}
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {tramos.map((t) => (
                <div key={t.tramo} className="min-w-0">
                  <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: t.color }} />
                    {t.label}
                  </p>
                  <p className="text-xs font-medium tabular-nums text-foreground truncate">
                    {t.valor > 0 ? abrevCOP(t.valor) : '—'}
                  </p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-green-700">
            <Check className="h-3.5 w-3.5" />
            Sin cuotas vencidas
          </p>
        )}
      </div>

      {/* Próximos vencimientos */}
      <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-xs">
        <span className="text-muted-foreground">Vence en los próximos 30 días</span>
        <span className="tabular-nums">
          <span className="font-semibold text-foreground">{abrevCOP(Number(resumen.por_vencer_30.valor))}</span>
          <span className="text-muted-foreground">
            {' '}· {resumen.por_vencer_30.cuotas} cuota{resumen.por_vencer_30.cuotas !== 1 ? 's' : ''}
          </span>
        </span>
      </div>
    </div>
  )
}

// Filtro de vendedores de la tarjeta de Ventas. Sin selección = todos.
function FiltroVendedores({ opciones, selected, onChange }: {
  opciones: Vendedor[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const filtradas = q ? opciones.filter((v) => v.nombre.toLowerCase().includes(q)) : opciones
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  const etiqueta = selected.length === 0
    ? 'Todos los vendedores'
    : selected.length === 1
      ? toTitleCase(opciones.find((v) => v.id === selected[0])?.nombre ?? '1 vendedor')
      : `${selected.length} vendedores`

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQuery('') }}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-7 max-w-[180px] gap-1 px-2 text-xs font-normal">
          <span className={cn('truncate', selected.length === 0 && 'text-muted-foreground')}>{etiqueta}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0 overflow-hidden">
        <div className="relative border-b p-2">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar vendedor..."
            className="h-8 pl-7 text-sm"
          />
        </div>
        <div className="max-h-56 overflow-y-auto py-1" onWheel={scrollWheelFallback}>
          {!q && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent transition-colors"
            >
              <Check className={cn('h-3.5 w-3.5 shrink-0', selected.length === 0 ? 'opacity-100' : 'opacity-0')} />
              <span className="font-medium">Todos</span>
            </button>
          )}
          {opciones.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground">No hay usuarios que elaboren cotizaciones.</p>
          ) : filtradas.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground text-center">Sin resultados</p>
          ) : filtradas.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => toggle(v.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent transition-colors"
            >
              <Check className={cn('h-3.5 w-3.5 shrink-0', selected.includes(v.id) ? 'opacity-100' : 'opacity-0')} />
              <span className="truncate">{toTitleCase(v.nombre)}</span>
              {!v.activo && <span className="ml-auto shrink-0 text-xs text-muted-foreground">inactivo</span>}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function MetricaCotizacion({
  label, value, sub, color, loading, ayuda,
}: {
  label: string
  value: string | number
  sub?: string
  color: string
  loading?: boolean
  /** De dónde sale el número, en una frase (tooltip). */
  ayuda?: string
}) {
  return (
    <div className={cn('flex-1 text-center px-4 py-3', ayuda && 'cursor-help')} title={ayuda}>
      {loading ? (
        <>
          <Skeleton className="h-8 w-12 mx-auto mb-1" />
          <Skeleton className="h-3 w-20 mx-auto" />
        </>
      ) : (
        <>
          <p className={cn('text-3xl font-bold', color)}>{value}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
          {sub && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{sub}</p>}
        </>
      )}
    </div>
  )
}

function SheetPacientesSinReagendar({
  open, onClose, pacientes,
}: {
  open: boolean
  onClose: () => void
  pacientes: PacienteSinReagendar[]
}) {
  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2">
            <UserX className="h-5 w-5 text-amber-500" />
            Pacientes sin reagendar
          </SheetTitle>
          <p className="text-sm text-muted-foreground">
            {pacientes.length} paciente{pacientes.length !== 1 ? 's' : ''} con sesiones pendientes hace más de un mes
          </p>
        </SheetHeader>

        <div className="space-y-2">
          {pacientes.map(p => (
            <Link
              key={`${p.paciente_id}-${p.cotizacion_id}-${p.tratamiento}`}
              href={`/cotizaciones/${p.cotizacion_id}`}
              onClick={onClose}
              className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors group"
            >
              <div className="h-8 w-8 rounded-full bg-amber-50 flex items-center justify-center shrink-0 mt-0.5">
                <UserX className="h-4 w-4 text-amber-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{p.paciente_nombre}</p>
                <p className="text-xs text-muted-foreground truncate">{p.tratamiento}</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-[11px] text-amber-600 font-medium">
                    {p.dias_sin_agendar} días sin agendar
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {p.sesiones_pendientes} sesión{p.sesiones_pendientes !== 1 ? 'es' : ''} pendiente{p.sesiones_pendientes !== 1 ? 's' : ''}
                  </span>
                </div>
                {p.ultima_cita && (
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                    Última cita: {new Date(p.ultima_cita).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                )}
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-2 opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function SheetNotificacionesFallidas({
  open, onClose, notificaciones,
}: {
  open: boolean
  onClose: () => void
  notificaciones: import('@/lib/api/notificaciones').NotificacionFallida[]
}) {
  const queryClient = useQueryClient()
  const { mutate: resolver, isPending, variables: idResolviendo } = useMutation({
    mutationFn: (id: string) => notificacionesFallidasApi.resolver(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificaciones', 'fallidas'] })
      toast.success('Marcada como resuelta')
    },
    onError: () => {
      toast.error('No se pudo actualizar', 'Intenta de nuevo.')
    },
  })

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2">
            <BellOff className="h-5 w-5 text-red-500" />
            Envíos de WhatsApp fallidos
          </SheetTitle>
          <p className="text-sm text-muted-foreground">
            {notificaciones.length} notificaci{notificaciones.length !== 1 ? 'ones' : 'ón'} que no se pudo{notificaciones.length !== 1 ? 'ieron' : ''} enviar
          </p>
        </SheetHeader>

        <div className="space-y-2">
          {notificaciones.map(n => (
            <div
              key={n.id}
              className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50/50"
            >
              <div className="h-8 w-8 rounded-full bg-red-50 flex items-center justify-center shrink-0 mt-0.5">
                <AlertTriangle className="h-4 w-4 text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {n.paciente_nombre || n.telefono || 'Paciente sin identificar'}
                </p>
                <p className="text-xs text-muted-foreground">{n.tipo_notificacion_display}</p>
                {n.motivo && (
                  <p className="text-[11px] text-red-600/80 mt-1 line-clamp-2">{n.motivo}</p>
                )}
                <p className="text-[11px] text-muted-foreground/70 mt-1">
                  {new Date(n.created_at).toLocaleString('es-CO', {
                    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
                  })}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                disabled={isPending && idResolviendo === n.id}
                onClick={() => resolver(n.id)}
              >
                <Check className="h-3.5 w-3.5 mr-1" />
                Resuelta
              </Button>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}

/** "Mis citas de hoy": quien atiende pacientes y no agenda. Quien puede agendar
 *  (recepción, aunque también atienda) ve las citas de toda la sede. */
function veSoloSusCitas(user: AuthUser | null | undefined) {
  return user?.es_profesional === true && !isAdminOrSuperAdmin(user) && !hasPermission(user, PERM.AGENDA_CREAR)
}

export default function DashboardPage() {
  const { user } = useAuthStore()
  return (
    <RoleGuard check={canAccess.dashboard}>
      {veSoloSusCitas(user)
        ? <DashboardProfesional />
        : veDashboard(user) ? <DashboardContent /> : <DashboardSinReportes />}
    </RoleGuard>
  )
}

/** Quien atiende pacientes y no agenda ve su propio día: sus citas, no las de
 *  toda la sede. Antes esta vista exigía no tener reportes y nunca se veía. */
function DashboardProfesional() {
  const { user } = useAuthStore()
  const { data: citasHoyData, isLoading: citasLoading } = useQuery({
    queryKey: ['citas', 'hoy', 'mias', user?.id],
    queryFn: () => agendaApi.citas.list({ fecha_inicio__date: todayISO(), profesional: user!.id, page_size: 100 }),
    enabled: !!user?.id,
    staleTime: STALE,
    refetchInterval: STALE,
  })
  const citasHoy = citasHoyData?.results
  const enCurso = citasHoy?.filter(c => c.estado === 'en_curso') ?? []
  const totalCitas = citasHoy?.length ?? 0
  const completadas = citasHoy?.filter(c => c.estado === 'completada').length ?? 0

    return (
      <div className="w-[90%] mx-auto space-y-6">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary/70 p-6 text-white shadow-md">
          <div className="relative z-10">
            <p className="text-white/70 text-sm mb-0.5 capitalize">{todayLong()}</p>
            <h1 className="text-2xl font-bold">{greeting()}, {user?.first_name}</h1>
            <p className="text-white/80 text-sm mt-1">
              {enCurso.length > 0
                ? <><span className="font-semibold text-white">{enCurso.length}</span> cita{enCurso.length !== 1 ? 's' : ''} en curso ahora mismo</>
                : totalCitas === 0
                  ? 'No hay citas agendadas para hoy'
                  : <><span className="font-semibold text-white">{totalCitas}</span> cita{totalCitas !== 1 ? 's' : ''} agendada{totalCitas !== 1 ? 's' : ''} para hoy</>
              }
            </p>
          </div>
          <div className="absolute -right-8 -top-8 h-36 w-36 rounded-full bg-white/10" />
          <div className="absolute -right-2 -bottom-10 h-24 w-24 rounded-full bg-white/10" />
          <div className="absolute right-24 -bottom-6 h-16 w-16 rounded-full bg-white/10" />
        </div>

        <AvisoDatosProfesionales />
        <AutorizacionesPendientesBanner />

        {/* KPIs simples */}
        <div className="grid grid-cols-2 gap-4">
          <KPICard
            label="Citas hoy"
            value={totalCitas}
            icon={CalendarDays}
            iconBg="bg-blue-50"
            iconColor="text-blue-500"
            loading={citasLoading}
          />
          <KPICard
            label="Completadas"
            value={completadas}
            sub={totalCitas > 0 ? `${Math.round((completadas / totalCitas) * 100)}% del día` : undefined}
            icon={CheckCircle2}
            iconBg="bg-green-50"
            iconColor="text-green-500"
            loading={citasLoading}
          />
        </div>

        {/* Citas + accesos */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <CitasHoyCard
              citas={citasHoy}
              loading={citasLoading}
              titulo="Mis citas de hoy"
              accionVacia={canAccess.agenda(user) ? { href: '/agenda', label: 'Ver agenda' } : undefined}
            />
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-xl border shadow-sm p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <h2 className="font-semibold text-sm mb-3">Accesos rápidos</h2>
              <div className="space-y-2">
                {[
                  { href: '/atenciones', icon: CheckCircle2, label: 'Atenciones', desc: 'Cola de atenciones', visible: canAccess.atenciones(user) },
                  { href: '/agenda', icon: CalendarDays, label: 'Agenda', desc: 'Ver mi agenda del día', visible: canAccess.agenda(user) },
                  { href: '/pacientes', icon: Users, label: 'Pacientes', desc: 'Buscar pacientes', visible: canAccess.pacientes(user) },
                ].filter((a) => a.visible).map(({ href, icon: Icon, label, desc }) => (
                  <Link
                    key={href}
                    href={href}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 border border-transparent hover:border-border transition-all group"
                  >
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
}

/** Sin permiso de reportes: accesos a lo que sí puede usar, en vez de
 *  indicadores en cero que parecen datos reales. */
function DashboardSinReportes() {
  const { user } = useAuthStore()
  const accesos = [
    { href: '/agenda', label: 'Agenda', detalle: 'Citas del día y por agendar', visible: canAccess.agenda(user) },
    { href: '/atenciones', label: 'Atenciones', detalle: 'Pacientes que atiendes hoy', visible: canAccess.atenciones(user) },
    { href: '/pacientes', label: 'Pacientes', detalle: 'Buscar y abrir fichas', visible: canAccess.pacientes(user) },
    { href: '/seguimiento', label: 'Seguimiento', detalle: 'A quién llamar hoy', visible: hasPermission(user, PERM.SEGUIMIENTO_VER) },
    { href: '/cotizaciones', label: 'Cotizaciones', detalle: 'Propuestas a pacientes', visible: hasPermission(user, PERM.COTIZACIONES_VER) },
    { href: '/ingresos', label: 'Ingresos', detalle: 'Cobros y pagos recibidos', visible: canAccess.cobros(user) },
    { href: '/cartera', label: 'Cartera', detalle: 'Cuotas y saldos por cobrar', visible: hasPermission(user, PERM.CARTERA_VER) },
  ].filter((a) => a.visible)
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{greeting()}, {user?.first_name}</h1>
        <p className="text-sm text-muted-foreground capitalize">{todayLong()}</p>
      </div>
      <AutorizacionesPendientesBanner />
      {accesos.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {accesos.map((a) => (
            <Link key={a.href} href={a.href} className="rounded-xl border bg-white p-4 transition-colors hover:bg-muted/40">
              <p className="font-medium">{a.label}</p>
              <p className="text-sm text-muted-foreground">{a.detalle}</p>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Usa el menú para ir a las secciones de tu rol.</p>
      )}
    </div>
  )
}

function DashboardContent() {
  const { user } = useAuthStore()
  const [tabOcupacion, setTabOcupacion] = useState<'mes' | 'hoy'>('mes')
  const [sheetPacientes, setSheetPacientes] = useState(false)
  const [sheetNotificacionesFallidas, setSheetNotificacionesFallidas] = useState(false)
  const [sedeId, setSedeId] = useState<string | null>(null)
  const [periodo, setPeriodo] = useState<PeriodoKey>('hoy')
  const [vendedores, setVendedores] = useState<string[]>([])
  // Filtro de periodo de las métricas. `hoy` conserva el comportamiento original
  // del dashboard (KPIs y cobros del día); el resto abarca un rango hasta hoy.
  const rango = rangoPeriodo(periodo)
  const periodoSufijo = PERIODO_SUFIJO[periodo]

  const { allDone: checklistDone } = useSetupChecklist()
  // KPIs financieros/comerciales de dueño: cartera agregada, P&L 30 días,
  // ingresos por servicio, conversión de cotizaciones, tasa de completado por
  // profesional. Recepción / profesional ven un dashboard operativo sin esto.
  // Debe coincidir con el gate del backend (DashboardView.get: "reportes.ver_financieros"),
  // que es el que decide si el payload trae `cobros_hoy`/`ingresos_semana`.
  const canVerFinanzas = hasPermission(user, PERM.REPORTES_VER_FINANCIEROS)
  // Las tarjetas que leen citas o cartera piden su propio permiso: sin él se
  // ocultan en vez de mostrar 0 (la consulta respondía 403 en silencio).
  const veAgenda = canAccess.agenda(user)
  const veCartera = canVerFinanzas && hasPermission(user, PERM.CARTERA_VER)
  const { sedes, isAllSedes, defaultSedeId } = useUserSedes()
  // `sedeId` = elección explícita del usuario. Sin elección, cae en la sede por
  // defecto de su scope: acotado a una sola sede -> esa sede; all-sedes -> null
  // (= todas). Así un usuario de una sede nunca recibe métricas de toda la clínica.
  const sede = (sedeId ?? defaultSedeId) ?? undefined

  // KPIs "de hoy": alimentan el hero, la tarjeta de citas y "Cobros de hoy por
  // medio" (que se mantienen anclados a hoy) y, cuando periodo === 'hoy', también
  // la fila de KPIs superior.
  const { data: kpis, isLoading: kpisLoading } = useQuery({
    queryKey: ['reportes', 'dashboard', sede],
    queryFn: () => reportesApi.getDashboard({ sede_id: sede }),
    staleTime: STALE,
    refetchInterval: STALE,
  })

  // KPIs del rango elegido: solo se pide cuando el periodo no es 'hoy'.
  const { data: kpisPeriodo, isLoading: kpisPeriodoLoading } = useQuery({
    queryKey: ['reportes', 'dashboard', 'periodo', periodo, sede],
    queryFn: () => reportesApi.getDashboard({ sede_id: sede, fecha_inicio: rango.ini, fecha_fin: rango.fin }),
    staleTime: STALE,
    refetchInterval: STALE,
    enabled: periodo !== 'hoy',
  })

  const kpisView = periodo === 'hoy' ? kpis : kpisPeriodo
  const kpisViewLoading = periodo === 'hoy' ? kpisLoading : kpisPeriodoLoading

  // Ingresos acumulados por origen. "Hoy" y "Este mes" muestran el mes en curso
  // y lo comparan con el mes pasado hasta el mismo día; los rangos largos, con
  // el mismo número de días justo antes. Sin gastos: los de caja no son la
  // contabilidad de la clínica y darían un resultado engañoso.
  const ingRango = (() => {
    if (periodo === 'hoy' || periodo === 'mes') {
      const hoy = new Date()
      const ini = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
      const finMesPasado = new Date(hoy.getFullYear(), hoy.getMonth(), 0)
      const iniMesPasado = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
      const mismoDia = new Date(hoy.getFullYear(), hoy.getMonth() - 1, Math.min(hoy.getDate(), finMesPasado.getDate()))
      return {
        ini: ini.toLocaleDateString('en-CA'),
        fin: todayISO(),
        comparar_inicio: iniMesPasado.toLocaleDateString('en-CA'),
        comparar_fin: mismoDia.toLocaleDateString('en-CA'),
        titulo: 'Ingresos del mes',
        comparadoCon: 'el mes pasado a esta fecha',
      }
    }
    const comparado: Record<PeriodoKey, string> = {
      hoy: '', mes: '', '3m': 'los 3 meses anteriores', '6m': 'los 6 meses anteriores', '1a': 'el año anterior',
    }
    return { ini: rango.ini, fin: rango.fin, titulo: `Ingresos ${periodoSufijo}`, comparadoCon: comparado[periodo] }
  })()

  const { data: ingresos, isLoading: ingresosLoading } = useQuery({
    queryKey: ['reportes', 'ingresos-por-origen', ingRango.ini, ingRango.fin, sede],
    queryFn: () => reportesApi.getIngresosPorOrigen({
      fecha_inicio: ingRango.ini,
      fecha_fin: ingRango.fin,
      ...('comparar_inicio' in ingRango ? { comparar_inicio: ingRango.comparar_inicio, comparar_fin: ingRango.comparar_fin } : {}),
      sede_id: sede,
    }),
    staleTime: STALE,
    refetchInterval: STALE,
    enabled: canVerFinanzas,
  })

  const { data: servicios, isLoading: serviciosLoading } = useQuery({
    queryKey: ['reportes', 'servicios', periodo, sede],
    queryFn: () => reportesApi.getServicios(
      periodo === 'hoy'
        ? { sede_id: sede }
        : { fecha_inicio: rango.ini, fecha_fin: rango.fin, sede_id: sede }
    ),
    staleTime: STALE,
    refetchInterval: STALE,
    enabled: canVerFinanzas,
  })

  const { data: ocupacionMes, isLoading: ocupacionMesLoading } = useQuery({
    queryKey: ['reportes', 'ocupacion', 'periodo', periodo, sede],
    queryFn: () => reportesApi.getOcupacion({ fecha_inicio: rango.ini, fecha_fin: rango.fin, sede_id: sede }),
    staleTime: STALE,
    refetchInterval: STALE,
  })

  const { data: ocupacionHoy, isLoading: ocupacionHoyLoading } = useQuery({
    queryKey: ['reportes', 'ocupacion', 'hoy', sede],
    queryFn: () => {
      const hoy = todayISO()
      return reportesApi.getOcupacion({ fecha_inicio: hoy, fecha_fin: hoy, sede_id: sede })
    },
    staleTime: STALE,
    refetchInterval: STALE,
    enabled: tabOcupacion === 'hoy',
  })

  const { data: citasHoyData, isLoading: citasLoading } = useQuery({
    queryKey: ['citas', 'hoy', sede],
    queryFn: () => {
      const hoy = todayISO()
      return agendaApi.citas.list({
        fecha_inicio__date: hoy,
        sede,
        page_size: 100,
      })
    },
    staleTime: STALE,
    refetchInterval: STALE,
    enabled: veAgenda,
  })
  const citasHoy = citasHoyData?.results

  const { data: comercial, isLoading: comercialLoading } = useQuery({
    queryKey: ['reportes', 'comercial', periodo, sede, vendedores],
    // Sigue el filtro de periodo del dashboard, incluido "Hoy".
    queryFn: () => reportesApi.getComercial({ fecha_inicio: rango.ini, fecha_fin: rango.fin, sede_id: sede, vendedores }),
    staleTime: STALE,
    refetchInterval: STALE,
    // El reporte exige reportes.ver_financieros; la tarjeta solo se muestra con ese permiso.
    enabled: canVerFinanzas,
  })

  const { data: vendedoresOpciones = [] } = useQuery({
    queryKey: ['reportes', 'vendedores'],
    queryFn: reportesApi.getVendedores,
    staleTime: STALE,
    enabled: canVerFinanzas,
  })

  const { data: resumenCartera, isLoading: carteraLoading } = useQuery({
    queryKey: ['cartera', 'resumen', sede],
    queryFn: () => carteraApi.resumen({ sede_id: sede }),
    staleTime: STALE,
    refetchInterval: STALE,
    enabled: veCartera,
  })

  const { data: citasSinCerrarData } = useQuery({
    queryKey: ['citas', 'sin-cerrar', periodo, sede],
    // Citas cuya FECHA cae dentro del periodo y siguen en un estado abierto.
    // El backend filtra por fecha de la cita y por estado; usamos `count`.
    queryFn: () => agendaApi.citas.list({
      fecha_inicio__date__gte: rango.ini,
      fecha_inicio__date__lte: rango.fin,
      estado__in: 'pendiente,confirmada,en_espera,en_curso',
      page_size: 1,
      ...(sede && { sede }),
    }),
    staleTime: STALE,
    refetchInterval: STALE,
    enabled: veAgenda,
  })

  const { data: pacientesSinReagendar, isLoading: pacientesLoading } = useQuery({
    queryKey: ['reportes', 'pacientes-sin-reagendar', sede],
    queryFn: () => reportesApi.getPacientesSinReagendar({ sede_id: sede }),
    staleTime: STALE,
    refetchInterval: STALE,
  })

  const { data: notificacionesFallidasData } = useQuery({
    queryKey: ['notificaciones', 'fallidas'],
    queryFn: () => notificacionesFallidasApi.list({ resuelta: false }),
    enabled: veEnviosFallidos(user),
    staleTime: STALE,
    refetchInterval: STALE,
  })
  const notificacionesFallidas = notificacionesFallidasData?.results ?? []

  const enCurso = citasHoy?.filter(c => c.estado === 'en_curso') ?? []
  const totalCitas = kpis?.citas_hoy.total ?? 0
  const completadas = kpis?.citas_hoy.completadas ?? 0

  // Valores de la fila de KPIs, ya sujetos al filtro de periodo (los de arriba
  // se mantienen "de hoy" para el hero y la tarjeta de citas).
  const citasKpi = kpisView?.citas_hoy.total ?? 0
  const completadasKpi = kpisView?.citas_hoy.completadas ?? 0
  // Servicios: con 'hoy' muestra el mes en curso (su etiqueta dice "del mes").
  // Comercial, "No atendidas" y "Ocupación" sí siguen el filtro completo.
  const periodoSufijoRetro = periodo === 'hoy' ? 'del mes' : periodoSufijo
  // Etiqueta corta para el tab de "Ocupación" (que comparte espacio con "Hoy").
  const periodoTabCorto: Record<PeriodoKey, string> = { hoy: 'Hoy', mes: 'Mes', '3m': '3M', '6m': '6M', '1a': '1A' }

  const ocupacionActiva = tabOcupacion === 'mes' ? ocupacionMes : ocupacionHoy
  const ocupacionLoading = tabOcupacion === 'mes' ? ocupacionMesLoading : ocupacionHoyLoading

  const sinReagendar = pacientesSinReagendar ?? []
  const canVerSinReagendar = hasPermission(user, PERM.REPORTES_VER)
  const canVerSeguimiento = hasPermission(user, PERM.SEGUIMIENTO_VER)
  // 4 o 5 tarjetas según permisos (Ingresos y Sin reagendar son opcionales).
  const nKpis = 3 + (canVerFinanzas ? 1 : 0) + (canVerSinReagendar ? 1 : 0)

  // Citas del periodo por desenlace (todo por fecha de la cita).
  const sinCerrarPeriodo = citasSinCerrarData?.count ?? 0
  const totalNoAsistioMes = (ocupacionMes ?? []).reduce((s, o) => s + o.no_asistio, 0)
  const totalCanceladasMes = (ocupacionMes ?? []).reduce((s, o) => s + o.canceladas, 0)
  const totalCitasMes = (ocupacionMes ?? []).reduce((s, o) => s + o.total_citas, 0)
  // "No atendidas" = no asistió + citas sin cerrar (las canceladas se muestran
  // aparte en el subtítulo como contexto, no suman al titular).
  const totalNoAtendidas = totalNoAsistioMes + sinCerrarPeriodo
  const pctNoAsistioMes = totalCitasMes > 0
    ? Math.min((totalNoAsistioMes / totalCitasMes) * 100, 100)
    : 0

  // Fila de KPIs superior — común a la variante con y sin checklist. Sujeta al
  // filtro de periodo salvo "No atendidas", que siempre es retrospectiva.
  const kpiCards = (
    <>
      <KPICard
        label={periodo === 'hoy' ? 'Citas hoy' : `Citas ${periodoSufijo}`}
        value={citasKpi}
        sub={periodo === 'hoy'
          ? `${kpisView?.citas_hoy.pendientes ?? 0} pendientes · ${kpisView?.citas_hoy.confirmadas ?? 0} confirmadas`
          : `${completadasKpi} completadas`}
        icon={CalendarDays}
        iconBg="bg-blue-50"
        iconColor="text-blue-500"
        loading={kpisViewLoading}
      />
      {canVerFinanzas && (
        <KPICard
          label={periodo === 'hoy' ? 'Ingresos hoy' : `Ingresos ${periodoSufijo}`}
          value={kpisView?.cobros_hoy ? COP.format(Number(kpisView.cobros_hoy.total_cop)) : '—'}
          sub={`${kpisView?.cobros_hoy?.pagados ?? 0} cobros pagados`}
          icon={DollarSign}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-500"
          loading={kpisViewLoading}
        />
      )}
      <KPICard
        label="Completadas"
        value={completadasKpi}
        sub={citasKpi > 0 ? `${Math.round((completadasKpi / citasKpi) * 100)}% ${periodo === 'hoy' ? 'del día' : 'del periodo'}` : undefined}
        icon={CheckCircle2}
        iconBg="bg-green-50"
        iconColor="text-green-500"
        loading={kpisViewLoading}
      />
      <KPICard
        label={`No atendidas ${periodoSufijo}`}
        value={ocupacionMesLoading ? '—' : totalNoAtendidas}
        sub={`${totalNoAsistioMes} no asistió · ${sinCerrarPeriodo} sin cerrar`}
        ayuda={`${totalNoAsistioMes} no asistieron${totalCitasMes > 0 ? ` (${pctNoAsistioMes.toFixed(0)}% de las citas)` : ''} y ${sinCerrarPeriodo} quedaron sin cerrar. Aparte, ${totalCanceladasMes} se cancelaron (no suman aquí).`}
        icon={UserX}
        iconBg={totalNoAtendidas > 0 ? 'bg-orange-50' : 'bg-gray-50'}
        iconColor={totalNoAtendidas > 0 ? 'text-orange-500' : 'text-gray-400'}
        loading={ocupacionMesLoading}
      />
      {canVerSinReagendar && (
        <KPICard
          label="Sin reagendar"
          value={sinReagendar.length}
          sub={sinReagendar.length > 0 ? 'más de un mes sin cita · ver lista' : 'todos tienen su próxima cita'}
          icon={CalendarX}
          iconBg={sinReagendar.length > 0 ? 'bg-amber-50' : 'bg-gray-50'}
          iconColor={sinReagendar.length > 0 ? 'text-amber-500' : 'text-gray-400'}
          alert={sinReagendar.length > 0}
          loading={pacientesLoading}
          onClick={sinReagendar.length > 0 ? () => setSheetPacientes(true) : undefined}
        />
      )}
    </>
  )

  // Fila de filtros: badges de sede a la izquierda, dropdown de periodo a la
  // derecha. Va encima de los KPI. "Todas las sedes" solo para quien realmente
  // ve todas (admin/superadmin).
  const filtrosLinea = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {sedes.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {isAllSedes && (
            <button
              onClick={() => setSedeId(null)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                sede === undefined
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-muted-foreground border-gray-200 hover:border-primary/50 hover:text-foreground'
              )}
            >
              Todas las sedes
            </button>
          )}
          {sedes.map(s => (
            <button
              key={s.id}
              onClick={() => setSedeId(s.id)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                sede === s.id
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-muted-foreground border-gray-200 hover:border-primary/50 hover:text-foreground'
              )}
            >
              {s.nombre}
            </button>
          ))}
        </div>
      ) : <div />}
      <Select value={periodo} onValueChange={(v) => setPeriodo(v as PeriodoKey)}>
        <SelectTrigger className="w-[180px] h-8 text-xs bg-white ml-auto">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PERIODOS.map(p => (
            <SelectItem key={p.key} value={p.key} className="text-xs">{p.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  // Solo lo que el usuario puede hacer: antes "Nueva cita" y "Nuevo paciente"
  // salían a todos y terminaban en "no tienes permiso".
  const accesosRapidos = [
    { href: '/agenda', icon: CalendarDays, label: 'Nueva cita', desc: 'Agendar para hoy', visible: hasPermission(user, PERM.AGENDA_CREAR) },
    { href: '/pacientes/nuevo', icon: Users, label: 'Nuevo paciente', desc: 'Registrar paciente', visible: hasPermission(user, PERM.PACIENTES_CREAR) },
    { href: '/cotizaciones', icon: FileText, label: 'Cotizaciones', desc: 'Ver y crear cotizaciones', visible: hasPermission(user, PERM.COTIZACIONES_VER) },
  ].filter((a) => a.visible)

  return (
    <div className="w-[90%] mx-auto space-y-6">

      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary/70 p-6 text-white shadow-md">
        <div className="relative z-10">
          <p className="text-white/70 text-sm mb-0.5 capitalize">{todayLong()}</p>
          <h1 className="text-2xl font-bold">
            {greeting()}, {user?.first_name}
          </h1>
          <p className="text-white/80 text-sm mt-1">
            {enCurso.length > 0
              ? <><span className="font-semibold text-white">{enCurso.length}</span> cita{enCurso.length !== 1 ? 's' : ''} en curso ahora mismo</>
              : totalCitas === 0
                ? 'No hay citas agendadas para hoy'
                : <><span className="font-semibold text-white">{totalCitas}</span> cita{totalCitas !== 1 ? 's' : ''} agendada{totalCitas !== 1 ? 's' : ''} para hoy</>
            }
          </p>
        </div>
        <div className="absolute -right-8 -top-8 h-36 w-36 rounded-full bg-white/10" />
        <div className="absolute -right-2 -bottom-10 h-24 w-24 rounded-full bg-white/10" />
        <div className="absolute right-24 -bottom-6 h-16 w-16 rounded-full bg-white/10" />
      </div>

      {/* Banners: en columnas en pantallas grandes; si solo aparece uno,
          ocupa todo el ancho, y si no aparece ninguno el contenedor se oculta */}
      <div className="flex flex-col lg:flex-row gap-4 empty:hidden [&>*]:min-w-0 lg:[&>*]:flex-1">
        <PuestaEnMarchaBanner />
        <AvisoDatosProfesionales />
        <AutorizacionesPendientesBanner />
      </div>

      {/* Filtros (sede + periodo) — encima de los KPI */}
      {filtrosLinea}

      {/* Checklist + KPIs */}
      {!checklistDone ? (
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4 items-start">
          <SetupChecklist />
          <div className="grid grid-cols-2 gap-4">
            {kpiCards}
          </div>
        </div>
      ) : (
        <div className={cn('grid grid-cols-2 gap-4', nKpis >= 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4')}>
          {kpiCards}
        </div>
      )}

      {/* Citas del día + Accesos rápidos: segunda fila, justo después de los KPI */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {veAgenda && <div className="lg:col-span-2">
          <CitasHoyCard
            citas={citasHoy}
            loading={citasLoading}
            titulo="Citas de hoy"
            mostrarProfesional
            accionVacia={hasPermission(user, PERM.AGENDA_CREAR) ? { href: '/agenda', label: 'Agendar cita', crear: true } : undefined}
          />
        </div>}

        <div className="space-y-4">
          {canVerSeguimiento && <ParaHoyResumen sede={sede} />}
          {accesosRapidos.length > 0 && <div className="bg-white rounded-xl border shadow-sm p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
            <h2 className="font-semibold text-sm mb-3">Accesos rápidos</h2>
            <div className="space-y-2">
              {accesosRapidos.map(({ href, icon: Icon, label, desc }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 border border-transparent hover:border-border transition-all group"
                >
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              ))}
            </div>
          </div>}
        </div>
      </div>

      {/* Comercial (cotizado vs vendido) + Cartera */}
      <div className={cn('grid grid-cols-1 gap-4', canVerFinanzas && 'lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]')}>
        {canVerFinanzas && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-5 py-3 border-b">
              <div className="flex items-center gap-2 min-w-0">
                <ShoppingBag className="h-4 w-4 text-primary shrink-0" />
                <h2 className="font-semibold text-sm truncate">Comercial {periodoSufijo}</h2>
              </div>
              <div className="flex items-center gap-3">
                <FiltroVendedores opciones={vendedoresOpciones} selected={vendedores} onChange={setVendedores} />
                <Link href="/cotizaciones" className="text-xs text-primary hover:underline">Cotizaciones</Link>
                <Link href="/ventas" className="text-xs text-primary hover:underline flex items-center gap-1">
                  Ventas <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 sm:divide-x border-b">
              <MetricaComercial
                label="Vendido"
                value={comercial ? abrevCOP(Number(comercial.ventas.valor)) : '—'}
                sub={comercial
                  ? `${comercial.ventas.cantidad} venta${comercial.ventas.cantidad !== 1 ? 's' : ''}${
                      comercial.ventas.dias_promedio_cierre != null ? ` · ~${Math.round(comercial.ventas.dias_promedio_cierre)} días para cerrar` : ''}`
                  : undefined}
                destacado
                loading={comercialLoading}
                ayuda="Valor de las cotizaciones aceptadas en el periodo (por fecha de aceptación)."
              />
              <MetricaComercial
                label="Tasa de cierre"
                value={comercial ? `${Number(comercial.ventas.tasa_cierre_pct).toFixed(0)}%` : '—'}
                sub={comercial
                  ? comercial.ventas.creadas_abiertas > 0
                    ? `${comercial.ventas.creadas_vendidas} de ${comercial.cotizaciones.creadas} · ${comercial.ventas.creadas_abiertas} siguen abiertas`
                    : `${comercial.ventas.creadas_vendidas} de ${comercial.cotizaciones.creadas} cotizaciones`
                  : undefined}
                loading={comercialLoading}
                ayuda="De las cotizaciones creadas en el periodo, cuántas ya se vendieron. Mientras haya cotizaciones abiertas, el porcentaje puede subir."
              />
              <MetricaComercial
                label="Cotizado"
                value={comercial ? abrevCOP(Number(comercial.cotizaciones.creadas_valor)) : '—'}
                sub={comercial ? `${comercial.cotizaciones.creadas} cotizaci${comercial.cotizaciones.creadas !== 1 ? 'ones' : 'ón'}` : undefined}
                loading={comercialLoading}
                ayuda="Valor de las cotizaciones creadas en el periodo, sin importar cómo terminaron."
              />
              <MetricaComercial
                label="Cotizaciones abiertas"
                value={comercial ? abrevCOP(Number(comercial.cotizaciones.abiertas_valor)) : '—'}
                sub={comercial ? `${comercial.cotizaciones.abiertas} por cerrar, a hoy` : undefined}
                loading={comercialLoading}
                ayuda="Cotizaciones vigentes que el paciente todavía no acepta. Es la foto de hoy, no depende del periodo."
              />
            </div>

            <div className="px-5 pt-3 pb-4">
              <GraficaComercial data={comercial} loading={comercialLoading} />
            </div>
          </div>
        )}

        {veCartera && (
          <div className={cn(
            'bg-white rounded-xl border shadow-sm overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
            (resumenCartera?.cuotas_vencidas ?? 0) > 0 ? 'border-red-200' : 'border-gray-100'
          )}>
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-primary" />
                <h2 className="font-semibold text-sm">Cartera</h2>
              </div>
              <Link href="/cartera" className="text-xs text-primary hover:underline flex items-center gap-1">
                Ver cartera <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="flex divide-x">
              <MetricaCotizacion
                label="Saldo pendiente"
                value={resumenCartera ? abrevCOP(Number(resumenCartera.saldo_pendiente)) : '—'}
                color="text-foreground"
                loading={carteraLoading}
              />
              <MetricaCotizacion
                label="Cuotas vencidas"
                value={resumenCartera?.cuotas_vencidas ?? 0}
                sub={resumenCartera && resumenCartera.cuotas_vencidas > 0
                  ? `${abrevCOP(Number(resumenCartera.cuotas_vencidas_valor))} · ${resumenCartera.pacientes_en_mora} paciente${resumenCartera.pacientes_en_mora !== 1 ? 's' : ''}`
                  : 'sin vencimientos'}
                color={(resumenCartera?.cuotas_vencidas ?? 0) > 0 ? 'text-red-600' : 'text-muted-foreground'}
                loading={carteraLoading}
              />
            </div>
            <CarteraDetalle resumen={resumenCartera} loading={carteraLoading} />
          </div>
        )}
      </div>

      {/* Lista de pacientes sin reagendar (se abre desde su tarjeta de KPI) */}
      <SheetPacientesSinReagendar
        open={sheetPacientes}
        onClose={() => setSheetPacientes(false)}
        pacientes={sinReagendar}
      />

      {/* Envíos de WhatsApp fallidos (recordatorios, OTP, cotizaciones, órdenes) */}
      {notificacionesFallidas.length > 0 && (
        <>
          <button
            onClick={() => setSheetNotificacionesFallidas(true)}
            className="w-full flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800 hover:bg-red-100 transition-colors text-left"
          >
            <BellOff className="h-4 w-4 shrink-0" />
            <span className="flex-1 font-medium">
              {notificacionesFallidas.length} envío{notificacionesFallidas.length !== 1 ? 's' : ''} de WhatsApp no se pudo{notificacionesFallidas.length !== 1 ? 'ieron' : ''} enviar
            </span>
            <ArrowRight className="h-4 w-4 shrink-0" />
          </button>
          <SheetNotificacionesFallidas
            open={sheetNotificacionesFallidas}
            onClose={() => setSheetNotificacionesFallidas(false)}
            notificaciones={notificacionesFallidas}
          />
        </>
      )}

      {/* Cupo mensual de WhatsApp cerca de agotarse */}
      {kpis?.whatsapp_uso?.cerca_del_limite && (
        <Link
          href="/configuracion/clinica"
          className="w-full flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 hover:bg-amber-100 transition-colors"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1 font-medium">
            {kpis.whatsapp_uso.envios_realizados} de {kpis.whatsapp_uso.envios_incluidos} envíos de WhatsApp usados este mes — se está por agotar el cupo
          </span>
          <ArrowRight className="h-4 w-4 shrink-0" />
        </Link>
      )}

      {/* Ingresos acumulados por origen + Cobros de hoy por medio de pago */}
      {canVerFinanzas && (
      <div className={cn('grid grid-cols-1 gap-6', canVerFinanzas && 'lg:grid-cols-3')}>
        <IngresosAcumuladosCard
          data={ingresos}
          loading={ingresosLoading}
          titulo={ingRango.titulo}
          comparadoCon={ingRango.comparadoCon}
        />

        <div className="bg-white rounded-xl border shadow-sm p-5 space-y-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
          <h2 className="font-semibold text-sm">Cobros de hoy por medio</h2>
          {kpisLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : !kpis?.cobros_hoy?.por_medio_pago.length ? (
            <p className="text-sm text-muted-foreground">Sin cobros registrados hoy</p>
          ) : (
            <div className="space-y-2">
              {kpis.cobros_hoy.por_medio_pago.map(({ medio, total }) => (
                <div key={medio} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                  <span className="text-sm text-muted-foreground">{medio}</span>
                  <span className="text-sm font-semibold">{COP.format(Number(total))}</span>
                </div>
              ))}
              <div className="flex items-center justify-between pt-1">
                <span className="text-sm font-semibold">Total</span>
                <span className="text-sm font-bold text-primary">{COP.format(Number(kpis.cobros_hoy.total_cop))}</span>
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Tablas: servicios + ocupación */}
      <div className={cn('grid grid-cols-1 gap-6', canVerFinanzas && 'lg:grid-cols-2')}>

        {/* Servicios del periodo */}
        {canVerFinanzas && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <h2 className="font-semibold text-sm">Servicios {periodoSufijoRetro}</h2>
            <span className="text-xs text-muted-foreground">por ingresos</span>
          </div>
          {serviciosLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !servicios?.length ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {periodo === 'hoy' ? 'Sin datos este mes' : 'Sin datos en el periodo'}
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              <div className={cn(COLS_SERVICIOS, 'py-2 bg-gray-50/60')}>
                {['Servicio', 'Citas', 'Ingresos', '% total'].map((h, i) => (
                  <span
                    key={h}
                    className={cn(
                      'whitespace-nowrap text-[10px] font-semibold text-muted-foreground uppercase tracking-wide',
                      i > 0 && 'text-right',
                    )}
                  >
                    {h}
                  </span>
                ))}
              </div>
              {(() => {
                const totalIngresos = servicios.reduce((sum, s) => sum + Number(s.ingresos), 0)
                return servicios.slice(0, 6).map(s => {
                  const pct = totalIngresos > 0 ? (Number(s.ingresos) / totalIngresos) * 100 : 0
                  return (
                    <div key={s.servicio_nombre} className={cn(COLS_SERVICIOS, 'py-2.5 items-center text-[13px] hover:bg-gray-50/50')}>
                      <span className="truncate uppercase" title={s.servicio_nombre}>{s.servicio_nombre}</span>
                      <span className="text-right tabular-nums text-muted-foreground">{s.cantidad_citas}</span>
                      <span className="text-right tabular-nums whitespace-nowrap font-medium">{COP.format(Number(s.ingresos))}</span>
                      <span className={cn(
                        'text-right tabular-nums font-semibold',
                        pct >= 30 ? 'text-emerald-600' : pct >= 10 ? 'text-amber-600' : 'text-muted-foreground'
                      )}>
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                  )
                })
              })()}
            </div>
          )}
        </div>
        )}

        {/* Ocupación por profesional — tab del periodo elegido vs. Hoy */}
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <h2 className="font-semibold text-sm">Ocupación por profesional</h2>
            <Tabs value={tabOcupacion} onValueChange={v => setTabOcupacion(v as 'mes' | 'hoy')}>
              <TabsList className="h-7">
                <TabsTrigger value="mes" className="text-xs px-3 h-5">{periodoTabCorto[periodo]}</TabsTrigger>
                <TabsTrigger value="hoy" className="text-xs px-3 h-5">Hoy</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          {ocupacionLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !ocupacionActiva?.length ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {tabOcupacion === 'hoy' ? 'Sin citas para hoy' : 'Sin datos en el periodo'}
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              <div className={cn('grid px-5 py-2 bg-gray-50/60', canVerFinanzas ? 'grid-cols-4' : 'grid-cols-3')}>
                {['Profesional', 'Citas', 'Compl.', ...(canVerFinanzas ? ['Tasa'] : [])].map(h => (
                  <span key={h} className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</span>
                ))}
              </div>
              {ocupacionActiva.slice(0, 6).map(o => (
                <div key={o.profesional_id} className={cn('grid px-5 py-2.5 items-center hover:bg-gray-50/50', canVerFinanzas ? 'grid-cols-4' : 'grid-cols-3')}>
                  <span className="text-sm truncate pr-2">{o.profesional_nombre}</span>
                  <span className="text-sm text-muted-foreground">{o.total_citas}</span>
                  <span className="text-sm text-muted-foreground">{o.completadas}</span>
                  {canVerFinanzas && (
                    <span className={cn(
                      'text-sm font-semibold',
                      Number(o.tasa_completadas_pct) >= 80 ? 'text-emerald-600' : Number(o.tasa_completadas_pct) >= 50 ? 'text-amber-600' : 'text-red-500'
                    )}>
                      {Number(o.tasa_completadas_pct).toFixed(0)}%
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
