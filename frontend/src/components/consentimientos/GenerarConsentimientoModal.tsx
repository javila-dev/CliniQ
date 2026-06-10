'use client'

import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { consentimientosApi } from '@/lib/api/consentimientos'
import { agendaApi } from '@/lib/api/agenda'
import { PacienteSearchInput } from '@/components/pacientes/PacienteSearchInput'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { formatDate } from '@/lib/utils'
import type { BusquedaPaciente } from '@/types/pacientes'

const schema = z.object({
  plantilla_id: z.string().min(1, 'Selecciona una plantilla'),
  cita_id: z.string().min(1, 'Selecciona una cita'),
})

type FormValues = z.infer<typeof schema>

interface GenerarConsentimientoModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function GenerarConsentimientoModal({ open, onOpenChange }: GenerarConsentimientoModalProps) {
  const queryClient = useQueryClient()
  const [paciente, setPaciente] = useState<BusquedaPaciente | null>(null)
  const [pacienteError, setPacienteError] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const { control, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const { data: plantillas } = useQuery({
    queryKey: ['plantillas-consentimiento'],
    queryFn: consentimientosApi.plantillas.list,
    enabled: open,
  })

  const { data: citasData } = useQuery({
    queryKey: ['citas', 'paciente-consentimiento', paciente?.id],
    queryFn: () => agendaApi.citas.list({ paciente: paciente!.id, estado: 'confirmada' }),
    enabled: Boolean(paciente),
  })

  const { mutateAsync, isPending } = useMutation({
    mutationFn: consentimientosApi.generar,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consentimientos'] })
      handleClose()
    },
  })

  const handleClose = () => {
    reset()
    setPaciente(null)
    setPacienteError(false)
    setServerError(null)
    onOpenChange(false)
  }

  const onSubmit = async (values: FormValues) => {
    if (!paciente) { setPacienteError(true); return }
    setServerError(null)
    try {
      await mutateAsync(values)
    } catch (err: any) {
      setServerError(err?.response?.data?.error ?? 'Error al generar el consentimiento')
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Generar consentimiento informado</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 py-2">
          {/* Paciente */}
          <div className="space-y-1.5">
            <Label>Paciente *</Label>
            <PacienteSearchInput
              onSelect={(p) => { setPaciente(p); setPacienteError(false) }}
              selected={paciente}
              onClear={() => setPaciente(null)}
            />
            {pacienteError && <p className="text-xs text-destructive">Selecciona un paciente</p>}
          </div>

          {/* Cita */}
          {paciente && (
            <div className="space-y-1.5">
              <Label>Cita *</Label>
              <Controller
                name="cita_id"
                control={control}
                render={({ field }) => (
                  <Select value={field.value ?? ''} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona la cita..." />
                    </SelectTrigger>
                    <SelectContent>
                      {citasData?.results.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {formatDate(c.fecha_inicio)} — {c.servicio_nombre} · {c.profesional_nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {!citasData?.results.length && (
                <p className="text-xs text-muted-foreground">Sin citas confirmadas para este paciente</p>
              )}
              {errors.cita_id && <p className="text-xs text-destructive">{errors.cita_id.message}</p>}
            </div>
          )}

          {/* Plantilla */}
          <div className="space-y-1.5">
            <Label>Plantilla *</Label>
            <Controller
              name="plantilla_id"
              control={control}
              render={({ field }) => (
                <Select value={field.value ?? ''} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona la plantilla..." />
                  </SelectTrigger>
                  <SelectContent>
                    {plantillas?.results.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.plantilla_id && <p className="text-xs text-destructive">{errors.plantilla_id.message}</p>}
          </div>

          {serverError && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
              <p className="text-sm text-destructive">{serverError}</p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>Cancelar</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Generando...' : 'Generar y enviar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
