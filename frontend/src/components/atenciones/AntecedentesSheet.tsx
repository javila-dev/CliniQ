'use client'

import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { historiaClinicaApi } from '@/lib/api/historiaClinica'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet'
import type { AntecedentePaciente, TipoFitzpatrick } from '@/types/historia'

const FITZPATRICK = [
  { value: 'I', label: 'Tipo I — Muy clara, siempre se quema' },
  { value: 'II', label: 'Tipo II — Clara, generalmente se quema' },
  { value: 'III', label: 'Tipo III — Intermedia, a veces se quema' },
  { value: 'IV', label: 'Tipo IV — Morena clara, raramente se quema' },
  { value: 'V', label: 'Tipo V — Morena oscura, muy raramente se quema' },
  { value: 'VI', label: 'Tipo VI — Muy oscura, nunca se quema' },
]

const schema = z.object({
  alergias: z.string(),
  medicamentos_actuales: z.string(),
  patologicos: z.string(),
  contraindicaciones: z.string(),
  tipo_piel: z.enum(['I', 'II', 'III', 'IV', 'V', 'VI', '']),
  antecedentes_esteticos: z.string(),
})

type FormValues = z.infer<typeof schema>

interface AntecedentesSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pacienteId: string
  antecedentesActuales?: AntecedentePaciente
}

export function AntecedentesSheet({ open, onOpenChange, pacienteId, antecedentesActuales }: AntecedentesSheetProps) {
  const queryClient = useQueryClient()

  const { register, control, handleSubmit, reset } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      alergias: '',
      medicamentos_actuales: '',
      patologicos: '',
      contraindicaciones: '',
      tipo_piel: '',
      antecedentes_esteticos: '',
    },
  })

  useEffect(() => {
    if (antecedentesActuales) {
      const p = antecedentesActuales.personales
      reset({
        alergias: p?.alergicos ?? '',
        medicamentos_actuales: p?.farmacologicos ?? '',
        patologicos: p?.patologicos ?? '',
        contraindicaciones: p?.contraindicaciones ?? '',
        tipo_piel: p?.tipo_piel ?? '',
        antecedentes_esteticos: p?.antecedentes_esteticos ?? '',
      })
    } else {
      reset({ alergias: '', medicamentos_actuales: '', patologicos: '', contraindicaciones: '', tipo_piel: '', antecedentes_esteticos: '' })
    }
  }, [antecedentesActuales, reset, open])

  const { mutateAsync, isPending } = useMutation({
    mutationFn: (values: FormValues) =>
      historiaClinicaApi.antecedentes.upsert(pacienteId, {
        ...values,
        tipo_piel: values.tipo_piel as TipoFitzpatrick | '',
        ant_quirurgicos: antecedentesActuales?.personales?.quirurgicos ?? '',
        ant_traumaticos: antecedentesActuales?.personales?.traumaticos ?? '',
        ant_familiares: antecedentesActuales?.familiares ?? '',
        gestaciones: antecedentesActuales?.ginecoobstetricos?.gestaciones ?? null,
        partos: antecedentesActuales?.ginecoobstetricos?.partos ?? null,
        abortos: antecedentesActuales?.ginecoobstetricos?.abortos ?? null,
        cesareas: antecedentesActuales?.ginecoobstetricos?.cesareas ?? null,
        fum: antecedentesActuales?.ginecoobstetricos?.fum ?? null,
        planificacion_familiar: antecedentesActuales?.ginecoobstetricos?.planificacion_familiar ?? '',
        metodo_anticonceptivo: antecedentesActuales?.ginecoobstetricos?.metodo_anticonceptivo ?? '',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['antecedentes', pacienteId] })
      onOpenChange(false)
    },
  })

  const onSubmit = async (values: FormValues) => {
    await mutateAsync(values)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[420px] sm:w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Antecedentes del paciente</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 py-6">
          <div className="space-y-1.5">
            <Label>Tipo de piel (Fitzpatrick)</Label>
            <Controller
              name="tipo_piel"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Sin especificar</SelectItem>
                    {FITZPATRICK.map((f) => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="alergias">Alergias</Label>
            <Textarea
              id="alergias"
              rows={2}
              placeholder="Penicilina, látex, ibuprofeno…"
              {...register('alergias')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contraindicaciones">Contraindicaciones para procedimientos estéticos</Label>
            <Textarea
              id="contraindicaciones"
              rows={2}
              placeholder="Ej: no aplicar toxina cerca de ojos por ptosis previa…"
              {...register('contraindicaciones')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="medicamentos_actuales">Medicamentos actuales</Label>
            <Textarea
              id="medicamentos_actuales"
              rows={2}
              placeholder="Nombre, dosis…"
              {...register('medicamentos_actuales')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="patologicos">Condiciones médicas</Label>
            <Textarea
              id="patologicos"
              rows={2}
              placeholder="Hipertensión, diabetes, embarazo, coagulación…"
              {...register('patologicos')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="antecedentes_esteticos">Antecedentes estéticos previos</Label>
            <Textarea
              id="antecedentes_esteticos"
              rows={3}
              placeholder="Cirugías, rellenos permanentes, láser previo, implantes…"
              {...register('antecedentes_esteticos')}
            />
          </div>

          <SheetFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Guardando…' : 'Guardar antecedentes'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
