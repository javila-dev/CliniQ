'use client'

import { useEffect, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { colaboradoresApi } from '@/lib/api/colaboradores'
import { rolesApi } from '@/lib/api/roles'
import { clinicasApi } from '@/lib/api/clinicas'
import { authApi } from '@/lib/api/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
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
})

const editSchema = createSchema.omit({ email: true }).extend({
  activo: z.boolean(),
  numero_documento: z.string().optional(),
})

type CreateForm = z.infer<typeof createSchema>
type EditForm = z.infer<typeof editSchema>


// ─── Checkbox group para especialidades ───────────────────────

function EspecialidadesCheckboxes({
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

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])
  }

  if (!servicios?.length) return (
    <p className="text-xs text-muted-foreground">No hay servicios activos</p>
  )

  return (
    <div className="grid grid-cols-2 gap-2">
      {servicios.map((s) => {
        const checked = value.includes(s.id)
        return (
          <label
            key={s.id}
            className={cn(
              'flex items-center gap-2.5 rounded-lg border px-3 py-2 cursor-pointer text-sm transition-colors',
              checked
                ? 'border-primary/40 bg-primary/5 text-primary font-medium'
                : 'border-gray-200 hover:border-gray-300 text-muted-foreground'
            )}
          >
            <input
              type="checkbox"
              className="accent-primary"
              checked={checked}
              onChange={() => toggle(s.id)}
            />
            <span className="truncate">{s.nombre}</span>
          </label>
        )
      })}
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
      <div className="flex items-center justify-between">
        <Label>Horarios de atención por sede</Label>
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
        <p className="text-xs text-muted-foreground">Sin horarios definidos</p>
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

// ─── Sheet ────────────────────────────────────────────────────

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  colaborador?: Colaborador | null
  puedeAgregar?: boolean
}

