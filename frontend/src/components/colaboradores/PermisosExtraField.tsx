'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, Loader2, Lock, Plus, ShieldPlus } from 'lucide-react'
import { rolesApi } from '@/lib/api/roles'
import { usuariosApi } from '@/lib/api/usuarios'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAuthStore } from '@/store/authStore'
import { hasPermission, isAdminOrSuperAdmin, PERM } from '@/lib/permissions'
import { mensajeDeError } from '@/lib/errores'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { Capacidad, CapacidadArea, Rol, UsuarioAdmin } from '@/types/usuarios'

// Permisos que una persona tiene además de su rol. Solo suman: lo que da el rol
// se ve marcado y bloqueado. Se eligen por capacidad, igual que al armar un rol,
// y se guardan aparte del formulario del colaborador (botón propio).

const contiene = (claves: string[], set: Set<string>) => claves.every((k) => set.has(k))

/** Lo que tiene sin contar los extra: su rol y lo que da el check "atiende pacientes". */
function permisosBase(usuario: UsuarioAdmin, rol: Rol | undefined): Set<string> {
  const extra = new Set(usuario.permisos_extra)
  return new Set([
    ...(rol?.permission_keys ?? []),
    ...usuario.permissions.filter((k) => !extra.has(k)),
  ])
}

/** Capacidades que hoy vienen de los permisos extra (no las cubre ya la base). */
function capacidadesExtra(areas: CapacidadArea[], base: Set<string>, extra: Set<string>): Set<string> {
  const total = new Set([...base, ...extra])
  return new Set(
    areas
      .flatMap((a) => a.capacidades)
      .filter((c) => !contiene(c.permisos, base) && contiene(c.permisos, total))
      .map((c) => c.clave),
  )
}

export function usePuedeAsignarPermisosExtra(usuario: UsuarioAdmin | undefined) {
  const actor = useAuthStore((s) => s.user)
  if (!usuario || !actor) return false
  if (actor.id === usuario.id) return false
  if (usuario.rol === 'admin') return false
  return hasPermission(actor, PERM.USUARIOS_EDITAR) && hasPermission(actor, PERM.ROLES_ASIGNAR_PERMISOS)
}

export function PermisosExtraField({ usuario, rol }: { usuario: UsuarioAdmin; rol: Rol | undefined }) {
  const [abierto, setAbierto] = useState(false)
  const { data: catalogo, isLoading } = useQuery({
    queryKey: ['capacidades-catalogo'],
    queryFn: () => rolesApi.listarCapacidades(),
    staleTime: 10 * 60 * 1000,
  })
  const areas = catalogo?.areas ?? []
  const base = useMemo(() => permisosBase(usuario, rol), [usuario, rol])
  const extra = useMemo(() => new Set(usuario.permisos_extra), [usuario.permisos_extra])
  const activas = useMemo(() => capacidadesExtra(areas, base, extra), [areas, base, extra])
  const titulos = areas.flatMap((a) => a.capacidades).filter((c) => activas.has(c.clave)).map((c) => c.titulo)
  // Claves otorgadas que no completan ninguna capacidad (p. ej. desde el modo técnico).
  const clavesDeCapacidades = new Set(areas.flatMap((a) => a.capacidades).filter((c) => activas.has(c.clave)).flatMap((c) => c.permisos))
  const sueltas = usuario.permisos_extra.filter((k) => !clavesDeCapacidades.has(k))

  return (
    <div className="space-y-1.5 sm:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Permisos adicionales</p>
          <p className="text-xs text-muted-foreground">
            Lo que puede hacer además de su rol. Aplica solo a esta persona.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setAbierto(true)} disabled={isLoading}>
          {usuario.permisos_extra.length > 0 ? 'Editar' : <><Plus className="mr-1 h-3.5 w-3.5" />Agregar</>}
        </Button>
      </div>
      {usuario.permisos_extra.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {titulos.map((t) => (
            <li key={t} className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
              <ShieldPlus className="h-3 w-3" />
              {t}
            </li>
          ))}
          {sueltas.length > 0 && (
            <li className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground" title={sueltas.join(', ')}>
              {sueltas.length === 1 ? '1 permiso técnico' : `${sueltas.length} permisos técnicos`}
            </li>
          )}
        </ul>
      )}
      {abierto && (
        <PermisosExtraDialog
          usuario={usuario}
          rolNombre={rol?.nombre ?? usuario.role_nombre ?? 'su rol'}
          areas={areas}
          base={base}
          activasIniciales={activas}
          sueltas={sueltas}
          onClose={() => setAbierto(false)}
        />
      )}
    </div>
  )
}

