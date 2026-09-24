import { Card, CardContent } from '@/components/ui/card'
import { cn, formatDate } from '@/lib/utils'
import type { Cartera } from '@/types/cartera'
import { estadoCartera, formatCOP } from './utils'

function Fila({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('tabular-nums font-medium text-right', className)}>{children}</dd>
    </div>
  )
}

/** Resumen financiero de la cartera: saldo, avance y datos clave en un solo panel. */
export function ResumenCarteraPanel({ cartera }: { cartera: Cartera }) {
  const total = Number(cartera.total)
  const cobrado = Number(cartera.total_pagado)
  const saldo = Number(cartera.saldo_pendiente)
  const vencido = Math.min(Number(cartera.mora_valor ?? 0), saldo)
  const pctCobrado = total > 0 ? Math.min(100, (cobrado / total) * 100) : 100
  const pctVencido = total > 0 ? Math.min(100 - pctCobrado, (vencido / total) * 100) : 0
  const estado = estadoCartera(cartera)

  return (
    <Card>
      <CardContent className="pt-5 space-y-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {estado === 'saldada' ? 'Cartera saldada' : 'Saldo pendiente'}
          </p>
          <p className={cn(
            'text-3xl font-semibold tabular-nums tracking-tight mt-1',
            estado === 'mora' && 'text-rose-600',
          )}>
            {formatCOP(saldo)}
          </p>
        </div>

        <div className="space-y-1.5">
          <div
            className="w-full h-2 rounded-full bg-muted overflow-hidden flex"
            role="img"
            aria-label={`Cobrado ${Math.round(pctCobrado)}% del total`}
          >
            <div className="h-full bg-emerald-500" style={{ width: `${pctCobrado}%` }} />
            {pctVencido > 0 && <div className="h-full bg-rose-500" style={{ width: `${pctVencido}%` }} />}
          </div>
          <p className="text-xs text-muted-foreground">
            {Math.round(pctCobrado)}% cobrado · {cartera.cuotas_pagadas} de {cartera.cuotas_total} cuotas pagadas
          </p>
        </div>

        <dl className="divide-y border-t">
          <Fila label="Total">{formatCOP(total)}</Fila>
          <Fila label="Cobrado">{formatCOP(cobrado)}</Fila>
          {vencido > 0 && (
            <Fila label={`Vencido · ${cartera.mora_dias} día${cartera.mora_dias !== 1 ? 's' : ''}`} className="text-rose-600">
              {formatCOP(vencido)}
            </Fila>
          )}
          {saldo > 0 && cartera.proxima_cuota_fecha && (
            <Fila label="Próxima cuota">
              <span className="block">{formatCOP(cartera.proxima_cuota_valor ?? 0)}</span>
              <span className="block text-xs font-normal text-muted-foreground">
                {formatDate(cartera.proxima_cuota_fecha)}
              </span>
            </Fila>
          )}
        </dl>
      </CardContent>
    </Card>
  )
}
