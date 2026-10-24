'use client'

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, AlertTriangle, CheckCircle2, Lock, Plus, X } from 'lucide-react'
import { cobrosApi } from '@/lib/api/cobros'
import { agendaApi } from '@/lib/api/agenda'
import { useAuthStore } from '@/store/authStore'
import { hasPermission, PERM } from '@/lib/permissions'
import { mensajeErrorDeuda } from '@/lib/deuda'
import { mensajeDeError } from '@/lib/errores'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useFormasPago } from '@/hooks/useFormasPago'
import type { Cita } from '@/types/agenda'

export { cobroConPagos } from '@/lib/recepcion'

interface Props {
  cita: Cita
  soloRegistrar?: boolean
  onInicioExitoso?: (citaId: string) => void
  onRegistradoSinAvance?: () => void
  /** Modo wizard: solo registra cobro, no llama cambiarEstado, avanza sin pantalla intermedia */
  onPagoRegistrado?: () => void
  onCancel?: () => void
}

interface FilaPago {
  medio: string
  valor: string
}

const COP = new Intl.NumberFormat('es-CO')
const pesos = (n: number) => `$${COP.format(n)}`
const soloDigitos = (v: string) => v.replace(/\D/g, '')

export function PagoContent({ cita, soloRegistrar = false, onInicioExitoso, onRegistradoSinAvance, onPagoRegistrado, onCancel }: Props) {
  const qc = useQueryClient()
  const { user } = useAuthStore()

  const precioBase = cita.servicio_precio_base ?? null
  const precioInicial = soloDigitos(String(Math.round(Number(precioBase ?? cita.servicio_precio ?? 0))))
  const canCambiarPrecio = hasPermission(user, PERM.COBROS_CAMBIAR_PRECIO)
  // Sin procedimiento no hay ítem: el cobro queda en $0 y lo recibido fija el valor.
  const conProcedimiento = !!cita.servicio
  const costoEditable = conProcedimiento && (precioBase === null || canCambiarPrecio)
  const { formasPago, isLoading: cargandoFormas } = useFormasPago({ soloMedioReal: true })

  const [costoCita, setCostoCita] = useState(precioInicial)
  const [filas, setFilas] = useState<FilaPago[]>([{ medio: '', valor: precioInicial }])
  // Mientras haya un solo medio y no se haya tocado su valor, sigue al costo.
  const valorTocado = useRef(false)
  // Si el cobro ya quedó y falla lo que sigue (iniciar la atención), el reintento no lo repite.
  const cobroListo = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [registrado, setRegistrado] = useState(false)

  useEffect(() => {
    if (formasPago.length > 0 && filas.some((f) => !f.medio)) {
      setFilas((prev) => prev.map((f) => (f.medio ? f : { ...f, medio: formasPago[0].id })))
    }
  }, [formasPago, filas])

  const costo = Number(costoCita || 0)
  const recibido = filas.reduce((s, f) => s + Number(f.valor || 0), 0)
  const pendiente = conProcedimiento ? costo - recibido : 0
  const esParcial = conProcedimiento && recibido > 0 && pendiente > 0
  const seExcede = conProcedimiento && recibido > costo

  function cambiarCosto(valor: string) {
    const limpio = soloDigitos(valor)
    setCostoCita(limpio)
    if (filas.length === 1 && !valorTocado.current) {
      setFilas([{ ...filas[0], valor: limpio }])
    }
  }

  function cambiarFila(i: number, cambio: Partial<FilaPago>) {
    if (cambio.valor !== undefined) valorTocado.current = true
    setFilas((prev) => prev.map((f, j) => (j === i ? { ...f, ...cambio } : f)))
  }

  function agregarMedio() {
    valorTocado.current = true
    const usados = new Set(filas.map((f) => f.medio))
    const siguiente = formasPago.find((f) => !usados.has(f.id)) ?? formasPago[0]
    setFilas((prev) => [...prev, { medio: siguiente?.id ?? '', valor: pendiente > 0 ? String(pendiente) : '' }])
  }

  function quitarFila(i: number) {
    setFilas((prev) => prev.filter((_, j) => j !== i))
  }

  const mut = useMutation({
    mutationFn: async () => {
      if (!cobroListo.current) {
        // Cobro y pagos en una sola petición: si un pago falla no queda nada a medias.
        await cobrosApi.create({
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
          pagos: filas.map((f) => ({ medio_pago: f.medio, valor: f.valor })),
        })
        cobroListo.current = true
      }
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
      qc.invalidateQueries({ queryKey: ['citas'] })
      setError(
        mensajeErrorDeuda(err) ?? mensajeDeError(err,
          cobroListo.current
            ? 'El pago quedó registrado, pero no se pudo iniciar la atención. Intenta de nuevo.'
            : 'No se pudo registrar el cobro. Intenta de nuevo.',
        )
      )
    },
  })

  function handleSubmit() {
    if (!cobroListo.current) {
      if (formasPago.length === 0) {
        setError('No hay formas de pago activas. Pídele a un administrador que las configure.')
        return
      }
      if (conProcedimiento && costoEditable && costoCita === '') {
        setError('Ingresa el valor de la cita.')
        return
      }
      if (filas.some((f) => !f.medio || !(Number(f.valor) > 0))) {
        setError('Cada medio de pago necesita un valor mayor a $0.')
        return
      }
      if (seExcede) {
        setError(`Lo recibido (${pesos(recibido)}) supera el valor de la cita (${pesos(costo)}).`)
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

  const usadosPorFila = (i: number) => new Set(filas.filter((_, j) => j !== i).map((f) => f.medio))

  return (
    <div className="space-y-4">
      <div className="space-y-4 py-1">
        <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm">
          <p className="font-medium">{cita.paciente_nombre}</p>
          <p className="text-muted-foreground uppercase">{cita.servicio_nombre}</p>
        </div>

        {conProcedimiento && (
          <div className="space-y-1.5">
            <Label htmlFor="costo-cita">Valor de la cita</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">$</span>
              <Input
                id="costo-cita"
                inputMode="numeric"
                className={['pl-7 pr-8', costoEditable ? '' : 'bg-muted/50 cursor-not-allowed'].join(' ')}
                placeholder="0"
                value={costoCita ? COP.format(Number(costoCita)) : ''}
                readOnly={!costoEditable || cobroListo.current}
                onChange={(e) => { if (costoEditable) cambiarCosto(e.target.value) }}
              />
              {!costoEditable && (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <Lock className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
            {!costoEditable && (
              <p className="text-[11px] text-muted-foreground">Precio fijo del procedimiento. Para cambiarlo se necesita el permiso de cambiar precios.</p>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Label>{filas.length > 1 ? 'Medios de pago' : 'Medio de pago'}</Label>
          {!cargandoFormas && formasPago.length === 0 && (
            <p className="text-sm text-amber-700">No hay formas de pago activas. Pídele a un administrador que las configure.</p>
          )}
          {filas.map((fila, i) => (
            <div key={i} className="flex items-center gap-2">
              <Select value={fila.medio} onValueChange={(v) => cambiarFila(i, { medio: v })} disabled={cobroListo.current}>
                <SelectTrigger className="flex-1 min-w-0" aria-label={`Medio de pago ${i + 1}`}><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                <SelectContent>
                  {formasPago.filter((f) => !usadosPorFila(i).has(f.id)).map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative w-36 shrink-0">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">$</span>
                <Input
                  inputMode="numeric"
                  aria-label={`Valor recibido ${i + 1}`}
                  className="pl-7"
                  placeholder="0"
                  value={fila.valor ? COP.format(Number(fila.valor)) : ''}
                  readOnly={cobroListo.current}
                  onChange={(e) => cambiarFila(i, { valor: soloDigitos(e.target.value) })}
                />
              </div>
              {filas.length > 1 && !cobroListo.current && (
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => quitarFila(i)} aria-label="Quitar este medio">
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          {!cobroListo.current && filas.length < formasPago.length && (
            <button type="button" onClick={agregarMedio} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              <Plus className="h-3.5 w-3.5" /> Pagar con otro medio
            </button>
          )}
        </div>

        {conProcedimiento && (filas.length > 1 || esParcial || seExcede) && (
          <div className="rounded-lg border px-3.5 py-2.5 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">Recibido</span><span className="tabular-nums font-medium">{pesos(recibido)}</span></div>
            {esParcial && (
              <div className="flex justify-between text-amber-700"><span>Queda pendiente</span><span className="tabular-nums font-medium">{pesos(pendiente)}</span></div>
            )}
            {esParcial && (
              <p className="text-[11px] text-muted-foreground">El saldo queda por cobrar y se paga después desde Ingresos.</p>
            )}
          </div>
        )}

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
            : soloRegistrar || onPagoRegistrado
              ? (esParcial ? 'Registrar pago parcial' : 'Confirmar cobro')
              : 'Iniciar atención'
          }
        </Button>
      </div>
    </div>
  )
}
