'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useFieldArray, Controller, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Loader2, Download, Send, Save, ArrowLeft, X, Maximize2, Package2, Stethoscope, FileText, Search, Receipt } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PacienteSearchInput } from '@/components/pacientes/PacienteSearchInput'
import { PacienteForm } from '@/components/pacientes/PacienteForm'
import { CotizacionEstadoBadge } from './CotizacionEstadoBadge'
import { EnviarCotizacionModal } from './EnviarCotizacionModal'
import { HistorialEnvios } from './HistorialEnvios'
import { SesionesCotizacionPanel } from './SesionesCotizacionPanel'
import { CobrosCotizacionModal } from './CobrosCotizacionPanel'
import { cotizacionesApi } from '@/lib/api/cotizaciones'
import { clinicasApi } from '@/lib/api/clinicas'
import { pacientesApi } from '@/lib/api/pacientes'
import { useAuthStore } from '@/store/authStore'
import { useUserSedes } from '@/hooks/useUserSedes'
import { toast } from '@/hooks/use-toast'
import type { Cotizacion, EstadoCotizacion, TipoItemCotizacion } from '@/types/cotizaciones'
import type { TratamientoCatalogo, Procedimiento } from '@/types/clinicas'
import type { BusquedaPaciente, CreatePacienteRequest } from '@/types/pacientes'

// ── Schema ─────────────────────────────────────────────────────────────────────

const itemSchema = z.object({
  tipo: z.enum(['tratamiento', 'procedimiento', 'libre']),
  tratamiento: z.string().nullable().optional(),
  procedimiento: z.string().nullable().optional(),
  descripcion: z.string().min(1, 'Requerido'),
  num_citas: z.number().int().min(1),
  duracion_estimada: z.string(),
  periodicidad: z.string(),
  valor_unitario: z.number().min(0),
  descuento_porcentaje: z.number().min(0).max(100),
})

const pagoSchema = z.object({
  fecha: z.string().nullable(),
  tipo: z.enum(['efectivo', 'transferencia', 'tarjeta_credito']),
  descripcion: z.string(),
  valor: z.number().min(0),
})

const schema = z.object({
  paciente: z.object({
    id: z.string(), nombre_completo: z.string(),
    numero_documento: z.string(), tipo_documento: z.string(),
    telefono: z.string(), canal_confirmacion: z.string(),
  }).nullable(),
  sede: z.string().nullable(),
  validez_dias: z.number().int().min(1),
  notas: z.string(),
  items: z.array(itemSchema).min(1),
  formas_pago: z.array(pagoSchema),
}).superRefine((data, ctx) => {
  if (data.formas_pago.length === 0) return
  const totalItems = data.items.reduce((acc, i) => acc + (i.valor_unitario || 0) * (i.num_citas || 1) * (1 - (i.descuento_porcentaje || 0) / 100), 0)
  const sumPagos = data.formas_pago.reduce((acc, p) => acc + (p.valor || 0), 0)
  if (Math.abs(sumPagos - totalItems) > 1) {
    ctx.addIssue({
      code: 'custom',
      message: `La suma de las formas de pago (${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(sumPagos)}) no coincide con el total (${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(totalItems)})`,
      path: ['formas_pago'],
    })
  }
})

type FormValues = z.infer<typeof schema>

// ── TratamientoSelector ────────────────────────────────────────────────────────

function TratamientoSelector({
  value, tratamientos, onSelect,
}: {
  value: string
  tratamientos: TratamientoCatalogo[]
  onSelect: (t: TratamientoCatalogo) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const selected = tratamientos.find((t) => t.id === value)
  const filtered = q
    ? tratamientos.filter((t) => t.nombre.toLowerCase().includes(q.toLowerCase()))
    : tratamientos

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 w-full items-center gap-1.5 rounded-md border border-dashed border-input bg-transparent px-2 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
      >
        <Package2 className="h-3 w-3 shrink-0" />
        <span className="truncate">{selected?.nombre ?? 'Seleccionar tratamiento…'}</span>
      </button>
    )
  }

  return (
    <div className="relative">
      <div className="rounded-lg border bg-white shadow-md overflow-hidden z-20 w-64">
        <div className="flex items-center gap-2 px-2.5 py-2 border-b">
          <Search className="h-3 w-3 text-muted-foreground shrink-0" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar tratamiento…"
            className="flex-1 text-xs outline-none bg-transparent"
            onKeyDown={(e) => { if (e.key === 'Escape') { setOpen(false); setQ('') } }}
          />
        </div>
        <div className="max-h-44 overflow-y-auto divide-y">
          {filtered.map((t) => (
            <button key={t.id} type="button"
              onClick={() => { onSelect(t); setOpen(false); setQ('') }}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
            >
              <span className="text-xs font-medium truncate">{t.nombre}</span>
              {t.precio_estimado && (
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(parseFloat(t.precio_estimado))}
                </span>
              )}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-3 py-2.5 text-xs text-muted-foreground">Sin resultados</p>
          )}
        </div>
        <div className="border-t px-3 py-2 flex justify-end">
          <button type="button" onClick={() => { setOpen(false); setQ('') }}
            className="text-[10px] text-muted-foreground hover:text-foreground">Cerrar</button>
        </div>
      </div>
    </div>
  )
}


