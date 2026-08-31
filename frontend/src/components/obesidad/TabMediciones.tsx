'use client'

import { useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Plus, Save, Loader2, Activity, TrendingUp, TrendingDown, Minus, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { obesidadApi } from '@/lib/api/obesidad'
import { formatDate } from '@/lib/utils'
import type { MedicionAntropometrica, MedicionAntropometricaInput } from '@/types/obesidad'

interface Props {
  pacienteId: string
  notaId?: string
  citaId?: string
}

interface FormValues {
  fecha: string
  peso_kg: string
  talla_cm: string
  presion_sistolica: string
  presion_diastolica: string
  frecuencia_cardiaca: string
  frecuencia_respiratoria: string
  temperatura_c: string
  saturacion_oxigeno: string
  cintura_cm: string
  cadera_cm: string
  brazo_cm: string
  muslo_cm: string
  abdomen_alto_cm: string
  abdomen_medio_cm: string
  abdomen_bajo_cm: string
  pierna_derecha_alto_cm: string
  pierna_derecha_bajo_cm: string
  pierna_izquierda_alto_cm: string
  pierna_izquierda_bajo_cm: string
  grasa_corporal_pct: string
  masa_muscular_kg: string
  grasa_visceral: string
  agua_corporal_pct: string
}

const EMPTY: FormValues = {
  fecha: new Date().toISOString().slice(0, 16),
  peso_kg: '',
  talla_cm: '',
  presion_sistolica: '',
  presion_diastolica: '',
  frecuencia_cardiaca: '',
  frecuencia_respiratoria: '',
  temperatura_c: '',
  saturacion_oxigeno: '',
  cintura_cm: '',
  cadera_cm: '',
  brazo_cm: '',
  muslo_cm: '',
  abdomen_alto_cm: '',
  abdomen_medio_cm: '',
  abdomen_bajo_cm: '',
  pierna_derecha_alto_cm: '',
  pierna_derecha_bajo_cm: '',
  pierna_izquierda_alto_cm: '',
  pierna_izquierda_bajo_cm: '',
  grasa_corporal_pct: '',
  masa_muscular_kg: '',
  grasa_visceral: '',
  agua_corporal_pct: '',
}

type MetricaKey =
  | 'peso_kg' | 'imc'
  | 'presion_sistolica' | 'presion_diastolica'
  | 'frecuencia_cardiaca' | 'frecuencia_respiratoria'
  | 'temperatura_c' | 'saturacion_oxigeno'
  | 'cintura_cm' | 'cadera_cm' | 'icc' | 'brazo_cm' | 'muslo_cm'
  | 'abdomen_alto_cm' | 'abdomen_medio_cm' | 'abdomen_bajo_cm'
  | 'pierna_derecha_alto_cm' | 'pierna_derecha_bajo_cm'
  | 'pierna_izquierda_alto_cm' | 'pierna_izquierda_bajo_cm'
  | 'grasa_corporal_pct' | 'masa_muscular_kg' | 'grasa_visceral' | 'agua_corporal_pct'

const METRICAS: { key: MetricaKey; label: string; unit: string; color: string }[] = [
  { key: 'peso_kg',                  label: 'Peso',               unit: 'kg',   color: '#6366f1' },
  { key: 'imc',                      label: 'IMC',                unit: '',     color: '#8b5cf6' },
  { key: 'presion_sistolica',        label: 'PA Sistólica',       unit: 'mmHg', color: '#ef4444' },
  { key: 'presion_diastolica',       label: 'PA Diastólica',      unit: 'mmHg', color: '#f97316' },
  { key: 'frecuencia_cardiaca',      label: 'Frec. Cardiaca',     unit: 'lpm',  color: '#ec4899' },
  { key: 'frecuencia_respiratoria',  label: 'Frec. Respiratoria', unit: 'rpm',  color: '#14b8a6' },
  { key: 'temperatura_c',            label: 'Temperatura',        unit: '°C',   color: '#f59e0b' },
  { key: 'saturacion_oxigeno',       label: 'SpO₂',                unit: '%',    color: '#3b82f6' },
  { key: 'cintura_cm',               label: 'Cintura',            unit: 'cm',   color: '#0ea5e9' },
  { key: 'cadera_cm',                label: 'Cadera',             unit: 'cm',   color: '#a855f7' },
  { key: 'icc',                      label: 'ICC',                unit: '',     color: '#d946ef' },
  { key: 'brazo_cm',                 label: 'Brazo',              unit: 'cm',   color: '#22c55e' },
  { key: 'muslo_cm',                 label: 'Muslo',              unit: 'cm',   color: '#84cc16' },
  { key: 'abdomen_alto_cm',          label: 'Abdomen alto',       unit: 'cm',   color: '#06b6d4' },
  { key: 'abdomen_medio_cm',         label: 'Abdomen medio',      unit: 'cm',   color: '#0891b2' },
  { key: 'abdomen_bajo_cm',          label: 'Abdomen bajo',       unit: 'cm',   color: '#0e7490' },
  { key: 'pierna_derecha_alto_cm',   label: 'Pierna der. alto',   unit: 'cm',   color: '#f43f5e' },
  { key: 'pierna_derecha_bajo_cm',   label: 'Pierna der. bajo',   unit: 'cm',   color: '#fb7185' },
  { key: 'pierna_izquierda_alto_cm', label: 'Pierna izq. alto',   unit: 'cm',   color: '#e11d48' },
  { key: 'pierna_izquierda_bajo_cm', label: 'Pierna izq. bajo',   unit: 'cm',   color: '#be123c' },
  { key: 'grasa_corporal_pct',       label: 'Grasa corporal',     unit: '%',    color: '#eab308' },
  { key: 'masa_muscular_kg',         label: 'Masa muscular',      unit: 'kg',   color: '#65a30d' },
  { key: 'grasa_visceral',           label: 'Grasa visceral',     unit: '',     color: '#ca8a04' },
  { key: 'agua_corporal_pct',        label: '% de agua',          unit: '%',    color: '#0284c7' },
]

type FieldKey = Exclude<keyof FormValues, 'fecha'>

interface FieldConfig {
  key: FieldKey
  label: string
  unit?: string
  step?: string
  min?: number
  max?: number
  placeholder: string
  required?: boolean
}

const ALL_FIELDS: FieldConfig[] = [
  { key: 'peso_kg',                   label: 'Peso',               unit: 'kg',   step: '0.1', min: 1,  max: 500, placeholder: '70.5', required: true },
  { key: 'talla_cm',                  label: 'Talla',              unit: 'cm',   step: '0.1', min: 1,  max: 250, placeholder: '165' },
  { key: 'presion_sistolica',         label: 'P. sistólica',       unit: 'mmHg',              min: 60, max: 300, placeholder: '120' },
  { key: 'presion_diastolica',        label: 'P. diastólica',      unit: 'mmHg',              min: 40, max: 200, placeholder: '80' },
  { key: 'frecuencia_cardiaca',       label: 'Frec. cardíaca',     unit: 'lpm',                min: 20, max: 250, placeholder: '72' },
  { key: 'frecuencia_respiratoria',   label: 'Frec. respiratoria', unit: 'rpm',                min: 5,  max: 60,  placeholder: '16' },
  { key: 'temperatura_c',             label: 'Temperatura',        unit: '°C',   step: '0.1', min: 30, max: 45,  placeholder: '36.5' },
  { key: 'saturacion_oxigeno',        label: 'SpO₂',                unit: '%',    step: '0.1', min: 50, max: 100, placeholder: '98' },
  { key: 'cintura_cm',                label: 'Cintura',            unit: 'cm',   step: '0.1', placeholder: '90' },
  { key: 'cadera_cm',                 label: 'Cadera',             unit: 'cm',   step: '0.1', placeholder: '100' },
  { key: 'brazo_cm',                  label: 'Brazo',              unit: 'cm',   step: '0.1', placeholder: '32' },
  { key: 'muslo_cm',                  label: 'Muslo',              unit: 'cm',   step: '0.1', placeholder: '55' },
  { key: 'abdomen_alto_cm',           label: 'Abdomen alto',       unit: 'cm',   step: '0.1', placeholder: '90' },
  { key: 'abdomen_medio_cm',          label: 'Abdomen medio',      unit: 'cm',   step: '0.1', placeholder: '85' },
  { key: 'abdomen_bajo_cm',           label: 'Abdomen bajo',       unit: 'cm',   step: '0.1', placeholder: '95' },
  { key: 'pierna_derecha_alto_cm',    label: 'Pierna der. alto',   unit: 'cm',   step: '0.1', placeholder: '55' },
  { key: 'pierna_derecha_bajo_cm',    label: 'Pierna der. bajo',   unit: 'cm',   step: '0.1', placeholder: '40' },
  { key: 'pierna_izquierda_alto_cm',  label: 'Pierna izq. alto',   unit: 'cm',   step: '0.1', placeholder: '55' },
  { key: 'pierna_izquierda_bajo_cm',  label: 'Pierna izq. bajo',   unit: 'cm',   step: '0.1', placeholder: '40' },
  { key: 'grasa_corporal_pct',        label: 'Grasa corporal',     unit: '%',    step: '0.1', min: 1,  max: 70,  placeholder: '35' },
  { key: 'masa_muscular_kg',          label: 'Masa muscular',      unit: 'kg',   step: '0.1', placeholder: '28' },
  { key: 'grasa_visceral',            label: 'Grasa visceral',                  step: '0.1', placeholder: '8' },
  { key: 'agua_corporal_pct',         label: '% de agua',          unit: '%',    step: '0.1', min: 1,  max: 90,  placeholder: '55' },
]

const MEDIDA_KEYS = ALL_FIELDS.map((f) => f.key)

/** Convierte una medición existente al shape del formulario (todo string). */
function medicionToForm(m: MedicionAntropometrica): FormValues {
  const out: FormValues = { ...EMPTY, fecha: m.fecha ? m.fecha.slice(0, 16) : EMPTY.fecha }
  for (const k of MEDIDA_KEYS) {
    const v = m[k]
    out[k] = v == null ? '' : String(v)
  }
  return out
}

/** Campos que ya tienen dato en la medición (siempre incluye peso). */
function medicionActiveFields(m: MedicionAntropometrica): Set<FieldKey> {
  const s = new Set<FieldKey>(['peso_kg'])
  for (const k of MEDIDA_KEYS) {
    if (m[k] != null) s.add(k)
  }
  return s
}

function toNum(s: string): number | null {
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

function toInt(s: string): number | null {
  const n = parseInt(s, 10)
  return isNaN(n) ? null : n
}

function metricValue(m: MedicionAntropometrica, key: MetricaKey): number | null {
  const raw = m[key]
  if (raw === null || raw === undefined) return null
  const n = typeof raw === 'string' ? parseFloat(raw) : raw
  return isNaN(n) ? null : n
}

function formatValor(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function compact3(a: string | null, m: string | null, b: string | null): string {
  if (!a && !m && !b) return '—'
  return `${a ?? '—'}/${m ?? '—'}/${b ?? '—'}`
}

function compact2(a: string | null, b: string | null): string {
  if (!a && !b) return '—'
  return `${a ?? '—'}/${b ?? '—'}`
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-muted-foreground text-xs">—</span>
  if (Math.abs(delta) < 0.01) return <span className="text-xs text-muted-foreground flex items-center gap-0.5"><Minus className="h-3 w-3" /> 0</span>
  if (delta < 0) return <span className="text-xs text-emerald-600 font-medium flex items-center gap-0.5"><TrendingDown className="h-3 w-3" />{delta.toFixed(1)}</span>
  return <span className="text-xs text-rose-500 font-medium flex items-center gap-0.5"><TrendingUp className="h-3 w-3" />+{delta.toFixed(1)}</span>
}

function TendenciaSeguimiento({ mediciones }: { mediciones: MedicionAntropometrica[] }) {
  const [metricaActiva, setMetricaActiva] = useState<MetricaKey>('peso_kg')
  const metrica = METRICAS.find((m) => m.key === metricaActiva)!

  const registrosOrdenados = useMemo(
    () => [...mediciones].sort((a, b) => a.fecha.localeCompare(b.fecha)),
    [mediciones],
  )

  const metricasConDatos = useMemo(
    () => METRICAS.filter((m) => registrosOrdenados.some((r) => metricValue(r, m.key) !== null)),
    [registrosOrdenados],
  )

  const chartData = registrosOrdenados
    .map((m) => ({ fecha: formatDate(m.fecha), valor: metricValue(m, metricaActiva) }))
    .filter((d): d is { fecha: string; valor: number } => d.valor !== null)

  const ultimo = chartData[chartData.length - 1]
  const previo = chartData[chartData.length - 2]
  const variacion = ultimo && previo ? ultimo.valor - previo.valor : null

  if (metricasConDatos.length === 0) return null

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tendencia</p>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {metricasConDatos.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMetricaActiva(m.key)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              metricaActiva === m.key
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border hover:bg-muted'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {chartData.length > 0 ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-md bg-muted/30 px-2 py-1.5">
              <p className="text-[10px] text-muted-foreground">Último</p>
              <p className="text-xs font-semibold">
                {formatValor(ultimo.valor)} <span className="font-normal text-muted-foreground">{metrica.unit}</span>
              </p>
            </div>
            <div className="rounded-md bg-muted/30 px-2 py-1.5">
              <p className="text-[10px] text-muted-foreground">Variación</p>
              <p className="text-xs font-semibold">
                {variacion === null ? 'Sin comparación' : (variacion > 0 ? '+' : '') + formatValor(variacion) + ' ' + metrica.unit}
              </p>
            </div>
            <div className="rounded-md bg-muted/30 px-2 py-1.5">
              <p className="text-[10px] text-muted-foreground">Tomas</p>
              <p className="text-xs font-semibold">{chartData.length}</p>
            </div>
          </div>

          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="fecha" tick={{ fontSize: 10 }} tickMargin={8} />
                <YAxis tick={{ fontSize: 10 }} width={34} domain={['auto', 'auto']} />
                <Tooltip
                  formatter={(value) => [formatValor(Number(value)) + ' ' + metrica.unit, metrica.label]}
                  contentStyle={{ fontSize: 11, borderRadius: 8 }}
                />
                <Line
                  type="monotone"
                  dataKey="valor"
                  stroke={metrica.color}
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: metrica.color, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  name={metrica.label}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {chartData.length === 1 && (
            <p className="text-[11px] text-muted-foreground">Agrega otro registro para ver la tendencia entre controles.</p>
          )}
        </>
      ) : (
        <div className="flex items-center justify-center h-28 rounded-md bg-muted/30 border border-dashed px-4 text-center">
          <p className="text-xs text-muted-foreground">Sin registros de {metrica.label.toLowerCase()}.</p>
        </div>
      )}
    </div>
  )
}

export function TabMediciones({ pacienteId, notaId, citaId }: Props) {
  const [open, setOpen] = useState(false)
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['obesidad-mediciones', pacienteId],
    queryFn: () => obesidadApi.mediciones.list(pacienteId),
    enabled: Boolean(pacienteId),
    staleTime: 30_000,
  })

  const mediciones = data?.results ?? []

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<FormValues>({ defaultValues: EMPTY })
  const [activeFields, setActiveFields] = useState<Set<FieldKey>>(new Set(['peso_kg']))
  const [editingId, setEditingId] = useState<string | null>(null)

  // Medición ya tomada en esta sesión (misma cita) — el modal edita esa, no crea otra.
  const sesionMedicion = citaId ? mediciones.find((m) => m.cita === citaId) ?? null : null

  const resetModal = () => {
    reset(EMPTY)
    setActiveFields(new Set(['peso_kg']))
    setEditingId(null)
  }

  const abrirModal = () => {
    if (sesionMedicion) {
      setEditingId(sesionMedicion.id)
      reset(medicionToForm(sesionMedicion))
      setActiveFields(medicionActiveFields(sesionMedicion))
    } else {
      resetModal()
    }
    setOpen(true)
  }

  const abrirEdicion = (m: MedicionAntropometrica) => {
    setEditingId(m.id)
    reset(medicionToForm(m))
    setActiveFields(medicionActiveFields(m))
    setOpen(true)
  }

  const toggleField = (field: FieldConfig) => {
    if (field.required) return
    setActiveFields((prev) => {
      const next = new Set(prev)
      if (next.has(field.key)) {
        next.delete(field.key)
        setValue(field.key, '')
      } else {
        next.add(field.key)
      }
      return next
    })
  }

  const { mutate, isPending } = useMutation({
    mutationFn: (values: FormValues) => {
      const payload: MedicionAntropometricaInput = {
        paciente: pacienteId,
        // Al editar no reasignamos nota/cita: se conserva el vínculo original de la sesión.
        ...(editingId ? {} : { nota: notaId ?? null, cita: citaId ?? null }),
        fecha: values.fecha,
        peso_kg: parseFloat(values.peso_kg),
        talla_cm: toNum(values.talla_cm),
        presion_sistolica: toInt(values.presion_sistolica),
        presion_diastolica: toInt(values.presion_diastolica),
        frecuencia_cardiaca: toInt(values.frecuencia_cardiaca),
        frecuencia_respiratoria: toInt(values.frecuencia_respiratoria),
        temperatura_c: toNum(values.temperatura_c),
        saturacion_oxigeno: toNum(values.saturacion_oxigeno),
        cintura_cm: toNum(values.cintura_cm),
        cadera_cm: toNum(values.cadera_cm),
        brazo_cm: toNum(values.brazo_cm),
        muslo_cm: toNum(values.muslo_cm),
        abdomen_alto_cm: toNum(values.abdomen_alto_cm),
        abdomen_medio_cm: toNum(values.abdomen_medio_cm),
        abdomen_bajo_cm: toNum(values.abdomen_bajo_cm),
        pierna_derecha_alto_cm: toNum(values.pierna_derecha_alto_cm),
        pierna_derecha_bajo_cm: toNum(values.pierna_derecha_bajo_cm),
        pierna_izquierda_alto_cm: toNum(values.pierna_izquierda_alto_cm),
        pierna_izquierda_bajo_cm: toNum(values.pierna_izquierda_bajo_cm),
        grasa_corporal_pct: toNum(values.grasa_corporal_pct),
        masa_muscular_kg: toNum(values.masa_muscular_kg),
        grasa_visceral: toNum(values.grasa_visceral),
        agua_corporal_pct: toNum(values.agua_corporal_pct),
      }
      return editingId
        ? obesidadApi.mediciones.update(editingId, payload)
        : obesidadApi.mediciones.create(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['obesidad-mediciones', pacienteId] })
      toast({ title: editingId ? 'Registro actualizado' : 'Registro guardado' })
      resetModal()
      setOpen(false)
    },
    onError: () => {
      toast({ title: 'Error al guardar el registro', variant: 'destructive' })
    },
  })

  const { mutate: eliminar, isPending: isDeleting } = useMutation({
    mutationFn: (id: string) => obesidadApi.mediciones.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['obesidad-mediciones', pacienteId] })
      toast({ title: 'Registro eliminado' })
    },
    onError: () => {
      toast({ title: 'Error al eliminar el registro', variant: 'destructive' })
    },
  })

  const prev = mediciones[1] ?? null

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Signos vitales y seguimiento</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{mediciones.length} registro{mediciones.length !== 1 ? 's' : ''}</p>
        </div>
        <Button size="sm" onClick={abrirModal}>
          {sesionMedicion
            ? <><Pencil className="h-3.5 w-3.5 mr-1.5" />Cambiar registro</>
            : <><Plus className="h-3.5 w-3.5 mr-1.5" />Nuevo registro</>}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2 animate-pulse">
          {[1, 2].map((i) => <div key={i} className="h-16 rounded-lg bg-muted" />)}
        </div>
      ) : mediciones.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <Activity className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Sin registros de seguimiento</p>
        </div>
      ) : (
        <>
          <TendenciaSeguimiento mediciones={mediciones} />

          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Fecha</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Peso (kg)</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">IMC</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">PA</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">FC</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">FR</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Temp.</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">SpO₂</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Cintura</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Cadera</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">ICC</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Brazo</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Muslo</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Abdomen A/M/B</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Pierna D/I</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Grasa %</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">M. Muscular</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Grasa visc.</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Agua %</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Δ peso</th>
                  <th className="px-3 py-2 w-px" />
                </tr>
              </thead>
              <tbody>
                {mediciones.map((m, idx) => {
                  const prevM = mediciones[idx + 1] ?? null
                  const deltaPeso = prevM ? parseFloat(m.peso_kg) - parseFloat(prevM.peso_kg) : null
                  return (
                    <tr key={m.id} className="border-t hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 text-xs whitespace-nowrap">{formatDate(m.fecha)}</td>
                      <td className="px-3 py-2 text-right font-medium">{m.peso_kg}</td>
                      <td className="px-3 py-2 text-right">{m.imc ?? '—'}</td>
                      <td className="px-3 py-2 text-right text-xs">
                        {m.presion_sistolica && m.presion_diastolica
                          ? `${m.presion_sistolica}/${m.presion_diastolica}`
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-right">{m.frecuencia_cardiaca ?? '—'}</td>
                      <td className="px-3 py-2 text-right">{m.frecuencia_respiratoria ?? '—'}</td>
                      <td className="px-3 py-2 text-right">{m.temperatura_c ?? '—'}</td>
                      <td className="px-3 py-2 text-right">{m.saturacion_oxigeno ?? '—'}</td>
                      <td className="px-3 py-2 text-right">{m.cintura_cm ?? '—'}</td>
                      <td className="px-3 py-2 text-right">{m.cadera_cm ?? '—'}</td>
                      <td className="px-3 py-2 text-right">{m.icc ?? '—'}</td>
                      <td className="px-3 py-2 text-right">{m.brazo_cm ?? '—'}</td>
                      <td className="px-3 py-2 text-right">{m.muslo_cm ?? '—'}</td>
                      <td className="px-3 py-2 text-right text-xs">
                        {compact3(m.abdomen_alto_cm, m.abdomen_medio_cm, m.abdomen_bajo_cm)}
                      </td>
                      <td className="px-3 py-2 text-right text-xs">
                        D {compact2(m.pierna_derecha_alto_cm, m.pierna_derecha_bajo_cm)} · I {compact2(m.pierna_izquierda_alto_cm, m.pierna_izquierda_bajo_cm)}
                      </td>
                      <td className="px-3 py-2 text-right">{m.grasa_corporal_pct ?? '—'}</td>
                      <td className="px-3 py-2 text-right">{m.masa_muscular_kg ?? '—'}</td>
                      <td className="px-3 py-2 text-right">{m.grasa_visceral ?? '—'}</td>
                      <td className="px-3 py-2 text-right">{m.agua_corporal_pct ?? '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <DeltaBadge delta={deltaPeso} />
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => abrirEdicion(m)}
                            className="p-1 rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors"
                            title="Editar registro"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={isDeleting}
                            onClick={() => {
                              if (window.confirm('¿Eliminar este registro de seguimiento?')) eliminar(m.id)
                            }}
                            className="p-1 rounded text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
                            title="Eliminar registro"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetModal() }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Cambiar registro' : 'Nuevo registro'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit((v) => mutate(v))} className="space-y-4">
            {editingId && (
              <p className="text-xs text-muted-foreground rounded-md bg-muted/50 px-2.5 py-1.5">
                Editando un registro existente. Los valores ya tomados vienen precargados; ajústalos o agrega más medidas.
              </p>
            )}
            <div className="space-y-1.5">
              <Label>Fecha y hora</Label>
              <Input type="datetime-local" {...register('fecha', { required: true })} />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Medidas</p>
              <div className="flex gap-1.5 flex-wrap">
                {ALL_FIELDS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => toggleField(f)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      f.required
                        ? 'bg-primary text-primary-foreground border-primary cursor-default'
                        : activeFields.has(f.key)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border hover:bg-muted'
                    }`}
                  >
                    {f.label}{f.required ? ' *' : ''}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {ALL_FIELDS.filter((f) => activeFields.has(f.key)).map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label>{f.label}{f.unit ? ` (${f.unit})` : ''}{f.required && <span className="text-destructive"> *</span>}</Label>
                  <Input
                    type="number"
                    step={f.step}
                    min={f.min}
                    max={f.max}
                    placeholder={f.placeholder}
                    {...register(f.key, f.required ? { required: true } : undefined)}
                  />
                  {f.required && errors[f.key] && <p className="text-xs text-destructive">Requerido</p>}
                </div>
              ))}
            </div>

            {prev && (
              <p className="text-xs text-muted-foreground">
                Último registro: <strong>{prev.peso_kg} kg</strong> ({formatDate(prev.fecha)})
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  resetModal()
                  setOpen(false)
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                {editingId ? 'Guardar cambios' : 'Guardar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
