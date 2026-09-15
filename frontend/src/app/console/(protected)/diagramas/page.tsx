'use client'

import { useRef, useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  ImageIcon, MoreHorizontal, Pencil, Plus, Trash2, UploadCloud, X,
  Images, LayoutTemplate, ArrowRight,
} from 'lucide-react'
import { adminApi } from '@/lib/api/admin'
import { clinicasApi } from '@/lib/api/clinicas'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import type { DiagramaCorporal, GrupoZonas, GrupoZonasDiagrama } from '@/types/admin'

// ─── Constantes de imagen ─────────────────────────────────────────────────────

const MIN_DIMENSION = 400 // px mínimo en cada lado

function validateImagenCuadrada(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const { naturalWidth: w, naturalHeight: h } = img
      if (w !== h) {
        resolve(`La imagen debe ser cuadrada (subiste ${w}×${h} px).`)
      } else if (w < MIN_DIMENSION) {
        resolve(`La imagen debe tener al menos ${MIN_DIMENSION}×${MIN_DIMENSION} px (subiste ${w}×${h} px).`)
      } else {
        resolve(null)
      }
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve('No se pudo leer la imagen.') }
    img.src = url
  })
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const diagramaSchema = z.object({
  nombre: z.string().min(2, 'Mínimo 2 caracteres'),
  orden:  z.string().min(1, 'Requerido'),
})

type DiagramaFormValues = z.infer<typeof diagramaSchema>

// ─── Selector de imagen ───────────────────────────────────────────────────────

function ImagePicker({
  preview,
  onFile,
  onClear,
  required,
}: {
  preview: string | null
  onFile: (f: File) => void
  onClear: () => void
  required?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) onFile(f)
  }

  return (
    <div className="space-y-1.5">
      <Label>Imagen PNG {required && '*'}</Label>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleChange}
      />

      {preview ? (
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Preview"
            className="h-36 w-36 object-contain rounded-lg border bg-muted"
          />
          <button
            type="button"
            onClick={onClear}
            className="absolute -top-2 -right-2 rounded-full bg-white border shadow p-0.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className="flex flex-col items-center justify-center gap-2 h-36 w-full rounded-lg border-2 border-dashed border-muted-foreground/25 hover:border-muted-foreground/50 transition-colors text-muted-foreground hover:text-foreground"
        >
          <UploadCloud className="h-7 w-7" />
          <span className="text-xs">Haz clic para seleccionar</span>
          <span className="text-xs opacity-60">PNG · JPG · WEBP</span>
        </button>
      )}

      {preview && (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          Cambiar imagen
        </button>
      )}
      <p className="text-xs text-muted-foreground">
        Cuadrada · mínimo {MIN_DIMENSION}×{MIN_DIMENSION} px · PNG, JPG o WEBP
      </p>
    </div>
  )
}

// ─── Dialog crear / editar diagrama ───────────────────────────────────────────

