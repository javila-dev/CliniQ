'use client'

import { useEffect, useRef } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save, Loader2, AlertTriangle, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { historiaClinicaApi } from '@/lib/api/historiaClinica'
import { useToast } from '@/hooks/use-toast'
import { formatDate } from '@/lib/utils'
import type { AntecedentePaciente, AntecedentePacienteUpdate, TipoFitzpatrick } from '@/types/historia'

const FITZPATRICK_OPTIONS: { value: TipoFitzpatrick; label: string }[] = [
  { value: 'I', label: 'Tipo I — Siempre se quema' },
  { value: 'II', label: 'Tipo II — Usualmente se quema' },
  { value: 'III', label: 'Tipo III — A veces se quema' },
  { value: 'IV', label: 'Tipo IV — Rara vez se quema' },
  { value: 'V', label: 'Tipo V — Muy rara vez se quema' },
  { value: 'VI', label: 'Tipo VI — Nunca se quema' },
]

// ─── Tipos ───────────────────────────────────────────────────────────────────
// Los campos numéricos se manejan como string en el form para que el input type="number"
// funcione naturalmente; se convierten a number|null al hacer submit.
interface FormValues {
  alergias: string
  medicamentos_actuales: string
  patologicos: string           // backend usa "patologicos", no "condiciones_medicas"
  contraindicaciones: string
  tipo_piel: TipoFitzpatrick | ''
  antecedentes_esteticos: string
  ant_quirurgicos: string
  ant_traumaticos: string
  ant_familiares: string
  gestaciones: string
  partos: string
  abortos: string
  cesareas: string
  fum: string
  planificacion_familiar: string
  metodo_anticonceptivo: string
}

interface TabAntecedentesProps {
  pacienteId: string
  modoAtencion?: boolean
}

const EMPTY_FORM: FormValues = {
  alergias: '', medicamentos_actuales: '', patologicos: '',
  contraindicaciones: '', tipo_piel: '', antecedentes_esteticos: '',
  ant_quirurgicos: '', ant_traumaticos: '', ant_familiares: '',
  gestaciones: '', partos: '', abortos: '', cesareas: '',
  fum: '', planificacion_familiar: '', metodo_anticonceptivo: '',
}

function toStr(v: number | null | undefined): string {
  return v != null ? String(v) : ''
}

function normalizeAntecedentes(a: AntecedentePaciente): FormValues {
  const p = a.personales
  const g = a.ginecoobstetricos
  return {
    alergias: p?.alergicos ?? '',
    medicamentos_actuales: p?.farmacologicos ?? '',
    patologicos: p?.patologicos ?? '',
    contraindicaciones: p?.contraindicaciones ?? '',
    tipo_piel: (p?.tipo_piel ?? '') as TipoFitzpatrick | '',
    antecedentes_esteticos: p?.antecedentes_esteticos ?? '',
    ant_quirurgicos: p?.quirurgicos ?? '',
    ant_traumaticos: p?.traumaticos ?? '',
    ant_familiares: a.familiares ?? '',
    gestaciones: toStr(g?.gestaciones),
    partos: toStr(g?.partos),
    abortos: toStr(g?.abortos),
    cesareas: toStr(g?.cesareas),
    fum: g?.fum ?? '',
    planificacion_familiar: g?.planificacion_familiar ?? '',
    metodo_anticonceptivo: g?.metodo_anticonceptivo ?? '',
  }
}

function toUpdatePayload(form: FormValues): AntecedentePacienteUpdate {
  const toInt = (s: string) => s.trim() !== '' ? parseInt(s, 10) : null
  return {
    alergias: form.alergias,
    medicamentos_actuales: form.medicamentos_actuales,
    patologicos: form.patologicos,
    contraindicaciones: form.contraindicaciones,
    tipo_piel: form.tipo_piel,
    antecedentes_esteticos: form.antecedentes_esteticos,
    ant_quirurgicos: form.ant_quirurgicos,
    ant_traumaticos: form.ant_traumaticos,
    ant_familiares: form.ant_familiares,
    gestaciones: toInt(form.gestaciones),
    partos: toInt(form.partos),
    abortos: toInt(form.abortos),
    cesareas: toInt(form.cesareas),
    fum: form.fum || null,
    planificacion_familiar: form.planificacion_familiar,
    metodo_anticonceptivo: form.metodo_anticonceptivo,
  }
}

// ─── Sub-tabs Personales ─────────────────────────────────────────────────────
type SubTabPersonal = 'patologicos' | 'farmacologicos' | 'quirurgicos' | 'traumaticos' | 'alergicos'

