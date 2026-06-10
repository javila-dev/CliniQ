'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { cobrosApi } from '@/lib/api/cobros'
import { agendaApi } from '@/lib/api/agenda'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Cita } from '@/types/agenda'
import type { MedioPago } from '@/types/cobros'

const MEDIO_PAGO_LABEL: Record<MedioPago, string> = {
  efectivo:        'Efectivo',
  tarjeta_debito:  'Tarjeta débito',
  tarjeta_credito: 'Tarjeta crédito',
  transferencia:   'Transferencia',
  otro:            'Otro',
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  cita: Cita
  // soloRegistrar: recepción registra cobro+pago sin iniciar la atención
  soloRegistrar?: boolean
}

export function IniciarPagoSheet({ open, onOpenChange, cita, soloRegistrar = false }: Props) {
  const router = useRouter()
  const qc = useQueryClient()
  const precioServicio = cita.servicio_precio ?? '0'

  const [medioPago, setMedioPago] = useState<MedioPago>('efectivo')
  const [valor, setValor] = useState(precioServicio)
  const [error, setError] = useState<string | null>(null)
  const [registrado, setRegistrado] = useState(false)

  const mut = useMutation({
    mutationFn: async () => {
      const cobro = await cobrosApi.create({
        cita: cita.id,
        paciente: cita.paciente,
        sede: cita.sede,
        ...(cita.servicio ? {
          items: [{
            tipo: 'servicio' as const,
            servicio: cita.servicio,
            precio_unitario: precioServicio,
            cantidad: '1',
          }],
        } : {}),
      })
      await cobrosApi.registrarPago(cobro.id, { medio_pago: medioPago, valor })
      if (!soloRegistrar) {
        return agendaApi.citas.cambiarEstado(cita.id, { estado: 'en_curso' })
      }
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['citas'] })
      if (!soloRegistrar && result) {
        router.push(`/atenciones/${result.id}`)
      } else {
        setRegistrado(true)
      }
    },
    onError: () => setError(
      soloRegistrar
        ? 'No se pudo registrar el cobro. Intenta de nuevo.'
        : 'No se pudo iniciar la atención. Intenta de nuevo.'
    ),
  })

  function handleSubmit() {
    if (valor === '' || valor === null) {
      setError('Ingresa el valor recibido (puede ser 0).')
      return
    }
    setError(null)
    mut.mutate()
  }

  function reset() {
    setMedioPago('efectivo')
    setValor(precioServicio)
    setError(null)
    setRegistrado(false)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{soloRegistrar ? 'Registrar cobro' : 'Registrar pago'}</DialogTitle>
        </DialogHeader>

        {registrado ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-green-500" />
            <div>
              <p className="font-semibold">Cobro registrado</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                El pago de {cita.paciente_nombre} quedó registrado correctamente.
              </p>
            </div>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
          </div>
        ) : (
          <>
            <div className="space-y-4 py-1">
              <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm">
                <p className="font-medium">{cita.paciente_nombre}</p>
                <p className="text-muted-foreground">{cita.servicio_nombre}</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="medio-pago">Medio de pago</Label>
                <Select value={medioPago} onValueChange={(v) => setMedioPago(v as MedioPago)}>
                  <SelectTrigger id="medio-pago"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(MEDIO_PAGO_LABEL) as [MedioPago, string][]).map(([k, label]) => (
                      <SelectItem key={k} value={k}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="valor-pago">Valor recibido</Label>
                <Input
                  id="valor-pago"
                  type="number"
                  min="0"
                  step="1000"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder="0"
                />
                <p className="text-xs text-muted-foreground">Ingresa 0 si el pago queda pendiente.</p>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-lg bg-destructive/8 border border-destructive/15 px-3.5 py-2.5">
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mut.isPending}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit} disabled={mut.isPending}>
                {mut.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                {soloRegistrar ? 'Confirmar cobro' : 'Iniciar atención'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
