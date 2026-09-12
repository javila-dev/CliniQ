'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Images, MoreHorizontal, Pencil, Plus, Trash2, X, LayoutTemplate,
} from 'lucide-react'
import { clinicasApi } from '@/lib/api/clinicas'
import { adminApi } from '@/lib/api/admin'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { GrupoZonas, GrupoZonasDiagrama, DiagramaCorporal } from '@/types/admin'

// ─── Dialog crear / editar grupo ─────────────────────────────────────────────

function GrupoDialog({
  grupo,
  open,
  onClose,
}: {
  grupo: GrupoZonas | null
  open: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()
  const isEdit = !!grupo
  const [nombre, setNombre] = useState(grupo?.nombre ?? '')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => {
      if (!nombre.trim()) throw new Error('Nombre requerido')
      if (isEdit) return clinicasApi.gruposZonas.update(grupo!.id, { nombre: nombre.trim() })
      return clinicasApi.gruposZonas.create({ nombre: nombre.trim() })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-grupos-zonas'] })
      handleClose()
    },
    onError: (e: Error) => setError(e.message || 'Error al guardar'),
  })

  function handleClose() {
    setNombre(grupo?.nombre ?? '')
    setError(null)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar grupo' : 'Nuevo grupo de zonas'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Nombre *</Label>
            <Input
              placeholder="Ej: Cara completa, Tronco anterior"
              value={nombre}
              onChange={e => { setNombre(e.target.value); setError(null) }}
              className={cn(error && 'border-red-400')}
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose}>Cancelar</Button>
          <Button disabled={mutation.isPending || !nombre.trim()} onClick={() => mutation.mutate()}>
            {mutation.isPending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear grupo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Dialog gestionar diagramas del grupo ─────────────────────────────────────

function DiagramasGrupoDialog({
  grupo,
  open,
  onClose,
}: {
  grupo: GrupoZonas | null
  open: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()

  const { data: todosLosDiagramas = [], isLoading: loadingDiagramas } = useQuery({
    queryKey: ['admin-diagramas'],
    queryFn: () => adminApi.diagramas.list(),
    staleTime: 60_000,
    enabled: open,
  })

  // Leer el grupo fresco desde el cache para reflejar cambios inmediatos
  const gruposCache = qc.getQueryData<GrupoZonas[]>(['admin-grupos-zonas']) ?? []
  const grupoFresco = gruposCache.find(g => g.id === grupo?.id) ?? grupo

  const agregarMut = useMutation({
    mutationFn: (diagramaId: string) =>
      clinicasApi.gruposZonas.agregarDiagrama(grupo!.id, diagramaId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-grupos-zonas'] }),
  })

  const eliminarMut = useMutation({
    mutationFn: (diagramaId: string) =>
      clinicasApi.gruposZonas.eliminarDiagrama(grupo!.id, diagramaId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-grupos-zonas'] }),
  })

  if (!grupo) return null

  const asignadosIds = new Set((grupoFresco?.diagramas ?? []).map((d: GrupoZonasDiagrama) => d.diagrama))
  const disponibles = (todosLosDiagramas as DiagramaCorporal[]).filter(
    d => d.activo && !asignadosIds.has(d.id),
  )

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Diagramas — {grupoFresco?.nombre}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* Asignados */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Asignados ({grupoFresco?.diagramas.length ?? 0})
            </p>
            {(grupoFresco?.diagramas.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground py-2 text-center">
                Sin diagramas asignados
              </p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {(grupoFresco?.diagramas ?? []).map((d: GrupoZonasDiagrama) => (
                  <div key={d.id} className="flex items-center gap-3 rounded-lg border p-2.5 bg-white">
                    {d.imagen_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={d.imagen_url} alt={d.diagrama_nombre} className="h-10 w-10 object-contain rounded bg-muted shrink-0" />
                    ) : (
                      <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                        <LayoutTemplate className="h-4 w-4 text-muted-foreground/40" />
                      </div>
                    )}
                    <span className="text-sm flex-1 min-w-0 truncate">{d.diagrama_nombre}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                      disabled={eliminarMut.isPending}
                      onClick={() => eliminarMut.mutate(d.diagrama)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Disponibles para agregar */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Agregar diagrama
            </p>
            {loadingDiagramas ? (
              <div className="space-y-1.5 animate-pulse">
                {[1, 2].map(i => <div key={i} className="h-14 rounded-lg bg-muted" />)}
              </div>
            ) : disponibles.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2 text-center">
                Todos los diagramas activos ya están asignados.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {disponibles.map((d: DiagramaCorporal) => (
                  <button
                    key={d.id}
                    className="w-full flex items-center gap-3 rounded-lg border p-2.5 hover:bg-muted/50 transition-colors text-left disabled:opacity-50"
                    disabled={agregarMut.isPending}
                    onClick={() => agregarMut.mutate(d.id)}
                  >
                    {d.imagen_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={d.imagen_url} alt={d.nombre} className="h-10 w-10 object-contain rounded bg-muted shrink-0" />
                    ) : (
                      <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                        <LayoutTemplate className="h-4 w-4 text-muted-foreground/40" />
                      </div>
                    )}
                    <span className="text-sm font-medium">{d.nombre}</span>
                    <Plus className="h-3.5 w-3.5 ml-auto text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Dialog confirmar eliminación ─────────────────────────────────────────────

function DeleteDialog({
  grupo,
  open,
  onClose,
}: {
  grupo: GrupoZonas | null
  open: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => clinicasApi.gruposZonas.delete(grupo!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-grupos-zonas'] })
      onClose()
    },
  })

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>¿Eliminar grupo?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground py-2">
          Se eliminará <span className="font-semibold">{grupo?.nombre}</span>. Los procedimientos que
          lo tengan asignado perderán la referencia.
        </p>
        {mutation.isError && (
          <p className="text-sm text-red-500">No se pudo eliminar. Puede tener relaciones activas.</p>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button variant="destructive" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? 'Eliminando…' : 'Eliminar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function GruposZonasPage() {
  const qc = useQueryClient()
  const [grupoDialog, setGrupoDialog]     = useState(false)
  const [diagramasDialog, setDiagramasDialog] = useState(false)
  const [deleteDialog, setDeleteDialog]   = useState(false)
  const [editando,   setEditando]   = useState<GrupoZonas | null>(null)
  const [gestionando, setGestionando] = useState<GrupoZonas | null>(null)
  const [eliminando, setEliminando] = useState<GrupoZonas | null>(null)

  const { data: grupos = [], isLoading } = useQuery({
    queryKey: ['admin-grupos-zonas'],
    queryFn: () => clinicasApi.gruposZonas.list(),
  })

  const toggleMut = useMutation({
    mutationFn: (g: GrupoZonas) => clinicasApi.gruposZonas.update(g.id, { activo: !g.activo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-grupos-zonas'] }),
  })

  const activos   = grupos.filter(g => g.activo).length
  const inactivos = grupos.filter(g => !g.activo).length

  function handleEdit(g: GrupoZonas) { setEditando(g); setGrupoDialog(true) }
  function handleGestionar(g: GrupoZonas) { setGestionando(g); setDiagramasDialog(true) }
  function handleDelete(g: GrupoZonas) { setEliminando(g); setDeleteDialog(true) }
  function closeGrupoDialog() { setGrupoDialog(false); setEditando(null) }
  function closeDiagramasDialog() { setDiagramasDialog(false); setGestionando(null) }
  function closeDeleteDialog() { setDeleteDialog(false); setEliminando(null) }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Grupos de zonas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isLoading
              ? 'Cargando…'
              : `${activos} activo${activos !== 1 ? 's' : ''}${inactivos > 0 ? ` · ${inactivos} inactivo${inactivos !== 1 ? 's' : ''}` : ''}`}
          </p>
        </div>
        <Button onClick={() => { setEditando(null); setGrupoDialog(true) }}>
          <Plus className="h-4 w-4 mr-1.5" />
          Nuevo grupo
        </Button>
      </div>

      {/* Tabla */}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead className="text-center w-28">Diagramas</TableHead>
              <TableHead className="w-28">Estado</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i} className="animate-pulse">
                  <TableCell><div className="h-4 w-40 rounded bg-gray-100" /></TableCell>
                  <TableCell><div className="h-4 w-8 rounded bg-gray-100 mx-auto" /></TableCell>
                  <TableCell><div className="h-5 w-16 rounded-full bg-gray-100" /></TableCell>
                  <TableCell><div className="h-8 w-8 rounded bg-gray-100" /></TableCell>
                </TableRow>
              ))
            ) : grupos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-16 text-center">
                  <Images className="h-10 w-10 text-muted-foreground/20 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No hay grupos de zonas creados</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Crea grupos para agrupar diagramas corporales y asignarlos a procedimientos.
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              grupos.map(g => (
                <TableRow key={g.id} className={cn(!g.activo && 'opacity-50')}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {/* Preview de miniaturas */}
                      <div className="flex -space-x-1.5">
                        {g.diagramas.slice(0, 3).map((d: GrupoZonasDiagrama) => (
                          d.imagen_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={d.id}
                              src={d.imagen_url}
                              alt={d.diagrama_nombre}
                              className="h-8 w-8 rounded-md border-2 border-white object-contain bg-muted"
                            />
                          ) : (
                            <div key={d.id} className="h-8 w-8 rounded-md border-2 border-white bg-muted flex items-center justify-center">
                              <LayoutTemplate className="h-3 w-3 text-muted-foreground/40" />
                            </div>
                          )
                        ))}
                        {g.diagramas.length > 3 && (
                          <div className="h-8 w-8 rounded-md border-2 border-white bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
                            +{g.diagramas.length - 3}
                          </div>
                        )}
                        {g.diagramas.length === 0 && (
                          <div className="h-8 w-8 rounded-md border border-dashed bg-muted/50 flex items-center justify-center">
                            <Images className="h-3 w-3 text-muted-foreground/30" />
                          </div>
                        )}
                      </div>
                      <span className="font-medium text-sm">{g.nombre}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">
                    {g.diagramas.length}
                  </TableCell>
                  <TableCell>
                    <Badge variant={g.activo ? 'success' : 'muted'}>
                      {g.activo ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleGestionar(g)}>
                          <Images className="h-3.5 w-3.5 mr-2" />Gestionar diagramas
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleEdit(g)}>
                          <Pencil className="h-3.5 w-3.5 mr-2" />Editar nombre
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => toggleMut.mutate(g)}
                          className={g.activo ? 'text-amber-600 focus:text-amber-600' : 'text-green-600 focus:text-green-600'}
                        >
                          {g.activo ? 'Desactivar' : 'Activar'}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleDelete(g)}
                          className="text-red-600 focus:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-2" />Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <GrupoDialog      grupo={editando}    open={grupoDialog}     onClose={closeGrupoDialog} />
      <DiagramasGrupoDialog grupo={gestionando} open={diagramasDialog} onClose={closeDiagramasDialog} />
      <DeleteDialog     grupo={eliminando}  open={deleteDialog}    onClose={closeDeleteDialog} />
    </div>
  )
}
