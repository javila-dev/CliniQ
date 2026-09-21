'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { Plus, MoreHorizontal, Pencil, Power, Clock, FileText, ShieldCheck, Loader2, CheckCircle2, XCircle, Search, SearchX, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { clinicasApi } from '@/lib/api/clinicas'
import { PageHeader } from '@/components/shared/PageHeader'
import { ProcedimientoDialog } from '@/components/configuracion/ProcedimientoDialog'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useDebounce } from '@/hooks/useDebounce'
import { cn } from '@/lib/utils'
import type { Servicio } from '@/types/clinicas'

const PAGE_SIZE = 25 // Tamaño de página fijo del backend (PageNumberPagination)

function ProcedimientosTable({
  servicios, onEdit, onToggle, fetching,
}: {
  servicios: Servicio[]
  onEdit: (s: Servicio) => void
  onToggle: (s: Servicio) => void
  fetching: boolean
}) {
  return (
    <div className={cn('rounded-xl border bg-white overflow-hidden transition-opacity', fetching && 'opacity-60')}>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b bg-gray-50/60">
            <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Procedimiento</th>
            <th className="px-4 py-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide w-24">Duración</th>
            <th className="px-4 py-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide w-20 hidden sm:table-cell">Zonas</th>
            <th className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32 hidden md:table-cell">Precio ref.</th>
            <th className="px-4 py-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide w-52 hidden sm:table-cell">Consentimiento</th>
            <th className="px-4 py-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide w-20">Estado</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {servicios.map((s) => (
            <tr key={s.id} className={cn('hover:bg-gray-50/50 transition-colors', !s.activo && 'opacity-55')}>
              <td className="px-4 py-2">
                <p className="font-medium text-gray-900 leading-tight uppercase">{s.nombre}</p>
                {s.descripcion && <p className="text-xs text-muted-foreground truncate max-w-xs mt-0.5">{s.descripcion}</p>}
              </td>
              <td className="px-4 py-2 text-center">
                <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />{s.duracion_min} min
                </span>
              </td>
              <td className="px-4 py-2 text-center hidden sm:table-cell">
                {(s.diagramas?.length ?? 0) > 0
                  ? <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                  : <XCircle className="h-4 w-4 text-red-400 mx-auto" />}
              </td>
              <td className="px-4 py-2 text-right hidden md:table-cell">
                {s.precio
                  ? <span className="text-sm font-medium tabular-nums">{new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(parseFloat(s.precio))}</span>
                  : <span className="text-xs text-muted-foreground">—</span>}
              </td>
              <td className="px-4 py-2 text-center hidden sm:table-cell">
                {(s.consentimientos_requeridos?.length ?? 0) > 0
                  ? (
                    <Badge variant="outline" className="text-[10px] gap-1 max-w-full truncate">
                      <ShieldCheck className="h-3 w-3 shrink-0" />
                      <span className="truncate">{s.consentimientos_requeridos![0].template_nombre ?? 'Sin plantilla'}</span>
                    </Badge>
                  )
                  : <span className="text-xs text-muted-foreground">—</span>}
              </td>
              <td className="px-4 py-2 text-center">
                <Badge variant={s.activo ? 'default' : 'secondary'} className="text-[10px]">
                  {s.activo ? 'Activo' : 'Inactivo'}
                </Badge>
              </td>
              <td className="px-2 py-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(s)}>
                      <Pencil className="h-4 w-4 mr-2" />Editar
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onToggle(s)}>
                      <Power className="h-4 w-4 mr-2" />
                      {s.activo ? 'Desactivar' : 'Activar'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function ProcedimientosPage() {
  const qc = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Servicio | null>(null)

  const [search, setSearch] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [filtroConsentimiento, setFiltroConsentimiento] = useState('todos')
  const [filtroZonas, setFiltroZonas] = useState('todos')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounce(search, 350)

  // Cada cambio de filtro o búsqueda vuelve a la primera página.
  const reset = (fn: () => void) => { fn(); setPage(1) }
  const hayFiltros = search.trim() !== '' || filtroEstado !== 'todos' || filtroConsentimiento !== 'todos' || filtroZonas !== 'todos'
  const limpiarFiltros = () => {
    setSearch(''); setFiltroEstado('todos'); setFiltroConsentimiento('todos'); setFiltroZonas('todos'); setPage(1)
  }

  const params = {
    search: debouncedSearch.trim() || undefined,
    activo: filtroEstado !== 'todos' ? filtroEstado === 'activos' : undefined,
    tiene_consentimiento: filtroConsentimiento !== 'todos' ? filtroConsentimiento === 'con' : undefined,
    tiene_zonas: filtroZonas !== 'todos' ? filtroZonas === 'con' : undefined,
    page,
  }

  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: ['procedimientos', 'all', params],
    queryFn: () => clinicasApi.procedimientos.list(params),
    placeholderData: keepPreviousData,
  })

  // Si la página pedida ya no existe (p. ej. se desactivó el último ítem de la última página con un filtro activo).
  useEffect(() => {
    if (isError && page > 1) setPage(1)
  }, [isError, page])

  const toggleMut = useMutation({
    mutationFn: ({ id, activo }: { id: string; activo: boolean }) =>
      clinicasApi.procedimientos.update(id, { activo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['procedimientos', 'all'] }),
  })

  const servicios = data?.results ?? []
  const total = data?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const abrirNuevo = () => { setEditTarget(null); setDialogOpen(true) }

  return (
    <div className="space-y-6">
      <PageHeader
        helpSlug="configurar-un-procedimiento"
        title="Procedimientos"
        description="Configura los procedimientos clínicos: duración, protocolo de pasos y consentimientos"
        backHref="/configuracion"
        action={
          <Button onClick={abrirNuevo}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo procedimiento
          </Button>
        }
      />

      {/* Buscador y filtros: se mantienen visibles aunque el filtro no devuelva nada, para poder limpiarlos */}
      {(hayFiltros || total > 0) && (
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o descripción…"
              value={search}
              onChange={(e) => reset(() => setSearch(e.target.value))}
              className="pl-9 bg-white"
            />
          </div>
          <Select value={filtroEstado} onValueChange={(v) => reset(() => setFiltroEstado(v))}>
            <SelectTrigger className="w-40 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estados</SelectItem>
              <SelectItem value="activos">Activos</SelectItem>
              <SelectItem value="inactivos">Inactivos</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filtroConsentimiento} onValueChange={(v) => reset(() => setFiltroConsentimiento(v))}>
            <SelectTrigger className="w-52 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Consentimiento: todos</SelectItem>
              <SelectItem value="con">Con consentimiento</SelectItem>
              <SelectItem value="sin">Sin consentimiento</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filtroZonas} onValueChange={(v) => reset(() => setFiltroZonas(v))}>
            <SelectTrigger className="w-44 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Zonas: todas</SelectItem>
              <SelectItem value="con">Con zonas</SelectItem>
              <SelectItem value="sin">Sin zonas</SelectItem>
            </SelectContent>
          </Select>
          {hayFiltros && (
            <Button variant="ghost" size="sm" onClick={limpiarFiltros}>
              <X className="h-4 w-4 mr-1" />Limpiar
            </Button>
          )}
        </div>
      )}

      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && servicios.length === 0 && !hayFiltros && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No hay procedimientos configurados</p>
          <p className="text-xs text-muted-foreground mt-1">Crea el primer procedimiento para empezar a agendar citas</p>
          <Button className="mt-4" onClick={abrirNuevo}>
            <Plus className="h-4 w-4 mr-2" />Nuevo procedimiento
          </Button>
        </div>
      )}

      {!isLoading && servicios.length === 0 && hayFiltros && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <SearchX className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">Ningún procedimiento coincide con los filtros</p>
          <Button variant="outline" className="mt-4" onClick={limpiarFiltros}>Limpiar filtros</Button>
        </div>
      )}

      {!isLoading && servicios.length > 0 && (
        <ProcedimientosTable
          servicios={servicios}
          fetching={isFetching}
          onEdit={(s) => { setEditTarget(s); setDialogOpen(true) }}
          onToggle={(s) => toggleMut.mutate({ id: s.id, activo: !s.activo })}
        />
      )}

      {!isLoading && total > 0 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} de {total}
          </p>
          <div className={cn('flex items-center gap-2', totalPages <= 1 && 'hidden')}>
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-muted-foreground tabular-nums">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <ProcedimientoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        servicio={editTarget}
      />
    </div>
  )
}
