'use client'

import { useEffect, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Check, ChevronsUpDown, Loader2, Plus, Search, Trash2, X } from 'lucide-react'
import { colaboradoresApi } from '@/lib/api/colaboradores'
import { usuariosApi } from '@/lib/api/usuarios'
import { rolesApi } from '@/lib/api/roles'
import { clinicasApi } from '@/lib/api/clinicas'
import { authApi } from '@/lib/api/auth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type { Colaborador, CreateHorarioColaboradorRequest } from '@/types/colaboradores'
import type { Rol } from '@/types/usuarios'
import type { DiaSemana } from '@/types/clinicas'

// ─── Constantes ───────────────────────────────────────────────

const DIAS: { value: DiaSemana; label: string }[] = [
  { value: 'lunes',     label: 'Lunes' },
  { value: 'martes',    label: 'Martes' },
  { value: 'miercoles', label: 'Miércoles' },
  { value: 'jueves',    label: 'Jueves' },
  { value: 'viernes',   label: 'Viernes' },
  { value: 'sabado',    label: 'Sábado' },
  { value: 'domingo',   label: 'Domingo' },
]

// ─── Schema ───────────────────────────────────────────────────

const createSchema = z.object({
  first_name: z.string().min(1, 'Requerido'),
  last_name: z.string().min(1, 'Requerido'),
  email: z.string().email('Correo inválido'),
  numero_documento: z.string().min(1, 'Requerido'),
  telefono: z.string().optional(),
  role_id: z.string().min(1, 'Selecciona un rol'),
  sede_principal: z.string().min(1, 'Selecciona una sede'),
  sedes_ids: z.array(z.string()),
  tipo_contrato: z.enum(['empleado', 'contratista', 'socio']),
  fecha_ingreso: z.string().min(1, 'Requerido'),
  especialidades: z.array(z.string()),
  es_profesional: z.boolean().optional(),
})

const editSchema = createSchema.omit({ email: true, sede_principal: true }).extend({
  activo: z.boolean(),
  numero_documento: z.string().optional(),
  sede_principal: z.string().optional(), // puede ser null/vacío en colaboradores sin sede asignada
})

type CreateForm = z.infer<typeof createSchema>
type EditForm = z.infer<typeof editSchema>

// Mapea errores por campo devueltos por el backend (DRF) a los inputs del form
function applyServerFieldErrors(
  data: any,
  setError: (name: any, error: { message: string }) => void,
  knownFields: string[],
) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return
  for (const field of knownFields) {
    const msg = data[field]
    if (msg) setError(field, { message: Array.isArray(msg) ? String(msg[0]) : String(msg) })
  }
}


// ─── Multi-select buscable para especialidades ────────────────