// ─── Componente principal ────────────────────────────────────────────────────
export function TabAntecedentes({ pacienteId, modoAtencion = false }: TabAntecedentesProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const populated = useRef(false)

  const { data: antecedentes, isLoading: loadingAntecedentes, isError: errorAntecedentes } = useQuery({
    queryKey: ['antecedentes', pacienteId],
    queryFn: () => historiaClinicaApi.antecedentes.get(pacienteId),
    enabled: Boolean(pacienteId),
    staleTime: 30_000,
  })

  const { register, control, handleSubmit, reset, getValues, formState: { isDirty } } = useForm<FormValues>({
    defaultValues: EMPTY_FORM,
  })

  useEffect(() => {
    if (antecedentes && !populated.current) {
      reset(normalizeAntecedentes(antecedentes))
      populated.current = true
    }
    if (!antecedentes) populated.current = false
  }, [antecedentes, reset])

  const { mutate, isPending } = useMutation({
    mutationFn: (data: FormValues) => historiaClinicaApi.antecedentes.upsert(pacienteId, toUpdatePayload(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['antecedentes', pacienteId] })
      populated.current = false
      reset(getValues())
      toast({ title: 'Antecedentes guardados', description: 'Los cambios quedaron registrados.' })
    },
    onError: () => {
      toast({ title: 'Error al guardar', description: 'No se pudieron guardar los antecedentes. Verifica tu conexión e intenta de nuevo.', variant: 'destructive' })
    },
  })

  const tieneAlertas = antecedentes?.personales?.alergicos?.trim() || antecedentes?.personales?.contraindicaciones?.trim()

  if (loadingAntecedentes) {
    return (
      <div className="max-w-2xl space-y-3 animate-pulse">
        <div className="h-4 w-48 rounded bg-muted" />
        <div className="h-24 rounded bg-muted" />
        <div className="h-24 rounded bg-muted" />
      </div>
    )
  }

  if (errorAntecedentes) {
    return (
      <div className="max-w-2xl flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2.5">
        <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
        <p className="text-xs text-destructive font-medium">
          No se pudo cargar los antecedentes. Verifica tu conexión e intenta recargar la página.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-4">
      {tieneAlertas && (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 font-medium">
            Este paciente tiene alertas clínicas. Revisa alergias y contraindicaciones antes de proceder.
          </p>
        </div>
      )}

      {!antecedentes && (
        <div className="flex items-start gap-2 rounded-md bg-blue-50 border border-blue-200 px-3 py-2.5">
          <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700">
            No hay antecedentes registrados para este paciente. Completa el formulario y guarda para crear el registro.
          </p>
        </div>
      )}

      {antecedentes?.updated_at && (
        <p className="text-xs text-muted-foreground">
          Última actualización: {formatDate(antecedentes.updated_at)}
        </p>
      )}

      <form onSubmit={handleSubmit((data) => mutate(data))} className={modoAtencion ? 'rounded-lg border p-4' : undefined}>
        <Tabs defaultValue="personales">
          <TabsList className="w-full">
            <TabsTrigger value="personales" className="flex-1 text-xs">Personales</TabsTrigger>
            <TabsTrigger value="gineco" className="flex-1 text-xs">Ginecoobstétricos</TabsTrigger>
            <TabsTrigger value="familiares" className="flex-1 text-xs">Familiares</TabsTrigger>
          </TabsList>

          {/* ── Tab Personales ─────────────────────────────────────── */}
          <TabsContent value="personales" className="mt-4">
            <Tabs defaultValue="patologicos">
              <TabsList className="w-full">
                {(
                  [
                    ['patologicos', 'Patológicos'],
                    ['farmacologicos', 'Farmacológicos'],
                    ['quirurgicos', 'Quirúrgicos'],
                    ['traumaticos', 'Traumáticos'],
                    ['alergicos', 'Alérgicos'],
                  ] as [SubTabPersonal, string][]
                ).map(([v, l]) => (
                  <TabsTrigger key={v} value={v} className="flex-1 text-[11px] px-1">
                    {l}
                  </TabsTrigger>
                ))}
              </TabsList>

              {/* Patológicos */}
              <TabsContent value="patologicos" className="mt-4 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="patologicos">Condiciones médicas relevantes</Label>
                  <Textarea
                    id="patologicos"
                    rows={3}
                    placeholder="Diabetes, hipertensión, hipotiroidismo, otras…"
                    {...register('patologicos')}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Tipo de piel (Fitzpatrick)</Label>
                  <Controller
                    control={control}
                    name="tipo_piel"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="w-72">
                          <SelectValue placeholder="Seleccionar tipo…" />
                        </SelectTrigger>
                        <SelectContent>
                          {FITZPATRICK_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="antecedentes_esteticos">Antecedentes estéticos previos</Label>
                  <Textarea
                    id="antecedentes_esteticos"
                    rows={3}
                    placeholder="Cirugías estéticas, tratamientos previos, complicaciones anteriores…"
                    {...register('antecedentes_esteticos')}
                  />
                </div>
              </TabsContent>

              {/* Farmacológicos */}
              <TabsContent value="farmacologicos" className="mt-4 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="medicamentos_actuales">Medicamentos actuales</Label>
                  <Textarea
                    id="medicamentos_actuales"
                    rows={4}
                    placeholder="Anticoagulantes, antihipertensivos, suplementos, dosis y frecuencia…"
                    {...register('medicamentos_actuales')}
                  />
                </div>
              </TabsContent>

              {/* Quirúrgicos */}
              <TabsContent value="quirurgicos" className="mt-4 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ant_quirurgicos">Cirugías e intervenciones previas</Label>
                  <Textarea
                    id="ant_quirurgicos"
                    rows={4}
                    placeholder="Cirugías realizadas, fecha aproximada, complicaciones…"
                    {...register('ant_quirurgicos')}
                  />
                </div>
              </TabsContent>

              {/* Traumáticos */}
              <TabsContent value="traumaticos" className="mt-4 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ant_traumaticos">Traumas y accidentes</Label>
                  <Textarea
                    id="ant_traumaticos"
                    rows={4}
                    placeholder="Accidentes, fracturas, traumas craneales, secuelas…"
                    {...register('ant_traumaticos')}
                  />
                </div>
              </TabsContent>

              {/* Alérgicos */}
              <TabsContent value="alergicos" className="mt-4 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="alergias" className="text-sm font-medium">
                    Alergias <span className="text-amber-600 text-xs font-normal">(clínicamente importante)</span>
                  </Label>
                  <Textarea
                    id="alergias"
                    rows={3}
                    placeholder="Ninguna conocida / describir alergias a medicamentos, materiales, látex…"
                    {...register('alergias')}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="contraindicaciones" className="text-sm font-medium">
                    Contraindicaciones <span className="text-amber-600 text-xs font-normal">(clínicamente importante)</span>
                  </Label>
                  <Textarea
                    id="contraindicaciones"
                    rows={3}
                    placeholder="Embarazo, implantes, marcapasos, enfermedades autoinmunes…"
                    {...register('contraindicaciones')}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* ── Tab Ginecoobstétricos ───────────────────────────────── */}
          <TabsContent value="gineco" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(
                [
                  ['gestaciones', 'G — Gestaciones'],
                  ['partos', 'P — Partos'],
                  ['abortos', 'A — Abortos'],
                  ['cesareas', 'C — Cesáreas'],
                ] as [keyof FormValues, string][]
              ).map(([key, label]) => (
                <div key={key} className="space-y-1">
                  <Label className="text-xs">{label}</Label>
                  <Input
                    type="number"
                    min={0}
                    className="h-8 text-sm"
                    {...register(key)}
                  />
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fum">FUM — Fecha de última menstruación</Label>
              <Input
                id="fum"
                type="date"
                className="w-44 h-8 text-xs"
                {...register('fum')}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="planificacion_familiar">Planificación familiar</Label>
              <Textarea
                id="planificacion_familiar"
                rows={2}
                placeholder="Información sobre planificación familiar…"
                {...register('planificacion_familiar')}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="metodo_anticonceptivo">Método anticonceptivo actual</Label>
              <Textarea
                id="metodo_anticonceptivo"
                rows={2}
                placeholder="DIU, hormonal, barrera, ninguno…"
                {...register('metodo_anticonceptivo')}
              />
            </div>
          </TabsContent>

          {/* ── Tab Familiares ──────────────────────────────────────── */}
          <TabsContent value="familiares" className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ant_familiares">Antecedentes familiares y enfermedades hereditarias</Label>
              <Textarea
                id="ant_familiares"
                rows={5}
                placeholder="Diabetes, hipertensión, cáncer, cardiopatías, enfermedades autoinmunes en familiares de 1.° y 2.° grado…"
                {...register('ant_familiares')}
              />
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end pt-4">
          <Button type="submit" size="sm" disabled={isPending || !isDirty}>
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
            Guardar cambios
          </Button>
        </div>
      </form>
    </div>
  )
}
