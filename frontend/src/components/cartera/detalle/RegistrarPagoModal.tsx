'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { carteraApi } from '@/lib/api/cartera'
import { useFormasPago } from '@/hooks/useFormasPago'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { formatDate, todayISO } from '@/lib/utils'
import type { CuotaCartera } from '@/types/cartera'
import { formatCOP, saldoCuota } from './utils'

const pagoSchema = z.object({
  valor_pagado: z.number().positive('Debe ser mayor a 0'),
  fecha_pago: z.string().min(1, 'Requerido'),
  medio_pago: z.string().min(1, 'Selecciona un medio'),
  observaciones: z.string().optional(),
})

type PagoForm = z.infer<typeof pagoSchema>

export function RegistrarPagoModal({
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
  const { formasPago } = useFormasPago({ soloMedioReal: true })
  const abonado = Number(cuota.valor_pagado ?? 0)

  const { register, handleSubmit, reset, formState: { errors }, setValue } = useForm<PagoForm>({
    resolver: zodResolver(pagoSchema),
    defaultValues: {
      valor_pagado: saldoCuota(cuota) || undefined,
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
      toast.success('Pago registrado')
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
          <dl className="rounded-md border bg-muted/40 px-3 py-2.5 text-sm space-y-1">
            <div className="flex justify-between gap-3">
              <dt className="font-medium">{cuota.descripcion || cuota.tipo_nombre}</dt>
              <dd className="text-muted-foreground">
                {cuota.fecha_esperada ? `Vence ${formatDate(cuota.fecha_esperada)}` : 'Sin fecha'}
              </dd>
            </div>
            <div className="flex justify-between gap-3 text-xs text-muted-foreground">
              <dt>Valor de la cuota</dt>
              <dd className="tabular-nums">{formatCOP(cuota.valor_esperado)}</dd>
            </div>
            {abonado > 0 && (
              <>
                <div className="flex justify-between gap-3 text-xs text-muted-foreground">
                  <dt>Ya abonado</dt>
                  <dd className="tabular-nums">{formatCOP(abonado)}</dd>
                </div>
                <div className="flex justify-between gap-3 text-xs font-medium">
                  <dt>Saldo</dt>
                  <dd className="tabular-nums">{formatCOP(saldoCuota(cuota))}</dd>
                </div>
              </>
            )}
          </dl>

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
            <Select onValueChange={(v) => setValue('medio_pago', v, { shouldValidate: true })}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar…" />
              </SelectTrigger>
              <SelectContent>
                {formasPago.map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.nombre}</SelectItem>
                ))}
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
