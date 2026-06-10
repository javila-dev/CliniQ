'use client'

import { useState, useCallback, useEffect } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Plus, Activity, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatDate } from '@/lib/utils'

export interface SignoVital {
  id: string
  fecha: string
  peso?: number        // kg
  talla?: number       // cm
  pas?: number         // presión arterial sistólica mmHg
  pad?: number         // presión arterial diastólica mmHg
  fc?: number          // frecuencia cardiaca lpm
  fr?: number          // frecuencia respiratoria rpm
  temperatura?: number // °C
  spo2?: number        // SpO2 %
}

type MetricaKey = 'peso' | 'talla' | 'pas' | 'pad' | 'fc' | 'fr' | 'temperatura' | 'spo2'

const METRICAS: { key: MetricaKey; label: string; unit: string; color: string }[] = [
  { key: 'peso', label: 'Peso', unit: 'kg', color: '#6366f1' },
  { key: 'talla', label: 'Talla', unit: 'cm', color: '#8b5cf6' },
  { key: 'pas', label: 'PA Sistólica', unit: 'mmHg', color: '#ef4444' },
  { key: 'pad', label: 'PA Diastólica', unit: 'mmHg', color: '#f97316' },
  { key: 'fc', label: 'Frec. Cardiaca', unit: 'lpm', color: '#ec4899' },
  { key: 'fr', label: 'Frec. Respiratoria', unit: 'rpm', color: '#14b8a6' },
  { key: 'temperatura', label: 'Temperatura', unit: '°C', color: '#f59e0b' },
  { key: 'spo2', label: 'SpO₂', unit: '%', color: '#3b82f6' },
]

const STORAGE_KEY = (pacienteId: string) => `sv_${pacienteId}`

function loadSignos(pacienteId: string): SignoVital[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(pacienteId))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveSignos(pacienteId: string, signos: SignoVital[]) {
  localStorage.setItem(STORAGE_KEY(pacienteId), JSON.stringify(signos))
}

interface FormValues {
  fecha: string
  peso: string
  talla: string
  pas: string
  pad: string
  fc: string
  fr: string
  temperatura: string
  spo2: string
}

const EMPTY_FORM: FormValues = {
  fecha: new Date().toISOString().slice(0, 10),
  peso: '', talla: '', pas: '', pad: '', fc: '', fr: '', temperatura: '', spo2: '',
}

