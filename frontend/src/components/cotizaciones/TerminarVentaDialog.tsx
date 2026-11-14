'use client'

// Terminar una venta que el paciente deja a medias (docs/plan-terminacion-ventas.md):
// no se agendan más sesiones, se decide qué pasa con las citas sin cerrar y con el
// saldo (perdonarlo o dejar un cobro de X).

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Loader2, RotateCcw } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { cotizacionesApi } from '@/lib/api/cotizaciones'
import { useFormasPago } from '@/hooks/useFormasPago'
import { toast } from '@/hooks/use-toast'
import { mensajeDeError } from '@/lib/errores'
import { cn, formatDateTime, formatFechaLocal } from '@/lib/utils'
import type { CitaSinCerrar, Cotizacion, MotivoTerminacion, TerminarVentaRequest } from '@/types/cotizaciones'

function cop(value: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value)
}

function hoyISO() {
  return new Date().toLocaleDateString('en-CA')
}

/** Refresca todo lo que cambia al terminar o reanudar una venta. */
function useRefrescarVenta(cotizacionId: string) {
  const queryClient = useQueryClient()
  return (data: Cotizacion) => {
    queryClient.setQueryData<Cotizacion>(['cotizacion', cotizacionId], (prev) => (prev ? { ...prev, ...data } : data))
    for (const key of [
      ['cotizacion', cotizacionId], ['cotizaciones'], ['ventas'], ['cotizacion-sesiones', cotizacionId],
      ['cartera'], ['citas'], ['seguimiento'],
    ]) {
      queryClient.invalidateQueries({ queryKey: key })
    }
  }
}

function OpcionTarjeta({
  activa, titulo, detalle, onClick,
}: { activa: boolean; titulo: string; detalle: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className={cn(
        'flex-1 rounded-lg border px-3 py-2.5 text-left transition-colors',
        activa ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border bg-white hover:bg-muted/50',
      )}
    >
      <span className="block text-sm font-medium">{titulo}</span>
      <span className="block text-xs text-muted-foreground mt-0.5">{detalle}</span>
    </button>
  )
}