// ── ProcedimientoSelector ──────────────────────────────────────────────────────

function ProcedimientoSelector({
  value, procedimientos, onSelect,
}: {
  value: string
  procedimientos: Procedimiento[]
  onSelect: (p: Procedimiento) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const selected = procedimientos.find((p) => p.id === value)
  const filtered = q
    ? procedimientos.filter((p) => p.nombre.toLowerCase().includes(q.toLowerCase()))
    : procedimientos

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 w-full items-center gap-1.5 rounded-md border border-dashed border-input bg-transparent px-2 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
      >
        <Stethoscope className="h-3 w-3 shrink-0" />
        <span className="truncate">{selected?.nombre ?? 'Seleccionar procedimiento…'}</span>
      </button>
    )
  }

  return (
    <div className="relative">
      <div className="rounded-lg border bg-white shadow-md overflow-hidden z-20 w-64">
        <div className="flex items-center gap-2 px-2.5 py-2 border-b">
          <Search className="h-3 w-3 text-muted-foreground shrink-0" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar procedimiento…"
            className="flex-1 text-xs outline-none bg-transparent"
            onKeyDown={(e) => { if (e.key === 'Escape') { setOpen(false); setQ('') } }}
          />
        </div>
        <div className="max-h-44 overflow-y-auto divide-y">
          {filtered.map((p) => (
            <button key={p.id} type="button"
              onClick={() => { onSelect(p); setOpen(false); setQ('') }}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
            >
              <span className="text-xs font-medium truncate">{p.nombre}</span>
              {p.precio_referencia && (
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(parseFloat(p.precio_referencia))}
                </span>
              )}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-3 py-2.5 text-xs text-muted-foreground">Sin resultados</p>
          )}
        </div>
        <div className="border-t px-3 py-2 flex justify-end">
          <button type="button" onClick={() => { setOpen(false); setQ('') }}
            className="text-[10px] text-muted-foreground hover:text-foreground">Cerrar</button>
        </div>
      </div>
    </div>
  )
}


// ── Helpers ────────────────────────────────────────────────────────────────────

function calcSubtotal(valor: number, citas: number, desc: number) {
  return valor * citas * (1 - desc / 100)
}

function cop(value: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0,
  }).format(value)
}

function fechaVencimiento(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })
}

