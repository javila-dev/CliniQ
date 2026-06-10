'use client'

import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { agendaApi } from '@/lib/api/agenda'
import { clinicasApi } from '@/lib/api/clinicas'
import { useAuthStore } from '@/store/authStore'
import { ProfesionalSelect } from './ProfesionalSelect'
import { ServicioSelect } from './ServicioSelect'
import { SedeSelect } from './SedeSelect'
import { SlotPicker } from './SlotPicker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Cita } from '@/types/agenda'

const schema = z.object({
  sede: z.string().min(1, 'Selecciona una sede'),
  profesional: z.string().min(1, 'Selecciona un profesional'),
  servicio: z.string().min(1, 'Selecciona un servicio'),
  fecha: z.string().min(1, 'Selecciona una fecha'),
  slot: z.string().min(1, 'Selecciona un horario'),
  canal_origen: z.enum(['presencial', 'telefono', 'web', 'redes']),
  notas_internas: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface EditarCitaFormProps {
  cita: Cita
  onCancel: () => void
  onSuccess: () => void
}

export function EditarCitaForm({ cita, onCancel, onSuccess }: EditarCitaFormProps) {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()

  const { control, register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      sede: cita.sede,
      profesional: cita.profesional,
      servicio: cita.servicio,
      fecha: cita.fecha_inicio.split('T')[0],
      slot: cita.fecha_inicio,
      canal_origen: cita.canal_origen,
      notas_internas: cita.notas_internas ?? '',
    },
  })

  const sedeId = watch('sede')
  const profesionalId = watch('profesional')
  const servicioId = watch('servicio')
  const fecha = watch('fecha')
  const slot = watch('slot')

  const { data: sedesData } = useQuery({
    queryKey: ['sedes'],
    queryFn: () => clinicasApi.sedes.list({ activa: true }),
  })
  const clinicaId = sedesData?.results.find((s) => s.id === sedeId)?.clinica ?? user?.clinica_id ?? undefined

  const { mutate, isPending, error } = useMutation({
    mutationFn: (values: FormValues) =>
      agendaApi.citas.update(cita.id, {
        sede: values.sede,
        profesional: values.profesional,
        servicio: values.servicio,
        fecha_inicio: values.slot,
        canal_origen: values.canal_origen,
        notas_internas: values.notas_internas || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['citas'] })
      queryClient.invalidateQueries({ queryKey: ['slots'] })
      onSuccess()
    },
  })

  const serverError = (() => {
    if (!error) return null
    const data = (error as any)?.response?.data
    if (!data) return 'Error al guardar los cambios'
    if (data.error) return String(data.error)
    if (data.detail) return String(data.detail)
    const entries = Object.entries(data)
    if (entries.length > 0) {
      const labels: Record<string, string> = {
        sede: 'Sede', profesional: 'Profesional', servicio: 'Servicio',
        fecha_inicio: 'Fecha/Hora', canal_origen: '¿Cómo agendó el paciente?',
      }
      return entries.map(([f, m]) => `${labels[f] ?? f}: ${Array.isArray(m) ? m[0] : m}`).join(' | ')
    }
    return 'Error al guardar los cambios'
  })()

  return (
    <form onSubmit={handleSubmit((v) => mutate(v))} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Sede *</Label>
        <Controller
          name="sede"
          control={control}
          render={({ field }) => (
            <SedeSelect
              value={field.value}
              onValueChange={(v) => {
                field.onChange(v)
                setValue('profesional', '')
                setValue('servicio', '')
                setValue('slot', '')
              }}
            />
          )}
        />
        {errors.sede && <p className="text-xs text-destructive">{errors.sede.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Profesional *</Label>
          <Controller
            name="profesional"
            control={control}
            render={({ field }) => (
              <ProfesionalSelect
                value={field.value}
                onValueChange={(v) => { field.onChange(v); setValue('slot', '') }}
                sedeId={sedeId}
                disabled={!sedeId}
              />
            )}
          />
          {errors.profesional && <p className="text-xs text-destructive">{errors.profesional.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label>Servicio *</Label>
          <Controller
            name="servicio"
            control={control}
            render={({ field }) => (
              <ServicioSelect
                value={field.value}
                onValueChange={(v) => { field.onChange(v); setValue('slot', '') }}
                clinicaId={clinicaId}
              />
            )}
          />
          {errors.servicio && <p className="text-xs text-destructive">{errors.servicio.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Fecha *</Label>
          <Input
            type="date"
            min={new Date().toISOString().split('T')[0]}
            {...register('fecha', { onChange: () => setValue('slot', '') })}
          />
          {errors.fecha && <p className="text-xs text-destructive">{errors.fecha.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label>¿Cómo agendó el paciente? *</Label>
          <Controller
            name="canal_origen"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="telefono">Teléfono</SelectItem>
                  <SelectItem value="presencial">Presencial</SelectItem>
                  <SelectItem value="web">Web</SelectItem>
                  <SelectItem value="redes">Redes sociales</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Horario *</Label>
        <div className="rounded-md border p-2 bg-muted/20">
          <SlotPicker
            profesionalId={profesionalId}
            sedeId={sedeId}
            servicioId={servicioId}
            fecha={fecha}
            value={slot}
            onSelect={(s) => setValue('slot', s)}
          />
        </div>
        {errors.slot && <p className="text-xs text-destructive">{errors.slot.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>Notas internas</Label>
        <Textarea rows={2} placeholder="Observaciones..." {...register('notas_internas')} />
      </div>

      {serverError && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
          <p className="text-sm text-destructive">{serverError}</p>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? 'Guardando...' : 'Guardar cambios'}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
