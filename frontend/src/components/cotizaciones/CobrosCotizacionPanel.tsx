'use client'

import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Clock, AlertCircle, XCircle, CreditCard } from 'lucide-react'
import { cobrosApi } from '@/lib/api/cobros'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import type { EstadoCobro, MedioPago, Cobro } from '@/types/cobros'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

const ESTADO_CONFIG: Record<EstadoCobro, { label: string; icon: React.ElementType; className: string }> = {
  pendiente:      { label: 'Pendiente',    icon: Clock,        className: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'  },
  pagado_parcial: { label: 'Pago parcial', icon: AlertCircle,  className: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'    },
  pagado:         { label: 'Pagado',       icon: CheckCircle2, className: 'bg-green-50 text-green-700 ring-1 ring-green-200' },
  anulado:        { label: 'Anulado',      icon: XCircle,      className: 'bg-gray-100 text-gray-500 ring-1 ring-gray-200'   },
}

const MEDIO_PAGO_LABEL: Record<MedioPago, string> = {
  efectivo:        'Efectivo',
  tarjeta_debito:  'Tarjeta débito',
  tarjeta_credito: 'Tarjeta crédito',
  transferencia:   'Transferencia',
  otro:            'Otro',
}

function EstadoBadge({ estado }: { estado: EstadoCobro }) {
  const cfg = ESTADO_CONFIG[estado]
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  )
}

function CobroRow({ cobro }: { cobro: Cobro }) {
  const saldo = parseFloat(cobro.saldo_pendiente)
  const total = parseFloat(cobro.total)

  return (
    <div className="rounded-lg border bg-gray-50/50 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <EstadoBadge estado={cobro.estado} />
          <span className="text-xs text-muted-foreground">
            {new Date(cobro.fecha).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
          {cobro.sede_nombre && (
            <span className="text-xs text-muted-foreground">· {cobro.sede_nombre}</span>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold tabular-nums">{COP.format(total)}</p>
          {saldo > 0 && (
            <p className="text-xs text-amber-600 tabular-nums">Saldo: {COP.format(saldo)}</p>
          )}
        </div>
      </div>

      {cobro.pagos.length > 0 && (
        <div className="space-y-1.5 pt-1 border-t">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pagos recibidos</p>
          {cobro.pagos.map((pago) => (
            <div key={pago.id} className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <CreditCard className="h-3 w-3 shrink-0" />
                {MEDIO_PAGO_LABEL[pago.medio_pago]}
                {pago.referencia && <span className="text-gray-400">· {pago.referencia}</span>}
              </span>
              <span className="tabular-nums font-medium text-foreground">{COP.format(parseFloat(pago.valor))}</span>
            </div>
          ))}
        </div>
      )}

      {cobro.pagos.length === 0 && cobro.estado === 'pendiente' && (
        <p className="text-xs text-muted-foreground italic pt-1 border-t">Sin pagos registrados aún</p>
      )}
    </div>
  )
}

interface CobrosCotizacionModalProps {
  cotizacionId: string
  open: boolean
  onClose: () => void
}

export function CobrosCotizacionModal({ cotizacionId, open, onClose }: CobrosCotizacionModalProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['cobros-cotizacion', cotizacionId],
    queryFn: () => cobrosApi.list({ cotizacion: cotizacionId, origen: 'cotizacion' }),
    enabled: open,
  })

  const cobros = data?.results ?? []
  const totalGeneral = cobros.reduce((s, c) => s + parseFloat(c.total), 0)
  const saldoGeneral = cobros.reduce((s, c) => s + parseFloat(c.saldo_pendiente), 0)

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-6">
            <DialogTitle>Cobros</DialogTitle>
            {cobros.length > 0 && (
              <div className="flex items-center gap-3 text-sm">
                <span className="text-muted-foreground">
                  Total: <span className="font-semibold text-foreground tabular-nums">{COP.format(totalGeneral)}</span>
                </span>
                {saldoGeneral > 0 ? (
                  <span className="text-amber-600">
                    Pendiente: <span className="font-semibold tabular-nums">{COP.format(saldoGeneral)}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-green-700 text-xs font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Al día
                  </span>
                )}
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <>
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </>
          ) : cobros.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-4 text-center">Sin cobros registrados</p>
          ) : (
            cobros.map((cobro) => <CobroRow key={cobro.id} cobro={cobro} />)
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
