'use client'

import { useState, useMemo, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileCheck, Stethoscope, Clock } from 'lucide-react'
import { agendaApi } from '@/lib/api/agenda'
import { clinicasApi } from '@/lib/api/clinicas'
import { pacientesApi } from '@/lib/api/pacientes'
import { cotizacionesApi } from '@/lib/api/cotizaciones'
import { protocolosApi } from '@/lib/api/protocolos'
import type { TipoItemCotizacion } from '@/types/cotizaciones'
import { PacienteSearchInput } from '@/components/pacientes/PacienteSearchInput'
import { PacienteForm } from '@/components/pacientes/PacienteForm'
import { ProfesionalSelect } from './ProfesionalSelect'
import { ServicioSelect } from './ServicioSelect'
import { SedeSelect } from './SedeSelect'
import { SlotPicker } from './SlotPicker'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { BusquedaPaciente, CreatePacienteRequest } from '@/types/pacientes'

type ModoCita = 'cotizacion' | 'servicio' | 'libre'

const DURACIONES_MIN = [15, 30, 45, 60, 90, 120]

const schema = z.object({
  sede:           z.string().min(1, 'Selecciona una sede'),
  profesional:    z.string().min(1, 'Selecciona un profesional'),
  servicio:       z.string().optional(),
  fecha:          z.string().min(1, 'Selecciona una fecha'),
  slot:           z.string().min(1, 'Selecciona un horario'),
  canal_origen:   z.enum(['presencial', 'telefono', 'web', 'redes']),
  notas_internas: z.string().optional(),
  motivo:         z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface NuevaCitaModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultFecha?: string
}

export function NuevaCitaModal({ open, onOpenChange, defaultFecha }: NuevaCitaModalProps) {
  const queryClient = useQueryClient()

  // Estado del paciente
  const [paciente, setPaciente] = useState<BusquedaPaciente | null>(null)
  const [pacienteError, setPacienteError] = useState(false)

  // Estado del modo
  const [modo, setModo] = useState<ModoCita>('servicio')

  // Estado específico por modo
  const [itemCotizacion, setItemCotizacion] = useState<string | null>(null)
  const [itemCotizacionTipo, setItemCotizacionTipo] = useState<TipoItemCotizacion | null>(null)
  const [itemCotizacionError, setItemCotizacionError] = useState(false)
  const [sesionEjecutada, setSesionEjecutada] = useState<string | null>(null)
  const [duracionLibre, setDuracionLibre] = useState(0)
  const [duracionError, setDuracionError] = useState(false)

  // Errores de servidor
  const [serverError, setServerError] = useState<string | null>(null)

  // Creación de paciente inline
  const [crearPacienteOpen, setCrearPacienteOpen] = useState(false)
  const [crearPacienteNombre, setCrearPacienteNombre] = useState('')
  const [crearPacienteLoading, setCrearPacienteLoading] = useState(false)

  const { control, register, handleSubmit, watch, setValue, reset, formState: { errors } } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: {
        fecha: defaultFecha ?? new Date().toISOString().split('T')[0],
        canal_origen: 'telefono',
      },
    })

  const sedeId      = watch('sede')
  const profesionalId = watch('profesional')
  const servicioId  = watch('servicio')
  const fecha       = watch('fecha')
  const slot        = watch('slot')

  // Sincroniza la fecha del calendario cada vez que el modal se abre
  useEffect(() => {
    if (open && defaultFecha) {
      setValue('fecha', defaultFecha)
      setValue('slot', '')
    }
  }, [open, defaultFecha])

  const { data: sedesData } = useQuery({
    queryKey: ['sedes'],
    queryFn: () => clinicasApi.sedes.list({ activa: true }),
  })
  const clinicaId = sedesData?.results.find((s) => s.id === sedeId)?.clinica

  const { data: cotizacionesPaciente } = useQuery({
    queryKey: ['cotizaciones-aceptadas', paciente?.id],
    queryFn: () => cotizacionesApi.list({ estado: 'aceptada', paciente: paciente!.id }),
    enabled: Boolean(paciente?.id),
  })

  const cotizacionIds = cotizacionesPaciente?.results.map((c) => c.id) ?? []
  const sesionesQueries = useQueries({
    queries: cotizacionIds.map((id) => ({
      queryKey: ['cotizacion-sesiones', id],
      queryFn: () => cotizacionesApi.sesiones(id),
    })),
  })

  const hasCotizaciones = (cotizacionesPaciente?.results.length ?? 0) > 0

  // ── Queries para sesiones del tratamiento (H30) ───────────────
  const { data: tratamientosPaciente } = useQuery({
    queryKey: ['tratamientos-modal', paciente?.id],
    queryFn: () => protocolosApi.tratamientos.list({ paciente: paciente!.id, estado: 'activo' }),
    enabled: Boolean(paciente?.id) && modo === 'cotizacion',
  })

  const tratamientoResumen = (itemCotizacion && itemCotizacionTipo === 'tratamiento')
    ? (tratamientosPaciente?.find((t) => t.cotizacion_item === itemCotizacion) ?? null)
    : null

  const { data: tratamientoDetalle, isLoading: loadingTratamiento } = useQuery({
    queryKey: ['tratamiento-modal-detalle', tratamientoResumen?.id],
    queryFn: () => protocolosApi.tratamientos.get(tratamientoResumen!.id),
    enabled: Boolean(tratamientoResumen?.id),
  })

  const sesionesPendientes = useMemo(() => {
    if (!tratamientoDetalle) return []
    if (tratamientoDetalle.grupos?.length) {
      return tratamientoDetalle.grupos.flatMap((g) =>
        g.sesiones
          .filter((s) => s.estado === 'pendiente')
          .map((s) => ({
            id: s.id,
            label: `Sesión ${s.numero}/${g.total} · ${g.tipo_sesion_nombre}`,
            procedimientos: g.procedimientos,
          }))
      )
    }
    return (tratamientoDetalle.sesiones ?? [])
      .filter((s) => s.estado === 'pendiente')
      .map((s) => ({
        id: s.id,
        label: `Sesión ${s.sesion_numero} · ${s.paso_nombre}`,
        procedimientos: [] as string[],
      }))
  }, [tratamientoDetalle])

  const { mutateAsync, isPending } = useMutation({
    mutationFn: agendaApi.citas.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['citas'] })
      handleClose()
    },
  })

  // ── Helpers ──────────────────────────────────────────────────

  function cambiarModo(nuevoModo: ModoCita) {
    setModo(nuevoModo)
    setValue('slot', '')
    setValue('servicio', '')
    setItemCotizacion(null)
    setItemCotizacionTipo(null)
    setItemCotizacionError(false)
    setSesionEjecutada(null)
    setDuracionLibre(0)
    setDuracionError(false)
    setServerError(null)
  }

  const handleClose = () => {
    reset()
    setPaciente(null)
    setPacienteError(false)
    setModo('servicio')
    setItemCotizacion(null)
    setItemCotizacionTipo(null)
    setItemCotizacionError(false)
    setSesionEjecutada(null)
    setDuracionLibre(0)
    setDuracionError(false)
    setServerError(null)
    onOpenChange(false)
  }

  const handleCreatePaciente = async (data: CreatePacienteRequest) => {
    setCrearPacienteLoading(true)
    try {
      const nuevo = await pacientesApi.create(data)
      setPaciente({
        id: nuevo.id,
        nombre_completo: nuevo.nombre_completo,
        numero_documento: nuevo.numero_documento,
        tipo_documento: nuevo.tipo_documento,
        telefono: nuevo.telefono,
        canal_confirmacion: nuevo.canal_confirmacion,
      })
      setPacienteError(false)
      setCrearPacienteOpen(false)
    } finally {
      setCrearPacienteLoading(false)
    }
  }

  const onSubmit = async (values: FormValues) => {
    if (!paciente) { setPacienteError(true); return }
    setPacienteError(false)

    // Validaciones específicas por modo
    if (modo === 'cotizacion' && !itemCotizacion) {
      setItemCotizacionError(true); return
    }
    if (modo === 'servicio' && !values.servicio) {
      setServerError('Selecciona un servicio'); return
    }
    if (modo === 'libre' && !duracionLibre) {
      setDuracionError(true); return
    }

    setItemCotizacionError(false)
    setDuracionError(false)
    setServerError(null)

    const base = {
      paciente:       paciente.id,
      sede:           values.sede,
      profesional:    values.profesional,
      fecha_inicio:   values.slot,
      canal_origen:   values.canal_origen,
      notas_internas: values.notas_internas || undefined,
    }

    try {
      if (modo === 'cotizacion') {
        await mutateAsync({
          ...base,
          item_cotizacion: itemCotizacion!,
          ...(sesionEjecutada ? { sesion_ejecutada: sesionEjecutada } : {}),
        })
      } else if (modo === 'servicio') {
        await mutateAsync({ ...base, servicio: values.servicio! })
      } else {
        await mutateAsync({
          ...base,
          duracion_min: duracionLibre,
          motivo: values.motivo || undefined,
        })
      }
    } catch (err: any) {
      const data = err?.response?.data
      if (data) {
        if (data.error)  { setServerError(String(data.error));  return }
        if (data.detail) { setServerError(String(data.detail)); return }
        const fieldLabels: Record<string, string> = {
          paciente: 'Paciente', sede: 'Sede', profesional: 'Profesional',
          servicio: 'Servicio', fecha_inicio: 'Fecha/Hora', canal_origen: '¿Cómo agendó el paciente?',
          duracion_min: 'Duración', item_cotizacion: 'Ítem de cotización',
        }
        const entries = Object.entries(data)
        if (entries.length > 0) {
          setServerError(
            entries.map(([field, msgs]) => {
              const label = fieldLabels[field] || field
              const text = Array.isArray(msgs) ? msgs[0] : String(msgs)
              return `${label}: ${text}`
            }).join(' | ')
          )
          return
        }
      }
      setServerError('Error al crear la cita')
    }
  }

  // Props dinámicos para SlotPicker según el modo activo
  const slotPickerProps = (() => {
    if (modo === 'cotizacion' && itemCotizacion)
      return { itemCotizacionId: itemCotizacion } as const
    if (modo === 'servicio' && servicioId)
      return { servicioId } as const
    if (modo === 'libre' && duracionLibre > 0)
      return { duracionMin: duracionLibre } as const
    // Sin fuente de duración → SlotPicker mostrará placeholder
    return { servicioId: '' } as const
  })()

  // ── Render ────────────────────────────────────────────────────

  return (
    <>
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva cita</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 py-2">

          {/* ── Paciente ── */}
          <div className="space-y-1.5">
            <Label>Paciente *</Label>
            <PacienteSearchInput
              onSelect={(p) => {
                setPaciente(p)
                setPacienteError(false)
                setItemCotizacion(null)
                setValue('slot', '')
              }}
              selected={paciente}
              onClear={() => {
                setPaciente(null)
                setItemCotizacion(null)
                setValue('slot', '')
                if (modo === 'cotizacion') cambiarModo('servicio')
              }}
              onCreateNew={(nombre) => {
                setCrearPacienteNombre(nombre ?? '')
                setCrearPacienteOpen(true)
              }}
            />
            {pacienteError && <p className="text-xs text-destructive">Selecciona un paciente</p>}
          </div>

          {/* ── Selector de modo (visible solo con paciente) ── */}
          {paciente && (
            <div className="space-y-1.5">
              <Label>Tipo de cita *</Label>
              <div className="grid grid-cols-3 gap-2">
                <ModoBtn
                  activo={modo === 'cotizacion'}
                  disabled={!hasCotizaciones}
                  onClick={() => cambiarModo('cotizacion')}
                  icon={<FileCheck className="h-4 w-4" />}
                  label={<>Sesión de<br/>cotización</>}
                  tooltip={!hasCotizaciones ? 'El paciente no tiene cotizaciones aceptadas' : undefined}
                />
                <ModoBtn
                  activo={modo === 'servicio'}
                  onClick={() => cambiarModo('servicio')}
                  icon={<Stethoscope className="h-4 w-4" />}
                  label={<>Por<br/>servicio</>}
                />
                <ModoBtn
                  activo={modo === 'libre'}
                  onClick={() => cambiarModo('libre')}
                  icon={<Clock className="h-4 w-4" />}
                  label={<>Consulta<br/>libre</>}
                />
              </div>
            </div>
          )}

          {/* ── MODO COTIZACION: selector de ítem ── */}
          {paciente && modo === 'cotizacion' && (
            <div className="space-y-1.5">
              <Label>Ítem de cotización *</Label>
              <Select
                value={itemCotizacion ?? 'none'}
                onValueChange={(v) => {
                  const val = v === 'none' ? null : v
                  setItemCotizacion(val)
                  setSesionEjecutada(null)
                  const found = sesionesQueries.flatMap((q) => q.data?.items ?? []).find((i) => i.item_id === val)
                  setItemCotizacionTipo(found?.tipo ?? null)
                  setItemCotizacionError(false)
                  setValue('slot', '')
                }}
              >
                <SelectTrigger className={itemCotizacionError ? 'border-destructive' : ''}>
                  <SelectValue placeholder="Selecciona un ítem" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Selecciona un ítem —</SelectItem>
                  {sesionesQueries.flatMap((q, idx) => {
                    if (!q.data) return []
                    const cotiz = cotizacionesPaciente!.results[idx]
                    const TIPO_LABELS: Record<string, string> = {
                      tratamiento:   'Tratamientos',
                      procedimiento: 'Procedimientos',
                      libre:         'Ítems adicionales',
                    }
                    const disponibles = q.data.items.filter((i) => i.citas_restantes > 0)
                    if (!disponibles.length) return []
                    return (['tratamiento', 'procedimiento', 'libre'] as const).flatMap((tipo) => {
                      const del_tipo = disponibles.filter((i) => (i.tipo ?? 'libre') === tipo)
                      if (!del_tipo.length) return []
                      return [
                        <SelectItem
                          key={`${cotiz.id}-lbl-${tipo}`}
                          value={`__lbl_${cotiz.id}_${tipo}`}
                          disabled
                          className="text-xs font-semibold text-muted-foreground py-1"
                        >
                          {TIPO_LABELS[tipo]}
                        </SelectItem>,
                        ...del_tipo.map((item) => (
                          <SelectItem key={item.item_id} value={item.item_id} className="pl-5">
                            {item.descripcion} — {item.citas_restantes} de {item.num_citas} restantes
                          </SelectItem>
                        )),
                      ]
                    })
                  })}
                </SelectContent>
              </Select>
              {itemCotizacionError && (
                <p className="text-xs text-destructive">Selecciona un ítem de cotización</p>
              )}
            </div>
          )}

          {/* ── MODO COTIZACION: selector de sesión (solo para ítems de tipo tratamiento) ── */}
          {paciente && modo === 'cotizacion' && itemCotizacion && itemCotizacionTipo === 'tratamiento' && (
            <div className="space-y-1.5">
              <Label>Sesión a consumir</Label>
              {loadingTratamiento ? (
                <p className="text-xs text-muted-foreground py-1">Cargando sesiones…</p>
              ) : sesionesPendientes.length === 0 ? (
                <p className="text-xs text-muted-foreground py-1">Sin sesiones pendientes para este tratamiento.</p>
              ) : (
                <Select
                  value={sesionEjecutada ?? 'none'}
                  onValueChange={(v) => setSesionEjecutada(v === 'none' ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona la sesión (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Sin asignar sesión —</SelectItem>
                    {sesionesPendientes.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label}
                        {s.procedimientos.length > 0 && (
                          <span className="text-xs text-muted-foreground ml-1">
                            ({s.procedimientos.join(', ')})
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* ── MODO LIBRE: duración + motivo ── */}
          {paciente && modo === 'libre' && (
            <>
              <div className="space-y-1.5">
                <Label>Duración *</Label>
                <div className="flex gap-2 flex-wrap">
                  {DURACIONES_MIN.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => {
                        setDuracionLibre(d)
                        setDuracionError(false)
                        setValue('slot', '')
                      }}
                      className={cn(
                        'px-3 py-1.5 rounded-md border text-sm font-medium transition-colors',
                        duracionLibre === d
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input bg-background hover:bg-accent'
                      )}
                    >
                      {d} min
                    </button>
                  ))}
                </div>
                {duracionError && (
                  <p className="text-xs text-destructive">Selecciona una duración</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="motivo">
                  Motivo{' '}
                  <span className="text-muted-foreground font-normal">(opcional)</span>
                </Label>
                <Textarea
                  id="motivo"
                  placeholder="Ej: Evaluación inicial, control post-procedimiento..."
                  rows={2}
                  {...register('motivo')}
                />
              </div>
            </>
          )}

          {/* ── Sede + Canal ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Sede *</Label>
              <Controller
                name="sede"
                control={control}
                render={({ field }) => (
                  <SedeSelect
                    value={field.value ?? ''}
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

          {/* ── Profesional + Servicio (servicio solo en modo 'servicio') ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Profesional *</Label>
              <Controller
                name="profesional"
                control={control}
                render={({ field }) => (
                  <ProfesionalSelect
                    value={field.value ?? ''}
                    onValueChange={(v) => { field.onChange(v); setValue('slot', '') }}
                    sedeId={sedeId}
                    disabled={!sedeId}
                  />
                )}
              />
              {errors.profesional && (
                <p className="text-xs text-destructive">{errors.profesional.message}</p>
              )}
            </div>

            {modo === 'servicio' && (
              <div className="space-y-1.5">
                <Label>Servicio *</Label>
                <Controller
                  name="servicio"
                  control={control}
                  render={({ field }) => (
                    <ServicioSelect
                      value={field.value ?? ''}
                      onValueChange={(v) => { field.onChange(v); setValue('slot', '') }}
                      clinicaId={clinicaId}
                    />
                  )}
                />
                {errors.servicio && (
                  <p className="text-xs text-destructive">{errors.servicio.message}</p>
                )}
              </div>
            )}
          </div>

          {/* ── Fecha ── */}
          <div className="space-y-1.5">
            <Label htmlFor="fecha">Fecha *</Label>
            <Input
              id="fecha"
              type="date"
              min={new Date().toISOString().split('T')[0]}
              {...register('fecha', { onChange: () => setValue('slot', '') })}
              className="max-w-xs"
            />
            {errors.fecha && <p className="text-xs text-destructive">{errors.fecha.message}</p>}
          </div>

          {/* ── Slots disponibles ── */}
          <div className="space-y-2">
            <Label>Horario disponible *</Label>
            <div className="rounded-md border p-3 bg-muted/20">
              <SlotPicker
                profesionalId={profesionalId ?? ''}
                sedeId={sedeId ?? ''}
                fecha={fecha ?? ''}
                value={slot ?? ''}
                onSelect={(s) => setValue('slot', s)}
                {...slotPickerProps}
              />
            </div>
            {errors.slot && <p className="text-xs text-destructive">{errors.slot.message}</p>}
          </div>

          {/* ── Notas internas ── */}
          <div className="space-y-1.5">
            <Label htmlFor="notas_internas">Notas internas</Label>
            <Textarea
              id="notas_internas"
              placeholder="Observaciones para el equipo..."
              rows={2}
              {...register('notas_internas')}
            />
          </div>

          {serverError && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
              <p className="text-sm text-destructive">{serverError}</p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Agendando...' : 'Agendar cita'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={crearPacienteOpen} onOpenChange={setCrearPacienteOpen}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo paciente</DialogTitle>
        </DialogHeader>
        <PacienteForm
          onSubmit={handleCreatePaciente}
          isLoading={crearPacienteLoading}
          submitLabel="Crear y seleccionar"
          initialNombre={crearPacienteNombre}
          compact
        />
      </DialogContent>
    </Dialog>
    </>
  )
}

// ── Componente auxiliar para los botones de modo ──────────────

function ModoBtn({
  activo,
  disabled,
  onClick,
  icon,
  label,
  tooltip,
}: {
  activo: boolean
  disabled?: boolean
  onClick: () => void
  icon: React.ReactNode
  label: React.ReactNode
  tooltip?: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={tooltip}
      className={cn(
        'flex flex-col items-center gap-1.5 rounded-lg border px-3 py-2.5 text-center text-xs font-medium leading-tight transition-colors',
        activo
          ? 'border-primary bg-primary/5 text-primary'
          : 'border-input bg-background hover:bg-accent',
        disabled && 'opacity-40 cursor-not-allowed hover:bg-background'
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}