function PermisosExtraDialog({
  usuario, rolNombre, areas, base, activasIniciales, sueltas, onClose,
}: {
  usuario: UsuarioAdmin
  rolNombre: string
  areas: CapacidadArea[]
  base: Set<string>
  activasIniciales: Set<string>
  sueltas: string[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const actor = useAuthStore((s) => s.user)
  const actorEsAdmin = isAdminOrSuperAdmin(actor)
  const propios = useMemo(() => new Set(actor?.permissions ?? []), [actor?.permissions])
  const [elegidas, setElegidas] = useState<Set<string>>(() => new Set(activasIniciales))
  const [abiertas, setAbiertas] = useState<Set<string>>(() => new Set(
    areas.filter((a) => a.capacidades.some((c) => activasIniciales.has(c.clave))).map((a) => a.area),
  ))

  // Quien no es administrador solo otorga lo que él mismo tiene (el backend lo exige).
  const puedeOtorgar = (c: Capacidad) => actorEsAdmin || c.permisos.every((k) => base.has(k) || propios.has(k))

  const guardar = useMutation({
    mutationFn: () => {
      const claves = new Set(sueltas)
      areas.flatMap((a) => a.capacidades)
        .filter((c) => elegidas.has(c.clave))
        .forEach((c) => c.permisos.forEach((k) => { if (!base.has(k)) claves.add(k) }))
      return usuariosApi.setPermisosExtra(usuario.id, [...claves].sort())
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuario-detail-colab', usuario.id] })
      qc.invalidateQueries({ queryKey: ['colaboradores'] })
      toast({ title: 'Permisos adicionales guardados' })
      onClose()
    },
  })

  const toggle = (clave: string) => setElegidas((prev) => {
    const next = new Set(prev)
    if (next.has(clave)) next.delete(clave)
    else next.add(clave)
    return next
  })
  const toggleArea = (area: string) => setAbiertas((prev) => {
    const next = new Set(prev)
    if (next.has(area)) next.delete(area)
    else next.add(area)
    return next
  })

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-6 pb-4 pt-6 text-left">
          <DialogTitle>Permisos adicionales de {usuario.nombre_completo}</DialogTitle>
          <DialogDescription>
            Se suman a los de «{rolNombre}». Lo que ya da su rol aparece marcado y no se puede quitar desde aquí.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-6 py-4">
          {areas.map((area) => {
            const extraEnArea = area.capacidades.filter((c) => elegidas.has(c.clave)).length
            const abierta = abiertas.has(area.area)
            return (
              <div key={area.area} className="overflow-hidden rounded-xl border">
                <button
                  type="button"
                  onClick={() => toggleArea(area.area)}
                  className="flex w-full items-center justify-between gap-3 bg-muted/40 px-4 py-2.5 text-left hover:bg-muted/70"
                >
                  <span className="text-sm font-semibold">{area.titulo}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    {extraEnArea > 0 && (
                      <span className="text-xs font-medium text-amber-700">
                        {extraEnArea === 1 ? '1 adicional' : `${extraEnArea} adicionales`}
                      </span>
                    )}
                    {abierta ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                  </span>
                </button>
                {abierta && (
                  <div className="divide-y border-t">
                    {area.capacidades.map((c) => {
                      const delRol = contiene(c.permisos, base)
                      const marcada = delRol || elegidas.has(c.clave)
                      const bloqueada = delRol || (!elegidas.has(c.clave) && !puedeOtorgar(c))
                      return (
                        <button
                          key={c.clave}
                          type="button"
                          disabled={bloqueada}
                          onClick={() => toggle(c.clave)}
                          className={cn(
                            'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors',
                            bloqueada ? 'cursor-default' : 'hover:bg-muted/40',
                            elegidas.has(c.clave) && 'bg-amber-50/60',
                          )}
                        >
                          <span className={cn(
                            'mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border',
                            delRol && 'border-muted-foreground/30 bg-muted text-muted-foreground',
                            !delRol && marcada && 'border-amber-500 bg-amber-500 text-white',
                            !marcada && 'border-gray-300',
                          )}>
                            {marcada && <span className="text-[11px] font-bold leading-none">✓</span>}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span className={cn('text-sm font-medium', bloqueada && !marcada && 'text-muted-foreground')}>{c.titulo}</span>
                              {delRol && <span className="text-xs text-muted-foreground">Incluido en su rol</span>}
                              {!delRol && bloqueada && (
                                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                  <Lock className="h-3 w-3" />No lo tienes tú
                                </span>
                              )}
                            </span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">{c.descripcion}</span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
          {sueltas.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Además tiene {sueltas.length === 1 ? '1 permiso técnico suelto' : `${sueltas.length} permisos técnicos sueltos`} ({sueltas.join(', ')}); se conservan.
            </p>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t px-6 py-4">
          {guardar.isError && (
            <p className="mr-auto self-center text-sm text-destructive">
              {mensajeDeError(guardar.error, 'No se pudieron guardar los permisos.')}
            </p>
          )}
          <Button type="button" variant="outline" onClick={onClose} disabled={guardar.isPending}>Cancelar</Button>
          <Button type="button" onClick={() => guardar.mutate()} disabled={guardar.isPending}>
            {guardar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
