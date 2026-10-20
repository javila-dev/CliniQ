'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Shield, Users, Pencil, Trash2, ChevronDown, ChevronUp,
  Lock, CheckSquare, Square, Minus, Stethoscope, Wrench, Eye,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { rolesApi } from '@/lib/api/roles'
import { useAuthStore } from '@/store/authStore'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { canAccess, hasPermission, PERM } from '@/lib/permissions'
import { PageHeader } from '@/components/shared/PageHeader'
import { ErrorState } from '@/components/shared/ErrorState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { EtiquetaAjuste, FilaAjuste, SeccionAjustes, VacioAjustes } from '@/components/configuracion/ajustes'
import { cn } from '@/lib/utils'
import { aplicarErroresDeCampo, mensajeDeError } from '@/lib/errores'
import type { Rol, PermisoGrupo, CapacidadArea, CapacidadesResponse } from '@/types/usuarios'

// ── Schemas ────────────────────────────────────────────────────────────────────

// El código interno del rol (slug) lo genera el backend desde el nombre.
// Antes se armaba aquí: con un nombre de una letra el botón no hacía nada.
const rolSchema = z.object({
  nombre:      z.string().trim().min(2, 'Escribe un nombre de al menos 2 letras.'),
  descripcion: z.string().optional(),
})

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
  // Acordeón por área — cada una se abre/cierra de forma independiente (no es
  // de un solo panel: al configurar un rol se suele tocar varias áreas a la
  // vez). Arrancan abiertas las que ya tengan algo activo, para ver de entrada
  // qué trae el rol; el resto queda colapsada mostrando solo el contador.
  const [openAreas, setOpenAreas] = useState<Set<string>>(() => new Set(
    areas
      .filter(a => a.capacidades.some(c => estadoDeCapacidad(c.permisos, selected) !== 'off'))
      .map(a => a.area),
  ))
  const toggleArea = (area: string) => {
    setOpenAreas(prev => {
      const next = new Set(prev)
      if (next.has(area)) next.delete(area)
      else next.add(area)
      return next
    })
  }

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
    <div className="space-y-2">
      {areas.map(area => {
        const total = area.capacidades.length
        const activas = area.capacidades.filter(
          c => estadoDeCapacidad(c.permisos, selected) === 'on',
        ).length
        const open = openAreas.has(area.area)

        return (
          <div key={area.area} className="rounded-xl border border-gray-150 overflow-hidden">
            <button
              type="button"
              onClick={() => toggleArea(area.area)}
              className="w-full flex items-center justify-between gap-3 px-4 py-2.5 bg-gray-50/70 hover:bg-gray-100/70 transition-colors text-left"
            >
              <span className="text-sm font-semibold">{area.titulo}</span>
              <span className="flex items-center gap-2 shrink-0">
                <span className={cn(
                  'text-xs tabular-nums',
                  activas > 0 ? 'text-rose-500 font-medium' : 'text-muted-foreground',
                )}>
                  {activas}/{total}
                </span>
                {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
              </span>
            </button>

            {open && (
              <div className="divide-y divide-gray-50 border-t border-gray-100">
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
                            <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 text-sky-700 text-xs font-medium px-2 py-0.5">
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
            )}
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

// ── Modal Crear/Editar rol ──────────────────────────────────────────────────────

function RolDialog({
  rol, open, onClose, capacidades, errorCapacidades, onReintentarCapacidades,
}: {
  rol: Rol | null  // null = modo creación
  open: boolean
  onClose: () => void
  capacidades: CapacidadesResponse | undefined
  errorCapacidades: unknown
  onReintentarCapacidades: () => void
}) {
  const qc = useQueryClient()
  const isEditing = Boolean(rol)
  const [verTecnicos, setVerTecnicos] = useState(false)

  const areas = capacidades?.areas ?? []
  const gruposTecnicos = capacidades?.permisos_tecnicos ?? []

  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm({
    resolver: zodResolver(rolSchema),
    values: rol ? { nombre: rol.nombre, descripcion: rol.descripcion } : undefined,
  })

  // Permisos seleccionados en este modal
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

  useEffect(() => {
    if (open) setVerTecnicos(false)
  }, [open, rol?.id])

  // Un nombre repetido se muestra en el campo Nombre, no como error genérico.
  const marcarErrorDeCampo = (err: unknown) => aplicarErroresDeCampo(err, setError, ['nombre', 'descripcion'])

  const crearMutation = useMutation({
    // Rol y permisos en una sola llamada: si algo falla no queda un rol vacío.
    mutationFn: (data: z.infer<typeof rolSchema>) =>
      rolesApi.create({ ...data, permission_keys: permKeys }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); reset(); onClose() },
    onError: marcarErrorDeCampo,
  })

  const editarMutation = useMutation({
    mutationFn: async (data: z.infer<typeof rolSchema>) => {
      await rolesApi.update(rol!.id, { nombre: data.nombre, descripcion: data.descripcion })
      await rolesApi.updatePermisos(rol!.id, permKeys)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); onClose() },
    onError: marcarErrorDeCampo,
  })

  const isPending = crearMutation.isPending || editarMutation.isPending
  const isError   = crearMutation.isError   || editarMutation.isError
  const errorGuardar = crearMutation.error ?? editarMutation.error
  // Si el error ya se muestra en un campo, no se repite abajo.
  const errorEnCampo = Boolean(errors.nombre?.type === 'server' || errors.descripcion?.type === 'server')

  const onSubmit = (data: z.infer<typeof rolSchema>) => {
    if (isEditing) editarMutation.mutate(data)
    else crearMutation.mutate(data)
  }

  const readonly = Boolean(rol && !rol.editable)

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); onClose() } }}>
      <DialogContent className="max-w-2xl max-h-[85vh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle>{isEditing ? 'Editar rol' : 'Nuevo rol'}</DialogTitle>
          {readonly && (
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" />
              Rol de sistema — solo lectura
            </p>
          )}
        </DialogHeader>

        <form id="rol-form" onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          <div className="space-y-4">
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
          </div>

          <div className="border-t pt-4 space-y-3">
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

            {errorCapacidades ? (
              <div className="flex items-center gap-3">
                <p className="text-sm text-destructive">
                  {mensajeDeError(errorCapacidades, 'No se pudieron cargar las capacidades.')}
                </p>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={onReintentarCapacidades}>
                  Reintentar
                </Button>
              </div>
            ) : areas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Cargando capacidades…</p>
            ) : (
              <CapacidadesEditor
                key={rol?.id ?? 'nuevo'}
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
        </form>

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
        {isError && !errorEnCampo && (
          <p className="shrink-0 px-6 pb-4 text-sm text-red-500">
            {mensajeDeError(errorGuardar, 'No se pudo guardar el rol. Intenta de nuevo.')}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Fila de rol ────────────────────────────────────────────────────────────────

function RolRow({
  rol, canEdit, canDelete, onEdit, onEliminar,
}: {
  rol: Rol
  canEdit: boolean
  canDelete: boolean
  onEdit: (r: Rol) => void
  onEliminar: (r: Rol) => void
}) {
  return (
    <FilaAjuste
      icono={Shield}
      apagada={!rol.activo}
      titulo={rol.nombre}
      descripcion={rol.descripcion || undefined}
      extra={
        <>
          {rol.es_sistema && <EtiquetaAjuste icono={Lock}>Sistema</EtiquetaAjuste>}
          {!rol.activo && <EtiquetaAjuste tono="aviso">Inactivo</EtiquetaAjuste>}
        </>
      }
    >
      <span className="hidden items-center gap-1 text-[13px] text-muted-foreground tabular-nums sm:flex" title="Usuarios con este rol">
        <Users className="h-3.5 w-3.5" />
        {rol.usuarios_count} {rol.usuarios_count === 1 ? 'usuario' : 'usuarios'}
      </span>
      <span className="flex items-center gap-1 text-[13px] text-muted-foreground tabular-nums sm:hidden">
        <Users className="h-3.5 w-3.5" />
        {rol.usuarios_count}
      </span>
      {canEdit && (
        <Button
          variant="ghost" size="icon" className="h-8 w-8"
          onClick={() => onEdit(rol)}
          title={rol.editable ? 'Editar' : 'Ver'}
          aria-label={`${rol.editable ? 'Editar' : 'Ver'} ${rol.nombre}`}
        >
          {rol.editable ? <Pencil className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </Button>
      )}
      {canDelete && (
        rol.editable && rol.usuarios_count === 0 ? (
          <Button
            variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/5"
            onClick={() => onEliminar(rol)}
            aria-label={`Eliminar ${rol.nombre}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        ) : (
          // Reserva el espacio para que los botones queden alineados entre filas.
          <span className="h-8 w-8" aria-hidden />
        )
      )}
    </FilaAjuste>
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

  const { data: roles = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['roles'],
    queryFn: () => rolesApi.list(),
    staleTime: 5 * 60 * 1000,
  })

  const { data: capacidades, error: errorCapacidades, refetch: refetchCapacidades } = useQuery({
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
    <div className="space-y-6">
      <PageHeader
        helpSlug="roles-y-permisos"
        title="Roles y permisos"
        description="Define qué puede ver y hacer cada rol en la clínica."
      />

      <div className="space-y-7">
        <SeccionAjustes
          titulo="Roles"
          descripcion="Cada usuario tiene un rol. Los del sistema se pueden consultar pero no editar."
          accion={canCreate ? (
            <Button size="sm" onClick={() => setRolSheet({ open: true, rol: null })}>
              <Plus className="h-4 w-4 mr-1.5" />
              Nuevo rol
            </Button>
          ) : undefined}
        >
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3.5 animate-pulse">
                <div className="h-8 w-8 rounded-lg bg-muted shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-32 rounded bg-muted" />
                  <div className="h-3 w-48 rounded bg-muted" />
                </div>
              </div>
            ))
          ) : isError ? (
            <ErrorState message={mensajeDeError(error, 'No se pudieron cargar los roles.')} onRetry={() => refetch()} />
          ) : roles.length === 0 ? (
            <VacioAjustes titulo="Sin roles configurados" descripcion="Crea un rol para asignarlo a los usuarios del equipo." />
          ) : (
            roles.map(r => (
              <RolRow
                key={r.id}
                rol={r}
                canEdit={canEdit || canDelete}
                canDelete={canDelete}
                onEdit={r => setRolSheet({ open: true, rol: r })}
                onEliminar={r => { setDeleteError(null); setEliminando(r) }}
              />
            ))
          )}
        </SeccionAjustes>
      </div>

      <RolDialog
        rol={rolSheet.rol}
        open={rolSheet.open}
        onClose={() => setRolSheet({ open: false, rol: null })}
        capacidades={capacidades}
        errorCapacidades={errorCapacidades}
        onReintentarCapacidades={() => refetchCapacidades()}
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