export function ColaboradorSheet({ open, onOpenChange, colaborador, puedeAgregar = true }: Props) {
  const qc = useQueryClient()
  const isEdit = !!colaborador

  // Fetch full detail when editing to ensure fresh sedes/especialidades/etc.
  const { data: colaboradorDetail, isLoading: isLoadingDetail } = useQuery({
    queryKey: ['colaborador-detail', colaborador?.id],
    queryFn: () => colaboradoresApi.get(colaborador!.id),
    enabled: open && !!colaborador?.id,
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
    },
  })

  // Edit form
  const editForm = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      numero_documento: '',
      telefono: '',
      role_id: '',
      sede_principal: '',
      sedes_ids: [],
      tipo_contrato: 'empleado',
      fecha_ingreso: '',
      especialidades: [],
      activo: true,
    },
  })

  useEffect(() => {
    if (open && isEdit) {
      // Use detail when available, fall back to list item (which now has user fields).
      const src = colaboradorDetail ?? colaborador
      if (!src) return
      editForm.reset({
        first_name:        src.first_name       ?? '',
        last_name:         src.last_name        ?? '',
        numero_documento:  src.numero_documento ?? '',
        telefono:          src.telefono         ?? '',
        role_id:           src.role_id          ?? '',
        sede_principal:    src.sede_principal   ?? '',
        sedes_ids:         src.sedes            ?? [],
        tipo_contrato:     src.tipo_contrato,
        fecha_ingreso:     src.fecha_ingreso    ?? '',
        especialidades:    src.especialidades_detalle?.map((e) => e.id) ?? src.especialidades ?? [],
        activo:            src.activo,
      })
    } else if (!open && !colaborador) {
      createForm.reset({
        role_id: '',
        numero_documento: '',
        tipo_contrato: 'empleado',
        especialidades: [],
        sedes_ids: [],
        fecha_ingreso: new Date().toISOString().split('T')[0],
      })
    }
  }, [open, colaborador?.id, colaboradorDetail])

  const createMut = useMutation({
    mutationFn: colaboradoresApi.create,
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['colaboradores'] })
      qc.invalidateQueries({ queryKey: ['usuarios-limite'] })
      authApi.invitar(variables.email).catch(() => {})
      onOpenChange(false)
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
      qc.invalidateQueries({ queryKey: ['usuarios-limite'] })
      onOpenChange(false)
    },
    onError: (err: any) => {
      console.error('PATCH colaborador error:', err?.response?.data)
    },
  })

  const onCreateSubmit = (data: CreateForm) => createMut.mutate(data)
  const onEditSubmit = (data: EditForm) => {
    if (colaborador) editMut.mutate({ id: colaborador.id, data })
  }

  const isPending = createMut.isPending || editMut.isPending
  const serverError = (createMut.error || editMut.error) as any

  // Shared fields renderer (avoids duplication between create/edit)
  const renderCommonFields = (
    _register: any,
    control: any,
    errors: any,
    watchRoleId: string,
    watchSedePrincipal: string,
    watchSedesIds: string[],
  ) => {
    // Determinar si el rol seleccionado tiene perfil profesional.
    // Usa es_profesional del backend cuando esté disponible; fallback al slug 'profesional'.
    const selectedRol = roles.find(r => r.id === watchRoleId)
    const esProfesional = selectedRol
      ? (selectedRol.es_profesional ?? selectedRol.slug === 'profesional')
      : false

    return (
    <>
      {/* Nombre */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Nombres</Label>
          <Controller
            name="first_name"
            control={control}
            render={({ field }) => <Input {...field} placeholder="Ana" />}
          />
          {errors.first_name && <p className="text-xs text-destructive">{errors.first_name.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Apellidos</Label>
          <Controller
            name="last_name"
            control={control}
            render={({ field }) => <Input {...field} placeholder="García" />}
          />
          {errors.last_name && <p className="text-xs text-destructive">{errors.last_name.message}</p>}
        </div>
      </div>

      {/* Número de documento */}
      <div className="space-y-1.5">
        <Label>Número de documento</Label>
        <Controller
          name="numero_documento"
          control={control}
          render={({ field }) => <Input {...field} value={field.value ?? ''} placeholder="CC / NIT / Pasaporte" />}
        />
        {errors.numero_documento && <p className="text-xs text-destructive">{errors.numero_documento.message}</p>}
      </div>

      {/* Teléfono */}
      <div className="space-y-1.5">
        <Label>Teléfono</Label>
        <Controller
          name="telefono"
          control={control}
          render={({ field }) => <Input {...field} value={field.value ?? ''} placeholder="+57 300 000 0000" />}
        />
      </div>

      {/* Rol */}
      <div className="space-y-1.5">
        <Label>Rol</Label>
        <Controller
          name="role_id"
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar rol" />
              </SelectTrigger>
              <SelectContent>
                {roles.map(r => (
                  <SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.role_id && <p className="text-xs text-destructive">{errors.role_id.message}</p>}
      </div>

      {/* Sede principal + Contrato */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Sede principal</Label>
          <Controller
            name="sede_principal"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Sede" />
                </SelectTrigger>
                <SelectContent>
                  {sedes.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.sede_principal && <p className="text-xs text-destructive">{errors.sede_principal.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label>Tipo contrato</Label>
          <Controller
            name="tipo_contrato"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="empleado">Empleado</SelectItem>
                  <SelectItem value="contratista">Contratista</SelectItem>
                  <SelectItem value="socio">Socio</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>

      {/* Sedes adicionales — solo si hay más de una sede disponible */}
      {sedes.length > 1 && (
        <div className="space-y-2">
          <Label>Sedes donde atiende</Label>
          <Controller
            name="sedes_ids"
            control={control}
            render={({ field }) => (
              <SedesCheckboxes
                value={field.value}
                onChange={field.onChange}
                sedePrincipalId={watchSedePrincipal}
                sedes={sedes}
              />
            )}
          />
        </div>
      )}

      {/* Fecha ingreso */}
      <div className="space-y-1.5">
        <Label>Fecha de ingreso</Label>
        <Controller
          name="fecha_ingreso"
          control={control}
          render={({ field }) => <Input type="date" {...field} value={field.value ?? ''} />}
        />
        {errors.fecha_ingreso && <p className="text-xs text-destructive">{errors.fecha_ingreso.message}</p>}
      </div>

      {/* Especialidades — solo si el rol tiene perfil profesional */}
      {esProfesional && (
        <div className="space-y-2">
          <Label>Especialidades / Servicios que realiza</Label>
          <Controller
            name="especialidades"
            control={control}
            render={({ field }) => (
              <EspecialidadesCheckboxes value={field.value} onChange={field.onChange} />
            )}
          />
        </div>
      )}
    </>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col p-0 overflow-hidden">
        <SheetHeader className="px-6 py-4 border-b shrink-0">
          <SheetTitle>{isEdit ? 'Editar colaborador' : 'Nuevo colaborador'}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isEdit ? (
            // ── EDIT FORM ──
            isLoadingDetail ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
            <form id="colaborador-form" onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              {renderCommonFields(
                null,
                editForm.control,
                editForm.formState.errors,
                editForm.watch('role_id'),
                editForm.watch('sede_principal'),
                editForm.watch('sedes_ids'),
              )}

              {/* Estado activo/inactivo */}
              <div className="space-y-1.5">
                <Label>Estado</Label>
                <Controller
                  name="activo"
                  control={editForm.control}
                  render={({ field }) => (
                    <Select
                      value={field.value ? 'true' : 'false'}
                      onValueChange={(v) => field.onChange(v === 'true')}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem
                          value="true"
                          disabled={!colaborador?.activo && !puedeAgregar}
                        >
                          Activo
                        </SelectItem>
                        <SelectItem value="false">Inactivo</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                {!colaborador?.activo && !puedeAgregar && (
                  <p className="text-xs text-amber-600 flex items-center gap-1">
                    <span>⚠</span>
                    Límite de usuarios activos alcanzado. No es posible reactivar este colaborador.
                  </p>
                )}
              </div>
            </form>
            )
          ) : (
            // ── CREATE FORM ──
            <form id="colaborador-form" onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
              {/* Email solo en creación */}
              <div className="space-y-1.5">
                <Label>Correo electrónico</Label>
                <Input
                  type="email"
                  {...createForm.register('email')}
                  placeholder="colaborador@clinica.com"
                />
                {createForm.formState.errors.email && (
                  <p className="text-xs text-destructive">{createForm.formState.errors.email.message}</p>
                )}
              </div>

              {renderCommonFields(
                null,
                createForm.control,
                createForm.formState.errors,
                createForm.watch('role_id'),
                createForm.watch('sede_principal'),
                createForm.watch('sedes_ids'),
              )}
            </form>
          )}

          {/* ── Horarios por sede (solo en edición) ── */}
          {isEdit && colaborador && (
            <div className="mt-6 pt-5 border-t space-y-1">
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
          )}

          {serverError && (
            <div className="mt-4 rounded-lg bg-destructive/8 border border-destructive/15 px-3.5 py-2.5">
              <p className="text-sm text-destructive">
                {serverError?.response?.data?.detail ||
                  serverError?.response?.data?.error ||
                  'Ocurrió un error. Verifica los datos e intenta de nuevo.'}
              </p>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t px-6 py-4 flex justify-end gap-3 bg-white">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button form="colaborador-form" type="submit" disabled={isPending || (isEdit && isLoadingDetail)}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEdit ? 'Guardar cambios' : 'Crear colaborador'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
