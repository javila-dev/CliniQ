'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { formatFechaLocal } from '@/lib/utils'

/** Al aceptar una cotización vencida: aceptarla igual o renovar su vigencia. */
export function CotizacionVencidaDialog({
  fechaVencimiento,
  onOpenChange,
  loading,
  onAceptarIgual,
  onRenovar,
}: {
  fechaVencimiento: string | null
  onOpenChange: (v: boolean) => void
  loading?: boolean
  onAceptarIgual: () => void
  onRenovar: () => void
}) {
  return (
    <Dialog open={fechaVencimiento !== null} onOpenChange={(v) => { if (!loading) onOpenChange(v) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Esta cotización ya venció</DialogTitle>
          <DialogDescription>
            Venció el {fechaVencimiento ? formatFechaLocal(fechaVencimiento) : ''}. Si el paciente la acepta con
            estos precios, acéptala igual. Si quieres darle más días antes de cerrar, renuévala.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={onRenovar} disabled={loading}>
            Renovar vigencia
          </Button>
          <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={onAceptarIgual} disabled={loading}>
            {loading ? 'Procesando…' : 'Aceptar igual'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
