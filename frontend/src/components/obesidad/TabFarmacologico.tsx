'use client'

import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Save, Loader2, Pill, CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { obesidadApi } from '@/lib/api/obesidad'
import { formatDate } from '@/lib/utils'
import type { TratamientoFarmacologicoInput, ViaAdministracion } from '@/types/obesidad'

const VIA_LABELS: Record<ViaAdministracion, string> = {
  oral:          'Oral',
  subcutanea:    'Subcutánea',
  intramuscular: 'Intramuscular',
}

interface Props {
  pacienteId: string
  notaId?: string
}

interface FormValues {
  medicamento: string
  principio_activo: string
  dosis: string
  via: ViaAdministracion
  frecuencia: string
  fecha_inicio: string
  fecha_fin: string
}

const EMPTY: FormValues = {
  medicamento: '',
  principio_activo: '',
  dosis: '',
  via: 'oral',
  frecuencia: '',
  fecha_inicio: new Date().toISOString().slice(0, 10),
  fecha_fin: '',
}

interface SuspenderDialogProps {
  id: string
  medicamento: string
  onClose: () => void
}

function SuspenderDialog({ id, medicamento, onClose }: SuspenderDialogProps) {
  const [motivo, setMotivo] = useState('')
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const { mutate, isPending } = useMutation({
    mutationFn: () => obesidadApi.farmacologico.update(id, {
      fecha_fin: new Date().toISOString().slice(0, 10),
      motivo_suspension: motivo,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['obesidad-farmacologico'] })
      toast({ title: `${medicamento} suspendido` })
      onClose()
    },
    onError: () => {
      toast({ title: 'Error al suspender', variant: 'destructive' })
    },
  })

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Suspender {medicamento}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Label>Motivo de suspensión</Label>
          <Textarea
            rows={3}
            placeholder="Efectos adversos, meta alcanzada, cambio de tratamiento…"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button variant="destructive" onClick={() => mutate()} disabled={isPending}>
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            Suspender
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function TabFarmacologico({ pacienteId, notaId }: Props) {
  const [open, setOpen] = useState(false)
  const [suspenderId, setSuspenderId] = useState<{ id: string; medicamento: string } | null>(null)
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['obesidad-farmacologico', pacienteId],
    queryFn: () => obesidadApi.farmacologico.list(pacienteId),
    enabled: Boolean(pacienteId),
    staleTime: 30_000,
  })

  const tratamientos = data?.results ?? []
  const vigentes = tratamientos.filter((t) => t.vigente)
  const suspendidos = tratamientos.filter((t) => !t.vigente)

  const { register, control, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({ defaultValues: EMPTY })

  const { mutate, isPending } = useMutation({
    mutationFn: (values: FormValues) => {
      const payload: TratamientoFarmacologicoInput = {
        paciente: pacienteId,
        nota: notaId ?? null,
        medicamento: values.medicamento,
        principio_activo: values.principio_activo,
        dosis: values.dosis,
        via: values.via,
        frecuencia: values.frecuencia,
        fecha_inicio: values.fecha_inicio,
        fecha_fin: values.fecha_fin || null,
      }
      return obesidadApi.farmacologico.create(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['obesidad-farmacologico', pacienteId] })
      toast({ title: 'Prescripción registrada' })
      reset(EMPTY)
      setOpen(false)
    },
    onError: () => {
      toast({ title: 'Error al guardar la prescripción', variant: 'destructive' })
    },
  })

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Tratamiento farmacológico</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {vigentes.length} vigente{vigentes.length !== 1 ? 's' : ''} · {suspendidos.length} suspendido{suspendidos.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Nueva prescripción
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2 animate-pulse">
          {[1, 2].map((i) => <div key={i} className="h-16 rounded-lg bg-muted" />)}
        </div>
      ) : tratamientos.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <Pill className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Sin prescripciones registradas</p>
        </div>
      ) : (
        <div className="space-y-4">
          {vigentes.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-emerald-700 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Vigentes
              </p>
              {vigentes.map((t) => (
                <div key={t.id} className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-0.5 min-w-0">
                      <p className="text-sm font-medium">{t.medicamento}</p>
                      {t.principio_activo && <p className="text-xs text-muted-foreground">{t.principio_activo}</p>}
                      <p className="text-xs text-muted-foreground">
                        {t.dosis} · {VIA_LABELS[t.via]} · {t.frecuencia}
                      </p>
                      <p className="text-xs text-muted-foreground">Desde {formatDate(t.fecha_inicio)}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => setSuspenderId({ id: t.id, medicamento: t.medicamento })}
                    >
                      Suspender
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {suspendidos.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <XCircle className="h-3.5 w-3.5" /> Suspendidos
              </p>
              {suspendidos.map((t) => (
                <div key={t.id} className="rounded-lg border bg-muted/20 p-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-muted-foreground line-through">{t.medicamento}</p>
                      <Badge variant="outline" className="text-xs">{VIA_LABELS[t.via]}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{t.dosis} · {t.frecuencia}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(t.fecha_inicio)} — {t.fecha_fin ? formatDate(t.fecha_fin) : ''}
                    </p>
                    {t.motivo_suspension && (
                      <p className="text-xs text-muted-foreground italic">{t.motivo_suspension}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva prescripción</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit((v) => mutate(v))} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label>Medicamento <span className="text-destructive">*</span></Label>
                <Input placeholder="Semaglutide" {...register('medicamento', { required: true })} />
                {errors.medicamento && <p className="text-xs text-destructive">Requerido</p>}
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Principio activo</Label>
                <Input placeholder="Semaglutide" {...register('principio_activo')} />
              </div>
              <div className="space-y-1.5">
                <Label>Dosis <span className="text-destructive">*</span></Label>
                <Input placeholder="0.25 mg" {...register('dosis', { required: true })} />
                {errors.dosis && <p className="text-xs text-destructive">Requerida</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Vía</Label>
                <Controller
                  control={control}
                  name="via"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.entries(VIA_LABELS) as [ViaAdministracion, string][]).map(([v, l]) => (
                          <SelectItem key={v} value={v}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Frecuencia <span className="text-destructive">*</span></Label>
                <Input placeholder="Una vez por semana" {...register('frecuencia', { required: true })} />
                {errors.frecuencia && <p className="text-xs text-destructive">Requerida</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Fecha inicio <span className="text-destructive">*</span></Label>
                <Input type="date" {...register('fecha_inicio', { required: true })} />
              </div>
              <div className="space-y-1.5">
                <Label>Fecha fin (si es temporal)</Label>
                <Input type="date" {...register('fecha_fin')} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {suspenderId && (
        <SuspenderDialog
          id={suspenderId.id}
          medicamento={suspenderId.medicamento}
          onClose={() => setSuspenderId(null)}
        />
      )}
    </div>
  )
}
