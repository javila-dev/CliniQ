'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import {
  Plus, MoreHorizontal, Pencil, Power, Copy, Loader2, Package2, Search, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { clinicasApi } from '@/lib/api/clinicas'
import { useDebounce } from '@/hooks/useDebounce'
import { TratamientoDialog } from '@/components/configuracion/TratamientoDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { hasPermission, PERM } from '@/lib/permissions'
import type { TratamientoCatalogo } from '@/types/clinicas'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

// ─── Tabla de tratamientos ────────────────────────────────────

function TratamientosTable({
  tratamientos, puedeGestionar, onEdit, onDuplicar, onToggle,
}: {
  tratamientos: TratamientoCatalogo[]
  puedeGestionar: boolean
  onEdit: (t: TratamientoCatalogo) => void
  onDuplicar: (t: TratamientoCatalogo) => void
  onToggle: (t: TratamientoCatalogo) => void
}) {
  return (
    <div className="rounded-xl border bg-white overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50/60">
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tratamiento</th>
            <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32 hidden md:table-cell">Precio de lista</th>
            <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide w-24 hidden sm:table-cell">Sesiones</th>
            <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide w-24">Estado</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {tratamientos.map((t) => (
            <tr key={t.id} className={cn('hover:bg-gray-50/50 transition-colors', !t.activo && 'opacity-55')}>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-900 uppercase">{t.nombre}</p>
                  <span className="inline-flex items-center bg-gray-100 text-gray-600 text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0">
                    {t.total_sesiones} {t.total_sesiones === 1 ? 'sesión' : 'sesiones'}
                  </span>
                </div>
                {t.descripcion && <p className="text-xs text-muted-foreground truncate max-w-sm mt-0.5">{t.descripcion}</p>}
              </td>
              <td className="px-4 py-3 text-right hidden md:table-cell">
                {t.precio_estimado
                  ? <span className="text-sm font-semibold tabular-nums">{COP.format(parseFloat(t.precio_estimado))}</span>
                  : <span className="text-xs text-muted-foreground">—</span>}
              </td>
              <td className="px-4 py-3 text-center hidden sm:table-cell">
                <span className="text-sm font-medium">{t.total_sesiones}</span>
              </td>
              <td className="px-4 py-3 text-center">
                <Badge variant={t.activo ? 'default' : 'secondary'} className="text-[10px]">
                  {t.activo ? 'Activo' : 'Inactivo'}
                </Badge>
              </td>
              <td className="px-2 py-3">
                {puedeGestionar && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(t)}>
                      <Pencil className="h-4 w-4 mr-2" />Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onDuplicar(t)}>
                      <Copy className="h-4 w-4 mr-2" />Duplicar
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onToggle(t)}>
                      <Power className="h-4 w-4 mr-2" />{t.activo ? 'Desactivar' : 'Activar'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Contenido de la pestaña ────────────────────────────────────

const PAGE_SIZE = 25

export function TratamientosCatalogo() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const puedeGestionar = hasPermission(user, PERM.SERVICIOS_GESTIONAR)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<TratamientoCatalogo | null>(null)
  const [duplicando, setDuplicando] = useState(false)

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const debSearch = useDebounce(search, 350)

  const params = { search: debSearch || undefined, page, page_size: PAGE_SIZE }
  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ['tratamientos', 'all', params],
    queryFn: () => clinicasApi.tratamientos.list(params),
    retry: 1,
    placeholderData: keepPreviousData,
  })

  const toggleMut = useMutation({
    mutationFn: ({ id, activo }: { id: string; activo: boolean }) =>
      clinicasApi.tratamientos.update(id, { activo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tratamientos', 'all'] }),
  })

  const tratamientos = data?.results ?? []
  const total = data?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const buscando = debSearch.trim().length > 0

  const abrirNuevo = () => { setEditTarget(null); setDuplicando(false); setDialogOpen(true) }
  const abrirEdicion = (t: TratamientoCatalogo) => { setEditTarget(t); setDuplicando(false); setDialogOpen(true) }
  const abrirCopia = (t: TratamientoCatalogo) => { setEditTarget(t); setDuplicando(true); setDialogOpen(true) }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Agrupan varios procedimientos en un paquete de sesiones que vendes al paciente, con su precio.
        </p>
        {puedeGestionar && (
          <Button onClick={abrirNuevo}>
            <Plus className="h-4 w-4 mr-2" />Nuevo tratamiento
          </Button>
        )}
      </div>

      {!isError && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 h-9 bg-white"
            placeholder="Buscar por nombre…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
      )}

      {isLoading && <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}

      {isError && (
        <div className="rounded-xl border bg-amber-50 border-amber-200 p-6 text-center">
          <Package2 className="h-8 w-8 text-amber-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-amber-800">No se pudieron cargar los tratamientos</p>
          <p className="text-xs text-amber-700 mt-1">Recarga la página para intentarlo de nuevo.</p>
        </div>
      )}

      {!isLoading && !isError && tratamientos.length === 0 && buscando && (
        <div className="rounded-xl border bg-white px-4 py-12 text-center text-sm text-muted-foreground">
          Sin tratamientos para “{debSearch}”.
        </div>
      )}

      {!isLoading && !isError && tratamientos.length === 0 && !buscando && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Package2 className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-gray-700">Aún no tienes tratamientos</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            Un tratamiento agrupa varios procedimientos en un paquete de sesiones que vendes al paciente.
            Podrá agendarlas después de aceptar la cotización.
          </p>
          {puedeGestionar && (
            <Button className="mt-4" onClick={abrirNuevo}>
              <Plus className="h-4 w-4 mr-2" />Crear mi primer tratamiento
            </Button>
          )}
        </div>
      )}

      {!isLoading && !isError && tratamientos.length > 0 && (
        <div className={cn('space-y-3 transition-opacity', isFetching && 'opacity-60')}>
          <TratamientosTable
            tratamientos={tratamientos}
            puedeGestionar={puedeGestionar}
            onEdit={abrirEdicion}
            onDuplicar={abrirCopia}
            onToggle={(t) => toggleMut.mutate({ id: t.id, activo: !t.activo })}
          />
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
        </div>
      )}

      <TratamientoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        tratamiento={editTarget}
        duplicar={duplicando}
      />
    </div>
  )
}
