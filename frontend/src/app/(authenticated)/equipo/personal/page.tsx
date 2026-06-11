'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Search, Users, Stethoscope, PhoneCall,
  Pencil, ToggleLeft, ToggleRight, LogIn, AlertCircle,
} from 'lucide-react'
import { colaboradoresApi } from '@/lib/api/colaboradores'
import { clinicasApi } from '@/lib/api/clinicas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ColaboradorSheet } from '@/components/colaboradores/ColaboradorSheet'
import { useDebounce } from '@/hooks/useDebounce'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { isSuperAdmin, hasPermission, PERM } from '@/lib/permissions'
import { PageHeader } from '@/components/shared/PageHeader'
import type { Colaborador } from '@/types/colaboradores'
import type { PlanLimite } from '@/types/usuarios'

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

const CONTRATO_CONFIG: Record<string, { label: string; className: string }> = {
  empleado:    { label: 'Empleado',    className: 'bg-blue-50 text-blue-700 ring-blue-200/60'       },
  contratista: { label: 'Contratista', className: 'bg-amber-50 text-amber-700 ring-amber-200/60'    },
  socio:       { label: 'Socio',       className: 'bg-violet-50 text-violet-700 ring-violet-200/60' },
}

const ROL_CONFIG: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  profesional: { label: 'Profesional', icon: Stethoscope, className: 'bg-rose-50 text-rose-700 ring-rose-200/60' },
  recepcion:   { label: 'Recepción',   icon: PhoneCall,   className: 'bg-sky-50 text-sky-700 ring-sky-200/60'    },
}

// ─── PlanLimitBanner ──────────────────────────────────────────

