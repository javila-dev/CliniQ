'use client'

import { use, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  ArrowLeft, CheckCircle2, Clock, AlertCircle, CreditCard, Pencil,
  FileSignature, Ban, Send, RefreshCw, Loader2, HandCoins,
} from 'lucide-react'
import { carteraApi } from '@/lib/api/cartera'
import { consentimientosApi } from '@/lib/api/consentimientos'
import { useAuthStore } from '@/store/authStore'
import { hasPermission, PERM } from '@/lib/permissions'
import { toast } from '@/hooks/use-toast'
import { NuevoAcuerdoPagoModal } from '@/components/cartera/NuevoAcuerdoPagoModal'
import { CompromisoPagoFirmaContent } from '@/components/consentimientos/CompromisoPagoFirmaContent'
import { PageHeader } from '@/components/shared/PageHeader'
import { LoadingState } from '@/components/shared/LoadingState'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { formatDate, todayISO } from '@/lib/utils'
import type { CuotaCartera } from '@/types/cartera'

function formatCOP(value: string | number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0,
  }).format(Number(value))
}

const pagoSchema = z.object({
  valor_pagado: z.number().positive('Debe ser mayor a 0'),
  fecha_pago: z.string().min(1, 'Requerido'),
  medio_pago: z.string().min(1, 'Selecciona un medio'),
  observaciones: z.string().optional(),
})

type PagoForm = z.infer<typeof pagoSchema>

function saldoCuota(cuota: CuotaCartera): number {
  return Number(cuota.saldo_pendiente ?? cuota.valor_esperado)
}

function estadoCuota(cuota: CuotaCartera): 'pagada' | 'vencida' | 'pendiente' | 'parcial' {
  if (saldoCuota(cuota) <= 0) return 'pagada'
  // Comparación por fecha "solo día" para no marcar como vencida una cuota
  // que vence hoy (new Date("YYYY-MM-DD") es medianoche UTC).
  const atrasada = Boolean(cuota.fecha_esperada && cuota.fecha_esperada.slice(0, 10) < todayISO())
  if (atrasada) return 'vencida'
  if (Number(cuota.valor_pagado ?? 0) > 0) return 'parcial'
  return 'pendiente'
}

function CuotaBadge({ cuota }: { cuota: CuotaCartera }) {
  const estado = estadoCuota(cuota)
  if (estado === 'pagada')
    return <Badge variant="success" className="text-xs gap-1"><CheckCircle2 className="h-3 w-3" />Pagada</Badge>
  if (estado === 'vencida')
    return <Badge variant="destructive" className="text-xs gap-1"><AlertCircle className="h-3 w-3" />Vencida</Badge>
  if (estado === 'parcial')
    return <Badge variant="warning" className="text-xs gap-1"><Clock className="h-3 w-3" />Abono parcial</Badge>
  return <Badge variant="secondary" className="text-xs gap-1"><Clock className="h-3 w-3" />Pendiente</Badge>
}

function FechaVencimientoEditor({
  cuota,
  carteraId,
}: {
  cuota: CuotaCartera
  carteraId: string
}) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(cuota.fecha_esperada ?? '')

  const { mutate, isPending } = useMutation({
    mutationFn: (fecha: string) => carteraApi.patchCuota(cuota.id, { fecha_vencimiento: fecha }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cartera', carteraId] })
      toast.success('Fecha actualizada')
      setEditing(false)
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail ?? err?.response?.data?.error ?? 'No se pudo actualizar la fecha'
      toast.error('Error', msg)
      setEditing(false)
      setDraft(cuota.fecha_esperada ?? '')
    },
  })

  function commit() {
    if (!draft || draft === cuota.fecha_esperada) { setEditing(false); return }
    mutate(draft)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="date"
        value={draft}
        disabled={isPending}
        className="text-xs border border-primary rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary w-32"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          if (e.key === 'Escape') { setEditing(false); setDraft(cuota.fecha_esperada ?? '') }
        }}
        autoFocus
      />
    )
  }

  return (
    <span className="inline-flex items-center gap-1 group/fecha">
      {cuota.fecha_esperada ? formatDate(cuota.fecha_esperada) : '—'}
      <button
        type="button"
        onClick={() => { setDraft(cuota.fecha_esperada ?? ''); setEditing(true) }}
        className="opacity-0 group-hover/fecha:opacity-100 transition-opacity text-muted-foreground hover:text-primary"
        title="Editar fecha de vencimiento"
      >
        <Pencil className="h-3 w-3" />
      </button>
    </span>
  )
}

