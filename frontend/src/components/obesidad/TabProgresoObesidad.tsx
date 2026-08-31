'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { Plus, Save, Loader2, TrendingDown, Target, Scale, AlertTriangle, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { obesidadApi } from '@/lib/api/obesidad'
import { formatDate } from '@/lib/utils'
import type { ObjetivoObesidadInput } from '@/types/obesidad'

interface Props {
  pacienteId: string
}

interface ObjetivoFormValues {
  peso_inicial_kg: string
  peso_objetivo_kg: string
  fecha_inicio: string
  fecha_objetivo: string
}

const EMPTY_OBJETIVO: ObjetivoFormValues = {
  peso_inicial_kg: '',
  peso_objetivo_kg: '',
  fecha_inicio: new Date().toISOString().slice(0, 10),
  fecha_objetivo: '',
}

function PorcentajeProgreso({ actual, inicial, objetivo }: { actual: number; inicial: number; objetivo: number }) {
  const total = inicial - objetivo
  const logrado = inicial - actual
  if (total <= 0) return null
  const pct = Math.min(100, Math.max(0, (logrado / total) * 100))
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{logrado.toFixed(1)} kg perdidos</span>
        <span>{pct.toFixed(0)}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export function TabProgresoObesidad({ pacienteId }: Props) {
  const [openObjetivo, setOpenObjetivo] = useState(false)
  const [editandoObjetivoId, setEditandoObjetivoId] = useState<string | null>(null)
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const { data: progreso, isLoading } = useQuery({
    queryKey: ['obesidad-progreso', pacienteId],
    queryFn: () => obesidadApi.mediciones.progreso(pacienteId),
    enabled: Boolean(pacienteId),
    staleTime: 30_000,
  })

  const { data: objetivosData } = useQuery({
    queryKey: ['obesidad-objetivos', pacienteId],
    queryFn: () => obesidadApi.objetivos.list(pacienteId),
    enabled: Boolean(pacienteId),
    staleTime: 30_000,
  })

  const objetivo = progreso?.objetivo ?? null
  const mediciones = progreso?.mediciones ?? []
  const farmacologico = progreso?.farmacologico ?? []

  const chartData = mediciones.map((m) => ({
    fecha: formatDate(m.fecha),
    peso:  parseFloat(m.peso_kg),
    imc:   m.imc ? parseFloat(m.imc) : undefined,
  }))

  const pesoActual = mediciones[0] ? parseFloat(mediciones[0].peso_kg) : null

  const { register, handleSubmit, reset, formState: { errors } } = useForm<ObjetivoFormValues>({
    defaultValues: EMPTY_OBJETIVO,
  })

  function abrirFormObjetivo(id?: string) {
    if (id && objetivo) {
      reset({
        peso_inicial_kg:  objetivo.peso_inicial_kg,
        peso_objetivo_kg: objetivo.peso_objetivo_kg,
        fecha_inicio:     objetivo.fecha_inicio,
        fecha_objetivo:   objetivo.fecha_objetivo ?? '',
      })
      setEditandoObjetivoId(id)
    } else {
      reset({
        ...EMPTY_OBJETIVO,
        peso_inicial_kg: pesoActual ? String(pesoActual) : '',
      })
      setEditandoObjetivoId(null)
    }
    setOpenObjetivo(true)
  }

  const { mutate: guardarObjetivo, isPending: guardandoObjetivo } = useMutation({
    mutationFn: (values: ObjetivoFormValues) => {
      const payload: ObjetivoObesidadInput = {
        paciente:         pacienteId,
        peso_inicial_kg:  parseFloat(values.peso_inicial_kg),
        peso_objetivo_kg: parseFloat(values.peso_objetivo_kg),
        fecha_inicio:     values.fecha_inicio,
        fecha_objetivo:   values.fecha_objetivo || null,
      }
      return editandoObjetivoId
        ? obesidadApi.objetivos.update(editandoObjetivoId, payload)
        : obesidadApi.objetivos.create(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['obesidad-progreso', pacienteId] })
      queryClient.invalidateQueries({ queryKey: ['obesidad-objetivos', pacienteId] })
      toast({ title: editandoObjetivoId ? 'Objetivo actualizado' : 'Objetivo creado' })
      reset(EMPTY_OBJETIVO)
      setOpenObjetivo(false)
    },
    onError: () => {
      toast({ title: 'Error al guardar el objetivo', variant: 'destructive' })
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-32 rounded-lg bg-muted" />
        <div className="h-64 rounded-lg bg-muted" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-6">

      {/* ── Objetivo activo ───────────────────────────────────────── */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Objetivo de peso</h3>
          </div>
          {objetivo ? (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => abrirFormObjetivo(objetivo.id)}>
              <Pencil className="h-3 w-3 mr-1" /> Editar
            </Button>
          ) : (
            <Button size="sm" className="h-7 text-xs" onClick={() => abrirFormObjetivo()}>
              <Plus className="h-3 w-3 mr-1" /> Definir objetivo
            </Button>
          )}
        </div>

        {objetivo ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Peso inicial</p>
                <p className="text-lg font-bold">{objetivo.peso_inicial_kg} <span className="text-xs font-normal">kg</span></p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Peso actual</p>
                <p className="text-lg font-bold text-primary">
                  {pesoActual ?? '—'} <span className="text-xs font-normal">kg</span>
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Meta</p>
                <p className="text-lg font-bold text-emerald-600">{objetivo.peso_objetivo_kg} <span className="text-xs font-normal">kg</span></p>
              </div>
            </div>

            {pesoActual && (
              <PorcentajeProgreso
                actual={pesoActual}
                inicial={parseFloat(objetivo.peso_inicial_kg)}
                objetivo={parseFloat(objetivo.peso_objetivo_kg)}
              />
            )}

            <div className="flex gap-4 text-xs text-muted-foreground">
              <span>Por perder: <strong className="text-foreground">{objetivo.por_perder_kg} kg</strong></span>
              <span>Inicio: {formatDate(objetivo.fecha_inicio)}</span>
              {objetivo.fecha_objetivo && <span>Meta: {formatDate(objetivo.fecha_objetivo)}</span>}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No hay un objetivo activo. Define el peso meta para hacer seguimiento del progreso.
          </p>
        )}
      </div>

      {/* ── Gráfica de peso ──────────────────────────────────────── */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <TrendingDown className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Evolución del peso</h3>
          <span className="text-xs text-muted-foreground">({mediciones.length} medición{mediciones.length !== 1 ? 'es' : ''})</span>
        </div>

        {chartData.length < 2 ? (
          <div className="h-48 flex items-center justify-center rounded-lg bg-muted/30">
            <div className="text-center space-y-1">
              <Scale className="h-8 w-8 text-muted-foreground/40 mx-auto" />
              <p className="text-sm text-muted-foreground">Se necesitan al menos 2 mediciones para graficar</p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="fecha"
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                domain={['auto', 'auto']}
              />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 6 }}
                formatter={(value: number) => [`${value} kg`, 'Peso']}
              />
              {objetivo && (
                <ReferenceLine
                  y={parseFloat(objetivo.peso_objetivo_kg)}
                  stroke="hsl(142 71% 45%)"
                  strokeDasharray="4 4"
                  label={{ value: `Meta ${objetivo.peso_objetivo_kg} kg`, position: 'right', fontSize: 10 }}
                />
              )}
              <Line
                type="monotone"
                dataKey="peso"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ r: 3, fill: 'hsl(var(--primary))' }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Farmacológico vigente ─────────────────────────────────── */}
      {farmacologico.length > 0 && (
        <div className="rounded-lg border p-4 space-y-3">
          <h3 className="text-sm font-semibold">Farmacológico vigente</h3>
          <div className="space-y-2">
            {farmacologico.map((t) => (
              <div key={t.id} className="flex items-start justify-between gap-3 rounded-md bg-muted/30 px-3 py-2">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{t.medicamento}</p>
                  <p className="text-xs text-muted-foreground">{t.dosis} · {t.frecuencia}</p>
                </div>
                <Badge variant="outline" className="text-xs shrink-0 bg-emerald-50 text-emerald-700 border-emerald-200">
                  Vigente
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Dialog objetivo ──────────────────────────────────────── */}
      <Dialog open={openObjetivo} onOpenChange={setOpenObjetivo}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editandoObjetivoId ? 'Editar objetivo' : 'Definir objetivo de peso'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit((v) => guardarObjetivo(v))} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Peso inicial (kg) <span className="text-destructive">*</span></Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="100"
                  {...register('peso_inicial_kg', { required: true })}
                />
                {errors.peso_inicial_kg && <p className="text-xs text-destructive">Requerido</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Peso meta (kg) <span className="text-destructive">*</span></Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="75"
                  {...register('peso_objetivo_kg', { required: true })}
                />
                {errors.peso_objetivo_kg && <p className="text-xs text-destructive">Requerido</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Fecha inicio <span className="text-destructive">*</span></Label>
                <Input type="date" {...register('fecha_inicio', { required: true })} />
              </div>
              <div className="space-y-1.5">
                <Label>Fecha meta (opcional)</Label>
                <Input type="date" {...register('fecha_objetivo')} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenObjetivo(false)}>Cancelar</Button>
              <Button type="submit" disabled={guardandoObjetivo}>
                {guardandoObjetivo ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
