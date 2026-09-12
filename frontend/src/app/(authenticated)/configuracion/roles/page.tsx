'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Shield, Users, Pencil, Trash2, ChevronDown, ChevronUp,
  Lock, CheckSquare, Square, Minus, Stethoscope, Wrench,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { rolesApi } from '@/lib/api/roles'
import { useAuthStore } from '@/store/authStore'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { canAccess, hasPermission, PERM } from '@/lib/permissions'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { Rol, PermisoGrupo, CapacidadArea, CapacidadesResponse } from '@/types/usuarios'

// ── Schemas ────────────────────────────────────────────────────────────────────

const rolSchema = z.object({
  slug:        z.string().min(2).regex(/^[a-z0-9_]+$/),
  nombre:      z.string().min(1, 'Requerido'),
  descripcion: z.string().optional(),
})

function toSlug(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
}

// ── Editor de capacidades (capa semántica) ────────────────────────────────────
// `selected` son siempre claves de permiso técnicas — es lo que se envía al
// backend. Las capacidades y el modo avanzado son dos vistas sobre ese set.

type EstadoCap = 'on' | 'off' | 'partial'

function estadoDeCapacidad(capKeys: string[], selected: string[]): EstadoCap {
  const dentro = capKeys.filter(k => selected.includes(k)).length
  if (dentro === 0) return 'off'
  if (dentro === capKeys.length) return 'on'
  return 'partial'
}