function formatValor(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

interface SignosVitalesWidgetProps {
  pacienteId: string
}

export function SignosVitalesWidget({ pacienteId }: SignosVitalesWidgetProps) {
  const [signos, setSignos] = useState<SignoVital[]>(() => loadSignos(pacienteId))
  const [metricaActiva, setMetricaActiva] = useState<MetricaKey>('peso')
  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useState<FormValues>(EMPTY_FORM)

  const metrica = METRICAS.find((m) => m.key === metricaActiva)!

  useEffect(() => {
    if (signos.length === 0 || signos.some((s) => s[metricaActiva] !== undefined)) return
    const primeraConDatos = METRICAS.find((m) => signos.some((s) => s[m.key] !== undefined))
    if (primeraConDatos) setMetricaActiva(primeraConDatos.key)
  }, [signos, metricaActiva])

  const registrosOrdenados = [...signos].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const chartData = registrosOrdenados
    .map((s) => ({
      fecha: formatDate(s.fecha),
      valor: s[metricaActiva] ?? null,
    }))
    .filter((d): d is { fecha: string; valor: number } => d.valor !== null)
  const ultimoSeguimiento = chartData[chartData.length - 1]
  const previoSeguimiento = chartData[chartData.length - 2]
  const variacion = ultimoSeguimiento && previoSeguimiento
    ? ultimoSeguimiento.valor - previoSeguimiento.valor
    : null

  const agregarSigno = useCallback(() => {
    const nuevo: SignoVital = {
      id: crypto.randomUUID(),
      fecha: form.fecha,
      ...(form.peso ? { peso: parseFloat(form.peso) } : {}),
      ...(form.talla ? { talla: parseFloat(form.talla) } : {}),
      ...(form.pas ? { pas: parseInt(form.pas) } : {}),
      ...(form.pad ? { pad: parseInt(form.pad) } : {}),
      ...(form.fc ? { fc: parseInt(form.fc) } : {}),
      ...(form.fr ? { fr: parseInt(form.fr) } : {}),
      ...(form.temperatura ? { temperatura: parseFloat(form.temperatura) } : {}),
      ...(form.spo2 ? { spo2: parseFloat(form.spo2) } : {}),
    }
    const updated = [...signos, nuevo]
    setSignos(updated)
    saveSignos(pacienteId, updated)
    setForm(EMPTY_FORM)
    setMostrarForm(false)
  }, [form, signos, pacienteId])

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Signos vitales</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setMostrarForm((v) => !v)}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Registrar
        </Button>
      </div>

      {/* Selector de métrica */}
      <div className="flex gap-1.5 flex-wrap">
        {METRICAS.map((m) => {
          const tieneData = signos.some((s) => s[m.key] !== undefined)
          return (
            <button
              key={m.key}
              onClick={() => setMetricaActiva(m.key)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                metricaActiva === m.key
                  ? 'bg-primary text-primary-foreground border-primary'
                  : tieneData
                  ? 'border-border hover:bg-muted'
                  : 'border-dashed text-muted-foreground hover:bg-muted'
              }`}
            >
              {m.label}
            </button>
          )
        })}
      </div>

      {/* Seguimiento */}
      <div className="rounded-md border bg-white p-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <TrendingUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Seguimiento</p>
          </div>
          <span className="text-[10px] text-muted-foreground shrink-0">{metrica.label}</span>
        </div>

        {chartData.length > 0 ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-md bg-muted/30 px-2 py-1.5">
                <p className="text-[10px] text-muted-foreground">Último</p>
                <p className="text-xs font-semibold">
                  {formatValor(ultimoSeguimiento.valor)} <span className="font-normal text-muted-foreground">{metrica.unit}</span>
                </p>
              </div>
              <div className="rounded-md bg-muted/30 px-2 py-1.5">
                <p className="text-[10px] text-muted-foreground">Variación</p>
                <p className="text-xs font-semibold">
                  {variacion === null
                    ? 'Sin comparación'
                    : (variacion > 0 ? '+' : '') + formatValor(variacion) + ' ' + metrica.unit}
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
                  <YAxis tick={{ fontSize: 10 }} width={34} domain={["auto", "auto"]} />
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
              <p className="text-[11px] text-muted-foreground">Agrega otra toma para ver la tendencia entre controles.</p>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-28 rounded-md bg-muted/30 border border-dashed px-4 text-center">
            <p className="text-xs text-muted-foreground">
              Sin registros de {metrica.label.toLowerCase()}. Usa "Registrar" para agregar el primer punto de seguimiento.
            </p>
          </div>
        )}
      </div>

      {/* Últimos valores */}
      {signos.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {METRICAS.filter((m) => signos.some((s) => s[m.key] !== undefined)).slice(0, 8).map((m) => {
            const ultimo = [...signos]
              .sort((a, b) => b.fecha.localeCompare(a.fecha))
              .find((s) => s[m.key] !== undefined)
            return (
              <div key={m.key} className="rounded-md bg-muted/40 px-2 py-1.5">
                <p className="text-[10px] text-muted-foreground">{m.label}</p>
                <p className="text-xs font-semibold">
                  {ultimo?.[m.key]} <span className="font-normal text-muted-foreground">{m.unit}</span>
                </p>
              </div>
            )
          })}
        </div>
      )}

      {/* Formulario inline */}
      {mostrarForm && (
        <div className="rounded-md border p-3 space-y-3 bg-muted/20">
          <p className="text-xs font-medium">Nuevo registro</p>
          <div className="space-y-1">
            <Label className="text-xs">Fecha *</Label>
            <Input
              type="date"
              className="h-8 text-xs w-40"
              value={form.fecha}
              onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {([
              ['peso', 'Peso (kg)'],
              ['talla', 'Talla (cm)'],
              ['pas', 'PA Sistólica'],
              ['pad', 'PA Diastólica'],
              ['fc', 'FC (lpm)'],
              ['fr', 'FR (rpm)'],
              ['temperatura', 'Temp (°C)'],
              ['spo2', 'SpO₂ (%)'],
            ] as [keyof FormValues, string][]).map(([key, label]) => (
              <div key={key} className="space-y-1">
                <Label className="text-xs">{label}</Label>
                <Input
                  className="h-8 text-xs"
                  placeholder="—"
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={() => setMostrarForm(false)}>
              Cancelar
            </Button>
            <Button type="button" size="sm" onClick={agregarSigno} disabled={!form.fecha}>
              Guardar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
