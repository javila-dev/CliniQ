'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { TrendingUp, TrendingDown, ArrowUp, ArrowDown, Package, Wallet } from 'lucide-react'
import { reportesApi } from '@/lib/api/reportes'
import { LoadingState } from '@/components/shared/LoadingState'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuthStore } from '@/store/authStore'
import { canAccess, hasPermission, PERM } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { useResultadosSede } from './context'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

type PeriodoKey = 'mes' | 'mes_pasado' | '3m' | '6m' | 'ano'
const PERIODOS: { key: PeriodoKey; label: string }[] = [
  { key: 'mes', label: 'Este mes' },
  { key: 'mes_pasado', label: 'Mes pasado' },
  { key: '3m', label: 'Últimos 3 meses' },
  { key: '6m', label: 'Últimos 6 meses' },
  { key: 'ano', label: 'Este año' },
]

function rango(key: PeriodoKey): { ini: string; fin: string } {
  const now = new Date()
  const iso = (d: Date) => d.toLocaleDateString('en-CA')
  switch (key) {
    case 'mes':        return { ini: iso(new Date(now.getFullYear(), now.getMonth(), 1)), fin: iso(now) }
    case 'mes_pasado': return { ini: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), fin: iso(new Date(now.getFullYear(), now.getMonth(), 0)) }
    case '3m':         return { ini: iso(new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())), fin: iso(now) }
    case '6m':         return { ini: iso(new Date(now.getFullYear(), now.getMonth() - 6, now.getDate())), fin: iso(now) }
    case 'ano':        return { ini: iso(new Date(now.getFullYear(), 0, 1)), fin: iso(now) }
  }
}

function Variacion({ pct, invertirColor }: { pct: string | null; invertirColor?: boolean }) {
  if (pct === null) return <span className="text-[11px] text-muted-foreground">— sin comparación</span>
  const n = parseFloat(pct)
  const sube = n >= 0
  const bueno = invertirColor ? !sube : sube
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-[11px] font-medium', bueno ? 'text-emerald-600' : 'text-rose-600')}>
      {sube ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(n).toFixed(1)}% vs periodo anterior
    </span>
  )
}

