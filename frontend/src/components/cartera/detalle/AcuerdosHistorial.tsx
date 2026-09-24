import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn, formatDate } from '@/lib/utils'
import type { AcuerdoEstado, AcuerdoPago } from '@/types/cartera'
import { formatCOP } from './utils'

const DOT: Record<AcuerdoEstado, string> = {
  vigente: 'bg-emerald-500',
  pendiente_firma: 'bg-amber-500',
  requiere_revision: 'bg-rose-500',
  anulado: 'bg-muted-foreground/40',
}

export function AcuerdosHistorial({ acuerdos }: { acuerdos: AcuerdoPago[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Acuerdos de pago</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <ol className="space-y-4">
          {acuerdos.map((a) => (
            <li key={a.id} className="relative pl-4">
              <span className={cn('absolute left-0 top-1.5 h-1.5 w-1.5 rounded-full', DOT[a.estado])} />
              <div className="flex items-baseline justify-between gap-3">
                <p className={cn('text-sm font-medium', a.estado === 'anulado' && 'text-muted-foreground line-through decoration-muted-foreground/40')}>
                  N.° {a.numero}
                </p>
                <span className="text-xs text-muted-foreground">{a.estado_display}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatDate(a.created_at)}
                {a.creado_por_nombre ? ` · ${a.creado_por_nombre}` : ''}
                {' · saldo '}
                <span className="tabular-nums">{formatCOP(a.saldo_al_proponer)}</span>
              </p>
              {a.motivo && <p className="text-xs mt-1 line-clamp-2" title={a.motivo}>{a.motivo}</p>}
              {a.vigente_desde && (
                <p className="text-xs text-muted-foreground mt-0.5">Vigente desde {formatDate(a.vigente_desde)}</p>
              )}
              {a.estado === 'anulado' && a.motivo_anulacion && (
                <p className="text-xs text-muted-foreground mt-0.5">Cancelado: {a.motivo_anulacion}</p>
              )}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}
