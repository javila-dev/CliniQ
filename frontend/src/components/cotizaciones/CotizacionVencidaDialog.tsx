'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { formatFechaLocal } from '@/lib/utils'

/**
 * Al registrar la venta de una cotización vencida: confirmar que se vende con
 * esos precios. Renovar la vigencia sin vender queda en el botón de la cabecera.
 */
export function CotizacionVencidaDialog({
  fechaVencimiento,
  onOpenChange,
  loading,
  onAceptarIgual,
}: {
  fechaVencimiento: string | null
  onOpenChange: (v: boolean) => void
  loading?: boolean
  onAceptarIgual: () => void
}) {
  return (
    <Dialog open={fechaVencimiento !== null} onOpenChange={(v) => { if (!loading) onOpenChange(v) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Esta cotización ya venció</DialogTitle>
          <DialogDescription>
            Venció el {fechaVencimiento ? formatFechaLocal(fechaVencimiento) : ''}. Si el cliente acepta estos
            precios, registra la venta igual. Si hay que cambiar algún precio, cancela y edítalo antes.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={onAceptarIgual} disabled={loading}>
            {loading ? 'Procesando…' : 'Registrar venta igual'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
