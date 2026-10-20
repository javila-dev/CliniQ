'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ChevronLeft, ChevronRight, Plus, Search, Stethoscope, PhoneCall, ShieldCheck, UserCog,
  Pencil, LogIn, Mail, MoreHorizontal, UserCheck, UserX,
} from 'lucide-react'
import { colaboradoresApi } from '@/lib/api/colaboradores'
import { usuariosApi } from '@/lib/api/usuarios'
import { clinicasApi } from '@/lib/api/clinicas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from '@/hooks/use-toast'
import { ColaboradorDialog } from '@/components/colaboradores/ColaboradorDialog'
import { EtiquetaAjuste, SeccionAjustes, VacioAjustes } from '@/components/configuracion/ajustes'
import { useDebounce } from '@/hooks/useDebounce'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { isSuperAdmin, hasPermission, PERM } from '@/lib/permissions'
import { PageHeader } from '@/components/shared/PageHeader'
import type { Colaborador } from '@/types/colaboradores'
import type { PlanLimite } from '@/types/usuarios'

/** Filas por página: la lista cabe en una pantalla; la búsqueda y los filtros hacen el resto. */
const POR_PAGINA = 10

// ─── helpers ──────────────────────────────────────────────────

const AVATAR_COLORS = [
  'bg-rose-100 text-rose-700',
  'bg-violet-100 text-violet-700',
  'bg-sky-100 text-sky-700',
  'bg-teal-100 text-teal-700',
  'bg-amber-100 text-amber-700',
  'bg-indigo-100 text-indigo-700',
]

function avatarColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function initials(name: string) {
  const parts = name.trim().split(' ')
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}

const ROL_CONFIG: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  admin:       { label: 'Administrador', icon: ShieldCheck, className: 'bg-violet-50 text-violet-700' },
  profesional: { label: 'Profesional',  icon: Stethoscope, className: 'bg-rose-50 text-rose-700' },
  recepcion:   { label: 'Recepción',    icon: PhoneCall,   className: 'bg-sky-50 text-sky-700'    },
}

