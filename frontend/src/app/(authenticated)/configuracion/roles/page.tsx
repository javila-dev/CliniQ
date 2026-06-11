'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Shield, Users, Pencil, Trash2, ChevronDown, ChevronUp,
  Lock, CheckSquare, Square,
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
import type { Rol, PermisoGrupo } from '@/types/usuarios'

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

// ── Editor de permisos ─────────────────────────────────────────────────────────

function PermisosEditor({
  grupos,
  selected,
  onChange,
  readonly,
}: {
  grupos: PermisoGrupo[]
  selected: string[]
  onChange: (keys: string[]) => void
  readonly: boolean
}) {
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({})

  const toggleGrupo = (modulo: string) =>
    setExpandidos(prev => ({ ...prev, [modulo]: !prev[modulo] }))

  const togglePermiso = (clave: string) => {
    if (readonly) return
    onChange(
      selected.includes(clave)
        ? selected.filter(k => k !== clave)
        : [...selected, clave]
    )
  }

  const toggleTodosGrupo = (grupo: PermisoGrupo) => {
    if (readonly) return
    const claves = grupo.permisos.map(p => p.clave)
    const todosMarcados = claves.every(c => selected.includes(c))
    onChange(
      todosMarcados
        ? selected.filter(k => !claves.includes(k))
        : [...new Set([...selected, ...claves])]
    )
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
                <button
                  type="button"
                  onClick={() => toggleTodosGrupo(grupo)}
                  className="px-3 py-2.5 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {todos
                    ? <CheckSquare className="h-4 w-4 text-rose-500" />
                    : <Square className="h-4 w-4" />}
                </button>
              )}
              <button
                type="button"
                className="flex-1 flex items-center justify-between px-3 py-2.5"
                onClick={() => toggleGrupo(grupo.modulo)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold capitalize">{grupo.modulo}</span>
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
                    <button
                      key={permiso.clave}
                      type="button"
                      disabled={readonly}
                      onClick={() => togglePermiso(permiso.clave)}
                      className={cn(
                        'w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors',
                        readonly ? 'cursor-default' : 'hover:bg-gray-50',
                        activo && !readonly && 'bg-rose-50/50'
                      )}
                    >
                      <div className={cn(
                        'mt-0.5 h-4 w-4 rounded flex items-center justify-center shrink-0 border transition-colors',
                        activo ? 'bg-rose-500 border-rose-500' : 'border-gray-300'
                      )}>
                        {activo && <span className="text-white text-[10px] font-bold">✓</span>}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{permiso.descripcion}</p>
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
  rol, open, onClose, grupos,
}: {
  rol: Rol | null  // null = modo creación
  open: boolean
  onClose: () => void
  grupos: PermisoGrupo[]
}) {
  const qc = useQueryClient()
  const isEditing = Boolean(rol)

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
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Permisos asignados
            </p>
            {grupos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Cargando permisos…</p>
            ) : (
              <PermisosEditor
                grupos={grupos}
                selected={permKeys}
                onChange={setPermKeys}
                readonly={readonly}
              />
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

  const { data: grupos = [] } = useQuery({
    queryKey: ['permisos-catalogo'],
    queryFn: () => rolesApi.listarPermisos(),
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
        grupos={grupos}
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