function PlanLimitBanner({ limite }: { limite: PlanLimite }) {
  if (limite.sin_limite) return null

  const { usuarios_activos, max_usuarios, slots_disponibles, puede_agregar } = limite
  const pct = max_usuarios ? Math.min((usuarios_activos / max_usuarios) * 100, 100) : 0
  const isWarning = pct >= 80
  const isFull = !puede_agregar

  return (
    <div className={cn(
      'flex items-center gap-3 rounded-xl border px-4 py-3',
      isFull
        ? 'bg-red-50 border-red-200'
        : isWarning
          ? 'bg-amber-50 border-amber-200'
          : 'bg-blue-50/60 border-blue-200/60',
    )}>
      <AlertCircle className={cn(
        'h-4 w-4 shrink-0',
        isFull ? 'text-red-500' : isWarning ? 'text-amber-500' : 'text-blue-400',
      )} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="text-xs font-medium text-foreground">
            {usuarios_activos} de {max_usuarios} usuarios activos en el plan
          </span>
          {isFull ? (
            <span className="text-xs font-semibold text-red-600">Límite alcanzado</span>
          ) : slots_disponibles !== null ? (
            <span className="text-xs text-muted-foreground">
              {slots_disponibles} slot{slots_disponibles !== 1 ? 's' : ''} libre{slots_disponibles !== 1 ? 's' : ''}
            </span>
          ) : null}
        </div>
        <div className="h-1.5 w-full rounded-full bg-white/70 overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-300',
              isFull ? 'bg-red-400' : isWarning ? 'bg-amber-400' : 'bg-blue-400',
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Row ──────────────────────────────────────────────────────

function ColaboradorRow({
  colaborador,
  onEdit,
  onToggle,
  onImpersonate,
  canActivate,
}: {
  colaborador: Colaborador
  onEdit: () => void
  onToggle: () => void
  onImpersonate?: () => void
  canActivate: boolean
}) {
  const rol = ROL_CONFIG[colaborador.rol]
  const contrato = CONTRATO_CONFIG[colaborador.tipo_contrato]
  const RolIcon = rol?.icon ?? Stethoscope

  const toggleDisabled = !colaborador.activo && !canActivate

  return (
    <div className={cn(
      'group flex items-center gap-4 px-5 py-3.5 border-b border-gray-100 last:border-0 transition-colors',
      colaborador.activo ? 'hover:bg-rose-50/30' : 'opacity-60 hover:bg-gray-50'
    )}>
      <div className={cn(
        'flex items-center justify-center h-10 w-10 rounded-full text-sm font-semibold shrink-0 select-none',
        colaborador.activo ? avatarColor(colaborador.nombre_completo) : 'bg-gray-100 text-gray-400'
      )}>
        {initials(colaborador.nombre_completo)}
      </div>

      <div className="flex-1 min-w-0">
        <p className={cn(
          'text-sm font-semibold truncate transition-colors',
          colaborador.activo
            ? 'text-foreground group-hover:text-primary'
            : 'text-muted-foreground line-through'
        )}>
          {colaborador.nombre_completo}
        </p>
        <p className="text-xs text-muted-foreground truncate">{colaborador.email}</p>
      </div>

      <div className="hidden md:flex justify-center w-28 shrink-0">
        {rol && (
          <span className={cn(
            'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ring-1',
            rol.className
          )}>
            <RolIcon className="h-3 w-3" />
            {rol.label}
          </span>
        )}
      </div>

      <div className="hidden lg:flex justify-center w-24 shrink-0">
        {contrato && (
          <span className={cn(
            'inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ring-1',
            contrato.className
          )}>
            {contrato.label}
          </span>
        )}
      </div>

      <div className="hidden xl:flex justify-center items-center gap-1 w-48 min-w-0 shrink-0 flex-wrap">
        {(colaborador.especialidades_detalle ?? []).length === 0 ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <div className="contents">
            {(colaborador.especialidades_detalle ?? []).slice(0, 2).map((e) => (
              <span key={e.id} className="inline-block px-1.5 py-0.5 rounded bg-gray-100 text-[10px] text-gray-600 truncate max-w-[88px]">
                {e.nombre}
              </span>
            ))}
            {(colaborador.especialidades_detalle ?? []).length > 2 && (
              <span className="text-[10px] text-muted-foreground">+{(colaborador.especialidades_detalle ?? []).length - 2}</span>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0">
        <span className={cn(
          'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ring-1',
          colaborador.activo
            ? 'bg-green-50 text-green-700 ring-green-200/60'
            : 'bg-gray-100 text-gray-500 ring-gray-200/60'
        )}>
          <span className={cn('h-1.5 w-1.5 rounded-full', colaborador.activo ? 'bg-green-500' : 'bg-gray-400')} />
          {colaborador.activo ? 'Activo' : 'Inactivo'}
        </span>
      </div>

      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {onImpersonate && (
          <button
            onClick={(e) => { e.stopPropagation(); onImpersonate() }}
            className="flex items-center justify-center h-7 w-7 rounded-md hover:bg-amber-50 text-muted-foreground hover:text-amber-600 transition-colors"
            title="Ingresar como este usuario"
          >
            <LogIn className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onEdit() }}
          className="flex items-center justify-center h-7 w-7 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Editar"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <button
                  onClick={(e) => { e.stopPropagation(); if (!toggleDisabled) onToggle() }}
                  disabled={toggleDisabled}
                  className={cn(
                    'flex items-center justify-center h-7 w-7 rounded-md transition-colors',
                    toggleDisabled
                      ? 'opacity-40 cursor-not-allowed text-muted-foreground'
                      : colaborador.activo
                        ? 'hover:bg-red-50 text-muted-foreground hover:text-red-500'
                        : 'hover:bg-green-50 text-muted-foreground hover:text-green-600'
                  )}
                  title={toggleDisabled ? 'Límite de usuarios alcanzado' : colaborador.activo ? 'Desactivar' : 'Activar'}
                >
                  {colaborador.activo
                    ? <ToggleRight className="h-4 w-4" />
                    : <ToggleLeft className="h-4 w-4" />}
                </button>
              </span>
            </TooltipTrigger>
            {toggleDisabled && (
              <TooltipContent>
                Límite de usuarios alcanzado. Actualiza tu plan para agregar más.
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 px-5 py-3.5 border-b border-gray-100 last:border-0 animate-pulse">
      <div className="h-10 w-10 rounded-full bg-gray-100 shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 w-36 rounded bg-gray-100" />
        <div className="h-3 w-48 rounded bg-gray-100" />
      </div>
      <div className="hidden md:block h-6 w-24 rounded bg-gray-100" />
      <div className="hidden lg:block h-6 w-20 rounded bg-gray-100" />
      <div className="h-6 w-16 rounded bg-gray-100" />
      <div className="h-6 w-14 rounded bg-gray-100" />
    </div>
  )
}

// ─── Stats bar ────────────────────────────────────────────────

function StatsBar({ data }: { data: Colaborador[] }) {
  const total        = data.length
  const activos      = data.filter((c) => c.activo).length
  const profesionales = data.filter((c) => c.rol === 'profesional').length
  const recepcion    = data.filter((c) => c.rol === 'recepcion').length

  const stats = [
    { label: 'Total',         value: total,         icon: Users,       color: 'text-foreground', bg: 'bg-gray-50'  },
    { label: 'Activos',       value: activos,       icon: Users,       color: 'text-green-600',  bg: 'bg-green-50' },
    { label: 'Profesionales', value: profesionales, icon: Stethoscope, color: 'text-rose-600',   bg: 'bg-rose-50'  },
    { label: 'Recepción',     value: recepcion,     icon: PhoneCall,   color: 'text-sky-600',    bg: 'bg-sky-50'   },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {stats.map(({ label, value, icon: Icon, color, bg }) => (
        <div key={label} className={cn('rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-3', bg)}>
          <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-white shadow-sm shrink-0">
            <Icon className={cn('h-4 w-4', color)} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={cn('text-base font-bold', color)}>{value}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────

export default function PersonalPage() {
  const qc = useQueryClient()
  const router = useRouter()
  const { user: currentUser, impersonate } = useAuthStore()
  const canImpersonate = isSuperAdmin(currentUser)
  const isAdmin = hasPermission(currentUser, PERM.USUARIOS_CREAR)

  const [search, setSearch] = useState('')
  const [filtroRol, setFiltroRol] = useState('todos')
  const [filtroEstado, setFiltroEstado] = useState('activos')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Colaborador | null>(null)
  const debouncedSearch = useDebounce(search, 350)

  const handleImpersonate = async (colaborador: Colaborador) => {
    await impersonate(colaborador.id)
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

  // Plan: solo max_usuarios y sin_limite — raramente cambia
  const { data: planInfo } = useQuery({
    queryKey: ['mi-plan'],
    queryFn: () => clinicasApi.getMiPlan(),
    staleTime: 5 * 60_000,
    enabled: isAdmin,
  })

  // Conteo real de activos — query ligera que se invalida en cada toggle/create
  const { data: activosPage } = useQuery({
    queryKey: ['colaboradores-activos-count'],
    queryFn: () => colaboradoresApi.list({ activo: true, page_size: 1 }),
    staleTime: 0,
    enabled: isAdmin,
  })

  // Construir PlanLimite combinando ambas fuentes
  const limite: import('@/types/usuarios').PlanLimite | undefined = planInfo
    ? (() => {
        const sinLimite   = planInfo.sin_limite
        const maxUsuarios = planInfo.max_usuarios
        const activos     = activosPage?.count ?? planInfo.usuarios_activos
        const slots       = sinLimite || maxUsuarios === null ? null : Math.max(0, maxUsuarios - activos)
        return {
          max_usuarios:     maxUsuarios,
          usuarios_activos: activos,
          puede_agregar:    sinLimite || (maxUsuarios !== null && activos < maxUsuarios),
          slots_disponibles: slots,
          sin_limite:       sinLimite,
        }
      })()
    : undefined

  const puedeAgregar = limite?.puede_agregar ?? true

  const toggleMut = useMutation({
    mutationFn: ({ id, activo }: { id: string; activo: boolean }) =>
      colaboradoresApi.update(id, { activo }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['colaboradores'] })
      qc.invalidateQueries({ queryKey: ['colaboradores-activos-count'] })
    },
  })

  const allColaboradores = data?.results ?? []
  const colaboradores = filtroRol === 'todos'
    ? allColaboradores
    : allColaboradores.filter((c) => c.rol === filtroRol)

  const handleEdit = (c: Colaborador) => { setEditTarget(c); setSheetOpen(true) }
  const handleNew  = () => { setEditTarget(null); setSheetOpen(true) }

  return (
    <div className="space-y-5">

      <PageHeader
        title="Equipo"
        description="Gestiona los colaboradores y usuarios de tu clínica."
        backHref="/configuracion"
      />

      {/* Sub-header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {isLoading ? 'Cargando...' : `${data?.count ?? 0} colaborador${(data?.count ?? 0) !== 1 ? 'es' : ''} registrados`}
        </p>
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button onClick={handleNew} disabled={!puedeAgregar}>
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

      {/* Stats */}
      {!isLoading && allColaboradores.length > 0 && (
        <StatsBar data={allColaboradores} />
      )}

      {/* Banner de uso del plan — solo visible para admin */}
      {isAdmin && limite && <PlanLimitBanner limite={limite} />}

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o correo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white"
          />
        </div>
        <Select value={filtroRol} onValueChange={setFiltroRol}>
          <SelectTrigger className="w-36 bg-white"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los roles</SelectItem>
            <SelectItem value="profesional">Profesionales</SelectItem>
            <SelectItem value="recepcion">Recepción</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filtroEstado} onValueChange={setFiltroEstado}>
          <SelectTrigger className="w-32 bg-white"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="activos">Activos</SelectItem>
            <SelectItem value="inactivos">Inactivos</SelectItem>
            <SelectItem value="todos">Todos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-4 px-5 py-2.5 bg-gray-50/80 border-b border-gray-100">
          <div className="w-10 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Colaborador</span>
          </div>
          <div className="hidden md:flex justify-center w-28 shrink-0">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Rol</span>
          </div>
          <div className="hidden lg:flex justify-center w-24 shrink-0">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Contrato</span>
          </div>
          <div className="hidden xl:flex justify-center w-48 shrink-0">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Especialidades</span>
          </div>
          <div className="w-[76px] shrink-0">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Estado</span>
          </div>
          <div className="w-14 shrink-0" />
        </div>

        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm font-semibold">Error al cargar colaboradores</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
              Reintentar
            </Button>
          </div>
        ) : colaboradores.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-muted mb-4">
              <Users className="h-7 w-7 text-muted-foreground/50" />
            </div>
            <p className="text-sm font-semibold text-foreground">
              {search ? 'Sin resultados' : 'Aún no hay colaboradores'}
            </p>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              {search
                ? `No se encontraron colaboradores para "${search}"`
                : 'Agrega el primer miembro del equipo usando el botón de arriba'}
            </p>
          </div>
        ) : (
          colaboradores.map((c) => (
            <ColaboradorRow
              key={c.id}
              colaborador={c}
              canActivate={puedeAgregar}
              onEdit={() => handleEdit(c)}
              onToggle={() => toggleMut.mutate({ id: c.id, activo: !c.activo })}
              onImpersonate={canImpersonate ? () => handleImpersonate(c) : undefined}
            />
          ))
        )}
      </div>

      <ColaboradorSheet
        open={sheetOpen}
        onOpenChange={(v) => { setSheetOpen(v); if (!v) setEditTarget(null) }}
        colaborador={editTarget}
        puedeAgregar={puedeAgregar}
      />
    </div>
  )
}
