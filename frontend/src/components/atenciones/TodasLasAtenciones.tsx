'use client'

import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { agendaApi } from '@/lib/api/agenda'
import { useUserSedes } from '@/hooks/useUserSedes'
import { useDebounce } from '@/hooks/useDebounce'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LoadingState } from '@/components/shared/LoadingState'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatDate, formatTime } from '@/lib/utils'
import { Search, ChevronLeft, ChevronRight, X } from 'lucide-react'
import Link from 'next/link'
import type { EstadoCita } from '@/types/agenda'

const NO_CERRADAS = 'pendiente,confirmada,en_espera,en_curso'

const ESTADO_LABELS: Record<EstadoCita, string> = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  en_espera: 'En espera',
  en_curso: 'En curso',
  completada: 'Completada',
  cancelada: 'Cancelada',
  no_asistio: 'No asistió',
}

const ESTADO_VARIANT: Record<EstadoCita, 'success' | 'muted' | 'warning' | 'info' | 'destructive' | 'default'> = {
  completada: 'success',
  cancelada: 'destructive',
  no_asistio: 'muted',
  en_curso: 'info',
  en_espera: 'warning',
  pendiente: 'default',
  confirmada: 'info',
}

const PAGE_SIZE = 15

type EstadoFiltro = 'no_cerradas' | EstadoCita | 'todas'

export function TodasLasAtenciones() {
  const { sedes, isLoading: loadingSedes } = useUserSedes()

  const [search, setSearch] = useState('')
  const [sede, setSede] = useState<string>('todas')
  const [estado, setEstado] = useState<EstadoFiltro>('no_cerradas')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [page, setPage] = useState(1)

  const debouncedSearch = useDebounce(search, 350)
  const resetPage = useCallback(() => setPage(1), [])

  const { data, isLoading } = useQuery({
    queryKey: ['citas', 'todas-clinica', sede, estado, fechaInicio, fechaFin, debouncedSearch, page],
    queryFn: () => agendaApi.citas.list({
      ...(sede !== 'todas' && { sede }),
      ...(estado === 'no_cerradas' && { estado__in: NO_CERRADAS }),
      ...(estado !== 'todas' && estado !== 'no_cerradas' && { estado: estado as EstadoCita }),
      ...(fechaInicio && { fecha_inicio__date__gte: fechaInicio }),
      ...(fechaFin && { fecha_inicio__date__lte: fechaFin }),
      ...(debouncedSearch && { search: debouncedSearch }),
      page,
      page_size: PAGE_SIZE,
      ordering: '-fecha_inicio',
    }),
  })

  const citas = data?.results ?? []
  const totalCount = data?.count ?? 0
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  const hasMultipleSedes = sedes.length > 1

  function limpiarFiltros() {
    setSearch('')
    setSede('todas')
    setEstado('no_cerradas')
    setFechaInicio('')
    setFechaFin('')
    setPage(1)
  }

  const hayFiltrosActivos =
    search !== '' || sede !== 'todas' || estado !== 'no_cerradas' || fechaInicio !== '' || fechaFin !== ''

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Buscar paciente o tratamiento…"
                value={search}
                onChange={e => { setSearch(e.target.value); resetPage() }}
                className="pl-8 h-9"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <label className="text-xs text-muted-foreground whitespace-nowrap">Desde</label>
              <Input
                type="date"
                value={fechaInicio}
                max={fechaFin || undefined}
                onChange={e => { setFechaInicio(e.target.value); resetPage() }}
                className="h-9 w-[140px] text-sm"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <label className="text-xs text-muted-foreground whitespace-nowrap">Hasta</label>
              <Input
                type="date"
                value={fechaFin}
                min={fechaInicio || undefined}
                onChange={e => { setFechaFin(e.target.value); resetPage() }}
                className="h-9 w-[140px] text-sm"
              />
            </div>

            {hasMultipleSedes && !loadingSedes && (
              <Select value={sede} onValueChange={v => { setSede(v); resetPage() }}>
                <SelectTrigger className="h-9 w-[160px] text-sm">
                  <SelectValue placeholder="Sede" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas las sedes</SelectItem>
                  {sedes.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Select value={estado} onValueChange={v => { setEstado(v as EstadoFiltro); resetPage() }}>
              <SelectTrigger className="h-9 w-[170px] text-sm">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="no_cerradas">En curso / no cerradas</SelectItem>
                <SelectItem value="pendiente">Pendientes</SelectItem>
                <SelectItem value="confirmada">Confirmadas</SelectItem>
                <SelectItem value="en_espera">En espera</SelectItem>
                <SelectItem value="en_curso">En curso</SelectItem>
                <SelectItem value="todas">Todos los estados</SelectItem>
                <SelectItem value="completada">Completadas</SelectItem>
                <SelectItem value="cancelada">Canceladas</SelectItem>
                <SelectItem value="no_asistio">No asistió</SelectItem>
              </SelectContent>
            </Select>

            {hayFiltrosActivos && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 gap-1.5 text-muted-foreground"
                onClick={limpiarFiltros}
              >
                <X className="h-3.5 w-3.5" />
                Limpiar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={6} />
      ) : citas.length === 0 ? (
        <EmptyState
          title="Sin resultados"
          description="No hay atenciones que coincidan con los filtros seleccionados."
        />
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground px-0.5">
            {totalCount} atención{totalCount !== 1 ? 'es' : ''} encontrada{totalCount !== 1 ? 's' : ''}
          </p>

          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Fecha</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Paciente</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Tratamiento / Servicio</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Profesional</th>
                    {hasMultipleSedes && (
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Sede</th>
                    )}
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Estado</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {citas.map(cita => (
                    <tr key={cita.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="font-medium text-foreground">{formatDate(cita.fecha_inicio)}</p>
                        <p className="text-xs text-muted-foreground">{formatTime(cita.fecha_inicio)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground truncate max-w-[180px]">{cita.paciente_nombre}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-foreground truncate max-w-[200px]">{cita.servicio_nombre || <span className="text-muted-foreground italic">Sin asignar</span>}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-foreground truncate max-w-[160px]">{cita.profesional_nombre}</p>
                      </td>
                      {hasMultipleSedes && (
                        <td className="px-4 py-3">
                          <p className="text-foreground truncate max-w-[140px]">{cita.sede_nombre}</p>
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <Badge variant={ESTADO_VARIANT[cita.estado]}>
                          {ESTADO_LABELS[cita.estado]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/atenciones/${cita.id}`}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          Ver
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-muted-foreground">
                Página {page} de {totalPages}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