function KPI({ label, value, icon: Icon, color, pct, invertirColor }: {
  label: string; value: string; icon: React.ElementType; color: string
  pct: string | null; invertirColor?: boolean
}) {
  return (
    <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="pt-5">
        <div className="flex items-start gap-3">
          <div className={cn('rounded-lg p-2.5', color)}><Icon className="h-4 w-4 text-white" /></div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-bold tabular-nums mt-0.5">{value}</p>
            <div className="mt-1"><Variacion pct={pct} invertirColor={invertirColor} /></div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function ResultadosResumenPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const puedePyL = canAccess.resultadosPyL(user)

  // El Resumen (P&L) es solo admin. A los demás que llegan a /resultados se los
  // manda a la primera pestaña que sí pueden ver.
  useEffect(() => {
    if (puedePyL) return
    const dest = hasPermission(user, PERM.CAJA_GASTOS_VER) ? '/resultados/egresos'
      : hasPermission(user, PERM.CAJA_CIERRE_VER) ? '/resultados/caja'
      : '/ingresos'
    router.replace(dest)
  }, [puedePyL, user, router])

  const { sede } = useResultadosSede()
  const [periodo, setPeriodo] = useState<PeriodoKey>('mes')
  const { ini, fin } = rango(periodo)

  const { data, isLoading } = useQuery({
    queryKey: ['pyl', periodo, sede],
    queryFn: () => reportesApi.getPyL({ fecha_inicio: ini, fecha_fin: fin, sede_id: sede }),
    placeholderData: keepPreviousData,
    enabled: puedePyL,
  })

  if (!puedePyL) return null

  const a = data?.actual
  const facturado = Number(a?.ingresos_facturado ?? 0)
  const costo = Number(a?.costo_insumos ?? 0)
  const gastos = Number(a?.gastos_operativos ?? 0)
  const margen = Number(a?.margen ?? 0)
  const pctOf = (v: number) => (facturado > 0 ? Math.max(0, Math.min(100, (v / facturado) * 100)) : 0)

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Select value={periodo} onValueChange={(v) => setPeriodo(v as PeriodoKey)}>
          <SelectTrigger className="w-[180px] h-8 text-xs bg-white"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PERIODOS.map((p) => <SelectItem key={p.key} value={p.key} className="text-xs">{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading && !data ? (
        <LoadingState rows={6} />
      ) : !data ? null : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPI label="Facturado" value={COP.format(facturado)} icon={TrendingUp} color="bg-blue-500"
                 pct={data.variacion_pct.ingresos_facturado} />
            <KPI label="Costo de insumos" value={COP.format(costo)} icon={Package} color="bg-amber-500"
                 pct={data.variacion_pct.costo_insumos} invertirColor />
            <KPI label="Gastos operativos" value={COP.format(gastos)} icon={TrendingDown} color="bg-rose-500"
                 pct={data.variacion_pct.gastos_operativos} invertirColor />
            <KPI label="Margen" value={COP.format(margen)} icon={Wallet}
                 color={margen >= 0 ? 'bg-emerald-500' : 'bg-rose-600'}
                 pct={data.variacion_pct.margen} />
          </div>

          <Card>
            <CardContent className="pt-5 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-muted-foreground uppercase tracking-wide">Del facturado al margen</span>
                <span className="text-muted-foreground">
                  Margen {facturado > 0 ? `${((margen / facturado) * 100).toFixed(1)}%` : '—'}
                </span>
              </div>
              {[
                { label: 'Facturado', valor: facturado, w: 100, cls: 'bg-blue-500' },
                { label: 'Costo insumos', valor: -costo, w: pctOf(costo), cls: 'bg-amber-400' },
                { label: 'Gastos operativos', valor: -gastos, w: pctOf(gastos), cls: 'bg-rose-400' },
                { label: 'Margen', valor: margen, w: pctOf(margen), cls: margen >= 0 ? 'bg-emerald-500' : 'bg-rose-600' },
              ].map((row) => (
                <div key={row.label} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 text-xs text-muted-foreground">{row.label}</span>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div className={cn('h-full rounded-full', row.cls)} style={{ width: `${row.w}%` }} />
                  </div>
                  <span className={cn('w-32 shrink-0 text-right text-xs font-semibold tabular-nums',
                    row.valor < 0 ? 'text-rose-600' : 'text-foreground')}>
                    {row.valor < 0 ? '−' : ''}{COP.format(Math.abs(row.valor))}
                  </span>
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground pt-1">
                Recaudado en el periodo: {COP.format(Number(data.actual.ingresos_recaudado))} · base: cobros facturados y
                gastos aprobados con fecha entre {data.periodo.inicio} y {data.periodo.fin}.
              </p>
            </CardContent>
          </Card>

          {data.por_sede && data.por_sede.length > 0 && (
            <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
              <div className="px-5 py-2.5 bg-muted/60 border-b text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                Por sede
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    <th className="text-left px-5 py-2">Sede</th>
                    <th className="text-right px-5 py-2">Facturado</th>
                    <th className="text-right px-5 py-2 hidden sm:table-cell">Costo insumos</th>
                    <th className="text-right px-5 py-2 hidden sm:table-cell">Gastos</th>
                    <th className="text-right px-5 py-2">Margen</th>
                    <th className="text-right px-5 py-2">%</th>
                  </tr>
                </thead>
                <tbody>
                  {data.por_sede.map((s) => {
                    const m = Number(s.margen)
                    return (
                      <tr key={s.sede_id} className="border-b border-gray-100 last:border-0 hover:bg-muted/30">
                        <td className="px-5 py-2.5 font-medium">{s.sede_nombre}</td>
                        <td className="px-5 py-2.5 text-right tabular-nums">{COP.format(Number(s.ingresos_facturado))}</td>
                        <td className="px-5 py-2.5 text-right tabular-nums hidden sm:table-cell text-amber-600">{COP.format(Number(s.costo_insumos))}</td>
                        <td className="px-5 py-2.5 text-right tabular-nums hidden sm:table-cell text-rose-600">{COP.format(Number(s.gastos_operativos))}</td>
                        <td className={cn('px-5 py-2.5 text-right tabular-nums font-semibold', m >= 0 ? 'text-emerald-600' : 'text-rose-600')}>{COP.format(m)}</td>
                        <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">{Number(s.margen_pct).toFixed(0)}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