function hoy(): string {
  return new Date().toISOString().slice(0, 10)
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface CotizacionFormProps {
  cotizacion?: Cotizacion | null
  pacienteInicial?: BusquedaPaciente | null
}

// ── Componente ─────────────────────────────────────────────────────────────────

export function CotizacionForm({ cotizacion, pacienteInicial }: CotizacionFormProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const esNueva = !cotizacion
  const soloLectura = !!(cotizacion && cotizacion.estado !== 'borrador')
  const [descModal, setDescModal] = useState<{ idx: number; texto: string } | null>(null)
  const [crearPacienteOpen, setCrearPacienteOpen] = useState(false)
  const [crearPacienteNombre, setCrearPacienteNombre] = useState('')
  const [crearPacienteLoading, setCrearPacienteLoading] = useState(false)
  const [enviarOpen, setEnviarOpen] = useState(false)
  const [cobrosOpen, setCobrosOpen] = useState(false)

  const { data: tratamientos } = useQuery({
    queryKey: ['tratamientos-activos'],
    queryFn: () => clinicasApi.tratamientos.activos(),
    retry: 1,
    select: (d) => d,
  })

  const { data: procedimientos } = useQuery({
    queryKey: ['procedimientos-activos'],
    queryFn: () => clinicasApi.procedimientos.activos(),
    retry: 1,
    select: (d) => d,
  })

  const { sedes } = useUserSedes()

  const pagosRef = useRef<HTMLDivElement>(null)
  const { register, control, handleSubmit, reset, setValue, getValues, setError, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      paciente: pacienteInicial ?? null,
      sede: user?.sede_id ?? null,
      validez_dias: 30,
      notas: '',
      items: [],
      formas_pago: [],
    },
  })

  const { fields: itemFields, append: addItem, remove: removeItem } = useFieldArray({ control, name: 'items' })
  const { fields: pagoFields, append: addPago, remove: removePago } = useFieldArray({ control, name: 'formas_pago' })


  const items = useWatch({ control, name: 'items' })
  const validez = useWatch({ control, name: 'validez_dias' })

  const subtotalBruto = items.reduce((a, i) => a + (i.valor_unitario || 0) * (i.num_citas || 1), 0)
  const totalDescuentos = items.reduce((a, i) => a + (i.valor_unitario || 0) * (i.num_citas || 1) * ((i.descuento_porcentaje || 0) / 100), 0)
  const total = subtotalBruto - totalDescuentos

  useEffect(() => {
    if (cotizacion) {
      reset({
        paciente: null,
        sede: cotizacion.sede ?? null,
        validez_dias: cotizacion.validez_dias,
        notas: cotizacion.notas,
        items: cotizacion.items.map((i) => ({
          tipo: (i.tipo ?? 'libre') as TipoItemCotizacion,
          tratamiento: i.tratamiento ?? null,
          procedimiento: i.procedimiento ?? null,
          descripcion: i.descripcion,
          num_citas: i.num_citas,
          duracion_estimada: i.duracion_estimada,
          periodicidad: i.periodicidad ?? '',
          valor_unitario: parseFloat(i.valor_unitario),
          descuento_porcentaje: parseFloat(i.descuento_porcentaje),
        })),
        formas_pago: cotizacion.formas_pago.map((p) => ({
          fecha: p.fecha ? p.fecha.slice(0, 10) : null,
          tipo: p.tipo,
          descripcion: p.descripcion,
          valor: parseFloat(p.valor),
        })),
      })
    }
  }, [cotizacion, reset])

  function onTratamientoChange(idx: number, t: TratamientoCatalogo) {
    setValue(`items.${idx}.tipo`, 'tratamiento')
    setValue(`items.${idx}.tratamiento`, t.id)
    setValue(`items.${idx}.procedimiento`, null)
    const sesionesLabel = t.total_sesiones > 0 ? ` (${t.total_sesiones} sesiones)` : ''
    setValue(`items.${idx}.descripcion`, `${t.nombre}${sesionesLabel}`)
    setValue(`items.${idx}.num_citas`, 1)
    if (t.precio_estimado) setValue(`items.${idx}.valor_unitario`, parseFloat(t.precio_estimado))
  }

  function onProcedimientoChange(idx: number, p: Procedimiento) {
    setValue(`items.${idx}.tipo`, 'procedimiento')
    setValue(`items.${idx}.procedimiento`, p.id)
    setValue(`items.${idx}.tratamiento`, null)
    setValue(`items.${idx}.descripcion`, p.nombre)
    if (p.precio_referencia) setValue(`items.${idx}.valor_unitario`, parseFloat(p.precio_referencia))
  }

