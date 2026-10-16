'use client'

import { Banknote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

export type AccionCobro = 'mantener' | 'anular'

/** Lo que responde el backend al cancelar una cita que ya tiene pagos. */
export interface CobroDeLaCita {
  total_pagado: string
  puede_anular: boolean
}

/** El backend respondió CITA_CON_COBRO_PAGADO: datos para preguntar qué hacer. */
export function cobroDeLaCitaDelError(err: unknown): CobroDeLaCita | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (err as any)?.response?.data
  if (data?.code !== 'CITA_CON_COBRO_PAGADO') return null
  return { total_pagado: data.cobro?.total_pagado ?? '0', puede_anular: Boolean(data.puede_anular) }
}

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

/** Cancelar una cita ya cobrada: se pregunta si el cobro se mantiene o se anula
 *  (decisión del 15/10/2026). Antes el ingreso quedaba cobrado sin aviso. */
export function CancelarConCobroDialog({
  cobro, enviando, onElegir, onCerrar,
}: {
  cobro: CobroDeLaCita | null
  enviando: boolean
  onElegir: (accion: AccionCobro) => void
  onCerrar: () => void
}) {
  return (
    <Dialog open={cobro !== null} onOpenChange={(o) => { if (!o && !enviando) onCerrar() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-amber-600" />
            Esta cita ya tiene un cobro
          </DialogTitle>
          <DialogDescription>
            El paciente pagó {cobro ? COP.format(Number(cobro.total_pagado)) : ''} por esta cita. ¿Qué hacemos con el
            cobro al cancelarla?
          </DialogDescription>
        </DialogHeader>
        {cobro && !cobro.puede_anular && (
          <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            Tu rol no puede anular cobros: la cita se cancela y el cobro queda como está. Si hay que devolver el dinero,
            pídeselo a quien maneja los ingresos.
          </p>
        )}
        {/* En columna: tres botones en fila no caben y el último se salía del diálogo. */}
        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          {cobro?.puede_anular && (
            <Button className="w-full" variant="destructive" disabled={enviando} onClick={() => onElegir('anular')}>
              Cancelar y anular el cobro
            </Button>
          )}
          <Button className="w-full" variant="outline" disabled={enviando} onClick={() => onElegir('mantener')}>
            Cancelar y mantener el cobro
          </Button>
          <Button className="w-full" variant="ghost" disabled={enviando} onClick={onCerrar}>Volver</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
