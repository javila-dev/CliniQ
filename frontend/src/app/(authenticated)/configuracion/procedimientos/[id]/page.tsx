'use client'

import { use } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, Loader2, Clock, DollarSign, ListOrdered, Settings2 } from 'lucide-react'
import Link from 'next/link'
import { clinicasApi } from '@/lib/api/clinicas'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LoadingState } from '@/components/shared/LoadingState'
import { ProtocoloPasos } from '@/components/configuracion/ProtocoloPasos'
import { ConsentimientosServicio } from '@/components/configuracion/ConsentimientosServicio'

const schema = z.object({
  nombre:         z.string().min(1, 'Requerido'),
  descripcion:    z.string().optional(),
  duracion_min:   z.number().int().min(1),
  precio_referencia: z.number().min(0).nullable().optional(),
  vigencia_meses: z.number().int().min(1).max(120),
  activo:         z.boolean(),
})
type FormValues = z.infer<typeof schema>

function TabGeneral({ servicioId }: { servicioId: string }) {
  const qc = useQueryClient()
  const { data: servicio, isLoading } = useQuery({
    queryKey: ['procedimiento', servicioId],
    queryFn: () => clinicasApi.procedimientos.get(servicioId),
  })

  const { register, control, handleSubmit, formState: { errors, isDirty } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: servicio ? {
      nombre:         servicio.nombre,
      descripcion:    servicio.descripcion ?? '',
      duracion_min:   servicio.duracion_min,
      precio_referencia: (servicio.precio_referencia ?? servicio.precio)
                        ? parseFloat(servicio.precio_referencia ?? servicio.precio ?? '0')
                        : null,
      vigencia_meses: servicio.vigencia_meses ?? 12,
      activo:         servicio.activo,
    } : undefined,
    resetOptions: { keepDirtyValues: false },
  })

  const mut = useMutation({
    mutationFn: (data: FormValues) => clinicasApi.procedimientos.update(servicioId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['procedimiento', servicioId] }),
  })

  if (isLoading) return <LoadingState rows={4} />

  return (
    <form onSubmit={handleSubmit((d) => mut.mutate(d))} className="space-y-5 max-w-lg">
      <div className="space-y-1.5">
        <Label>Nombre *</Label>
        <Input {...register('nombre')} />
        {errors.nombre && <p className="text-xs text-destructive">{errors.nombre.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>Descripción</Label>
        <Textarea {...register('descripcion')} rows={3} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Duración (minutos) *</Label>
          <Controller name="duracion_min" control={control} render={({ field }) => (
            <Input type="number" min={5} step={5} value={field.value} onChange={(e) => field.onChange(Number(e.target.value))} />
          )} />
        </div>
        <div className="space-y-1.5">
          <Label>Precio de referencia</Label>
          <Controller name="precio_referencia" control={control} render={({ field }) => (
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">$</span>
              <Input
                inputMode="numeric" className="pl-7" placeholder="0"
                value={field.value != null ? new Intl.NumberFormat('es-CO').format(field.value) : ''}
                onChange={(e) => { const raw = e.target.value.replace(/\D/g, ''); field.onChange(raw ? Number(raw) : null) }}
              />
            </div>
          )} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Vigencia del consentimiento (meses)</Label>
        <Controller name="vigencia_meses" control={control} render={({ field }) => (
          <div className="flex items-center gap-2">
            <Input type="number" min={1} max={120} className="w-24" value={field.value} onChange={(e) => field.onChange(Number(e.target.value))} />
            <span className="text-sm text-muted-foreground">meses</span>
          </div>
        )} />
      </div>

      <div className="flex items-center justify-between rounded-lg border px-4 py-3">
        <div>
          <p className="text-sm font-medium">Activo</p>
          <p className="text-xs text-muted-foreground">Los procedimientos inactivos no aparecen al crear citas</p>
        </div>
        <Controller name="activo" control={control} render={({ field }) => (
          <input type="checkbox" checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} className="h-4 w-4 accent-primary" />
        )} />
      </div>

      {mut.error && (
        <div className="rounded-lg bg-destructive/8 border border-destructive/15 px-3.5 py-2.5">
          <p className="text-sm text-destructive">{(mut.error as any)?.response?.data?.detail || 'Error al guardar.'}</p>
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={!isDirty || mut.isPending} size="sm">
          {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Guardar cambios
        </Button>
      </div>
    </form>
  )
}

export default function ProcedimientoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const { data: servicio, isLoading } = useQuery({
    queryKey: ['procedimiento', id],
    queryFn: () => clinicasApi.procedimientos.get(id),
  })

  if (isLoading) return <LoadingState rows={6} />
  if (!servicio) return null

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild className="gap-1 text-muted-foreground">
          <Link href="/configuracion/procedimientos">
            <ArrowLeft className="h-4 w-4" />
            Procedimientos
          </Link>
        </Button>
      </div>

      <PageHeader
        title={servicio.nombre}
        backHref="/configuracion/procedimientos"
        description={
          <div className="flex items-center gap-3 mt-1">
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />{servicio.duracion_min} min
            </span>
            {(servicio.precio_referencia ?? servicio.precio) && (
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <DollarSign className="h-3.5 w-3.5" />
                {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(parseFloat(servicio.precio_referencia ?? servicio.precio ?? '0'))}
              </span>
            )}
            <Badge variant={servicio.activo ? 'default' : 'secondary'} className="text-[10px]">
              {servicio.activo ? 'Activo' : 'Inactivo'}
            </Badge>
            {servicio.tiene_protocolo && (
              <Badge variant="outline" className="text-[10px] gap-1">
                <ListOrdered className="h-3 w-3" />
                {servicio.pasos_protocolo?.length ?? '—'} pasos
              </Badge>
            )}
          </div>
        }
      />

      <Tabs defaultValue="protocolo">
        <TabsList>
          <TabsTrigger value="general" className="gap-1.5">
            <Settings2 className="h-3.5 w-3.5" />General
          </TabsTrigger>
          <TabsTrigger value="protocolo" className="gap-1.5">
            <ListOrdered className="h-3.5 w-3.5" />Protocolo
          </TabsTrigger>
        </TabsList>
        <TabsContent value="general" className="mt-6">
          <TabGeneral servicioId={id} />
        </TabsContent>
        <TabsContent value="protocolo" className="mt-6 space-y-4">
          <ProtocoloPasos servicioId={id} />
          <ConsentimientosServicio servicioId={id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