async function handleCrearPaciente(data: CreatePacienteRequest) {
    setCrearPacienteLoading(true)
    try {
      const nuevo = await pacientesApi.create(data)
      setValue('paciente', {
        id: nuevo.id,
        nombre_completo: nuevo.nombre_completo,
        numero_documento: nuevo.numero_documento,
        tipo_documento: nuevo.tipo_documento,
        telefono: nuevo.telefono,
        canal_confirmacion: nuevo.canal_confirmacion,
      })
      setCrearPacienteOpen(false)
    } finally {
      setCrearPacienteLoading(false)
    }
  }

  // Mutations
  const buildPayload = (values: FormValues) => {
    const payload = {
      paciente: values.paciente?.id ?? cotizacion!.paciente,
      sede: values.sede ?? null,
      validez_dias: values.validez_dias,
      notas: values.notas,
      items: values.items.map((i) => ({
        tipo: i.tipo,
        tratamiento: i.tratamiento ?? null,
        procedimiento: i.procedimiento ?? null,
        descripcion: i.descripcion,
        num_citas: i.num_citas,
        duracion_estimada: i.duracion_estimada,
        periodicidad: i.periodicidad,
        valor_unitario: i.valor_unitario,
        descuento_porcentaje: i.descuento_porcentaje,
      })),
      formas_pago: values.formas_pago,
    }
    console.log('[PATCH payload]', JSON.stringify(payload, null, 2))
    return payload
  }

  const { mutate: crear, isPending: creando } = useMutation({
    mutationFn: (values: FormValues) => cotizacionesApi.create(buildPayload(values)),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['cotizaciones'] })
      router.replace(`/cotizaciones/${data.id}`)
    },
  })

  const { mutate: actualizar, mutateAsync: actualizarAsync, isPending: actualizando } = useMutation({
    mutationFn: (values: FormValues) => cotizacionesApi.patch(cotizacion!.id, buildPayload(values)),
    onSuccess: (data) => {
      queryClient.setQueryData(['cotizacion', cotizacion!.id], data)
      queryClient.invalidateQueries({ queryKey: ['cotizaciones'] })
      toast.success('Cotización guardada')
    },
    onError: () => {
      toast.error('No se pudo guardar', 'Revisa los datos e intenta de nuevo.')
    },
  })

  const { mutate: cambiarEstado, isPending: cambiando } = useMutation({
    mutationFn: (estado: EstadoCotizacion) => cotizacionesApi.cambiarEstado(cotizacion!.id, estado),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['cotizaciones'] })
      queryClient.setQueryData(['cotizacion', cotizacion!.id], data)
      router.refresh()
    },
  })

  async function handleAceptar() {
    const values = getValues()
    const { formas_pago, items } = values
    const totalItems = items.reduce((acc, i) => acc + (i.valor_unitario || 0) * (i.num_citas || 1) * (1 - (i.descuento_porcentaje || 0) / 100), 0)
    const sumPagos = formas_pago.reduce((acc, p) => acc + (p.valor || 0), 0)

    if (formas_pago.length === 0 || Math.abs(sumPagos - totalItems) > 1) {
      const msg = formas_pago.length === 0
        ? 'Debes registrar al menos una forma de pago antes de aprobar.'
        : `La suma de formas de pago (${cop(sumPagos)}) no coincide con el total (${cop(totalItems)}).`
      setError('formas_pago', { type: 'manual', message: msg })
      pagosRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    try {
      await actualizarAsync(values)
    } catch {
      return
    }
    cambiarEstado('aceptada')
  }

  async function descargarPdf() {
    if (!cotizacion) return
    const blob = await cotizacionesApi.descargarPdf(cotizacion.id)
    const url = URL.createObjectURL(blob)
    Object.assign(document.createElement('a'), {
      href: url,
      download: `cotizacion-${cotizacion.id.slice(0, 8)}.pdf`,
    }).click()
    URL.revokeObjectURL(url)
  }

  const guardando = creando || actualizando

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Topbar ─────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-white border-b shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild>
              <Link href="/cotizaciones"><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">
                {esNueva
                  ? 'Nueva cotización'
                  : `Cotización · ${cotizacion?.paciente_nombre}`}
              </p>
              {cotizacion && (
                <p className="text-xs text-muted-foreground">
                  Creada el {new Date(cotizacion.created_at).toLocaleDateString('es-CO')}
                </p>
              )}
            </div>
            {cotizacion && <CotizacionEstadoBadge estado={cotizacion.estado} />}
          </div>

          {/* Acciones topbar */}
          <div className="flex items-center gap-2 shrink-0">
            {cotizacion && (
              <Button variant="outline" size="sm" onClick={descargarPdf}>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                PDF
              </Button>
            )}
            {cotizacion?.estado === 'aceptada' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCobrosOpen(true)}
              >
                <Receipt className="h-3.5 w-3.5 mr-1.5" />
                Cobros
              </Button>
            )}
            {cotizacion && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEnviarOpen(true)}
              >
                <Send className="h-3.5 w-3.5 mr-1.5" />
                Enviar
              </Button>
            )}
            {cotizacion?.estado === 'borrador' && (
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700"
                disabled={cambiando}
                onClick={handleAceptar}
              >
                {cambiando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Aceptar'}
              </Button>
            )}
            {!soloLectura && (
              <Button
                size="sm"
                disabled={guardando}
                onClick={handleSubmit((v) => {
                  if (esNueva && !v.paciente) {
                    setError('paciente', { type: 'required', message: 'Selecciona un cliente para continuar' })
                    return
                  }
                  esNueva ? crear(v) : actualizar(v)
                })}
              >
                {guardando
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  : <Save className="h-3.5 w-3.5 mr-1.5" />}
                {esNueva ? 'Crear cotización' : 'Guardar'}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">

        {/* ── Seguimiento de sesiones (solo cuando está aceptada) ─────────── */}
        {cotizacion?.estado === 'aceptada' && (
          <SesionesCotizacionPanel cotizacionId={cotizacion.id} pacienteId={cotizacion.paciente} />
        )}

        {/* ── Fila 1: Cliente + Meta ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Cliente */}
          <div className="bg-white rounded-xl border p-5 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cliente</p>
            {esNueva ? (
              <Controller
                control={control}
                name="paciente"
                render={({ field }) => (
                  <PacienteSearchInput
                    selected={field.value as BusquedaPaciente | null}
                    onSelect={field.onChange}
                    onClear={() => field.onChange(null)}
                    placeholder="Buscar cliente por nombre o documento..."
                    onCreateNew={(nombre) => {
                      setCrearPacienteNombre(nombre ?? '')
                      setCrearPacienteOpen(true)
                    }}
                  />
                )}
              />
            ) : (
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-rose-100 text-rose-600 font-semibold flex items-center justify-center text-sm shrink-0">
                  {cotizacion?.paciente_nombre.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-sm">{cotizacion?.paciente_nombre}</p>
                  {cotizacion?.profesional_nombre && (
                    <p className="text-xs text-muted-foreground">Profesional: {cotizacion.profesional_nombre}</p>
                  )}
                </div>
              </div>
            )}
            {errors.paciente && (
              <p className="text-xs text-destructive">Selecciona un cliente para continuar</p>
            )}
          </div>

          {/* Meta cotización */}
          <div className="bg-white rounded-xl border p-5 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Detalles</p>
            <div className="space-y-2">
              {sedes.length > 0 && (
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-sm text-muted-foreground shrink-0">Sede</Label>
                  <Controller
                    control={control}
                    name="sede"
                    render={({ field }) => (
                      <Select
                        value={field.value ?? '__sin_sede__'}
                        onValueChange={(v) => field.onChange(v === '__sin_sede__' ? null : v)}
                        disabled={soloLectura}
                      >
                        <SelectTrigger className="h-8 text-sm flex-1">
                          <SelectValue placeholder="Sin sede" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__sin_sede__">Sin sede</SelectItem>
                          {sedes.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              )}
              <div className="flex items-center justify-between">
                <Label className="text-sm text-muted-foreground">Validez</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    className="w-20 h-8 text-sm text-right"
                    disabled={soloLectura}
                    {...register('validez_dias', { valueAsNumber: true })}
                  />
                  <span className="text-sm text-muted-foreground">días</span>
                </div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Vence el</span>
                <span className="font-medium">
                  {cotizacion?.fecha_vencimiento
                    ? new Date(cotizacion.fecha_vencimiento).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })
                    : fechaVencimiento(validez || 30)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Ítems de cotización (3 secciones) ──────────────────────────── */}
        <div className="bg-white rounded-xl border overflow-hidden">

          {/* Columnas compartidas para tratamientos y procedimientos */}
          {/* grid: [selector_2fr][desc_3fr][citas_60px][precio_120px][desc%_70px][period_130px][subtotal_100px][del_36px] */}

          {(['tratamiento', 'procedimiento', 'libre'] as TipoItemCotizacion[]).map((seccion) => {
            const SECCION_CONFIG = {
              tratamiento:   { label: 'Tratamientos',      icon: Package2,     selectorLabel: 'Tratamiento',   placeholder: '' },
              procedimiento: { label: 'Procedimientos',    icon: Stethoscope,  selectorLabel: 'Procedimiento', placeholder: '' },
              libre:         { label: 'Ítems adicionales', icon: FileText,     selectorLabel: null,            placeholder: 'Descripción…' },
            }
            // Columnas y encabezados por sección
            const GRID: Record<TipoItemCotizacion, string> = {
              tratamiento:   'md:grid-cols-[2fr_120px_70px_100px_36px]',
              procedimiento: 'md:grid-cols-[2fr_60px_120px_70px_130px_100px_36px]',
              libre:         'md:grid-cols-[1fr_60px_120px_70px_130px_100px_36px]',
            }
            const HEADERS: Record<TipoItemCotizacion, React.ReactNode> = {
              tratamiento: (
                <>
                  <span>Tratamiento</span>
                  <span className="text-right">Precio</span>
                  <span className="text-right">Desc %</span>
                  <span className="text-right">Subtotal</span>
                  <span />
                </>
              ),
              procedimiento: (
                <>
                  <span>Procedimiento</span>
                  <span className="text-center">Citas</span>
                  <span className="text-right">Precio unit.</span>
                  <span className="text-right">Desc %</span>
                  <span className="text-center">Periodicidad</span>
                  <span className="text-right">Subtotal</span>
                  <span />
                </>
              ),
              libre: (
                <>
                  <span>Descripción</span>
                  <span className="text-center">Citas</span>
                  <span className="text-right">Precio unit.</span>
                  <span className="text-right">Desc %</span>
                  <span className="text-center">Periodicidad</span>
                  <span className="text-right">Subtotal</span>
                  <span />
                </>
              ),
            }
            const cfg = SECCION_CONFIG[seccion]
            const Icon = cfg.icon
            const filas = itemFields
              .map((f, i) => ({ field: f, idx: i }))
              .filter(({ idx }) => (items[idx]?.tipo ?? 'libre') === seccion)

            return (
              <div key={seccion} className="border-b last:border-b-0">
                {/* Header de sección */}
                <div className="px-5 py-3 bg-gray-50 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{cfg.label}</p>
                  </div>
                  {!soloLectura && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-primary"
                      onClick={() => addItem({
                        tipo: seccion,
                        tratamiento: null,
                        procedimiento: null,
                        descripcion: '',
                        num_citas: 1,
                        duracion_estimada: '',
                        periodicidad: '',
                        valor_unitario: 0,
                        descuento_porcentaje: 0,
                      })}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Agregar
                    </Button>
                  )}
                </div>

                {/* Header de columnas */}
                {filas.length > 0 && (
                  <div className={`hidden md:grid gap-x-3 px-5 py-2 border-b text-xs font-medium text-muted-foreground ${GRID[seccion]}`}>
                    {HEADERS[seccion]}
                  </div>
                )}

                {/* Filas de esta sección */}
                <div className="divide-y">
                  {filas.length === 0 && (
                    <p className="px-5 py-3 text-xs text-muted-foreground italic">
                      {soloLectura ? 'Sin ítems.' : `Sin ${cfg.label.toLowerCase()} — usa el botón Agregar.`}
                    </p>
                  )}
                  {filas.map(({ field, idx }) => {
                    const val = items[idx]?.valor_unitario ?? 0
                    const citas = items[idx]?.num_citas ?? 1
                    const desc = items[idx]?.descuento_porcentaje ?? 0
                    const sub = calcSubtotal(val, citas, desc)

                    const precioField = (label: string) => (
                      <div>
                        <p className="text-xs text-muted-foreground md:hidden mb-1">{label}</p>
                        <Controller
                          control={control}
                          name={`items.${idx}.valor_unitario`}
                          render={({ field: f }) => (
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none select-none">$</span>
                              <Input
                                inputMode="numeric"
                                className="h-8 text-sm text-right pl-6"
                                disabled={soloLectura}
                                value={f.value ? new Intl.NumberFormat('es-CO').format(f.value) : ''}
                                onChange={(e) => { const raw = e.target.value.replace(/\D/g, ''); f.onChange(raw ? Number(raw) : 0) }}
                                placeholder="0"
                              />
                            </div>
                          )}
                        />
                      </div>
                    )

                    const descField = (
                      <div>
                        <p className="text-xs text-muted-foreground md:hidden mb-1">Desc %</p>
                        <Input
                          type="number" min={0} max={100}
                          className="h-8 text-sm text-right"
                          disabled={soloLectura}
                          {...register(`items.${idx}.descuento_porcentaje`, { valueAsNumber: true })}
                        />
                      </div>
                    )

                    const subtotalField = (
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground md:hidden mb-1">Subtotal</p>
                        <span className="text-sm font-semibold tabular-nums">{cop(sub)}</span>
                      </div>
                    )

                    const deleteBtn = (
                      <div className="flex justify-end">
                        {!soloLectura && itemFields.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/5 transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    )

                    return (
                      <div
                        key={field.id}
                        className={`px-5 py-3 grid grid-cols-1 gap-3 items-center ${GRID[seccion]}`}
                      >
                        {/* ── TRATAMIENTO ── selector | precio | desc% | subtotal | del */}
                        {seccion === 'tratamiento' && <>
                          <div>
                            <p className="text-xs text-muted-foreground md:hidden mb-1">Tratamiento</p>
                            {!soloLectura ? (
                              <>
                                <TratamientoSelector
                                  value={items[idx]?.tratamiento ?? ''}
                                  tratamientos={tratamientos ?? []}
                                  onSelect={(t) => onTratamientoChange(idx, t)}
                                />
                                {(() => {
                                  const t = tratamientos?.find(t => t.id === items[idx]?.tratamiento)
                                  return t?.total_sesiones ? (
                                    <p className="text-xs text-muted-foreground mt-1">{t.total_sesiones} sesiones incluidas</p>
                                  ) : null
                                })()}
                              </>
                            ) : (
                              <span className="text-xs">{items[idx]?.descripcion ?? '—'}</span>
                            )}
                          </div>
                          {precioField('Precio')}
                          {descField}
                          {subtotalField}
                          {deleteBtn}
                        </>}

                        {/* ── PROCEDIMIENTO ── selector | citas | precio | desc% | periodicidad | subtotal | del */}
                        {seccion === 'procedimiento' && <>
                          <div>
                            <p className="text-xs text-muted-foreground md:hidden mb-1">Procedimiento</p>
                            {!soloLectura ? (
                              <ProcedimientoSelector
                                value={items[idx]?.procedimiento ?? ''}
                                procedimientos={procedimientos ?? []}
                                onSelect={(p) => onProcedimientoChange(idx, p)}
                              />
                            ) : (
                              <span className="text-xs">{items[idx]?.descripcion ?? '—'}</span>
                            )}
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground md:hidden mb-1">Citas</p>
                            <Input type="number" min={1} className="h-8 text-sm text-center" disabled={soloLectura}
                              {...register(`items.${idx}.num_citas`, { valueAsNumber: true })} />
                          </div>
                          {precioField('Precio unit.')}
                          {descField}
                          <div>
                            <p className="text-xs text-muted-foreground md:hidden mb-1">Periodicidad</p>
                            <Input className="h-8 text-sm text-center" placeholder="Mensual…" disabled={soloLectura}
                              {...register(`items.${idx}.periodicidad`)} />
                          </div>
                          {subtotalField}
                          {deleteBtn}
                        </>}

                        {/* ── LIBRE ── descripción | citas | precio | desc% | periodicidad | subtotal | del */}
                        {seccion === 'libre' && <>
                          <div>
                            <p className="text-xs text-muted-foreground md:hidden mb-1">Descripción</p>
                            <div className="relative group">
                              <Input
                                className="h-8 text-sm pr-7"
                                placeholder="Descripción…"
                                disabled={soloLectura}
                                {...register(`items.${idx}.descripcion`)}
                              />
                              {!soloLectura && (
                                <button
                                  type="button"
                                  title="Ampliar"
                                  onClick={() => setDescModal({ idx, texto: items[idx]?.descripcion ?? '' })}
                                  className="absolute right-1.5 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded text-muted-foreground/25 hover:text-muted-foreground/60 hover:bg-muted/60 transition-all"
                                >
                                  <Maximize2 className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                            {errors.items?.[idx]?.descripcion && (
                              <p className="text-[10px] text-destructive mt-0.5">Requerido</p>
                            )}
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground md:hidden mb-1">Citas</p>
                            <Input type="number" min={1} className="h-8 text-sm text-center" disabled={soloLectura}
                              {...register(`items.${idx}.num_citas`, { valueAsNumber: true })} />
                          </div>
                          {precioField('Precio unit.')}
                          {descField}
                          <div>
                            <p className="text-xs text-muted-foreground md:hidden mb-1">Periodicidad</p>
                            <Input className="h-8 text-sm text-center" placeholder="Mensual…" disabled={soloLectura}
                              {...register(`items.${idx}.periodicidad`)} />
                          </div>
                          {subtotalField}
                          {deleteBtn}
                        </>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* Totales */}
          <div className="px-5 py-4 bg-gray-50 border-t">
            <div className="flex justify-end">
              <div className="w-60 space-y-1.5">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{cop(subtotalBruto)}</span>
                </div>
                {totalDescuentos > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Descuentos</span>
                    <span className="tabular-nums">−{cop(totalDescuentos)}</span>
                  </div>
                )}
                <div className="flex justify-between items-baseline pt-1.5 border-t mt-1.5">
                  <span className="text-sm font-semibold">Total</span>
                  <span className="text-2xl font-bold tabular-nums">{cop(total)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Formas de pago ─────────────────────────────────────────────── */}
        <div ref={pagosRef} className="bg-white rounded-xl border p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Formas de pago</p>
            {!soloLectura && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-primary"
                onClick={() => addPago({ fecha: hoy(), tipo: 'efectivo', descripcion: '', valor: total })}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Agregar
              </Button>
            )}
          </div>

          {(errors.formas_pago?.root?.message || (errors.formas_pago as any)?.message) && (
            <p className="text-xs text-destructive -mt-1">
              {errors.formas_pago?.root?.message ?? (errors.formas_pago as any)?.message}
            </p>
          )}

          {pagoFields.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Sin formas de pago especificadas</p>
          ) : (
            <div>
              {/* Encabezado columnas */}
              <div className="hidden md:grid grid-cols-[120px_130px_1fr_160px_32px] gap-2 mb-1.5 px-1 text-xs font-medium text-muted-foreground">
                <span>Fecha</span>
                <span>Forma</span>
                <span>Observaciones</span>
                <span className="text-right">Valor</span>
                <span />
              </div>

              <div className="space-y-2">
                {pagoFields.map((field, idx) => (
                  <div key={field.id} className="grid grid-cols-1 md:grid-cols-[120px_130px_1fr_160px_32px] gap-2 items-center">
                    {/* Fecha */}
                    <div>
                      <p className="text-xs text-muted-foreground md:hidden mb-1">Fecha</p>
                      <Input
                        type="date"
                        className="h-8 text-xs"
                        disabled={soloLectura}
                        {...register(`formas_pago.${idx}.fecha`)}
                      />
                    </div>

                    {/* Forma */}
                    <div>
                      <p className="text-xs text-muted-foreground md:hidden mb-1">Forma</p>
                      <Controller
                        control={control}
                        name={`formas_pago.${idx}.tipo`}
                        render={({ field: f }) => (
                          <Select value={f.value} onValueChange={f.onChange} disabled={soloLectura}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="efectivo">Efectivo</SelectItem>
                              <SelectItem value="transferencia">Transferencia</SelectItem>
                              <SelectItem value="tarjeta_credito">Tarjeta de crédito</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>

                    {/* Observaciones */}
                    <div>
                      <p className="text-xs text-muted-foreground md:hidden mb-1">Observaciones</p>
                      <Input
                        className="h-8 text-xs"
                        disabled={soloLectura}
                        {...register(`formas_pago.${idx}.descripcion`)}
                      />
                    </div>

                    {/* Valor formateado */}
                    <div>
                      <p className="text-xs text-muted-foreground md:hidden mb-1">Valor</p>
                      <Controller
                        control={control}
                        name={`formas_pago.${idx}.valor`}
                        render={({ field: f }) => (
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none select-none">$</span>
                            <Input
                              inputMode="numeric"
                              className="h-8 text-xs text-right pl-6"
                              disabled={soloLectura}
                              value={f.value ? new Intl.NumberFormat('es-CO').format(f.value) : ''}
                              onChange={(e) => {
                                const raw = e.target.value.replace(/\D/g, '')
                                f.onChange(raw ? Number(raw) : 0)
                              }}
                              placeholder="0"
                            />
                          </div>
                        )}
                      />
                    </div>

                    {/* Eliminar */}
                    <div className="flex justify-end md:justify-center">
                      {!soloLectura && (
                        <button
                          type="button"
                          onClick={() => removePago(idx)}
                          className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/5 transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Notas ──────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border p-5 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notas</p>
          <Textarea
            rows={3}
            placeholder="Condiciones especiales, vigencia de precios, términos de la propuesta…"
            disabled={soloLectura}
            className="resize-none text-sm"
            {...register('notas')}
          />
        </div>

        {/* ── Historial de envíos ────────────────────────────────────────── */}
        {cotizacion && (
          <HistorialEnvios
            cotizacionId={cotizacion.id}
            initialEnvios={cotizacion.envios}
          />
        )}

        <div className="pb-8" />
      </div>

      {/* ── Modal cobros ───────────────────────────────────────────────── */}
      {cotizacion?.estado === 'aceptada' && (
        <CobrosCotizacionModal
          cotizacionId={cotizacion.id}
          open={cobrosOpen}
          onClose={() => setCobrosOpen(false)}
        />
      )}

      {/* ── Modal enviar cotización ────────────────────────────────────── */}
      {cotizacion && (
        <EnviarCotizacionModal
          open={enviarOpen}
          onClose={() => setEnviarOpen(false)}
          cotizacionId={cotizacion.id}
          pacienteTelefono={cotizacion.paciente_telefono}
          pacienteEmail={cotizacion.paciente_email}
        />
      )}

{/* ── Modal crear paciente ───────────────────────────────────────── */}
      <Dialog open={crearPacienteOpen} onOpenChange={setCrearPacienteOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo paciente</DialogTitle>
          </DialogHeader>
          <PacienteForm
            onSubmit={handleCrearPaciente}
            isLoading={crearPacienteLoading}
            submitLabel="Crear y seleccionar"
            initialNombre={crearPacienteNombre}
            compact
          />
        </DialogContent>
      </Dialog>

      {/* ── Modal descripción ampliada ──────────────────────────────────── */}
      <Dialog open={!!descModal} onOpenChange={(open) => !open && setDescModal(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">Descripción del procedimiento</DialogTitle>
          </DialogHeader>
          <Textarea
            rows={6}
            className="resize-none text-sm mt-1"
            placeholder="Escribe una descripción detallada del procedimiento o condiciones especiales…"
            value={descModal?.texto ?? ''}
            onChange={(e) => setDescModal((d) => d ? { ...d, texto: e.target.value } : d)}
            autoFocus
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDescModal(null)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (descModal !== null) {
                  setValue(`items.${descModal.idx}.descripcion`, descModal.texto, { shouldDirty: true })
                }
                setDescModal(null)
              }}
            >
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
