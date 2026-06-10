'use client'

import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { historiaClinicaApi } from '@/lib/api/historiaClinica'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertTriangle } from 'lucide-react'
import type { Cita } from '@/types/agenda'
import { useState } from 'react'

const schema = z.object({
  tipo: z.enum(['consulta', 'procedimiento', 'evolucion', 'aclaratoria']),
  anamnesis: z.string().optional(),
  diagnostico: z.string().optional(),
  plan_manejo: z.string().optional(),
  observaciones: z.string().optional(),
  nota_aclarada: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface NuevaNotaFormProps {
  historiaId: string
  cita: Cita
  onSuccess: () => void
  onCancel: () => void
}

export function NuevaNotaForm({ historiaId, cita, onSuccess, onCancel }: NuevaNotaFormProps) {
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    control,
    watch,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { tipo: 'consulta' },
  })

  const tipo = watch('tipo')

  const { mutateAsync, isPending } = useMutation({
    mutationFn: historiaClinicaApi.notas.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['historia', historiaId, 'notas'] })
      onSuccess()
    },
  })

  const onSubmit = async (values: FormValues) => {
    setServerError(null)
    try {
      await mutateAsync({
        historia: historiaId,
        cita: cita.id,
        servicio: cita.servicio,
        ...values,
      })
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.detail ||
        'Error al guardar la nota'
      setServerError(String(msg))
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Alert variant="warning">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Las notas clínicas son inmutables. Una vez guardada no se puede editar.
          Si necesitas corregir algo, crea una nota <strong>aclaratoria</strong>.
        </AlertDescription>
      </Alert>

      {/* Tipo */}
      <div className="space-y-1.5">
        <Label>Tipo de nota *</Label>
        <Controller
          name="tipo"
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="consulta">Consulta</SelectItem>
                <SelectItem value="procedimiento">Procedimiento</SelectItem>
                <SelectItem value="evolucion">Evolución</SelectItem>
                <SelectItem value="aclaratoria">Aclaratoria</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </div>

      {tipo === 'aclaratoria' && (
        <div className="space-y-1.5">
          <Label htmlFor="nota_aclarada">ID de la nota que se aclara</Label>
          <input
            id="nota_aclarada"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="UUID de la nota original"
            {...register('nota_aclarada')}
          />
        </div>
      )}

      {/* Campos clínicos */}
      {['consulta', 'procedimiento', 'evolucion'].includes(tipo) && (
        <div className="space-y-1.5">
          <Label htmlFor="anamnesis">Anamnesis</Label>
          <Textarea id="anamnesis" rows={3} placeholder="Motivo de consulta, antecedentes relevantes..." {...register('anamnesis')} />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="diagnostico">Diagnóstico</Label>
        <Textarea id="diagnostico" rows={2} placeholder="Diagnóstico o hallazgos..." {...register('diagnostico')} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="plan_manejo">Plan de manejo</Label>
        <Textarea id="plan_manejo" rows={2} placeholder="Tratamiento, recomendaciones..." {...register('plan_manejo')} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="observaciones">Observaciones</Label>
        <Textarea id="observaciones" rows={2} placeholder="Observaciones adicionales..." {...register('observaciones')} />
      </div>

      {serverError && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
          <p className="text-sm text-destructive">{serverError}</p>
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Guardando...' : 'Guardar nota'}
        </Button>
      </div>
    </form>
  )
}