function EspecialidadesSelect({
  value = [],
  onChange,
}: {
  value: string[]
  onChange: (v: string[]) => void
}) {
  const { data: servicios } = useQuery({
    queryKey: ['servicios', 'activos'],
    queryFn: () => clinicasApi.servicios.activos(),
  })
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')

  const opciones = servicios ?? []
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])

  const termino = q.trim().toLowerCase()
  const filtradas = termino
    ? opciones.filter((s) => s.nombre.toLowerCase().includes(termino))
    : opciones
  const seleccionadas = opciones.filter((s) => value.includes(s.id))

  if (servicios && !servicios.length) return (
    <p className="text-xs text-muted-foreground">No hay procedimientos activos</p>
  )

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQ('') }}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" role="combobox"
            className="w-full justify-between font-normal">
            <span className={cn(!seleccionadas.length && 'text-muted-foreground')}>
              {seleccionadas.length
                ? `${seleccionadas.length} procedimiento${seleccionadas.length > 1 ? 's' : ''}`
                : 'Seleccionar procedimientos…'}
            </span>
            <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
          <div className="flex items-center border-b px-3">
            <Search className="h-4 w-4 shrink-0 opacity-50" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar procedimiento…"
              className="flex h-9 w-full bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground" />
          </div>
          <div className="max-h-60 overflow-y-auto p-1">
            {filtradas.length === 0 ? (
              <p className="px-2 py-3 text-xs text-muted-foreground text-center">Sin resultados</p>
            ) : filtradas.map((s) => {
              const checked = value.includes(s.id)
              return (
                <button key={s.id} type="button" onClick={() => toggle(s.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent',
                    checked && 'font-medium',
                  )}>
                  <Check className={cn('h-4 w-4 shrink-0', checked ? 'opacity-100 text-primary' : 'opacity-0')} />
                  <span className="truncate">{s.nombre}</span>
                </button>
              )
            })}
          </div>
        </PopoverContent>
      </Popover>

      {seleccionadas.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {seleccionadas.map((s) => (
            <Badge key={s.id} variant="secondary" className="gap-1 pr-1">
              {s.nombre}
              <button type="button" onClick={() => toggle(s.id)}
                className="rounded-sm hover:bg-muted-foreground/20" aria-label={`Quitar ${s.nombre}`}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Checkbox group para sedes ────────────────────────────────

function SedesCheckboxes({
  value = [],
  onChange,
  sedePrincipalId,
  sedes,
}: {
  value: string[]
  onChange: (v: string[]) => void
  sedePrincipalId: string
  sedes: { id: string; nombre: string }[]
}) {
  const toggle = (id: string) => {
    if (id === sedePrincipalId) return  // la sede principal no se puede quitar desde aquí
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])
  }

  if (!sedes.length) return (
    <p className="text-xs text-muted-foreground">No hay sedes activas</p>
  )

  return (
    <div className="grid grid-cols-2 gap-2">
      {sedes.map((s) => {
        const isPrincipal = s.id === sedePrincipalId
        const checked = isPrincipal || value.includes(s.id)
        return (
          <label
            key={s.id}
            className={cn(
              'flex items-center gap-2.5 rounded-lg border px-3 py-2 cursor-pointer text-sm transition-colors',
              isPrincipal
                ? 'border-primary/60 bg-primary/10 text-primary font-medium opacity-70 cursor-default'
                : checked
                  ? 'border-primary/40 bg-primary/5 text-primary font-medium'
                  : 'border-gray-200 hover:border-gray-300 text-muted-foreground'
            )}
          >
            <input
              type="checkbox"
              className="accent-primary"
              checked={checked}
              disabled={isPrincipal}
              onChange={() => toggle(s.id)}
            />
            <span className="truncate">
              {s.nombre}
              {isPrincipal && <span className="ml-1 text-xs opacity-70">(principal)</span>}
            </span>
          </label>
        )
      })}
    </div>
  )
}

// ─── Sección de horarios (solo en edición) ────────────────────

function HorariosSection({
  colaboradorId,
  sedes,
}: {
  colaboradorId: string
  sedes: { id: string; nombre: string }[]
}) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [newHorario, setNewHorario] = useState<Partial<CreateHorarioColaboradorRequest>>({
    colaborador: colaboradorId,
  })

  const { data: horarios = [], isLoading } = useQuery({
    queryKey: ['colaborador-horarios', colaboradorId],
    queryFn: () => colaboradoresApi.horarios.list(colaboradorId),
    enabled: !!colaboradorId,
  })

  const createMut = useMutation({
    mutationFn: colaboradoresApi.horarios.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['colaborador-horarios', colaboradorId] })
      setShowForm(false)
      setNewHorario({ colaborador: colaboradorId })
    },
  })

  const deleteMut = useMutation({
    mutationFn: colaboradoresApi.horarios.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['colaborador-horarios', colaboradorId] })
    },
  })

  const canSubmitNew =
    newHorario.sede &&
    newHorario.dia_semana &&
    newHorario.hora_inicio &&
    newHorario.hora_fin

  const handleAdd = () => {
    if (!canSubmitNew) return
    createMut.mutate(newHorario as CreateHorarioColaboradorRequest)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => setShowForm((v) => !v)}
        >
          <Plus className="h-3.5 w-3.5" />
          Agregar
        </Button>
      </div>

      {/* Formulario para agregar horario */}
      {showForm && (
        <div className="rounded-lg border border-dashed p-3 space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Sede</Label>
              <Select
                value={newHorario.sede ?? ''}
                onValueChange={(v) => { createMut.reset(); setNewHorario((h) => ({ ...h, sede: v })) }}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Sede" />
                </SelectTrigger>
                <SelectContent>
                  {sedes.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Día</Label>
              <Select
                value={newHorario.dia_semana ?? ''}
                onValueChange={(v) => { createMut.reset(); setNewHorario((h) => ({ ...h, dia_semana: v as DiaSemana })) }}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Día" />
                </SelectTrigger>
                <SelectContent>
                  {DIAS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Hora inicio</Label>
              <Input
                type="time"
                className="h-8 text-sm"
                value={newHorario.hora_inicio ?? ''}
                onChange={(e) => { createMut.reset(); setNewHorario((h) => ({ ...h, hora_inicio: e.target.value })) }}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Hora fin</Label>
              <Input
                type="time"
                className="h-8 text-sm"
                value={newHorario.hora_fin ?? ''}
                onChange={(e) => { createMut.reset(); setNewHorario((h) => ({ ...h, hora_fin: e.target.value })) }}
              />
            </div>
          </div>

          {createMut.isError && (
            <p className="text-xs text-destructive">
              {(createMut.error as any)?.response?.data?.non_field_errors?.[0] ||
                (createMut.error as any)?.response?.data?.detail ||
                (createMut.error as any)?.response?.data?.error ||
                'No se pudo guardar el horario. Verifica que no se solape con uno existente.'}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => { setShowForm(false); setNewHorario({ colaborador: colaboradorId }) }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs"
              disabled={!canSubmitNew || createMut.isPending}
              onClick={handleAdd}
            >
              {createMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Guardar
            </Button>
          </div>
        </div>
      )}

      {/* Lista de horarios existentes */}
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Cargando horarios…</p>
      ) : horarios.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
          Sin horarios propios: atiende en el horario de cada sede.
        </p>
      ) : (
        <div className="divide-y rounded-lg border overflow-hidden">
          {horarios.map((h) => {
            const diaLabel = DIAS.find((d) => d.value === h.dia_semana)?.label ?? h.dia_semana
            return (
              <div key={h.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="font-medium text-muted-foreground w-24 shrink-0">{diaLabel}</span>
                <span className="flex-1 text-xs text-muted-foreground truncate">
                  {h.sede_nombre ?? sedes.find((s) => s.id === h.sede)?.nombre ?? h.sede}
                </span>
                <span className="text-xs font-mono tabular-nums shrink-0">
                  {h.hora_inicio} – {h.hora_fin}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 ml-2 text-muted-foreground hover:text-destructive shrink-0"
                  disabled={deleteMut.isPending}
                  onClick={() => deleteMut.mutate(h.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Layout del formulario ────────────────────────────────────

/** Sección con título y descripción a la izquierda y sus campos en dos columnas a la derecha. */
function Seccion({ titulo, descripcion, children }: { titulo: string; descripcion: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-t pt-6 first:border-t-0 first:pt-0 md:grid-cols-[11rem_minmax(0,1fr)] md:gap-8">
      <div>
        <h3 className="text-sm font-semibold">{titulo}</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{descripcion}</p>
      </div>
      <div className="grid content-start gap-4 sm:grid-cols-2">{children}</div>
    </section>
  )
}

function Campo({ label, ayuda, error, className, children }: {
  label: string
  ayuda?: string
  error?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label>{label}</Label>
      {children}
      {ayuda && <p className="text-xs leading-relaxed text-muted-foreground">{ayuda}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

function iniciales(nombre: string) {
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  if (partes.length >= 2) return (partes[0][0] + partes[1][0]).toUpperCase()
  return nombre.slice(0, 2).toUpperCase()
}

// ─── Modal ────────────────────────────────────────────────────

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  colaborador?: Colaborador | null
  puedeAgregar?: boolean
}

export function ColaboradorDialog({ open, onOpenChange, colaborador, puedeAgregar = true }: Props) {
  const qc = useQueryClient()
  const isEdit = !!colaborador

  // Fetch full detail when editing to ensure fresh sedes/especialidades/etc.
  const { data: colaboradorDetail, isLoading: isLoadingDetail } = useQuery({
    queryKey: ['colaborador-detail', colaborador?.id],
    queryFn: () => colaboradoresApi.get(colaborador!.id),
    enabled: open && !!colaborador?.id,
  })

  // Fetch user-level fields (first_name, last_name, telefono) from the usuarios
  // endpoint, since the colaboradores serializer may not expose them.
  const { data: usuarioDetail, isLoading: isLoadingUsuario } = useQuery({
    queryKey: ['usuario-detail-colab', colaborador?.user],
    queryFn: () => usuariosApi.get(colaborador!.user),
    enabled: open && !!colaborador?.user,
  })

  // Roles dinámicos — excluye superadmin
  const { data: rolesData = [] } = useQuery<Rol[]>({
    queryKey: ['roles'],
    queryFn: () => rolesApi.list(),
    staleTime: 5 * 60 * 1000,
    enabled: open,
  })
  const roles = rolesData.filter(r => r.activo && r.slug !== 'superadmin')

  // Sedes
  const { data: sedesData } = useQuery({
    queryKey: ['sedes'],
    queryFn: () => clinicasApi.sedes.list({ activa: true }),
    enabled: open,
  })
  const sedes = sedesData?.results ?? []

  // Colaborador-model fields come from the detail (or fall back to the list item).
  // User-model fields (first_name, last_name, telefono) come from /usuarios/{id}/
  // because the colaboradores serializer may not expose them individually.
  const editSrc = colaboradorDetail ?? (isEdit ? colaborador : null)
  const editValues: EditForm | undefined = editSrc ? {
    first_name:       usuarioDetail?.first_name       || editSrc.first_name       || '',
    last_name:        usuarioDetail?.last_name        || editSrc.last_name        || '',
    telefono:         usuarioDetail?.telefono         ?? editSrc.telefono         ?? '',
    numero_documento: editSrc.numero_documento ?? '',
    role_id:          editSrc.role_id          ?? usuarioDetail?.role_id ?? '',
    sede_principal:   editSrc.sede_principal   ?? '',
    sedes_ids:        editSrc.sedes            ?? [],
    tipo_contrato:    editSrc.tipo_contrato    ?? 'empleado',
    fecha_ingreso:    editSrc.fecha_ingreso    ?? '',
    especialidades:   editSrc.especialidades_detalle?.map((e) => e.id) ?? editSrc.especialidades ?? [],
    activo:           editSrc.activo           ?? true,
    es_profesional:   editSrc.es_profesional   ?? false,
  } : undefined

  // Create form
  const createForm = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      role_id: '',
      numero_documento: '',
      tipo_contrato: 'empleado',
      especialidades: [],
      sedes_ids: [],
      fecha_ingreso: new Date().toISOString().split('T')[0],
      es_profesional: false,
    },
  })

  // Edit form — `values` auto-syncs when editValues changes (no useEffect needed)
  const editForm = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    values: editValues,
  })

  useEffect(() => {
    if (!open && !colaborador) {
      createForm.reset({
        role_id: '',
        numero_documento: '',
        tipo_contrato: 'empleado',
        especialidades: [],
        sedes_ids: [],
        fecha_ingreso: new Date().toISOString().split('T')[0],
        es_profesional: false,
      })
    }
  }, [open, colaborador])

  const createMut = useMutation({
    mutationFn: colaboradoresApi.create,
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['colaboradores'] })
      qc.invalidateQueries({ queryKey: ['mi-plan'] })
      authApi.invitar(variables.email).catch(() => {})
      onOpenChange(false)
    },
    onError: (err: any) => {
      applyServerFieldErrors(err?.response?.data, createForm.setError, Object.keys(createSchema.shape))
    },
  })

  const editMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: EditForm }) => {
      console.log('PATCH colaborador payload:', JSON.stringify(data, null, 2))
      return colaboradoresApi.update(id, data)
    },
    onSuccess: (res) => {
      console.log('PATCH colaborador response:', JSON.stringify(res, null, 2))
      qc.invalidateQueries({ queryKey: ['colaboradores'] })
      qc.invalidateQueries({ queryKey: ['colaborador-detail', colaborador?.id] })
      qc.invalidateQueries({ queryKey: ['mi-plan'] })
      onOpenChange(false)
    },
    onError: (err: any) => {
      console.error('PATCH colaborador error:', err?.response?.data)
      applyServerFieldErrors(err?.response?.data, editForm.setError, Object.keys(editSchema.shape))
    },
  })

  const onCreateSubmit = (data: CreateForm) => createMut.mutate(data)
  const onEditSubmit = (data: EditForm) => {
    if (!colaborador) return
    // La API prohíbe enviar sedes_ids cuando sede_principal es null
    const payload: EditForm = !data.sede_principal
      ? { ...data, sedes_ids: [] }
      : data
    editMut.mutate({ id: colaborador.id, data: payload })
  }

  const isPending = createMut.isPending || editMut.isPending
  const serverError = (createMut.error || editMut.error) as any
  // Si el backend devolvió errores por campo (email, etc.) ya se muestran junto al input;
  // el mensaje genérico de abajo solo aplica cuando no hay un campo conocido que los muestre.
  const serverErrorData = serverError?.response?.data
  const knownFormFields = Object.keys(isEdit ? editSchema.shape : createSchema.shape)
  const hasFieldSpecificError =
    !!serverErrorData &&
    typeof serverErrorData === 'object' &&
    !Array.isArray(serverErrorData) &&
    Object.keys(serverErrorData).some((k) => knownFormFields.includes(k))

  // Campos compartidos entre crear y editar, agrupados por sección.
  // `camposExtra` agrega lo que solo existe en un modo (correo al crear, estado al editar).
  const renderSecciones = (
    control: any,
    errors: any,
    watchRoleId: string,
    watchSedePrincipal: string,
    watchEsProfesional: boolean | undefined,
    camposExtra: { personales?: React.ReactNode; acceso?: React.ReactNode },
  ) => {
    // El rol puede tener es_profesional inherente (ej. rol "Profesional").
    // Para roles que no lo tienen (ej. Admin, Recepción) se muestra la opción manual.
    const selectedRol = roles.find(r => r.id === watchRoleId)
    const rolInherenteProfesional = selectedRol
      ? (selectedRol.es_profesional ?? selectedRol.slug === 'profesional')
      : false
    const esProfesional = rolInherenteProfesional || !!watchEsProfesional
    const mostrarCheckbox = !!selectedRol && !rolInherenteProfesional

    return (
      <>
        <Seccion titulo="Datos personales" descripcion="Cómo aparece en la agenda, las atenciones y los documentos.">
          <Campo label="Nombres" error={errors.first_name?.message}>
            <Controller name="first_name" control={control}
              render={({ field }) => <Input {...field} value={field.value ?? ''} placeholder="Ana" />} />
          </Campo>
          <Campo label="Apellidos" error={errors.last_name?.message}>
            <Controller name="last_name" control={control}
              render={({ field }) => <Input {...field} value={field.value ?? ''} placeholder="García" />} />
          </Campo>
          <Campo label="Número de documento" error={errors.numero_documento?.message}>
            <Controller name="numero_documento" control={control}
              render={({ field }) => <Input {...field} value={field.value ?? ''} placeholder="CC / NIT / Pasaporte" />} />
          </Campo>
          <Campo label="Teléfono">
            <Controller name="telefono" control={control}
              render={({ field }) => <Input {...field} value={field.value ?? ''} placeholder="+57 300 000 0000" />} />
          </Campo>
          {camposExtra.personales}
        </Seccion>

        <Seccion titulo="Rol y acceso" descripcion="Qué puede ver y hacer en CliniQ, y si atiende pacientes.">
          <Campo label="Rol" error={errors.role_id?.message}>
            <Controller name="role_id" control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar rol" /></SelectTrigger>
                  <SelectContent>
                    {roles.map(r => <SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              )} />
          </Campo>
          {camposExtra.acceso}

          {/* ¿Atiende pacientes? Junto al rol, porque de esto depende aparecer en la agenda.
              Si el rol ya es profesional se muestra como dato; si no, como opción. */}
          {selectedRol && (mostrarCheckbox ? (
            <Controller name="es_profesional" control={control}
              render={({ field }) => (
                <label className="sm:col-span-2 flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer select-none">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">Atiende pacientes</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Aparecerá en la agenda y podrá atender citas: escribir en la historia clínica,
                      editar antecedentes, subir fotos, gestionar consentimientos y registrar los
                      insumos que use, sin importar su rol.
                    </p>
                  </div>
                  <Switch checked={!!field.value} onCheckedChange={field.onChange} />
                </label>
              )} />
          ) : (
            <div className="sm:col-span-2 flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
              <Check className="h-4 w-4 shrink-0 text-primary" />
              <p className="text-sm">
                <span className="font-medium">Atiende pacientes.</span>{' '}
                <span className="text-muted-foreground">
                  Lo define el rol {selectedRol.nombre}. Podrá atender citas y escribir en la historia clínica.
                </span>
              </p>
            </div>
          ))}

          {esProfesional && (
            <Campo label="Procedimientos que realiza" className="sm:col-span-2">
              <Controller name="especialidades" control={control}
                render={({ field }) => <EspecialidadesSelect value={field.value} onChange={field.onChange} />} />
            </Campo>
          )}
        </Seccion>

        <Seccion
          titulo="Sedes y vinculación"
          descripcion="Dónde trabaja, a qué sedes tiene acceso y desde cuándo. Las sedes también limitan lo que ve en el sistema, no solo dónde atiende."
        >
          <Campo
            label="Sede principal"
            ayuda={sedes.length > 1 ? undefined : 'Solo verá la información de esta sede. Los administradores ven todas.'}
            error={errors.sede_principal?.message}
          >
            <Controller name="sede_principal" control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue placeholder="Sede" /></SelectTrigger>
                  <SelectContent>
                    {sedes.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              )} />
          </Campo>
          <Campo label="Fecha de ingreso" error={errors.fecha_ingreso?.message}>
            <Controller name="fecha_ingreso" control={control}
              render={({ field }) => <Input type="date" {...field} value={field.value ?? ''} />} />
          </Campo>
          <Campo label="Tipo de contrato">
            <Controller name="tipo_contrato" control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="empleado">Empleado</SelectItem>
                    <SelectItem value="contratista">Contratista</SelectItem>
                    <SelectItem value="socio">Socio</SelectItem>
                  </SelectContent>
                </Select>
              )} />
          </Campo>
          {/* Sedes adicionales — solo si hay más de una sede disponible */}
          {sedes.length > 1 && (
            <Campo
              label="Sedes a las que tiene acceso"
              ayuda="Además de atender en ellas, solo verá la agenda, caja, ingresos, inventario, compras y reportes de estas sedes. Los administradores ven todas."
              className="sm:col-span-2"
            >
              <Controller name="sedes_ids" control={control}
                render={({ field }) => (
                  <SedesCheckboxes value={field.value} onChange={field.onChange}
                    sedePrincipalId={watchSedePrincipal} sedes={sedes} />
                )} />
            </Campo>
          )}
        </Seccion>
      </>
    )
  }

  const nombreEdit = [editForm.watch('first_name'), editForm.watch('last_name')].filter(Boolean).join(' ')
    || colaborador?.nombre_completo || ''
  const reactivacionBloqueada = isEdit && !colaborador?.activo && !puedeAgregar

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="px-6 py-4 pr-12 border-b shrink-0 space-y-0">
          {isEdit ? (
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {iniciales(nombreEdit)}
              </div>
              <div className="min-w-0 text-left">
                <DialogTitle className="truncate">{nombreEdit || 'Editar colaborador'}</DialogTitle>
                <DialogDescription className="truncate">{colaborador?.email}</DialogDescription>
              </div>
            </div>
          ) : (
            <div className="text-left">
              <DialogTitle>Nuevo colaborador</DialogTitle>
              <DialogDescription>Le llegará un correo de invitación para crear su contraseña.</DialogDescription>
            </div>
          )}
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          {isEdit ? (
            // ── EDIT FORM ──
            (isLoadingDetail || isLoadingUsuario) ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <form id="colaborador-form" onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-6">
                {renderSecciones(
                  editForm.control,
                  editForm.formState.errors,
                  editForm.watch('role_id'),
                  editForm.watch('sede_principal') ?? '',
                  editForm.watch('es_profesional'),
                  {
                    acceso: (
                      <Controller name="activo" control={editForm.control}
                        render={({ field }) => (
                          <Campo label="Estado">
                            <label className={cn(
                              'flex h-10 items-center justify-between gap-3 rounded-md border px-3',
                              reactivacionBloqueada && !field.value ? 'cursor-not-allowed opacity-70' : 'cursor-pointer',
                            )}>
                              <span className="text-sm">{field.value ? 'Activo' : 'Inactivo'}</span>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                disabled={reactivacionBloqueada && !field.value}
                              />
                            </label>
                            {reactivacionBloqueada && (
                              <p className="text-xs text-amber-600">
                                Límite de usuarios activos alcanzado. No es posible reactivarlo.
                              </p>
                            )}
                          </Campo>
                        )} />
                    ),
                  },
                )}

                {/* ── Horarios por sede (solo en edición) ── */}
                {colaborador && (
                  <Seccion titulo="Horarios" descripcion="Opcional. Úsalo si atiende menos horas que la sede. Los días sin horario usan el de la sede.">
                    <div className="sm:col-span-2">
                      <HorariosSection
                        colaboradorId={colaborador.id}
                        sedes={
                          // solo mostrar sedes a las que el colaborador pertenece
                          sedes.filter((s) => {
                            const sedesIds = editForm.watch('sedes_ids') ?? []
                            return s.id === editForm.watch('sede_principal') || sedesIds.includes(s.id)
                          })
                        }
                      />
                    </div>
                  </Seccion>
                )}
              </form>
            )
          ) : (
            // ── CREATE FORM ──
            <form id="colaborador-form" onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-6">
              {/* Bloqueo por límite de plan */}
              {!puedeAgregar && (
                <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3">
                  <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800">
                    Has alcanzado el límite de usuarios activos de tu plan. Desactiva un usuario existente o actualiza tu plan para agregar uno nuevo.
                  </p>
                </div>
              )}

              {renderSecciones(
                createForm.control,
                createForm.formState.errors,
                createForm.watch('role_id'),
                createForm.watch('sede_principal'),
                createForm.watch('es_profesional'),
                {
                  personales: (
                    <Campo label="Correo electrónico" className="sm:col-span-2" error={createForm.formState.errors.email?.message}>
                      <Input type="email" {...createForm.register('email')} placeholder="colaborador@clinica.com" />
                    </Campo>
                  ),
                },
              )}
            </form>
          )}

          {serverError && !hasFieldSpecificError && (
            <div className="mt-4 rounded-lg bg-destructive/8 border border-destructive/15 px-3.5 py-2.5">
              <p className="text-sm text-destructive">
                {serverError?.response?.data?.detail ||
                  serverError?.response?.data?.error ||
                  serverError?.response?.data?.non_field_errors?.[0] ||
                  'Ocurrió un error. Verifica los datos e intenta de nuevo.'}
              </p>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t px-6 py-4 flex justify-end gap-3 bg-white sm:rounded-b-lg">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            form="colaborador-form"
            type="submit"
            disabled={
              isPending ||
              (isEdit && (isLoadingDetail || isLoadingUsuario)) ||
              (!isEdit && !puedeAgregar) ||
              (reactivacionBloqueada && editForm.watch('activo') === true)
            }
          >
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEdit ? 'Guardar cambios' : 'Crear colaborador'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