function ListaCitas({ titulo, citas }: { titulo: string; citas: CitaSinCerrar[] }) {
  if (!citas.length) return null
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
      <ul className="divide-y rounded-md border text-xs">
        {citas.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
            <span className="min-w-0 truncate">{c.descripcion || 'Cita'}{c.profesional_nombre ? ` · ${c.profesional_nombre}` : ''}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{formatDateTime(c.fecha_inicio)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function TerminarVentaDialog({
  cotizacion,
  open,
  onOpenChange,
}: {
  cotizacion: Cotizacion
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const refrescar = useRefrescarVenta(cotizacion.id)
  const { formasPago } = useFormasPago()
  const [motivo, setMotivo] = useState<MotivoTerminacion | null>(null)
  const [nota, setNota] = useState('')
  const [accionCitas, setAccionCitas] = useState<'cancelar' | 'manual' | null>(null)
  const [modo, setModo] = useState<'perdonar' | 'cobrar' | null>(null)
  const [valor, setValor] = useState('')
  const [fecha, setFecha] = useState(hoyISO())
  const [formaPago, setFormaPago] = useState<string | null>(null)

  const { data: previa, isLoading, isError, error } = useQuery({
    queryKey: ['cotizacion-terminacion', cotizacion.id],
    queryFn: () => cotizacionesApi.terminacion(cotizacion.id),
    enabled: open,
    staleTime: 0,
  })

  const saldo = Number(previa?.saldo ?? 0)
  useEffect(() => {
    if (!open) {
      setMotivo(null); setNota(''); setAccionCitas(null); setModo(null)
      setValor(''); setFecha(hoyISO()); setFormaPago(null)
    }
  }, [open])
  useEffect(() => {
    if (previa) {
      setValor(saldo > 0 ? String(Math.round(saldo)) : '')
      setFormaPago(previa.forma_pago_sugerida)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previa])

  const { mutate: terminar, isPending } = useMutation({
    mutationFn: (data: TerminarVentaRequest) => cotizacionesApi.terminar(cotizacion.id, data),
    onSuccess: (data) => {
      refrescar(data)
      toast.success('Venta terminada', 'Ya no se agendan más sesiones de esta venta.')
      onOpenChange(false)
    },
    onError: (err) => toast.error('No se pudo terminar la venta', mensajeDeError(err)),
  })

  const citas = previa?.citas
  const cancelables = citas ? citas.agendadas.length + citas.sin_cerrar.length : 0
  const enAtencion = citas?.en_atencion.length ?? 0
  const valorNum = Number(valor || 0)
  const cobroParcial = modo === 'cobrar' && valorNum > 0 && valorNum < saldo

  const faltante =
    !motivo ? 'Elige el motivo.'
      : motivo === 'otro' && !nota.trim() ? 'Escribe el motivo.'
        : cancelables > 0 && !accionCitas ? 'Elige qué hacer con las citas.'
          : saldo > 0 && !modo ? 'Elige qué pasa con el saldo.'
            : modo === 'cobrar' && (valorNum <= 0 || valorNum > saldo) ? `El valor debe estar entre 1 y ${cop(saldo)}.`
              : cobroParcial && (!fecha || fecha < hoyISO()) ? 'Elige la fecha del cobro (desde hoy).'
                : cobroParcial && !formaPago ? 'Elige la forma de pago.'
                  : previa?.acuerdo_pendiente ? 'Hay un acuerdo de pago pendiente de firma: anúlalo primero.'
                    : null

  function confirmar() {
    if (faltante || !motivo) return
    terminar({
      motivo,
      nota: nota.trim(),
      citas: cancelables > 0 ? accionCitas : null,
      modo: saldo > 0 ? modo : null,
      valor: modo === 'cobrar' ? String(valorNum) : null,
      fecha: cobroParcial ? fecha : null,
      forma_pago: cobroParcial ? formaPago : null,
    })
  }

  const sesionesPendientes = previa?.sesiones.reduce((a, s) => a + s.pendientes, 0) ?? 0

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isPending) onOpenChange(v) }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Terminar venta</DialogTitle>
          <DialogDescription>
            {cotizacion.paciente_nombre} no va a continuar. La venta sigue contando como vendida, pero ya no se
            agendan más sesiones.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : isError || !previa ? (
          <p className="text-sm text-destructive">{mensajeDeError(error, 'No se pudo cargar la venta.')}</p>
        ) : (
          <div className="space-y-5">
            {/* Sesiones */}
            {previa.sesiones.length > 0 && (
              <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm">
                {previa.sesiones.map((s) => (
                  <p key={s.item_id} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate">{s.descripcion}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{s.hechas} de {s.total} hechas</span>
                  </p>
                ))}
                {sesionesPendientes > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {sesionesPendientes === 1 ? 'La sesión que falta no se va a agendar.' : `Las ${sesionesPendientes} sesiones que faltan no se van a agendar.`}
                  </p>
                )}
              </div>
            )}

            {/* Motivo */}
            <div className="space-y-2">
              <Label>Motivo</Label>
              <div className="flex flex-wrap gap-2">
                {previa.motivos.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMotivo(m.value)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-sm transition-colors',
                      motivo === m.value ? 'border-primary bg-primary text-white' : 'border-border bg-white hover:bg-muted',
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <Textarea
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder={motivo === 'otro' ? 'Cuéntanos el motivo' : 'Nota (opcional)'}
                rows={2}
                maxLength={2000}
              />
            </div>

            {/* Citas */}
            {(cancelables > 0 || enAtencion > 0) && citas && (
              <div className="space-y-2">
                <Label>Citas sin cerrar</Label>
                <ListaCitas titulo="Agendadas" citas={citas.agendadas} />
                <ListaCitas titulo="De días pasados, sin marcar como atendidas" citas={citas.sin_cerrar} />
                {cancelables > 0 && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <OpcionTarjeta
                      activa={accionCitas === 'cancelar'}
                      titulo="Cancelarlas ahora"
                      detalle={cancelables === 1 ? 'Se cancela con el motivo de la terminación.' : `Se cancelan las ${cancelables} con el motivo de la terminación.`}
                      onClick={() => setAccionCitas('cancelar')}
                    />
                    <OpcionTarjeta
                      activa={accionCitas === 'manual'}
                      titulo="Las manejo yo"
                      detalle="Quedan como están: se pueden atender, reprogramar o cancelar desde la agenda."
                      onClick={() => setAccionCitas('manual')}
                    />
                  </div>
                )}
                {enAtencion > 0 && (
                  <div className="space-y-1">
                    <ListaCitas titulo="En atención ahora" citas={citas.en_atencion} />
                    <p className="text-xs text-muted-foreground">
                      {enAtencion === 1 ? 'Esta cita no se cancela' : 'Estas citas no se cancelan'}: se cierran desde la agenda o la atención.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Saldo */}
            {saldo > 0 && (
              <div className="space-y-2">
                <Label>Saldo pendiente: {cop(saldo)}</Label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <OpcionTarjeta
                    activa={modo === 'perdonar'}
                    titulo="Perdonar el saldo"
                    detalle="La deuda queda en 0 y se levanta la mora."
                    onClick={() => setModo('perdonar')}
                  />
                  <OpcionTarjeta
                    activa={modo === 'cobrar'}
                    titulo="Cobrar un valor"
                    detalle="El paciente sigue debiendo lo que acuerden."
                    onClick={() => setModo('cobrar')}
                  />
                </div>
                {modo === 'cobrar' && (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label htmlFor="terminar-valor" className="text-xs">Valor a cobrar</Label>
                      <Input
                        id="terminar-valor"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={saldo}
                        value={valor}
                        onChange={(e) => setValor(e.target.value)}
                      />
                    </div>
                    {cobroParcial && (
                      <>
                        <div className="space-y-1">
                          <Label htmlFor="terminar-fecha" className="text-xs">Fecha del cobro</Label>
                          <Input id="terminar-fecha" type="date" min={hoyISO()} value={fecha} onChange={(e) => setFecha(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="terminar-forma-pago" className="text-xs">Forma de pago</Label>
                          <Select value={formaPago ?? undefined} onValueChange={setFormaPago}>
                            <SelectTrigger id="terminar-forma-pago"><SelectValue placeholder="Elegir" /></SelectTrigger>
                            <SelectContent>
                              {formasPago.map((f) => <SelectItem key={f.id} value={f.id}>{f.nombre}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}
                    <p className="sm:col-span-3 text-xs text-muted-foreground">
                      {valorNum >= saldo
                        ? 'El plan de cuotas queda como está.'
                        : valorNum > 0
                          ? `Las cuotas pendientes se cierran y queda una sola cuota de ${cop(valorNum)}. Se perdonan ${cop(saldo - valorNum)}.`
                          : null}
                    </p>
                  </div>
                )}
              </div>
            )}

            {previa.oportunidades_abiertas > 0 && (
              <p className="text-xs text-muted-foreground">
                También se cierra{previa.oportunidades_abiertas === 1 ? ' su seguimiento abierto' : `n sus ${previa.oportunidades_abiertas} seguimientos abiertos`}.
              </p>
            )}

            {previa.acuerdo_pendiente && (
              <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                Hay un acuerdo de pago pendiente de firma. Anúlalo en Cartera antes de terminar la venta.
              </p>
            )}

            {/* Lo que falta para poder terminar, a la vista (no solo en un tooltip). */}
            {faltante && <p className="text-xs text-muted-foreground text-right">{faltante}</p>}

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={isPending}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                disabled={isPending || !!faltante}
                onClick={confirmar}
              >
                {isPending ? 'Terminando…' : 'Terminar venta'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Aviso en el detalle de una venta terminada, con "Reanudar" si no se perdonó nada. */
export function VentaTerminadaBanner({ cotizacion, puedeGestionar }: { cotizacion: Cotizacion; puedeGestionar: boolean }) {
  const refrescar = useRefrescarVenta(cotizacion.id)
  const [confirmar, setConfirmar] = useState(false)
  const { mutate: reanudar, isPending } = useMutation({
    mutationFn: () => cotizacionesApi.reanudar(cotizacion.id),
    onSuccess: (data) => {
      refrescar(data)
      setConfirmar(false)
      toast.success('Venta reanudada', 'Ya se pueden agendar las sesiones que faltan.')
    },
    onError: (err) => toast.error('No se pudo reanudar', mensajeDeError(err)),
  })
  if (!cotizacion.terminada_en) return null
  const perdonado = Number(cotizacion.valor_perdonado ?? 0)

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border bg-white px-5 py-4">
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-sm font-semibold">Venta terminada</p>
        <p className="text-xs text-muted-foreground">
          El {formatFechaLocal(cotizacion.terminada_en.slice(0, 10))}
          {cotizacion.terminada_por_nombre ? ` por ${cotizacion.terminada_por_nombre}` : ''}
          {cotizacion.motivo_terminacion_display ? ` · ${cotizacion.motivo_terminacion_display}` : ''}
          {cotizacion.nota_terminacion ? `: ${cotizacion.nota_terminacion}` : ''}
        </p>
        <p className="text-xs text-muted-foreground">
          Ya no se agendan más sesiones.
          {perdonado > 0 ? ` Se perdonaron ${cop(perdonado)} del saldo.` : ''}
        </p>
      </div>
      {puedeGestionar && cotizacion.puede_reanudar && (
        <Button size="sm" variant="outline" className="shrink-0" onClick={() => setConfirmar(true)} disabled={isPending}>
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
          Reanudar
        </Button>
      )}
      <ConfirmDialog
        open={confirmar}
        onOpenChange={setConfirmar}
        title="¿Reanudar la venta?"
        description="Se vuelven a poder agendar las sesiones que faltan. Las citas que se cancelaron al terminarla no vuelven: agéndalas de nuevo."
        confirmLabel="Reanudar"
        loading={isPending}
        onConfirm={() => reanudar()}
      />
    </div>
  )
}
