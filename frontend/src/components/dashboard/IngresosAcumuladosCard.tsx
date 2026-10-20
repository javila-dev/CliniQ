'use client'

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ReactNode } from 'react'
import { TrendingDown, TrendingUp } from 'lucide-react'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { IngresosPorOrigen, OrigenIngreso } from '@/types/reportes'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

function abrev(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toLocaleString('es-CO', { maximumFractionDigits: 1 })}M`
  if (value >= 1_000) return `$${Math.round(value / 1_000)}k`
  return COP.format(value)
}

// Orden fijo (también el de apilado, de abajo hacia arriba). Validado con el
// script de la paleta: el gris de "Otros" es neutro a propósito.
const ORIGENES: { key: OrigenIngreso; label: string; color: string; ayuda: string }[] = [
  { key: 'citas', label: 'Citas', color: '#2563eb', ayuda: 'Pagos de citas y servicios sueltos.' },
  { key: 'ventas', label: 'Ventas al cerrar', color: '#e11d48', ayuda: 'Lo que pagó el paciente hasta el día en que aceptó la cotización.' },
  { key: 'cartera', label: 'Cuotas de cartera', color: '#0d9488', ayuda: 'Abonos al plan de pagos después de cerrar la venta.' },
  { key: 'otros', label: 'Otros ingresos', color: '#6b7280', ayuda: 'Ingresos libres registrados en Ingresos.' },
]

function fechaCorta(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}

type Punto = { fecha: string; total: number } & Record<OrigenIngreso, number>

function TooltipAcumulado({ active, payload }: { active?: boolean; payload?: { payload: Punto }[] }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="mb-1 font-medium text-foreground">Hasta el {fechaCorta(p.fecha)}</p>
      {[...ORIGENES].reverse().map((o) => (
        <p key={o.key} className="flex items-center gap-1.5 text-muted-foreground">
          <span className="h-2 w-2 rounded-sm" style={{ background: o.color }} />
          {o.label}
          <span className="ml-auto pl-4 tabular-nums text-foreground">{COP.format(p[o.key])}</span>
        </p>
      ))}
      <p className="mt-1 flex border-t pt-1 font-medium text-foreground">
        Total <span className="ml-auto pl-4 tabular-nums">{COP.format(p.total)}</span>
      </p>
    </div>
  )
}

interface Props {
  data: IngresosPorOrigen | undefined
  loading: boolean
  titulo: string
  /** "el mes pasado a esta fecha", "los 3 meses anteriores"… */
  comparadoCon: string
  /** Panel a la derecha de la gráfica (debajo en pantallas chicas), dentro de la misma tarjeta. */
  lateral?: ReactNode
}

/** Dinero que entró en el periodo, acumulado día a día y separado por origen. */
export function IngresosAcumuladosCard({ lateral, ...props }: Props) {
  return (
    <div className={cn(
      'rounded-xl border bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
      lateral && 'lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]',
    )}>
      <div className="min-w-0">
        <Contenido {...props} />
      </div>
      {lateral && (
        <div className="mt-5 flex flex-col border-t pt-4 lg:mt-0 lg:ml-6 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          {lateral}
        </div>
      )}
    </div>
  )
}

function Contenido({ data, loading, titulo, comparadoCon }: Omit<Props, 'lateral'>) {
  if (loading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-44 w-full rounded-lg" />
      </div>
    )
  }

  const totales = Object.fromEntries(ORIGENES.map((o) => [o.key, Number(data.totales[o.key])])) as Record<OrigenIngreso, number>
  const total = Number(data.totales.total)
  const anterior = Number(data.anterior.total)
  const variacion = anterior > 0 ? ((total - anterior) / anterior) * 100 : null

  const acumulado = Object.fromEntries(ORIGENES.map((o) => [o.key, 0])) as Record<OrigenIngreso, number>
  const puntos: Punto[] = data.serie.map((dia) => {
    for (const o of ORIGENES) acumulado[o.key] += Number(dia[o.key])
    return { fecha: dia.fecha, ...acumulado, total: ORIGENES.reduce((s, o) => s + acumulado[o.key], 0) }
  })
  const visibles = ORIGENES.filter((o) => totales[o.key] > 0)

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <h2 className="text-sm font-semibold">{titulo}</h2>
          <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight">{COP.format(total)}</p>
        </div>
        {variacion !== null ? (
          <p
            className={cn('flex items-center gap-1 text-xs font-medium', variacion >= 0 ? 'text-emerald-700' : 'text-red-600')}
            title={`${COP.format(anterior)} entre el ${fechaCorta(data.anterior.fecha_inicio)} y el ${fechaCorta(data.anterior.fecha_fin)}`}
          >
            {variacion >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {variacion >= 0 ? '+' : ''}{variacion.toLocaleString('es-CO', { maximumFractionDigits: 0 })} % frente a {comparadoCon}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Sin ingresos en {comparadoCon} para comparar</p>
        )}
      </div>

      {total === 0 ? (
        <div className="mt-4 grid h-44 place-items-center rounded-lg bg-gray-50 text-xs text-muted-foreground">
          Aún no hay pagos registrados en este periodo
        </div>
      ) : (
        <>
          {/* De dónde viene: proporción del total */}
          <div className="mt-4 flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden>
            {visibles.map((o) => (
              <div key={o.key} style={{ flex: totales[o.key], background: o.color }} />
            ))}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            {ORIGENES.map((o) => (
              <div key={o.key} title={o.ayuda} className={cn('min-w-0 cursor-help', totales[o.key] === 0 && 'opacity-60')}>
                <dt className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                  <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: o.color }} />
                  {o.label}
                </dt>
                <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                  {abrev(totales[o.key])}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    {Math.round((totales[o.key] / total) * 100)}%
                  </span>
                </dd>
              </div>
            ))}
          </dl>

          {/* Acumulado día a día, apilado por origen */}
          <div className="mt-4">
            <ResponsiveContainer width="100%" height={190}>
              <AreaChart data={puntos} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#f0f0f0" />
                <XAxis
                  dataKey="fecha"
                  tickFormatter={fechaCorta}
                  tick={{ fontSize: 10, fill: '#6b7280' }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#6b7280' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => abrev(v)}
                  width={52}
                />
                <Tooltip content={<TooltipAcumulado />} cursor={{ stroke: '#d1d5db', strokeDasharray: '3 3' }} />
                {ORIGENES.map((o) => (
                  <Area
                    key={o.key}
                    type="monotone"
                    dataKey={o.key}
                    stackId="ingresos"
                    stroke={o.color}
                    strokeWidth={1.5}
                    fill={o.color}
                    fillOpacity={0.18}
                    isAnimationActive={false}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </>
  )
}