function RegistrarPagoModal({
  cuota,
  open,
  onOpenChange,
  carteraId,
}: {
  cuota: CuotaCartera
  open: boolean
  onOpenChange: (v: boolean) => void
  carteraId: string
}) {
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)

  const { register, handleSubmit, reset, formState: { errors }, setValue } = useForm<PagoForm>({
    resolver: zodResolver(pagoSchema),
    defaultValues: {
      valor_pagado: parseFloat(cuota.saldo_pendiente ?? cuota.valor_esperado) || undefined,
      fecha_pago: todayISO(),
      medio_pago: '',
      observaciones: '',
    },
  })

  const { mutate, isPending } = useMutation({
    mutationFn: (data: PagoForm) => carteraApi.registrarPago(cuota.id, {
      valor_pagado: data.valor_pagado,
      fecha_pago: data.fecha_pago,
      medio_pago: data.medio_pago,
      observaciones: data.observaciones || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cartera', carteraId] })
      queryClient.invalidateQueries({ queryKey: ['cartera-resumen'] })
      queryClient.invalidateQueries({ queryKey: ['cartera'] })
      onOpenChange(false)
      reset()
    },
    onError: (err: any) => {
      const data = err?.response?.data
      if (data?.detail) { setServerError(String(data.detail)); return }
      if (data?.error) { setServerError(String(data.error)); return }
      setServerError('Error al registrar el pago')
    },
  })

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { reset(); setServerError(null) } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit((d) => { setServerError(null); mutate(d) })} className="space-y-4">
          <div className="rounded-md bg-muted/40 border px-3 py-2 text-sm">
            <p className="font-medium">{cuota.descripcion || cuota.tipo}</p>
            {cuota.fecha_esperada && (
              <p className="text-xs text-muted-foreground mt-0.5">Vence: {formatDate(cuota.fecha_esperada)}</p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">Esperado: {formatCOP(cuota.valor_esperado)}</p>
            {Number(cuota.valor_pagado ?? 0) > 0 && (
              <p className="text-xs text-amber-600 mt-0.5">
                Ya abonado: {formatCOP(cuota.valor_pagado ?? 0)} · Saldo: {formatCOP(cuota.saldo_pendiente ?? cuota.valor_esperado)}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Valor pagado *</Label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
              <Input
                type="number"
                step="1"
                min="0"
                placeholder="0"
                className="pl-6"
                {...register('valor_pagado', { valueAsNumber: true })}
              />
            </div>
            {errors.valor_pagado && <p className="text-xs text-destructive">{errors.valor_pagado.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Fecha de pago *</Label>
            <Input type="date" {...register('fecha_pago')} />
            {errors.fecha_pago && <p className="text-xs text-destructive">{errors.fecha_pago.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Medio de pago *</Label>
            <Select onValueChange={(v) => setValue('medio_pago', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="efectivo">Efectivo</SelectItem>
                <SelectItem value="transferencia">Transferencia</SelectItem>
                <SelectItem value="tarjeta">Tarjeta débito/crédito</SelectItem>
                <SelectItem value="datafono">Datáfono</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
              </SelectContent>
            </Select>
            {errors.medio_pago && <p className="text-xs text-destructive">{errors.medio_pago.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Observaciones</Label>
            <Textarea rows={2} placeholder="Notas adicionales…" {...register('observaciones')} />
          </div>

          {serverError && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
              <p className="text-sm text-destructive">{serverError}</p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Guardando…' : 'Registrar pago'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function DetalleCarteraPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const canModificarPlazo = hasPermission(user, PERM.CARTERA_MODIFICAR_PLAZO)
  const [cuotaSeleccionada, setCuotaSeleccionada] = useState<CuotaCartera | null>(null)
  const [showNuevoAcuerdo, setShowNuevoAcuerdo] = useState(false)
  const [showFirmaAcuerdo, setShowFirmaAcuerdo] = useState(false)

  const { data: cartera, isLoading } = useQuery({
    queryKey: ['cartera', id],
    queryFn: () => carteraApi.get(id),
  })

  const acuerdoPendiente = cartera?.acuerdo_pendiente ?? null

  const anularAcuerdo = useMutation({
    mutationFn: () => {
      const motivo = window.prompt('Motivo de la cancelación del acuerdo:')?.trim()
      if (!motivo) return Promise.reject(new Error('cancelado'))
      return carteraApi.anularAcuerdo(acuerdoPendiente!.id, motivo)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cartera', id] })
      toast.success('Acuerdo cancelado', 'Puedes crear uno nuevo o registrar pagos normalmente.')
    },
    onError: (e: any) => { if (e?.message !== 'cancelado') toast.error('No se pudo cancelar', e?.response?.data?.error ?? 'Intenta de nuevo.') },
  })

  const verificarFirma = useMutation({
    mutationFn: () => carteraApi.verificarFirmaAcuerdo(acuerdoPendiente!.id),
    onSuccess: (a) => {
      queryClient.invalidateQueries({ queryKey: ['cartera', id] })
      if (a.estado === 'vigente') toast.success('Acuerdo vigente', 'El plan de cartera fue actualizado.')
      else if (a.estado === 'requiere_revision') toast.error('Requiere revisión', 'El saldo cambió respecto a la propuesta. Cancela el acuerdo y crea uno nuevo.')
      else toast({ title: 'Todavía sin firmar', description: 'El paciente aún no ha firmado el acta.' })
    },
    onError: () => toast.error('No se pudo verificar', 'Intenta de nuevo en un momento.'),
  })

  const reenviarLink = useMutation({
    mutationFn: () => consentimientosApi.enviarLinkDocumenso(acuerdoPendiente!.documento!.id),
    onSuccess: (info) => toast.success(
      info.enviado ? 'Link reenviado' : 'Link listo',
      info.enviado ? `Se envió por WhatsApp a ${info.telefono}.` : 'El paciente no tiene teléfono; abre "Firmar" para copiar el enlace.',
    ),
    onError: (e: any) => toast.error('No se pudo reenviar', e?.response?.data?.error ?? 'Intenta de nuevo.'),
  })

  if (isLoading) return <div className="p-8"><LoadingState rows={8} /></div>
  if (!cartera) return null

  const saldoPct = cartera.total !== '0'
    ? Math.round((Number(cartera.total_pagado) / Number(cartera.total)) * 100)
    : 100
  const puedeCrearAcuerdo = canModificarPlazo && Number(cartera.saldo_pendiente) > 0 && !acuerdoPendiente

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/cartera">
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Cartera
          </Link>
        </Button>
      </div>

      <PageHeader
        title={cartera.paciente_nombre}
        description={`Cotización #${cartera.cotizacion_id.slice(0, 8)}`}
      />

      {/* Resumen financiero */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Total cotizado</p>
            <p className="text-2xl font-bold tabular-nums mt-1">{formatCOP(cartera.total)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Total cobrado</p>
            <p className="text-2xl font-bold tabular-nums mt-1 text-emerald-600">{formatCOP(cartera.total_pagado)}</p>
            <div className="mt-2 w-full h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${saldoPct}%` }} />
            </div>
            <p className="text-xs text-muted-foreground mt-1">{saldoPct}% cobrado</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Saldo pendiente</p>
            <p className={`text-2xl font-bold tabular-nums mt-1 ${
              Number(cartera.saldo_pendiente) <= 0
                ? 'text-emerald-600'
                : cartera.en_mora ? 'text-rose-600' : 'text-amber-600'
            }`}>
              {formatCOP(cartera.saldo_pendiente)}
            </p>
            {cartera.en_mora ? (
              <Badge variant="destructive" className="text-xs gap-1 mt-1">
                <AlertCircle className="h-3 w-3" />
                En mora · {cartera.mora_dias} día{cartera.mora_dias !== 1 ? 's' : ''} · {formatCOP(cartera.mora_valor)}
              </Badge>
            ) : (
              <p className="text-xs text-muted-foreground mt-0.5">
                {cartera.cuotas_pagadas} de {cartera.cuotas_total} cuotas pagadas
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Banner: acuerdo de pago pendiente de firma */}
      {acuerdoPendiente && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-2.5">
          <div className="flex items-start gap-2.5">
            <Clock className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-900">
                Acuerdo de pago N.&deg;{acuerdoPendiente.numero} pendiente de firma
              </p>
              <p className="text-xs text-amber-800 mt-0.5">
                Creado el {formatDate(acuerdoPendiente.created_at)}
                {acuerdoPendiente.creado_por_nombre ? ` por ${acuerdoPendiente.creado_por_nombre}` : ''}.
                El plan de abajo <span className="font-medium">sigue siendo el vigente</span>. Hasta que el paciente
                firme el acta y Documenso lo confirme: no se pueden registrar pagos ni mover cuotas, y la mora sigue activa.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pl-6">
            <Button size="sm" onClick={() => setShowFirmaAcuerdo(true)}>
              <FileSignature className="h-3.5 w-3.5 mr-1.5" /> Firmar / ver acta
            </Button>
            <Button size="sm" variant="outline" onClick={() => reenviarLink.mutate()} disabled={reenviarLink.isPending}>
              <Send className="h-3.5 w-3.5 mr-1.5" /> Reenviar link
            </Button>
            <Button size="sm" variant="outline" onClick={() => verificarFirma.mutate()} disabled={verificarFirma.isPending}>
              {verificarFirma.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
              Verificar en Documenso
            </Button>
            <Button size="sm" variant="ghost" className="text-amber-800" onClick={() => anularAcuerdo.mutate()} disabled={anularAcuerdo.isPending}>
              <Ban className="h-3.5 w-3.5 mr-1.5" /> Cancelar acuerdo
            </Button>
          </div>
        </div>
      )}

      {/* Cuotas */}
      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            Cuotas y pagos
          </CardTitle>
          {puedeCrearAcuerdo && (
            <Button size="sm" variant="outline" onClick={() => setShowNuevoAcuerdo(true)}>
              <HandCoins className="h-4 w-4 mr-1.5" /> Nuevo acuerdo de pago
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {!cartera.cuotas?.length ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">Sin cuotas registradas</p>
          ) : (
            <div className="divide-y">
              {cartera.cuotas.map((cuota) => {
                const estado = estadoCuota(cuota)
                return (
                  <div key={cuota.id} className="flex items-center justify-between px-6 py-4 gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{cuota.descripcion || cuota.tipo}</p>
                        <CuotaBadge cuota={cuota} />
                        {cuota.acuerdo_numero != null && (
                          <Badge variant="secondary" className="text-[10px] gap-1">
                            <HandCoins className="h-2.5 w-2.5" />Acuerdo N.&deg;{cuota.acuerdo_numero}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                        {(cuota.fecha_esperada || (estado === 'pendiente' && canModificarPlazo)) && (
                          <p>
                            Vencimiento:{' '}
                            {estado === 'pendiente' && canModificarPlazo && !acuerdoPendiente ? (
                              <FechaVencimientoEditor cuota={cuota} carteraId={id} />
                            ) : (
                              cuota.fecha_esperada ? formatDate(cuota.fecha_esperada) : '—'
                            )}
                          </p>
                        )}
                        {cuota.fecha_pago && Number(cuota.valor_pagado ?? 0) > 0 && (
                          <p className="text-emerald-600">
                            {saldoCuota(cuota) <= 0 ? 'Pagado el ' : 'Último abono el '}
                            {formatDate(cuota.fecha_pago)} · {cuota.medio_pago}
                            {cuota.observaciones && ` · ${cuota.observaciones}`}
                          </p>
                        )}
                        {saldoCuota(cuota) > 0 && Number(cuota.valor_pagado ?? 0) > 0 && (
                          <p className={estado === 'vencida' ? 'text-rose-600 font-medium' : 'text-amber-600 font-medium'}>
                            Abonado {formatCOP(cuota.valor_pagado ?? 0)} · falta {formatCOP(saldoCuota(cuota))}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold tabular-nums">
                        {formatCOP(cuota.valor_esperado)}
                      </p>
                      {saldoCuota(cuota) > 0 && (
                        <Button
                          size="sm"
                          variant={estado === 'vencida' ? 'destructive' : 'outline'}
                          className="mt-2 text-xs h-7"
                          onClick={() => setCuotaSeleccionada(cuota)}
                          disabled={Boolean(acuerdoPendiente)}
                          title={acuerdoPendiente ? 'Bloqueado: hay un acuerdo de pago pendiente de firma' : undefined}
                        >
                          {Number(cuota.valor_pagado ?? 0) > 0 ? 'Cobrar saldo' : 'Registrar pago'}
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Historial de acuerdos de pago */}
      {(cartera.acuerdos?.length ?? 0) > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <HandCoins className="h-4 w-4 text-muted-foreground" />
              Acuerdos de pago
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 divide-y">
            {cartera.acuerdos!.map((a) => (
              <div key={a.id} className="px-6 py-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">Acuerdo N.&deg;{a.numero}</p>
                    <Badge
                      variant={
                        a.estado === 'vigente' ? 'success'
                          : a.estado === 'pendiente_firma' ? 'warning'
                          : a.estado === 'requiere_revision' ? 'destructive'
                          : 'secondary'
                      }
                      className="text-[10px]"
                    >
                      {a.estado_display}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{a.motivo}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {formatDate(a.created_at)}
                    {a.creado_por_nombre ? ` · ${a.creado_por_nombre}` : ''}
                    {a.vigente_desde ? ` · vigente desde ${formatDate(a.vigente_desde)}` : ''}
                    {a.estado === 'anulado' && a.motivo_anulacion ? ` · cancelado: ${a.motivo_anulacion}` : ''}
                  </p>
                </div>
                <span className="text-sm font-semibold tabular-nums shrink-0">{formatCOP(a.saldo_al_proponer)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {cuotaSeleccionada && (
        <RegistrarPagoModal
          cuota={cuotaSeleccionada}
          open={Boolean(cuotaSeleccionada)}
          onOpenChange={(v) => { if (!v) setCuotaSeleccionada(null) }}
          carteraId={id}
        />
      )}

      {showNuevoAcuerdo && (
        <NuevoAcuerdoPagoModal
          cartera={cartera}
          open={showNuevoAcuerdo}
          onOpenChange={setShowNuevoAcuerdo}
          onCreado={() => queryClient.invalidateQueries({ queryKey: ['cartera', id] })}
        />
      )}

      {showFirmaAcuerdo && acuerdoPendiente?.documento && (
        <Dialog open={showFirmaAcuerdo} onOpenChange={setShowFirmaAcuerdo}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Acta de acuerdo de pago N.&deg;{acuerdoPendiente.numero}</DialogTitle>
            </DialogHeader>
            <CompromisoPagoFirmaContent
              consentimientoId={acuerdoPendiente.documento.id}
              initialSigningToken={acuerdoPendiente.documento.documenso_signing_token || undefined}
              documentoLabel="Acta de acuerdo de pago"
              onFirmado={() => {
                queryClient.invalidateQueries({ queryKey: ['cartera', id] })
                setShowFirmaAcuerdo(false)
              }}
              onCancel={() => setShowFirmaAcuerdo(false)}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
