'use client'

import { use, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, CheckCircle2, Clock, AlertCircle, CreditCard } from 'lucide-react'
import { carteraApi } from '@/lib/api/cartera'
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
import { formatDate } from '@/lib/utils'
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

function estadoCuota(cuota: CuotaCartera): 'pagada' | 'vencida' | 'pendiente' {
  if (cuota.pagada) return 'pagada'
  if (cuota.fecha_esperada && new Date(cuota.fecha_esperada) < new Date()) return 'vencida'
  return 'pendiente'
}

function CuotaBadge({ cuota }: { cuota: CuotaCartera }) {
  const estado = estadoCuota(cuota)
  if (estado === 'pagada')
    return <Badge variant="success" className="text-xs gap-1"><CheckCircle2 className="h-3 w-3" />Pagada</Badge>
  if (estado === 'vencida')
    return <Badge variant="destructive" className="text-xs gap-1"><AlertCircle className="h-3 w-3" />Vencida</Badge>
  return <Badge variant="secondary" className="text-xs gap-1"><Clock className="h-3 w-3" />Pendiente</Badge>
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
      valor_pagado: parseFloat(cuota.valor_esperado) || undefined,
      fecha_pago: new Date().toISOString().split('T')[0],
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
  const [cuotaSeleccionada, setCuotaSeleccionada] = useState<CuotaCartera | null>(null)

  const { data: cartera, isLoading } = useQuery({
    queryKey: ['cartera', id],
    queryFn: () => carteraApi.get(id),
  })

  if (isLoading) return <div className="p-8"><LoadingState rows={8} /></div>
  if (!cartera) return null

  const saldoPct = cartera.total !== '0'
    ? Math.round((Number(cartera.total_pagado) / Number(cartera.total)) * 100)
    : 100

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
            <p className={`text-2xl font-bold tabular-nums mt-1 ${Number(cartera.saldo_pendiente) > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {formatCOP(cartera.saldo_pendiente)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {cartera.cuotas_pagadas} de {cartera.cuotas_total} cuotas pagadas
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Cuotas */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            Cuotas y pagos
          </CardTitle>
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
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                        {cuota.fecha_esperada && (
                          <p>Fecha esperada: {formatDate(cuota.fecha_esperada)}</p>
                        )}
                        {cuota.pagada && cuota.fecha_pago && (
                          <p className="text-emerald-600">
                            Pagado el {formatDate(cuota.fecha_pago)} · {cuota.medio_pago}
                            {cuota.observaciones && ` · ${cuota.observaciones}`}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold tabular-nums">
                        {cuota.pagada && cuota.valor_pagado
                          ? formatCOP(cuota.valor_pagado)
                          : formatCOP(cuota.valor_esperado)}
                      </p>
                      {!cuota.pagada && (
                        <Button
                          size="sm"
                          variant={estado === 'vencida' ? 'destructive' : 'outline'}
                          className="mt-2 text-xs h-7"
                          onClick={() => setCuotaSeleccionada(cuota)}
                        >
                          Registrar pago
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

      {cuotaSeleccionada && (
        <RegistrarPagoModal
          cuota={cuotaSeleccionada}
          open={Boolean(cuotaSeleccionada)}
          onOpenChange={(v) => { if (!v) setCuotaSeleccionada(null) }}
          carteraId={id}
        />
      )}
    </div>
  )
}