function DiagramaDialog({
  diagrama,
  open,
  onClose,
}: {
  diagrama: DiagramaCorporal | null
  open: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()
  const isEdit = !!diagrama

  const [file, setFile]           = useState<File | null>(null)
  const [preview, setPreview]     = useState<string | null>(diagrama?.imagen_url ?? null)
  const [imagenError, setImagenError] = useState<string | null>(null)
  const [validating, setValidating]   = useState(false)

  const { register, handleSubmit, reset, formState: { errors } } = useForm<DiagramaFormValues>({
    resolver: zodResolver(diagramaSchema),
    values: diagrama
      ? { nombre: diagrama.nombre, orden: String(diagrama.orden) }
      : undefined,
  })

  const handleFile = useCallback(async (f: File) => {
    setImagenError(null)
    setValidating(true)
    const error = await validateImagenCuadrada(f)
    setValidating(false)
    if (error) {
      setImagenError(error)
      return
    }
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }, [])

  const handleClear = () => {
    setFile(null)
    setPreview(null)
    setImagenError(null)
  }

  const mutation = useMutation({
    mutationFn: (data: DiagramaFormValues) => {
      const orden = parseInt(data.orden, 10)
      if (isEdit) {
        return adminApi.diagramas.update(diagrama!.id, {
          nombre: data.nombre,
          orden,
          ...(file ? { imagen: file } : {}),
        })
      }
      if (!file) throw new Error('Imagen requerida')
      return adminApi.diagramas.create({ nombre: data.nombre, orden, imagen: file })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-diagramas'] })
      handleClose()
    },
  })

  const handleClose = () => {
    reset()
    setFile(null)
    setPreview(null)
    onClose()
  }

  const missingImage = !isEdit && !file

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar diagrama' : 'Nuevo diagrama'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Nombre *</Label>
            <Input
              placeholder="Ej: Cara Frontal, Cuerpo Posterior"
              {...register('nombre')}
              className={cn(errors.nombre && 'border-red-400')}
            />
            {errors.nombre && <p className="text-xs text-red-500">{errors.nombre.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Orden *</Label>
            <Input
              type="number"
              min={0}
              placeholder="0"
              {...register('orden')}
              className={cn('w-24', errors.orden && 'border-red-400')}
            />
            {errors.orden && <p className="text-xs text-red-500">{errors.orden.message}</p>}
          </div>

          <ImagePicker
            preview={preview}
            onFile={handleFile}
            onClear={handleClear}
            required={!isEdit}
          />

          {validating && (
            <p className="text-xs text-muted-foreground">Validando imagen…</p>
          )}
          {imagenError && (
            <p className="text-xs text-red-500">{imagenError}</p>
          )}
          {missingImage && mutation.isError && (
            <p className="text-xs text-red-500">La imagen es obligatoria para crear un diagrama.</p>
          )}
          {mutation.isError && !missingImage && !imagenError && (
            <p className="text-sm text-red-500">Error al guardar. Intenta de nuevo.</p>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={handleClose}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending || validating || !!imagenError}>
              {mutation.isPending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear diagrama'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Dialog confirmar eliminación de diagrama ─────────────────────────────────

function DeleteDiagramaDialog({
  diagrama,
  open,
  onClose,
}: {
  diagrama: DiagramaCorporal | null
  open: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => adminApi.diagramas.delete(diagrama!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-diagramas'] })
      onClose()
    },
  })

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>¿Eliminar diagrama?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground py-2">
          Se eliminará <span className="font-semibold">{diagrama?.nombre}</span>. Los servicios que
          lo tengan asignado perderán la referencia.
        </p>
        {mutation.isError && (
          <p className="text-sm text-red-500">No se pudo eliminar. Puede tener anotaciones activas.</p>
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

// ─── Tab: Diagramas ────────────────────────────────────────────────────────────

function DiagramasTab({
  diagramas,
  isLoading,
  onNuevo,
}: {
  diagramas: DiagramaCorporal[]
  isLoading: boolean
  onNuevo: () => void
}) {
  const qc = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editando,   setEditando]   = useState<DiagramaCorporal | null>(null)
  const [eliminando, setEliminando] = useState<DiagramaCorporal | null>(null)

  const toggleMutation = useMutation({
    mutationFn: (d: DiagramaCorporal) => adminApi.diagramas.update(d.id, { activo: !d.activo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-diagramas'] }),
  })

  const handleEdit   = (d: DiagramaCorporal) => { setEditando(d); setDialogOpen(true) }
  const handleDelete = (d: DiagramaCorporal) => { setEliminando(d); setDeleteOpen(true) }
  const handleCloseDialog = () => { setDialogOpen(false); setEditando(null) }
  const handleCloseDelete = () => { setDeleteOpen(false); setEliminando(null) }

  return (
    <div>
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Vista previa</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead className="text-center w-24">Orden</TableHead>
              <TableHead className="w-28">Estado</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i} className="animate-pulse">
                  <TableCell>
                    <div className="h-12 w-12 rounded-lg bg-gray-100" />
                  </TableCell>
                  <TableCell><div className="h-4 w-36 rounded bg-gray-100" /></TableCell>
                  <TableCell><div className="h-4 w-8 rounded bg-gray-100 mx-auto" /></TableCell>
                  <TableCell><div className="h-5 w-16 rounded-full bg-gray-100" /></TableCell>
                  <TableCell><div className="h-8 w-8 rounded bg-gray-100" /></TableCell>
                </TableRow>
              ))
            ) : diagramas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-16 text-center">
                  <ImageIcon className="h-10 w-10 text-muted-foreground/20 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No hay diagramas creados</p>
                  <p className="text-xs text-muted-foreground mt-1 mb-3">
                    Crea el primero para que las clínicas puedan marcar zonas tratadas en sus atenciones.
                  </p>
                  <Button size="sm" onClick={onNuevo}>
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Nuevo diagrama
                  </Button>
                </TableCell>
              </TableRow>
            ) : (
              diagramas.map(d => (
                <TableRow key={d.id} className={cn(!d.activo && 'opacity-50')}>
                  <TableCell>
                    {d.imagen_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={d.imagen_url}
                        alt={d.nombre}
                        className="h-12 w-12 object-contain rounded-lg border bg-muted"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-lg border bg-muted flex items-center justify-center">
                        <ImageIcon className="h-5 w-5 text-muted-foreground/40" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="font-medium text-sm">{d.nombre}</span>
                  </TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">
                    {d.orden}
                  </TableCell>
                  <TableCell>
                    <Badge variant={d.activo ? 'success' : 'muted'}>
                      {d.activo ? 'Activo' : 'Inactivo'}
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
                        <DropdownMenuItem onClick={() => handleEdit(d)}>
                          <Pencil className="h-3.5 w-3.5 mr-2" />Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => toggleMutation.mutate(d)}
                          className={
                            d.activo
                              ? 'text-amber-600 focus:text-amber-600'
                              : 'text-green-600 focus:text-green-600'
                          }
                        >
                          {d.activo ? 'Desactivar' : 'Activar'}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleDelete(d)}
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

      <DiagramaDialog diagrama={editando} open={dialogOpen} onClose={handleCloseDialog} />
      <DeleteDiagramaDialog diagrama={eliminando} open={deleteOpen} onClose={handleCloseDelete} />
    </div>
  )
}

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
  onIrADiagramas,
}: {
  grupo: GrupoZonas | null
  open: boolean
  onClose: () => void
  onIrADiagramas: () => void
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
            ) : todosLosDiagramas.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  Todavía no hay diagramas creados en el sistema.
                </p>
                <Button size="sm" variant="outline" onClick={onIrADiagramas}>
                  Ir a Diagramas
                  <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                </Button>
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

// ─── Dialog confirmar eliminación de grupo ────────────────────────────────────

function DeleteGrupoDialog({
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

// ─── Tab: Grupos de zonas ──────────────────────────────────────────────────────

function GruposTab({
  grupos,
  isLoading,
  onNuevo,
  onIrADiagramas,
}: {
  grupos: GrupoZonas[]
  isLoading: boolean
  onNuevo: () => void
  onIrADiagramas: () => void
}) {
  const qc = useQueryClient()
  const [grupoDialog, setGrupoDialog]         = useState(false)
  const [diagramasDialog, setDiagramasDialog] = useState(false)
  const [deleteDialog, setDeleteDialog]       = useState(false)
  const [editando,    setEditando]    = useState<GrupoZonas | null>(null)
  const [gestionando, setGestionando] = useState<GrupoZonas | null>(null)
  const [eliminando,  setEliminando]  = useState<GrupoZonas | null>(null)

  const toggleMut = useMutation({
    mutationFn: (g: GrupoZonas) => clinicasApi.gruposZonas.update(g.id, { activo: !g.activo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-grupos-zonas'] }),
  })

  function handleEdit(g: GrupoZonas) { setEditando(g); setGrupoDialog(true) }
  function handleGestionar(g: GrupoZonas) { setGestionando(g); setDiagramasDialog(true) }
  function handleDelete(g: GrupoZonas) { setEliminando(g); setDeleteDialog(true) }
  function closeGrupoDialog() { setGrupoDialog(false); setEditando(null) }
  function closeDiagramasDialog() { setDiagramasDialog(false); setGestionando(null) }
  function closeDeleteDialog() { setDeleteDialog(false); setEliminando(null) }

  return (
    <div>
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
                  <p className="text-xs text-muted-foreground mt-1 mb-3">
                    Crea grupos para agrupar diagramas corporales y asignarlos a procedimientos.
                  </p>
                  <Button size="sm" onClick={onNuevo}>
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Nuevo grupo
                  </Button>
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
      <DiagramasGrupoDialog
        grupo={gestionando}
        open={diagramasDialog}
        onClose={closeDiagramasDialog}
        onIrADiagramas={() => { closeDiagramasDialog(); onIrADiagramas() }}
      />
      <DeleteGrupoDialog grupo={eliminando}  open={deleteDialog}    onClose={closeDeleteDialog} />
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

type TabKey = 'diagramas' | 'grupos'

export default function DiagramasYZonasPage() {
  const [tab, setTab] = useState<TabKey>('diagramas')
  const [nuevoDiagramaOpen, setNuevoDiagramaOpen] = useState(false)
  const [nuevoGrupoOpen, setNuevoGrupoOpen]       = useState(false)

  const { data: diagramas = [], isLoading: loadingDiagramas } = useQuery({
    queryKey: ['admin-diagramas'],
    queryFn:  () => adminApi.diagramas.list(),
  })
  const { data: grupos = [], isLoading: loadingGrupos } = useQuery({
    queryKey: ['admin-grupos-zonas'],
    queryFn:  () => clinicasApi.gruposZonas.list(),
  })

  const diagramasActivos   = diagramas.filter(d => d.activo).length
  const diagramasInactivos = diagramas.filter(d => !d.activo).length
  const gruposActivos      = grupos.filter(g => g.activo).length
  const gruposInactivos    = grupos.filter(g => !g.activo).length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Diagramas y zonas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Diagramas corporales y los grupos que los agrupan para marcar zonas tratadas.
          </p>
        </div>
        {tab === 'diagramas' ? (
          <Button onClick={() => setNuevoDiagramaOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nuevo diagrama
          </Button>
        ) : (
          <Button onClick={() => setNuevoGrupoOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nuevo grupo
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={v => setTab(v as TabKey)}>
        <TabsList>
          <TabsTrigger value="diagramas">
            Diagramas
            <span className="ml-1.5 text-xs text-muted-foreground">
              {loadingDiagramas ? '…' : diagramasActivos}
              {diagramasInactivos > 0 && !loadingDiagramas ? ` +${diagramasInactivos}` : ''}
            </span>
          </TabsTrigger>
          <TabsTrigger value="grupos">
            Grupos de zonas
            <span className="ml-1.5 text-xs text-muted-foreground">
              {loadingGrupos ? '…' : gruposActivos}
              {gruposInactivos > 0 && !loadingGrupos ? ` +${gruposInactivos}` : ''}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="diagramas" className="pt-4">
          <DiagramasTab
            diagramas={diagramas}
            isLoading={loadingDiagramas}
            onNuevo={() => setNuevoDiagramaOpen(true)}
          />
        </TabsContent>

        <TabsContent value="grupos" className="pt-4">
          <GruposTab
            grupos={grupos}
            isLoading={loadingGrupos}
            onNuevo={() => setNuevoGrupoOpen(true)}
            onIrADiagramas={() => setTab('diagramas')}
          />
        </TabsContent>
      </Tabs>

      <DiagramaDialog diagrama={null} open={nuevoDiagramaOpen} onClose={() => setNuevoDiagramaOpen(false)} />
      <GrupoDialog    grupo={null}    open={nuevoGrupoOpen}    onClose={() => setNuevoGrupoOpen(false)} />
    </div>
  )
}