function CapacidadesEditor({
  areas,
  selected,
  onChange,
  readonly,
}: {
  areas: CapacidadArea[]
  selected: string[]
  onChange: (keys: string[]) => void
  readonly: boolean
}) {
  const toggleCapacidad = (clave: string, capKeys: string[], estado: EstadoCap) => {
    if (readonly) return
    if (estado === 'on') {
      // Al apagar: quita sus claves, salvo las que otra capacidad totalmente
      // activa todavía necesita (permisos compartidos entre capacidades).
      const requeridasPorOtras = new Set(
        areas
          .flatMap(a => a.capacidades)
          .filter(c => c.clave !== clave && c.permisos.every(k => selected.includes(k)))
          .flatMap(c => c.permisos),
      )
      onChange(selected.filter(k => !capKeys.includes(k) || requeridasPorOtras.has(k)))
    } else {
      onChange([...new Set([...selected, ...capKeys])])
    }
  }

  return (
    <div className="space-y-4">
      {areas.map(area => {
        const total = area.capacidades.length
        const activas = area.capacidades.filter(
          c => estadoDeCapacidad(c.permisos, selected) === 'on',
        ).length

        return (
          <div key={area.area} className="rounded-xl border border-gray-150 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50/70 border-b border-gray-100">
              <span className="text-sm font-semibold">{area.titulo}</span>
              <span className={cn(
                'text-xs tabular-nums',
                activas > 0 ? 'text-rose-500 font-medium' : 'text-muted-foreground',
              )}>
                {activas}/{total}
              </span>
            </div>

            <div className="divide-y divide-gray-50">
              {area.capacidades.map(cap => {
                const estado = estadoDeCapacidad(cap.permisos, selected)
                const activo = estado === 'on'
                return (
                  <button
                    key={cap.clave}
                    type="button"
                    disabled={readonly}
                    onClick={() => toggleCapacidad(cap.clave, cap.permisos, estado)}
                    className={cn(
                      'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors',
                      readonly ? 'cursor-default' : 'hover:bg-gray-50',
                      activo && !readonly && 'bg-rose-50/40',
                    )}
                  >
                    <div className={cn(
                      'mt-0.5 h-[18px] w-[18px] rounded-md flex items-center justify-center shrink-0 border transition-colors',
                      estado === 'on'   && 'bg-rose-500 border-rose-500 text-white',
                      estado === 'partial' && 'bg-rose-100 border-rose-300 text-rose-600',
                      estado === 'off'  && 'border-gray-300',
                    )}>
                      {estado === 'on' && <span className="text-[11px] font-bold leading-none">✓</span>}
                      {estado === 'partial' && <Minus className="h-3 w-3" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-medium">{cap.titulo}</p>
                        {cap.profesional && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 text-sky-600 text-[10px] font-medium px-1.5 py-0.5">
                            <Stethoscope className="h-3 w-3" />
                            Atención clínica
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{cap.descripcion}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Modo avanzado: permisos técnicos crudos ──────────────────────────────────

function PermisosTecnicosEditor({
  grupos, selected, onChange, readonly,
}: {
  grupos: PermisoGrupo[]
  selected: string[]
  onChange: (keys: string[]) => void
  readonly: boolean
}) {
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({})
  const toggleGrupo = (m: string) => setExpandidos(p => ({ ...p, [m]: !p[m] }))

  const togglePermiso = (clave: string) => {
    if (readonly) return
    onChange(
      selected.includes(clave) ? selected.filter(k => k !== clave) : [...selected, clave],
    )
  }
  const toggleTodosGrupo = (g: PermisoGrupo) => {
    if (readonly) return
    const claves = g.permisos.map(p => p.clave)
    const todos = claves.every(c => selected.includes(c))
    onChange(todos
      ? selected.filter(k => !claves.includes(k))
      : [...new Set([...selected, ...claves])])
  }

  return (
    <div className="space-y-2">
      {grupos.map(grupo => {
        const open = expandidos[grupo.modulo] ?? false
        const claves = grupo.permisos.map(p => p.clave)
        const marcados = claves.filter(c => selected.includes(c)).length
        const todos = marcados === claves.length
        return (
          <div key={grupo.modulo} className="border rounded-lg overflow-hidden">
            <div className="flex items-center bg-gray-50/80 hover:bg-gray-100/80 transition-colors">
              {!readonly && (
                <button type="button" onClick={() => toggleTodosGrupo(grupo)}
                  className="px-3 py-2 shrink-0 text-muted-foreground hover:text-foreground">
                  {todos ? <CheckSquare className="h-4 w-4 text-rose-500" /> : <Square className="h-4 w-4" />}
                </button>
              )}
              <button type="button" className="flex-1 flex items-center justify-between px-3 py-2"
                onClick={() => toggleGrupo(grupo.modulo)}>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium capitalize">{grupo.modulo}</span>
                  <span className="text-xs text-muted-foreground">{marcados}/{claves.length}</span>
                </div>
                {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>
            </div>
            {open && (
              <div className="divide-y divide-gray-50">
                {grupo.permisos.map(permiso => {
                  const activo = selected.includes(permiso.clave)
                  return (
                    <button key={permiso.clave} type="button" disabled={readonly}
                      onClick={() => togglePermiso(permiso.clave)}
                      className={cn(
                        'w-full flex items-start gap-3 px-4 py-2 text-left transition-colors',
                        readonly ? 'cursor-default' : 'hover:bg-gray-50',
                        activo && !readonly && 'bg-rose-50/50',
                      )}>
                      <div className={cn(
                        'mt-0.5 h-4 w-4 rounded flex items-center justify-center shrink-0 border',
                        activo ? 'bg-rose-500 border-rose-500' : 'border-gray-300',
                      )}>
                        {activo && <span className="text-white text-[10px] font-bold">✓</span>}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm">{permiso.descripcion}</p>
                        <p className="text-xs text-muted-foreground font-mono">{permiso.clave}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Sheet Crear/Editar rol ─────────────────────────────────────────────────────

function RolSheet({
  rol, open, onClose, capacidades,
}: {
  rol: Rol | null  // null = modo creación
  open: boolean
  onClose: () => void
  capacidades: CapacidadesResponse | undefined
}) {
  const qc = useQueryClient()
  const isEditing = Boolean(rol)
  const [verTecnicos, setVerTecnicos] = useState(false)

  const areas = capacidades?.areas ?? []
  const gruposTecnicos = capacidades?.permisos_tecnicos ?? []
  const profesionalKeys = new Set(
    areas.flatMap(a => a.capacidades.filter(c => c.profesional).flatMap(c => c.permisos)),
  )

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(rolSchema),
    values: rol ? { slug: rol.slug, nombre: rol.nombre, descripcion: rol.descripcion } : undefined,
  })

  // Auto-genera el slug desde el nombre solo en modo creación
  const nombreValue = watch('nombre')
  useEffect(() => {
    if (!isEditing) setValue('slug', toSlug(nombreValue ?? ''))
  }, [nombreValue, isEditing, setValue])

  // Permisos seleccionados en este sheet
  const [permKeys, setPermKeys] = useState<string[]>(rol?.permission_keys ?? [])

  // Sincronizar al abrir con un rol diferente
  const [lastRolId, setLastRolId] = useState<string | null>(null)
  if (rol && rol.id !== lastRolId) {
    setPermKeys(rol.permission_keys)
    setLastRolId(rol.id)
  }
  if (!rol && lastRolId !== null) {
    setPermKeys([])
    setLastRolId(null)
  }

  const crearMutation = useMutation({
    mutationFn: async (data: z.infer<typeof rolSchema>) => {
      const nuevo = await rolesApi.create(data)
      if (permKeys.length) await rolesApi.updatePermisos(nuevo.id, permKeys)
      return nuevo
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); reset(); onClose() },
  })

  const editarMutation = useMutation({
    mutationFn: async (data: z.infer<typeof rolSchema>) => {
      await rolesApi.update(rol!.id, { nombre: data.nombre, descripcion: data.descripcion })
      await rolesApi.updatePermisos(rol!.id, permKeys)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); onClose() },
  })

  const isPending = crearMutation.isPending || editarMutation.isPending
  const isError   = crearMutation.isError   || editarMutation.isError

  const onSubmit = (data: z.infer<typeof rolSchema>) => {
    if (isEditing) editarMutation.mutate(data)
    else crearMutation.mutate(data)
  }

  const readonly = Boolean(rol && !rol.editable)
  const esProfesional = permKeys.some(k => profesionalKeys.has(k))

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) { reset(); onClose() } }}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <SheetTitle>{isEditing ? 'Editar rol' : 'Nuevo rol'}</SheetTitle>
          {readonly && (
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" />
              Rol de sistema — solo lectura
            </p>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          <form id="rol-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nombre del rol *</Label>
              <Input
                placeholder="Ej: Auxiliar operativo"
                {...register('nombre')}
                disabled={readonly}
                className={cn(errors.nombre && 'border-red-400')}
              />
              {errors.nombre && <p className="text-xs text-red-500">{errors.nombre.message}</p>}
            </div>

            {/* slug oculto — se auto-genera desde el nombre */}
            <input type="hidden" {...register('slug')} />

            <div className="space-y-1.5">
              <Label>Descripción</Label>
              <Textarea
                placeholder="Describe brevemente qué hace este rol…"
                rows={2}
                {...register('descripcion')}
                disabled={readonly}
                className="resize-none text-sm"
              />
            </div>
          </form>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                ¿Qué puede hacer este rol?
              </p>
              {!readonly && permKeys.length > 0 && (
                <button
                  type="button"
                  onClick={() => setPermKeys([])}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Limpiar todo
                </button>
              )}
            </div>

            {esProfesional && (
              <div className="flex items-start gap-2 rounded-lg bg-sky-50/70 border border-sky-100 px-3 py-2">
                <Stethoscope className="h-4 w-4 text-sky-600 mt-0.5 shrink-0" />
                <p className="text-xs text-sky-700">
                  Este rol podrá realizar atenciones clínicas: quien lo tenga aparecerá
                  como profesional en la agenda y podrá firmar la historia.
                </p>
              </div>
            )}

            {areas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Cargando capacidades…</p>
            ) : (
              <CapacidadesEditor
                areas={areas}
                selected={permKeys}
                onChange={setPermKeys}
                readonly={readonly}
              />
            )}

            {gruposTecnicos.length > 0 && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setVerTecnicos(v => !v)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Wrench className="h-3.5 w-3.5" />
                  {verTecnicos ? 'Ocultar' : 'Ver'} permisos técnicos
                  <span className="text-muted-foreground/60">({permKeys.length})</span>
                  {verTecnicos ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
                {verTecnicos && (
                  <div className="mt-2">
                    <PermisosTecnicosEditor
                      grupos={gruposTecnicos}
                      selected={permKeys}
                      onChange={setPermKeys}
                      readonly={readonly}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {!readonly && (
          <div className="shrink-0 border-t px-6 py-4 flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancelar
            </Button>
            <Button form="rol-form" type="submit" className="flex-1" disabled={isPending}>
              {isPending ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Crear rol'}
            </Button>
          </div>
        )}
        {isError && (
          <p className="shrink-0 px-6 pb-4 text-sm text-red-500">
            Error al guardar el rol. Intenta de nuevo.
          </p>
        )}
      </SheetContent>
    </Sheet>
  )
}

// ── Fila de rol ────────────────────────────────────────────────────────────────

function RolRow({
  rol, canEdit, onEdit, onEliminar,
}: {
  rol: Rol
  canEdit: boolean
  onEdit: (r: Rol) => void
  onEliminar: (r: Rol) => void
}) {
  return (
    <div className="flex items-center gap-4 px-5 py-3.5 border-b border-gray-100 last:border-0 hover:bg-gray-50/50 transition-colors">
      <div className="flex items-center justify-center h-9 w-9 rounded-full bg-rose-50 shrink-0">
        <Shield className="h-4 w-4 text-rose-500" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold">{rol.nombre}</p>
          {rol.es_sistema && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">Sistema</Badge>
          )}
          {!rol.activo && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-gray-400">Inactivo</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground font-mono">{rol.slug}</p>
        {rol.descripcion && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{rol.descripcion}</p>
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          {rol.usuarios_count}
        </div>
        <span className="text-xs text-muted-foreground">{rol.permission_keys.length} permisos</span>
      </div>

      {canEdit && (
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost" size="icon" className="h-8 w-8"
            onClick={() => onEdit(rol)}
            title={rol.editable ? 'Editar' : 'Ver'}
          >
            {rol.editable ? <Pencil className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
          </Button>
          {rol.editable && rol.usuarios_count === 0 && (
            <Button
              variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50"
              onClick={() => onEliminar(rol)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────────────────

export default function RolesPage() {
  return <RoleGuard check={canAccess.gestionRoles}><RolesContent /></RoleGuard>
}

function RolesContent() {
  const { user } = useAuthStore()
  const qc = useQueryClient()

  const canCreate = hasPermission(user, PERM.ROLES_CREAR)
  const canEdit   = hasPermission(user, PERM.ROLES_EDITAR)
  const canDelete = hasPermission(user, PERM.ROLES_ELIMINAR)

  const [rolSheet, setRolSheet] = useState<{ open: boolean; rol: Rol | null }>({ open: false, rol: null })
  const [eliminando, setEliminando] = useState<Rol | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: () => rolesApi.list(),
    staleTime: 5 * 60 * 1000,
  })

  const { data: capacidades } = useQuery({
    queryKey: ['capacidades-catalogo'],
    queryFn: () => rolesApi.listarCapacidades(),
    staleTime: 60 * 60 * 1000, // 1 hora — el catálogo cambia poco
  })

  const eliminarMutation = useMutation({
    mutationFn: (r: Rol) => rolesApi.delete(r.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] })
      setEliminando(null)
      setDeleteError(null)
    },
    onError: (err: any) => {
      setDeleteError(
        err?.response?.data?.error ??
        err?.response?.data?.detail ??
        'No se pudo eliminar el rol. Puede tener usuarios asignados.'
      )
    },
  })

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Roles y permisos"
          description="Define qué puede ver y hacer cada rol en la clínica."
          backHref="/configuracion"
        />
        {canCreate && (
          <Button onClick={() => setRolSheet({ open: true, rol: null })} className="shrink-0">
            <Plus className="h-4 w-4 mr-1.5" />
            Nuevo rol
          </Button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-4 px-5 py-2.5 bg-gray-50/80 border-b border-gray-100">
          <div className="w-9 shrink-0" />
          <div className="flex-1">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Rol</span>
          </div>
          <div className="w-36 shrink-0 text-right">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Usuarios / Permisos</span>
          </div>
          {(canEdit || canDelete) && <div className="w-16 shrink-0" />}
        </div>

        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3.5 border-b border-gray-100 animate-pulse">
              <div className="h-9 w-9 rounded-full bg-gray-100 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-32 rounded bg-gray-100" />
                <div className="h-3 w-20 rounded bg-gray-100" />
              </div>
            </div>
          ))
        ) : roles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Shield className="h-10 w-10 text-muted-foreground/20 mb-3" />
            <p className="text-sm font-semibold">Sin roles configurados</p>
          </div>
        ) : (
          roles.map(r => (
            <RolRow
              key={r.id}
              rol={r}
              canEdit={canEdit || canDelete}
              onEdit={r => setRolSheet({ open: true, rol: r })}
              onEliminar={r => { setDeleteError(null); setEliminando(r) }}
            />
          ))
        )}
      </div>

      <RolSheet
        rol={rolSheet.rol}
        open={rolSheet.open}
        onClose={() => setRolSheet({ open: false, rol: null })}
        capacidades={capacidades}
      />

      <Dialog open={!!eliminando} onOpenChange={v => { if (!v) { setEliminando(null); setDeleteError(null) } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Eliminar rol</DialogTitle></DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-muted-foreground">
              ¿Confirmas eliminar el rol{' '}
              <span className="font-semibold text-foreground">{eliminando?.nombre}</span>?
              Esta acción no se puede deshacer.
            </p>
            {deleteError && (
              <div className="rounded-lg bg-destructive/8 border border-destructive/15 px-3.5 py-2.5">
                <p className="text-sm text-destructive">{deleteError}</p>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setEliminando(null); setDeleteError(null) }}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={eliminarMutation.isPending}
              onClick={() => eliminando && eliminarMutation.mutate(eliminando)}
            >
              {eliminarMutation.isPending ? 'Eliminando…' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
