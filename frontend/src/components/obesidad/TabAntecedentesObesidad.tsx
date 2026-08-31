'use client'

import { useEffect, useRef, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, Loader2, AlertTriangle, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { obesidadApi } from '@/lib/api/obesidad'
import { formatDate } from '@/lib/utils'
import type { ActividadFisica, AntecedentesObesidadInput } from '@/types/obesidad'

const ACTIVIDAD_OPTIONS: { value: ActividadFisica; label: string }[] = [
  { value: 'sedentario', label: 'Sedentario' },
  { value: 'leve',       label: 'Leve (1–2 días/semana)' },
  { value: 'moderado',   label: 'Moderado (3–4 días/semana)' },
  { value: 'intenso',    label: 'Intenso (5+ días/semana)' },
]

const COMORBILIDADES_COMUNES = [
  'Diabetes tipo 2', 'Hipertensión arterial', 'Dislipidemia', 'Hipotiroidismo',
  'Apnea del sueño', 'NASH / NAFLD', 'Artrosis', 'Depresión / Ansiedad',
]

interface FormValues {
  peso_maximo_kg: string
  peso_minimo_adulto_kg: string
  intentos_previos: string
  medicamentos_actuales: string
  antecedente_familiar: 'si' | 'no' | ''
  actividad_fisica: ActividadFisica | ''
  patron_alimentario: string
  factores_emocionales: string
}

const EMPTY: FormValues = {
  peso_maximo_kg: '',
  peso_minimo_adulto_kg: '',
  intentos_previos: '',
  medicamentos_actuales: '',
  antecedente_familiar: '',
  actividad_fisica: '',
  patron_alimentario: '',
  factores_emocionales: '',
}

interface Props {
  historiaId: string
}

export function TabAntecedentesObesidad({ historiaId }: Props) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const populated = useRef(false)
  const [comorbilidades, setComorbilidades] = useState<string[]>([])
  const [comorbilidadInput, setComorbilidadInput] = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['obesidad-antecedentes', historiaId],
    queryFn: () => obesidadApi.antecedentes.get(historiaId),
    enabled: Boolean(historiaId),
    retry: 1,
  })

  const { register, control, handleSubmit, reset, formState: { isDirty } } = useForm<FormValues>({
    defaultValues: EMPTY,
  })

  useEffect(() => {
    if (data && !populated.current) {
      reset({
        peso_maximo_kg:       data.peso_maximo_kg ?? '',
        peso_minimo_adulto_kg: data.peso_minimo_adulto_kg ?? '',
        intentos_previos:     data.intentos_previos,
        medicamentos_actuales: data.medicamentos_actuales,
        antecedente_familiar:
          data.antecedente_familiar === true ? 'si'
          : data.antecedente_familiar === false ? 'no'
          : '',
        actividad_fisica:  (data.actividad_fisica as ActividadFisica | '') ?? '',
        patron_alimentario:   data.patron_alimentario,
        factores_emocionales: data.factores_emocionales,
      })
      setComorbilidades(data.comorbilidades ?? [])
      populated.current = true
    }
    if (!data) populated.current = false
  }, [data, reset])

  const { mutate, isPending } = useMutation({
    mutationFn: (values: FormValues) => {
      const payload: AntecedentesObesidadInput = {
        historia: historiaId,
        peso_maximo_kg:        values.peso_maximo_kg ? parseFloat(values.peso_maximo_kg) : null,
        peso_minimo_adulto_kg: values.peso_minimo_adulto_kg ? parseFloat(values.peso_minimo_adulto_kg) : null,
        intentos_previos:     values.intentos_previos,
        comorbilidades,
        medicamentos_actuales: values.medicamentos_actuales,
        antecedente_familiar:
          values.antecedente_familiar === 'si' ? true
          : values.antecedente_familiar === 'no' ? false
          : null,
        actividad_fisica:     values.actividad_fisica as ActividadFisica | '',
        patron_alimentario:   values.patron_alimentario,
        factores_emocionales: values.factores_emocionales,
      }
      return data
        ? obesidadApi.antecedentes.update(historiaId, payload)
        : obesidadApi.antecedentes.create(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['obesidad-antecedentes', historiaId] })
      populated.current = false
      toast({ title: 'Antecedentes de obesidad guardados' })
    },
    onError: () => {
      toast({ title: 'Error al guardar', variant: 'destructive' })
    },
  })

  function addComorbilidad(valor: string) {
    const v = valor.trim()
    if (v && !comorbilidades.includes(v)) {
      setComorbilidades((prev) => [...prev, v])
    }
    setComorbilidadInput('')
  }

  function removeComorbilidad(c: string) {
    setComorbilidades((prev) => prev.filter((x) => x !== c))
  }

  if (isLoading) {
    return (
      <div className="max-w-2xl space-y-3 animate-pulse">
        {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded bg-muted" />)}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="max-w-2xl flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2.5">
        <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
        <p className="text-xs text-destructive font-medium">
          No se pudo cargar los antecedentes de obesidad.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-4">
      {data?.updated_at && (
        <p className="text-xs text-muted-foreground">Última actualización: {formatDate(data.updated_at)}</p>
      )}

      <form onSubmit={handleSubmit((v) => mutate(v))} className="space-y-5">
        {/* Pesos de referencia */}
        <div className="rounded-lg border p-4 space-y-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pesos de referencia</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Peso máximo histórico (kg)</Label>
              <Input type="number" step="0.1" placeholder="120" {...register('peso_maximo_kg')} />
            </div>
            <div className="space-y-1.5">
              <Label>Peso mínimo en vida adulta (kg)</Label>
              <Input type="number" step="0.1" placeholder="75" {...register('peso_minimo_adulto_kg')} />
            </div>
          </div>
        </div>

        {/* Comorbilidades */}
        <div className="rounded-lg border p-4 space-y-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Comorbilidades</h4>
          <div className="flex flex-wrap gap-1.5">
            {COMORBILIDADES_COMUNES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => comorbilidades.includes(c) ? removeComorbilidad(c) : addComorbilidad(c)}
                className={[
                  'text-xs px-2 py-1 rounded-full border transition-colors',
                  comorbilidades.includes(c)
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background border-border hover:bg-muted',
                ].join(' ')}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={comorbilidadInput}
              onChange={(e) => setComorbilidadInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addComorbilidad(comorbilidadInput) } }}
              placeholder="Otra comorbilidad…"
              className="h-8 text-sm"
            />
            <Button type="button" size="sm" variant="outline" onClick={() => addComorbilidad(comorbilidadInput)}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          {comorbilidades.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {comorbilidades.map((c) => (
                <Badge key={c} variant="secondary" className="gap-1 pr-1">
                  {c}
                  <button type="button" onClick={() => removeComorbilidad(c)}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Estilo de vida */}
        <div className="rounded-lg border p-4 space-y-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Estilo de vida</h4>
          <div className="space-y-1.5">
            <Label>Actividad física</Label>
            <Controller
              control={control}
              name="actividad_fisica"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-72">
                    <SelectValue placeholder="Seleccionar…" />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIVIDAD_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Patrón alimentario</Label>
            <Textarea
              rows={2}
              placeholder="Hábitos de comida, horarios, preferencias, restricciones…"
              {...register('patron_alimentario')}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Factores emocionales</Label>
            <Textarea
              rows={2}
              placeholder="Estrés, ansiedad, alimentación emocional, eventos vitales…"
              {...register('factores_emocionales')}
            />
          </div>
        </div>

        {/* Historia del problema */}
        <div className="rounded-lg border p-4 space-y-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Historia del problema</h4>
          <div className="space-y-1.5">
            <Label>Intentos previos de pérdida de peso</Label>
            <Textarea
              rows={3}
              placeholder="Dietas, cirugías bariátricas previas, medicamentos usados, resultados…"
              {...register('intentos_previos')}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Medicamentos actuales relacionados</Label>
            <Textarea
              rows={2}
              placeholder="Insulina, antidiabéticos, antihipertensivos, hormonas…"
              {...register('medicamentos_actuales')}
            />
          </div>
          <div className="flex items-center gap-4">
            <Label>Antecedente familiar de obesidad</Label>
            <Controller
              control={control}
              name="antecedente_familiar"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-28">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="si">Sí</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
            Guardar
          </Button>
        </div>
      </form>
    </div>
  )
}
