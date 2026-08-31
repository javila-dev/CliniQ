'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, AlertTriangle, CheckCircle2, Lock } from 'lucide-react'
import { cobrosApi } from '@/lib/api/cobros'
import { agendaApi } from '@/lib/api/agenda'
import { useAuthStore } from '@/store/authStore'
import { hasPermission, PERM } from '@/lib/permissions'
import { toast } from '@/hooks/use-toast'
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
  cita: Cita
  soloRegistrar?: boolean
  onInicioExitoso?: (citaId: string) => void
  onRegistradoSinAvance?: () => void
  /** Modo wizard: solo registra cobro, no llama cambiarEstado, avanza sin pantalla intermedia */
  onPagoRegistrado?: () => void
  onCancel?: () => void
}

export function PagoContent({ cita, soloRegistrar = false, onInicioExitoso, onRegistradoSinAvance, onPagoRegistrado, onCancel }: Props) {
  const qc = useQueryClient()
  const { user } = useAuthStore()

  const precioBase = cita.servicio_precio_base ?? null
  const precioInicial = precioBase ?? cita.servicio_precio ?? '0'
  const canCambiarPrecio = hasPermission(user, PERM.COBROS_CAMBIAR_PRECIO)
  const precioBloqueado = precioBase !== null && !canCambiarPrecio

  const [medioPago, setMedioPago] = useState<MedioPago>('efectivo')
  const [costoCita, setCostoCita] = useState(precioInicial)
  const [valorCobrado, setValorCobrado] = useState(precioInicial)
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
            precio_unitario: costoCita,
            cantidad: '1',
          }],
        } : {}),
      })
      await cobrosApi.registrarPago(cobro.id, {
        medio_pago: medioPago,
        valor: precioBloqueado ? precioBase! : valorCobrado,
      })
      // Solo llama cambiarEstado si no estamos en modo wizard (onPagoRegistrado) ni soloRegistrar
      if (!soloRegistrar && !onPagoRegistrado) {
        return agendaApi.citas.cambiarEstado(cita.id, { estado: 'en_curso' })
      }
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['citas'] })
      if (onPagoRegistrado) {
        onPagoRegistrado()
      } else if (!soloRegistrar && result) {
        onInicioExitoso?.(result.id)
      } else {
        setRegistrado(true)
      }
    },
    onError: (err: unknown) => {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 403) {
        toast.error('Sin permiso', 'No tienes permiso para modificar el precio de este cobro.')
        return
      }
      setError(
        soloRegistrar || onPagoRegistrado
          ? 'No se pudo registrar el cobro. Intenta de nuevo.'
          : 'No se pudo iniciar la atención. Intenta de nuevo.'
      )
    },
  })

  function handleSubmit() {
    if (!precioBloqueado) {
      if (valorCobrado === '' || valorCobrado === null) {
        setError('Ingresa el valor cobrado.')
        return
      }
      if (Number(valorCobrado) < Number(costoCita)) {
        setError('El valor cobrado no puede ser menor al costo de la cita.')
        return
      }
    }
    setError(null)
    mut.mutate()
  }

  if (registrado) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <CheckCircle2 className="h-10 w-10 text-green-500" />
        <div>
          <p className="font-semibold">Cobro registrado</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            El pago de {cita.paciente_nombre} quedó registrado correctamente.
          </p>
        </div>
        <Button variant="outline" onClick={() => onRegistradoSinAvance?.()}>Cerrar</Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
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
          <Label htmlFor="costo-cita">Costo de la cita</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">$</span>
            <Input
              id="costo-cita"
              inputMode="numeric"
              className="pl-7 pr-8 bg-muted/50 cursor-not-allowed"
              placeholder="0"
              value={costoCita ? new Intl.NumberFormat('es-CO').format(Number(costoCita)) : ''}
              readOnly
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="valor-cobrado">Valor cobrado</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">$</span>
            <Input
              id="valor-cobrado"
              inputMode="numeric"
              className={['pl-7', precioBloqueado ? 'bg-muted/50 cursor-not-allowed' : ''].join(' ')}
              placeholder="0"
              value={precioBloqueado
                ? new Intl.NumberFormat('es-CO').format(Number(precioBase))
                : valorCobrado ? new Intl.NumberFormat('es-CO').format(Number(valorCobrado)) : ''
              }
              readOnly={precioBloqueado}
              onChange={(e) => {
                if (!precioBloqueado) setValorCobrado(e.target.value.replace(/\D/g, ''))
              }}
            />
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/8 border border-destructive/15 px-3.5 py-2.5">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        {onCancel && (
          <Button variant="outline" onClick={onCancel} disabled={mut.isPending}>
            Cancelar
          </Button>
        )}
        <Button onClick={handleSubmit} disabled={mut.isPending}>
          {mut.isPending
            ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Procesando...</>
            : soloRegistrar || onPagoRegistrado ? 'Confirmar cobro' : 'Iniciar atención'
          }
        </Button>
      </div>
    </div>
  )
}
