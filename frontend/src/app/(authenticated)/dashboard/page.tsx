'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  CalendarDays, Users, CheckCircle2,
  ArrowRight, Plus, TrendingUp, DollarSign,
  FileText, UserX, ChevronRight, AlertTriangle, Wallet,
} from 'lucide-react'
import Link from 'next/link'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { reportesApi } from '@/lib/api/reportes'
import { carteraApi } from '@/lib/api/cartera'
import { agendaApi } from '@/lib/api/agenda'
import { useUserSedes } from '@/hooks/useUserSedes'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CitaStatusBadge } from '@/components/shared/StatusBadge'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { canAccess, hasPermission, PERM } from '@/lib/permissions'
import { formatTime, cn } from '@/lib/utils'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import type { EstadoCita } from '@/types/agenda'
import type { PacienteSinReagendar } from '@/types/reportes'

const STALE = 5 * 60 * 1000

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 0,
})

const MEDIO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta_debito: 'Débito',
  tarjeta_credito: 'Crédito',
  transferencia: 'Transferencia',
  otro: 'Otro',
}

const ESTADO_LEFT: Record<EstadoCita, string> = {
  pendiente: 'border-l-yellow-400',
  confirmada: 'border-l-blue-400',
  en_espera: 'border-l-violet-400',
  en_curso: 'border-l-primary',
  completada: 'border-l-green-400',
  cancelada: 'border-l-red-300',
  no_asistio: 'border-l-gray-300',
}

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

function mesActual() {
  const now = new Date()
  const ini = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const fin = now.toISOString().split('T')[0]
  return { ini, fin }
}

function KPICard({
  label, value, sub, icon: Icon, iconBg, iconColor, loading, alert,
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ElementType
  iconBg: string
  iconColor: string
  loading?: boolean
  alert?: boolean
}) {
  return (
    <div className={cn(
      'bg-white rounded-xl border p-4 flex items-center gap-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
      alert ? 'border-red-200' : 'border-gray-100'
    )}>
      <div className={cn('rounded-xl p-3 shrink-0', iconBg)}>
        <Icon className={cn('h-5 w-5', iconColor)} />
      </div>
      <div className="min-w-0">
        {loading ? (
          <>
            <Skeleton className="h-7 w-16 mb-1" />
            <Skeleton className="h-3 w-24" />
          </>
        ) : (
          <>
            <p className={cn('text-2xl font-bold truncate', alert && Number(value) > 0 ? 'text-red-600' : 'text-foreground')}>
              {value}
            </p>
            <p className="text-xs text-muted-foreground">{label}</p>
            {sub && <p className="text-xs text-muted-foreground/70 mt-0.5">{sub}</p>}
          </>
        )}
      </div>
    </div>
  )
}