// Rol a mostrar en la fila: usa el config por slug conocido; si es un rol
// dinámico/custom, cae al nombre del rol devuelto por el backend.
function resolverRol(colaborador: Colaborador) {
  const conocido = ROL_CONFIG[colaborador.rol ?? '']
  if (conocido) return conocido
  const nombre = colaborador.role_nombre?.trim()
  if (nombre) return { label: nombre, icon: UserCog, className: 'bg-muted text-foreground/70' }
  return null
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/** Línea de resumen bajo el título: cuántos hay, cuántos atienden y el uso del plan. */
function resumenEquipo({ total, estado, atienden, limite }: {
  total: number
  estado: string
  atienden: number
  limite?: PlanLimite
}) {
  const partes = [
    estado === 'activos' ? plural(total, 'persona activa', 'personas activas')
      : estado === 'inactivos' ? plural(total, 'persona inactiva', 'personas inactivas')
        : plural(total, 'persona', 'personas'),
    `${atienden} ${atienden === 1 ? 'atiende' : 'atienden'} pacientes`,
  ]
  if (limite && !limite.sin_limite && limite.max_usuarios) {
    const { usuarios_activos: usados, max_usuarios: max } = limite
    // El cupo cuenta usuarios activos e invitaciones pendientes, no solo esta lista.
    partes.push(usados > max
      ? `${usados} cupos usados de ${max} del plan`
      : `${usados} de ${max} cupos del plan`)
  }
  return partes.join(' · ')
}

// ─── Fila ─────────────────────────────────────────────────────

const COLUMNAS = 'grid grid-cols-[minmax(0,1fr)_auto_2rem] items-center gap-3 md:grid-cols-[minmax(0,1.1fr)_8.5rem_6rem_2rem] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_8.5rem_6rem_2rem] 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_8.5rem_10rem_6rem_2rem]'

function ColaboradorRow({
  colaborador,
  onEdit,
  onToggle,
  onImpersonate,
  onResend,
  resending,
  canActivate,
  puedeGestionar,
  puedeReenviar,
}: {
  colaborador: Colaborador
  puedeGestionar: boolean
  puedeReenviar: boolean
  onEdit: () => void
  onToggle: () => void
  onImpersonate?: () => void
  onResend: () => void
  resending: boolean
  canActivate: boolean
}) {
  const rol = resolverRol(colaborador)
  const RolIcon = rol?.icon ?? Stethoscope
  const grupos = colaborador.grupos_detalle ?? []

  const toggleDisabled = !colaborador.activo && !canActivate

  return (
    <div className={cn(COLUMNAS, 'px-4 py-2 transition-colors', colaborador.activo ? 'hover:bg-muted/30' : 'bg-muted/20')}>
      {/* Nombre (y correo debajo cuando no hay columna de correo) */}
      <div className="flex min-w-0 items-center gap-3">
        <div className={cn(
          'flex h-7 w-7 shrink-0 select-none items-center justify-center rounded-full text-xs font-semibold',
          colaborador.activo ? avatarColor(colaborador.nombre_completo) : 'bg-muted text-muted-foreground',
        )}>
          {initials(colaborador.nombre_completo)}
        </div>
        <div className="min-w-0">
          <p className={cn(
            'truncate text-sm font-medium',
            colaborador.activo ? 'text-foreground' : 'text-muted-foreground line-through',
          )}>
            {colaborador.nombre_completo}
          </p>
          <p className="truncate text-[13px] text-muted-foreground lg:hidden">{colaborador.email}</p>
        </div>
      </div>

      <p className="hidden truncate text-[13px] text-muted-foreground lg:block">{colaborador.email}</p>

      <div className="hidden min-w-0 md:block">
        {rol && (
          <span className={cn('inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium', rol.className)}>
            <RolIcon className="h-3 w-3 shrink-0" />
            <span className="truncate">{rol.label}</span>
          </span>
        )}
      </div>

      <div className="hidden min-w-0 items-center gap-1 2xl:flex">
        {grupos.length === 0 ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <>
            <span className="truncate rounded-md bg-muted px-1.5 py-0.5 text-xs text-foreground/80" title={grupos.map((g) => g.nombre).join(', ')}>
              {grupos[0].nombre}
            </span>
            {grupos.length > 1 && <span className="shrink-0 text-xs text-muted-foreground">+{grupos.length - 1}</span>}
          </>
        )}
      </div>

      <div>
        {colaborador.invitacion_pendiente ? (
          <span title="Fue invitado pero aún no activa su cuenta. Ocupa un cupo del plan.">
            <EtiquetaAjuste tono="aviso">Pendiente</EtiquetaAjuste>
          </span>
        ) : colaborador.activo ? (
          <EtiquetaAjuste tono="activo">Activo</EtiquetaAjuste>
        ) : (
          <EtiquetaAjuste>Inactivo</EtiquetaAjuste>
        )}
      </div>

      <div className="flex justify-end">
        {(puedeGestionar || puedeReenviar || onImpersonate) && <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground"
              aria-label={`Acciones para ${colaborador.nombre_completo}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {puedeGestionar && (
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="mr-2 h-3.5 w-3.5" />Editar
              </DropdownMenuItem>
            )}
            {puedeReenviar && colaborador.invitacion_pendiente && (
              <DropdownMenuItem onClick={onResend} disabled={resending}>
                <Mail className="mr-2 h-3.5 w-3.5" />Reenviar invitación
              </DropdownMenuItem>
            )}
            {onImpersonate && (
              <DropdownMenuItem onClick={onImpersonate}>
                <LogIn className="mr-2 h-3.5 w-3.5" />Ingresar como este usuario
              </DropdownMenuItem>
            )}
            {puedeGestionar && <DropdownMenuSeparator />}
            {!puedeGestionar ? null : colaborador.activo ? (
              <DropdownMenuItem onClick={onToggle} className="text-red-600 focus:text-red-600">
                <UserX className="mr-2 h-3.5 w-3.5" />Desactivar
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={onToggle}
                disabled={toggleDisabled}
                className="flex-col items-start text-green-600 focus:text-green-600"
              >
                <span className="flex items-center"><UserCheck className="mr-2 h-3.5 w-3.5" />Activar</span>
                {toggleDisabled && (
                  <span className="pl-[22px] text-xs text-muted-foreground">Límite de usuarios alcanzado. Actualiza tu plan para agregar más.</span>
                )}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>}
      </div>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 animate-pulse">
      <div className="h-8 w-8 rounded-full bg-muted shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 w-36 rounded bg-muted" />
      </div>
      <div className="hidden md:block h-5 w-24 rounded-full bg-muted" />
      <div className="h-5 w-14 rounded-full bg-muted" />
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────

export default function PersonalPage() {
  const qc = useQueryClient()
  const router = useRouter()
  // También se muestra como Configuración → Equipo → Usuarios, con el menú lateral de Configuración.
  const enConfiguracion = usePathname().startsWith('/configuracion')
  const { user: currentUser, impersonate } = useAuthStore()
  const canImpersonate = isSuperAdmin(currentUser)
  const isAdmin = hasPermission(currentUser, PERM.USUARIOS_CREAR)
  // Crear, editar y activar colaboradores: "Gestionar colaboradores". Reenviar la
  // invitación: "Editar usuarios". Sin ellos, la lista es de solo consulta.
  const puedeGestionar = hasPermission(currentUser, PERM.COLABORADORES_GESTIONAR)
  const puedeReenviar = hasPermission(currentUser, PERM.USUARIOS_EDITAR)

  const [search, setSearch] = useState('')
  const [filtroRol, setFiltroRol] = useState('todos')
  const [filtroEstado, setFiltroEstado] = useState('activos')
  const [pagina, setPagina] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Colaborador | null>(null)
  const [toggleTarget, setToggleTarget] = useState<Colaborador | null>(null)
  const [resendingId, setResendingId] = useState<string | null>(null)
  const debouncedSearch = useDebounce(search, 350)

  const handleImpersonate = async (colaborador: Colaborador) => {
    await impersonate(colaborador.user)
    router.push('/dashboard')
  }

  const params = {
    search: debouncedSearch || undefined,
    activo: filtroEstado === 'todos' ? undefined : filtroEstado === 'activos',
    page_size: 100,
  }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['colaboradores', params],
    queryFn: () => colaboradoresApi.list(params),
  })

  // Quién atiende pacientes. El listado de colaboradores no trae `es_profesional`
  // (antes el contador "Profesionales" salía en 0 y el filtro no encontraba a nadie):
  // se toma de la lista de profesionales, que sí lo decide por ese check.
  const { data: profesionales } = useQuery({
    queryKey: ['colaboradores', 'atienden-pacientes'],
    queryFn: () => colaboradoresApi.profesionales(),
    staleTime: 60_000,
  })
  const idsQueAtienden = new Set((profesionales ?? []).map((p) => p.colaborador_id).filter(Boolean))
  const atiende = (c: Colaborador) =>
    c.es_profesional ?? (profesionales ? idsQueAtienden.has(c.id) || (!c.activo && c.rol === 'profesional') : c.rol === 'profesional')

  // Uso del plan (activados + invitaciones pendientes). El backend ya calcula
  // usuarios_activos / puede_agregar / slots; se invalida en cada toggle/create.
  const { data: limite } = useQuery({
    queryKey: ['mi-plan'],
    queryFn: () => clinicasApi.getMiPlan(),
    staleTime: 60_000,
    enabled: isAdmin,
  })

  const puedeAgregar = limite?.puede_agregar ?? true

  const toggleMut = useMutation({
    mutationFn: ({ id, activo }: { id: string; activo: boolean }) =>
      colaboradoresApi.update(id, { activo }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['colaboradores'] })
      qc.invalidateQueries({ queryKey: ['mi-plan'] })
      setToggleTarget(null)
    },
    onError: (e: any) => {
      const data = e?.response?.data
      const msg = typeof data?.error === 'string'
        ? data.error
        : typeof data?.activo?.[0] === 'string'
          ? data.activo[0]
          : typeof data?.[0] === 'string'
            ? data[0]
            : 'Intenta de nuevo.'
      toast.error('No se pudo cambiar el estado', msg)
    },
  })

  const resendMut = useMutation({
    mutationFn: (c: Colaborador) => usuariosApi.reenviarInvitacion(c.user),
    onMutate: (c) => setResendingId(c.id),
    onSuccess: (result, c) => {
      if (result.email_enviado) {
        toast.success('Invitación reenviada', `Se envió un nuevo enlace a ${c.email ?? c.nombre_completo}.`)
      } else {
        toast.error('El enlace se generó, pero el correo no se pudo enviar', 'Intenta de nuevo en unos minutos o contacta a soporte.')
      }
    },
    onError: (e: any) => {
      const msg = typeof e?.response?.data?.error === 'string' ? e.response.data.error : 'Intenta de nuevo.'
      toast.error('No se pudo reenviar la invitación', msg)
    },
    onSettled: () => setResendingId(null),
  })

  const allColaboradores = data?.results ?? []
  const colaboradores = filtroRol === 'todos'
    ? allColaboradores
    : allColaboradores.filter((c) => (filtroRol === 'profesional' ? atiende(c) : !atiende(c)))
  const totalPaginas = Math.max(1, Math.ceil(colaboradores.length / POR_PAGINA))
  const paginaActual = Math.min(pagina, totalPaginas)
  const visibles = colaboradores.slice((paginaActual - 1) * POR_PAGINA, paginaActual * POR_PAGINA)

  const handleEdit = (c: Colaborador) => { setEditTarget(c); setDialogOpen(true) }
  const handleNew  = () => { setEditTarget(null); setDialogOpen(true) }

  const sinCupos = isAdmin && limite && !limite.sin_limite && !limite.puede_agregar
  const resumen = isLoading
    ? 'Cargando…'
    : resumenEquipo({
      total: data?.count ?? 0,
      estado: filtroEstado,
      atienden: allColaboradores.filter(atiende).length,
      limite: isAdmin ? limite : undefined,
    })

  const botonNuevo = puedeGestionar ? (
    <div className="flex items-center gap-2">
      {sinCupos && <span className="hidden sm:inline"><EtiquetaAjuste tono="aviso">Plan sin cupos libres</EtiquetaAjuste></span>}
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button size="sm" onClick={handleNew} disabled={!puedeAgregar}>
                <Plus className="h-4 w-4 mr-1.5" />
                Nuevo colaborador
              </Button>
            </span>
          </TooltipTrigger>
          {!puedeAgregar && (
            <TooltipContent>
              Has alcanzado el límite de usuarios activos de tu plan.
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
    </div>
  ) : undefined

  const cambiarFiltro = (fn: (v: string) => void) => (v: string) => { fn(v); setPagina(1) }

  return (
    <div className="space-y-6">

      <PageHeader
        title={enConfiguracion ? 'Usuarios' : 'Equipo'}
        description="Gestiona los colaboradores y usuarios de tu clínica."
        backHref={enConfiguracion ? undefined : '/configuracion'}
        helpSlug="crear-usuarios-y-asignar-roles"
      />

      <div className="space-y-7">
        <SeccionAjustes titulo="Personas del equipo" descripcion={resumen} accion={botonNuevo}>
          {/* Sin cupos: en móvil la etiqueta no cabe junto al botón; va aquí. */}
          {sinCupos && (
            <div className="px-4 py-2.5 sm:hidden"><EtiquetaAjuste tono="aviso">Plan sin cupos libres</EtiquetaAjuste></div>
          )}

          {/* Filtros */}
          <div className="flex flex-col gap-2 bg-muted/30 px-4 py-2.5 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre o correo"
                aria-label="Buscar colaborador"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPagina(1) }}
                className="h-9 bg-white pl-9 text-[13px]"
              />
            </div>
            <div className="flex gap-2">
              <Select value={filtroRol} onValueChange={cambiarFiltro(setFiltroRol)}>
                <SelectTrigger className="h-9 flex-1 bg-white text-[13px] sm:w-44" aria-label="Filtrar por tipo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los usuarios</SelectItem>
                  <SelectItem value="profesional">Atienden pacientes</SelectItem>
                  <SelectItem value="administrativo">No atienden pacientes</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filtroEstado} onValueChange={cambiarFiltro(setFiltroEstado)}>
                <SelectTrigger className="h-9 flex-1 bg-white text-[13px] sm:w-32" aria-label="Filtrar por estado"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="activos">Activos</SelectItem>
                  <SelectItem value="inactivos">Inactivos</SelectItem>
                  <SelectItem value="todos">Todos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Encabezado de columnas */}
          <div className={cn(COLUMNAS, 'px-4 py-2 text-xs font-medium text-muted-foreground')}>
            <span>Nombre</span>
            <span className="hidden lg:block">Correo</span>
            <span className="hidden md:block">Rol</span>
            <span className="hidden 2xl:block">Grupos de atención</span>
            <span>Estado</span>
            <span />
          </div>

          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
          ) : isError ? (
            <VacioAjustes
              titulo="No se pudo cargar el equipo"
              accion={<Button variant="outline" size="sm" onClick={() => refetch()}>Reintentar</Button>}
            />
          ) : colaboradores.length === 0 ? (
            <VacioAjustes
              titulo={search ? 'Sin resultados' : 'Aún no hay colaboradores'}
              descripcion={search
                ? `No se encontraron colaboradores para «${search}».`
                : 'Agrega al primer miembro del equipo con «Nuevo colaborador».'}
            />
          ) : (
            visibles.map((c) => (
              <ColaboradorRow
                key={c.id}
                colaborador={c}
                canActivate={puedeAgregar}
                puedeGestionar={puedeGestionar}
                puedeReenviar={puedeReenviar}
                onEdit={() => handleEdit(c)}
                onToggle={() => setToggleTarget(c)}
                onImpersonate={canImpersonate ? () => handleImpersonate(c) : undefined}
                onResend={() => resendMut.mutate(c)}
                resending={resendingId === c.id}
              />
            ))
          )}

          {!isLoading && !isError && colaboradores.length > POR_PAGINA && (
            <div className="flex items-center justify-end gap-2 px-4 py-1.5 text-[13px] text-muted-foreground">
              <span className="tabular-nums">
                {(paginaActual - 1) * POR_PAGINA + 1}–{Math.min(paginaActual * POR_PAGINA, colaboradores.length)} de {colaboradores.length}
              </span>
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={paginaActual <= 1}
                onClick={() => setPagina(paginaActual - 1)} aria-label="Página anterior">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={paginaActual >= totalPaginas}
                onClick={() => setPagina(paginaActual + 1)} aria-label="Página siguiente">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </SeccionAjustes>
      </div>

      <ColaboradorDialog
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditTarget(null) }}
        colaborador={editTarget}
        puedeAgregar={puedeAgregar}
      />

      <ConfirmDialog
        open={!!toggleTarget}
        onOpenChange={(v) => { if (!v && !toggleMut.isPending) setToggleTarget(null) }}
        title={toggleTarget?.activo ? 'Desactivar usuario' : 'Activar usuario'}
        description={
          toggleTarget?.activo
            ? `${toggleTarget?.nombre_completo} perderá el acceso a la clínica hasta que se reactive.`
            : `Se restablecerá el acceso de ${toggleTarget?.nombre_completo} a la clínica.`
        }
        confirmLabel={toggleTarget?.activo ? 'Desactivar' : 'Activar'}
        variant={toggleTarget?.activo ? 'destructive' : 'default'}
        loading={toggleMut.isPending}
        onConfirm={() => toggleTarget && toggleMut.mutate({ id: toggleTarget.id, activo: !toggleTarget.activo })}
      />
    </div>
  )
}