function GraficaIngresos({ data, loading }: { data: { periodo: string; total_cobros: string; total_gastos: string }[]; loading: boolean }) {
  if (loading) return <Skeleton className="h-48 w-full rounded-xl" />

  const chartData = data.map(d => ({
    fecha: new Date(d.periodo + 'T00:00:00').toLocaleDateString('es-CO', { month: 'short', day: 'numeric' }),
    Ingresos: parseFloat(d.total_cobros),
    Gastos: parseFloat(d.total_gastos),
  }))

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="fecha" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
        <Tooltip
          formatter={(value: number) => COP.format(value)}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Ingresos" fill="#f43f5e" radius={[3, 3, 0, 0]} />
        <Bar dataKey="Gastos" fill="#e5e7eb" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function MetricaCotizacion({
  label, value, sub, color, loading,
}: {
  label: string
  value: string | number
  sub?: string
  color: string
  loading?: boolean
}) {
  return (
    <div className="flex-1 text-center px-4 py-3">
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

export default function DashboardPage() {
  return <RoleGuard check={canAccess.dashboard}><DashboardContent /></RoleGuard>
}

function DashboardContent() {
  const { user } = useAuthStore()
  const [tabOcupacion, setTabOcupacion] = useState<'mes' | 'hoy'>('mes')
  const [sheetPacientes, setSheetPacientes] = useState(false)
  const [sedeId, setSedeId] = useState<string | null>(null)

  const canVerCotizaciones = hasPermission(user, PERM.COTIZACIONES_VER)
  const sede = sedeId ?? undefined

  const { sedes } = useUserSedes()

  const { data: kpis, isLoading: kpisLoading } = useQuery({
    queryKey: ['reportes', 'dashboard', sedeId],
    queryFn: () => reportesApi.getDashboard({ sede_id: sede }),
    staleTime: STALE,
    refetchInterval: STALE,
  })

  const { data: ingresos, isLoading: ingresosLoading } = useQuery({
    queryKey: ['reportes', 'ingresos', '30d', sedeId],
    queryFn: () => {
      const fin = new Date().toISOString().split('T')[0]
      const ini = new Date(Date.now() - 29 * 86400000).toISOString().split('T')[0]
      return reportesApi.getIngresos({ fecha_inicio: ini, fecha_fin: fin, agrupar_por: 'dia', sede_id: sede })
    },
    staleTime: STALE,
    refetchInterval: STALE,
  })

  const { data: servicios, isLoading: serviciosLoading } = useQuery({
    queryKey: ['reportes', 'servicios', sedeId],
    queryFn: () => reportesApi.getServicios({ sede_id: sede }),
    staleTime: STALE,
    refetchInterval: STALE,
  })

  const { data: ocupacionMes, isLoading: ocupacionMesLoading } = useQuery({
    queryKey: ['reportes', 'ocupacion', 'mes', sedeId],
    queryFn: () => reportesApi.getOcupacion({ sede_id: sede }),
    staleTime: STALE,
    refetchInterval: STALE,
  })

  const { data: ocupacionHoy, isLoading: ocupacionHoyLoading } = useQuery({
    queryKey: ['reportes', 'ocupacion', 'hoy', sedeId],
    queryFn: () => {
      const hoy = new Date().toISOString().split('T')[0]
      return reportesApi.getOcupacion({ fecha_inicio: hoy, fecha_fin: hoy, sede_id: sede })
    },
    staleTime: STALE,
    refetchInterval: STALE,
    enabled: tabOcupacion === 'hoy',
  })

  const { data: citasHoyData, isLoading: citasLoading } = useQuery({
    queryKey: ['citas', 'hoy', sedeId],
    queryFn: () => {
      const hoy = new Date().toISOString().split('T')[0]
      return agendaApi.citas.list({ fecha_inicio__date: hoy, sede: sedeId ?? undefined, page_size: 100 })
    },
    staleTime: STALE,
    refetchInterval: STALE,
  })
  const citasHoy = citasHoyData?.results

  const { data: cotizacionesMes, isLoading: cotizacionesMesLoading } = useQuery({
    queryKey: ['reportes', 'cotizaciones', 'mes', sedeId],
    queryFn: () => {
      const { ini, fin } = mesActual()
      return reportesApi.getCotizacionesMes({ fecha_inicio: ini, fecha_fin: fin, sede_id: sede })
    },
    staleTime: STALE,
    refetchInterval: STALE,
    enabled: canVerCotizaciones,
  })

  const { data: resumenCartera, isLoading: carteraLoading } = useQuery({
    queryKey: ['cartera', 'resumen', sedeId],
    queryFn: () => carteraApi.resumen({ sede_id: sede }),
    staleTime: STALE,
    refetchInterval: STALE,
  })

  const { data: citasSinCerrarData } = useQuery({
    queryKey: ['citas', 'sin-cerrar-mes', sedeId],
    queryFn: () => {
      const ayer = new Date(Date.now() - 86400000).toISOString().split('T')[0]
      const { ini } = mesActual()
      return agendaApi.citas.list({
        fecha_inicio__date__gte: ini,
        fecha_inicio__date__lte: ayer,
        page_size: 200,
        ...(sedeId && { sede: sedeId }),
      })
    },
    staleTime: STALE,
    refetchInterval: STALE,
  })

  const { data: pacientesSinReagendar, isLoading: pacientesLoading } = useQuery({
    queryKey: ['reportes', 'pacientes-sin-reagendar', sedeId],
    queryFn: () => reportesApi.getPacientesSinReagendar({ sede_id: sede }),
    staleTime: STALE,
    refetchInterval: STALE,
  })

  const enCurso = citasHoy?.filter(c => c.estado === 'en_curso') ?? []
  const totalCitas = kpis?.citas_hoy.total ?? 0
  const completadas = kpis?.citas_hoy.completadas ?? 0

  const ocupacionActiva = tabOcupacion === 'mes' ? ocupacionMes : ocupacionHoy
  const ocupacionLoading = tabOcupacion === 'mes' ? ocupacionMesLoading : ocupacionHoyLoading

  const sinReagendar = pacientesSinReagendar ?? []

  const ESTADOS_ABIERTOS: EstadoCita[] = ['pendiente', 'confirmada', 'en_espera', 'en_curso']
  const citasSinCerrarMes = (citasSinCerrarData?.results ?? []).filter(
    c => ESTADOS_ABIERTOS.includes(c.estado as EstadoCita)
  )

  const totalNoAsistioMes = (ocupacionMes ?? []).reduce((s, o) => s + o.no_asistio, 0)
  const totalCitasMes = (ocupacionMes ?? []).reduce((s, o) => s + o.total_citas, 0)
  const totalNoAtendidas = totalNoAsistioMes + citasSinCerrarMes.length
  const pctNoAtendidas = totalCitasMes > 0 ? (totalNoAtendidas / totalCitasMes) * 100 : 0

  return (
    <div className="max-w-6xl mx-auto space-y-6">

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

      {/* Filtro por sede */}
      {sedes.length > 1 && (
        <div className="w-full flex flex-wrap gap-2">
          <button
            onClick={() => setSedeId(null)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
              sedeId === null
                ? 'bg-primary text-white border-primary'
                : 'bg-white text-muted-foreground border-gray-200 hover:border-primary/50 hover:text-foreground'
            )}
          >
            Todas las sedes
          </button>
          {sedes.map(s => (
            <button
              key={s.id}
              onClick={() => setSedeId(s.id)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                sedeId === s.id
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-muted-foreground border-gray-200 hover:border-primary/50 hover:text-foreground'
              )}
            >
              {s.nombre}
            </button>
          ))}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Citas hoy"
          value={kpis?.citas_hoy.total ?? 0}
          sub={`${kpis?.citas_hoy.pendientes ?? 0} pendientes · ${kpis?.citas_hoy.confirmadas ?? 0} confirmadas`}
          icon={CalendarDays}
          iconBg="bg-blue-50"
          iconColor="text-blue-500"
          loading={kpisLoading}
        />
        <KPICard
          label="Ingresos hoy"
          value={kpis ? COP.format(Number(kpis.cobros_hoy.total_cop)) : '—'}
          sub={`${kpis?.cobros_hoy.pagados ?? 0} cobros pagados`}
          icon={DollarSign}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-500"
          loading={kpisLoading}
        />
        <KPICard
          label="Completadas"
          value={completadas}
          sub={totalCitas > 0 ? `${Math.round((completadas / totalCitas) * 100)}% del día` : undefined}
          icon={CheckCircle2}
          iconBg="bg-green-50"
          iconColor="text-green-500"
          loading={kpisLoading}
        />
        <KPICard
          label="No atendidas (mes)"
          value={ocupacionMesLoading ? '—' : totalNoAtendidas}
          sub={
            totalCitasMes > 0
              ? `${pctNoAtendidas.toFixed(1)}% · ${totalNoAsistioMes} no asistieron, ${citasSinCerrarMes.length} sin cerrar`
              : undefined
          }
          icon={UserX}
          iconBg={totalNoAtendidas > 0 ? 'bg-orange-50' : 'bg-gray-50'}
          iconColor={totalNoAtendidas > 0 ? 'text-orange-500' : 'text-gray-400'}
          loading={ocupacionMesLoading}
        />
      </div>

      {/* Cotizaciones del mes + Cartera */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {canVerCotizaciones && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <h2 className="font-semibold text-sm">Cotizaciones del mes</h2>
              </div>
              <Link href="/cotizaciones" className="text-xs text-primary hover:underline flex items-center gap-1">
                Ver todas <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="flex divide-x">
              <MetricaCotizacion
                label="Realizadas"
                value={cotizacionesMes?.total_mes ?? 0}
                color="text-foreground"
                loading={cotizacionesMesLoading}
              />
              <MetricaCotizacion
                label="Aceptadas"
                value={cotizacionesMes?.aceptadas_mes ?? 0}
                color="text-emerald-600"
                loading={cotizacionesMesLoading}
              />
              <MetricaCotizacion
                label="Conversión"
                value={cotizacionesMes ? `${Number(cotizacionesMes.tasa_conversion_pct).toFixed(0)}%` : '—'}
                sub={cotizacionesMes && Number(cotizacionesMes.tasa_conversion_pct) >= 50 ? 'buen ritmo' : cotizacionesMes ? 'por mejorar' : undefined}
                color={cotizacionesMes
                  ? Number(cotizacionesMes.tasa_conversion_pct) >= 50
                    ? 'text-emerald-600'
                    : Number(cotizacionesMes.tasa_conversion_pct) >= 25
                      ? 'text-amber-600'
                      : 'text-red-500'
                  : 'text-muted-foreground'
                }
                loading={cotizacionesMesLoading}
              />
            </div>
          </div>
        )}

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
                ? abrevCOP(Number(resumenCartera.cuotas_vencidas_valor))
                : 'sin vencimientos'}
              color={(resumenCartera?.cuotas_vencidas ?? 0) > 0 ? 'text-red-600' : 'text-muted-foreground'}
              loading={carteraLoading}
            />
          </div>
        </div>
      </div>

      {/* Pacientes sin reagendar */}
      {!pacientesLoading && sinReagendar.length > 0 && (
        <>
          <button
            onClick={() => setSheetPacientes(true)}
            className="w-full flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 hover:bg-amber-100 transition-colors text-left"
          >
            <UserX className="h-4 w-4 shrink-0" />
            <span className="flex-1 font-medium">
              {sinReagendar.length} paciente{sinReagendar.length !== 1 ? 's' : ''} con más de un mes sin reagendar
            </span>
            <ArrowRight className="h-4 w-4 shrink-0" />
          </button>
          <SheetPacientesSinReagendar
            open={sheetPacientes}
            onClose={() => setSheetPacientes(false)}
            pacientes={sinReagendar}
          />
        </>
      )}

      {/* Gráfica + Cobros por medio de pago */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border shadow-sm p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-sm">Ingresos últimos 30 días</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Cobros vs gastos por día</p>
            </div>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </div>
          <GraficaIngresos data={ingresos ?? []} loading={ingresosLoading} />
        </div>

        <div className="bg-white rounded-xl border shadow-sm p-5 space-y-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
          <h2 className="font-semibold text-sm">Cobros de hoy por medio</h2>
          {kpisLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : !kpis?.cobros_hoy.por_medio_pago.length ? (
            <p className="text-sm text-muted-foreground">Sin cobros registrados hoy</p>
          ) : (
            <div className="space-y-2">
              {kpis.cobros_hoy.por_medio_pago.map(({ medio, total }) => (
                <div key={medio} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                  <span className="text-sm text-muted-foreground">{MEDIO_LABEL[medio] ?? medio}</span>
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

      {/* Tablas: servicios + ocupación */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Servicios del mes */}
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <h2 className="font-semibold text-sm">Servicios del mes</h2>
            <span className="text-xs text-muted-foreground">por ingresos</span>
          </div>
          {serviciosLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !servicios?.length ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Sin datos este mes</div>
          ) : (
            <div className="divide-y divide-gray-50">
              <div className="grid grid-cols-4 px-5 py-2 bg-gray-50/60">
                {['Servicio', 'Citas', 'Ingresos', 'Margen'].map(h => (
                  <span key={h} className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</span>
                ))}
              </div>
              {servicios.slice(0, 6).map(s => (
                <div key={s.servicio_nombre} className="grid grid-cols-4 px-5 py-2.5 items-center hover:bg-gray-50/50">
                  <span className="text-sm truncate pr-2">{s.servicio_nombre}</span>
                  <span className="text-sm text-muted-foreground">{s.cantidad_citas}</span>
                  <span className="text-sm font-medium">{COP.format(Number(s.ingresos))}</span>
                  <span className={cn(
                    'text-sm font-semibold',
                    Number(s.margen_pct) >= 50 ? 'text-emerald-600' : Number(s.margen_pct) >= 20 ? 'text-amber-600' : 'text-red-500'
                  )}>
                    {Number(s.margen_pct).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ocupación por profesional — con tabs Hoy / Mes */}
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <h2 className="font-semibold text-sm">Ocupación por profesional</h2>
            <Tabs value={tabOcupacion} onValueChange={v => setTabOcupacion(v as 'mes' | 'hoy')}>
              <TabsList className="h-7">
                <TabsTrigger value="mes" className="text-xs px-3 h-5">Mes</TabsTrigger>
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
              {tabOcupacion === 'hoy' ? 'Sin citas para hoy' : 'Sin datos este mes'}
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              <div className="grid grid-cols-4 px-5 py-2 bg-gray-50/60">
                {['Profesional', 'Citas', 'Compl.', 'Tasa'].map(h => (
                  <span key={h} className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</span>
                ))}
              </div>
              {ocupacionActiva.slice(0, 6).map(o => (
                <div key={o.profesional_id} className="grid grid-cols-4 px-5 py-2.5 items-center hover:bg-gray-50/50">
                  <span className="text-sm truncate pr-2">{o.profesional_nombre}</span>
                  <span className="text-sm text-muted-foreground">{o.total_citas}</span>
                  <span className="text-sm text-muted-foreground">{o.completadas}</span>
                  <span className={cn(
                    'text-sm font-semibold',
                    Number(o.tasa_completadas_pct) >= 80 ? 'text-emerald-600' : Number(o.tasa_completadas_pct) >= 50 ? 'text-amber-600' : 'text-red-500'
                  )}>
                    {Number(o.tasa_completadas_pct).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Citas del día + Accesos rápidos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              <h2 className="font-semibold text-sm">Citas de hoy</h2>
            </div>
            <Link href="/agenda" className="text-xs text-primary hover:underline flex items-center gap-1">
              Ver agenda <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y">
            {citasLoading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
              </div>
            ) : !citasHoy?.length ? (
              <div className="flex flex-col items-center py-12 text-center px-4">
                <CalendarDays className="h-10 w-10 text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground font-medium">Sin citas para hoy</p>
                <Button size="sm" className="mt-3" asChild>
                  <Link href="/agenda">
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Agendar cita
                  </Link>
                </Button>
              </div>
            ) : (
              citasHoy.map(cita => (
                <Link
                  key={cita.id}
                  href={`/agenda?cita=${cita.id}`}
                  className={cn(
                    'flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors border-l-4',
                    ESTADO_LEFT[cita.estado]
                  )}
                >
                  <div className="text-center w-12 shrink-0">
                    <p className="text-sm font-bold text-primary tabular-nums">{formatTime(cita.fecha_inicio)}</p>
                    <p className="text-[10px] text-muted-foreground tabular-nums">{formatTime(cita.fecha_fin)}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{cita.paciente_nombre}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {cita.servicio_nombre} · {cita.profesional_nombre}
                    </p>
                  </div>
                  <CitaStatusBadge estado={cita.estado} />
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-xl border shadow-sm p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
            <h2 className="font-semibold text-sm mb-3">Accesos rápidos</h2>
            <div className="space-y-2">
              {[
                { href: '/agenda', icon: CalendarDays, label: 'Nueva cita', desc: 'Agendar para hoy' },
                { href: '/pacientes/nuevo', icon: Users, label: 'Nuevo paciente', desc: 'Registrar paciente' },
                { href: '/cotizaciones', icon: FileText, label: 'Cotizaciones', desc: 'Ver y crear cotizaciones' },
              ].map(({ href, icon: Icon, label, desc }) => (
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

          {!kpisLoading && totalCitas > 0 && (
            <div className="bg-white rounded-xl border shadow-sm p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <h2 className="font-semibold text-sm mb-3">Progreso del día</h2>
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{completadas} de {totalCitas} completadas</span>
                  <span>{Math.round((completadas / totalCitas) * 100)}%</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full bg-green-400 rounded-full transition-all"
                    style={{ width: `${(completadas / totalCitas) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
