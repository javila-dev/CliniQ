'use client'

import { useEffect, useState } from 'react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { GripVertical, Plus, Pencil, Trash2, Layers } from 'lucide-react'

import { ayudaAdminApi } from '@/lib/api/ayuda'
import type { CategoriaAyuda } from '@/types/ayuda'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { DynamicIcon } from '@/components/ayuda/DynamicIcon'

interface Props {
  categorias: CategoriaAyuda[]
  seleccionada: string | null
  onSeleccionar: (slug: string | null) => void
}

export function CategoriaRail({ categorias, seleccionada, onSeleccionar }: Props) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [orden, setOrden] = useState(categorias)
  const [editando, setEditando] = useState<CategoriaAyuda | null>(null)
  const [creando, setCreando] = useState(false)
  const [aBorrar, setABorrar] = useState<CategoriaAyuda | null>(null)

  useEffect(() => setOrden(categorias), [categorias])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const reordenar = useMutation({
    mutationFn: (ids: string[]) => ayudaAdminApi.reordenarCategorias(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ayuda', 'gestion', 'categorias'] }),
    onError: () => {
      toast({ title: 'No se pudo guardar el orden', variant: 'destructive' })
      setOrden(categorias)
    },
  })

  const borrar = useMutation({
    mutationFn: (slug: string) => ayudaAdminApi.eliminarCategoria(slug),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ayuda', 'gestion', 'categorias'] })
      toast({ title: 'Categoría eliminada' })
      setABorrar(null)
      if (aBorrar && seleccionada === aBorrar.slug) onSeleccionar(null)
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast({ title: msg ?? 'No se pudo eliminar', variant: 'destructive' })
    },
  })

  function onDragEnd(ev: DragEndEvent) {
    const { active, over } = ev
    if (!over || active.id === over.id) return
    const from = orden.findIndex((c) => c.id === active.id)
    const to = orden.findIndex((c) => c.id === over.id)
    const next = arrayMove(orden, from, to)
    setOrden(next)
    reordenar.mutate(next.map((c) => c.id))
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={() => onSeleccionar(null)}
        className={cn(
          'flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
          seleccionada === null ? 'bg-rose-50 text-rose-700' : 'text-muted-foreground hover:bg-muted',
        )}
      >
        <Layers className="h-4 w-4" />
        Todos los artículos
      </button>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={orden.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {orden.map((c) => (
            <FilaCategoria
              key={c.id}
              categoria={c}
              activa={seleccionada === c.slug}
              onSeleccionar={() => onSeleccionar(c.slug)}
              onEditar={() => setEditando(c)}
              onBorrar={() => setABorrar(c)}
            />
          ))}
        </SortableContext>
      </DndContext>

      <Button variant="ghost" size="sm" className="mt-1 justify-start" onClick={() => setCreando(true)}>
        <Plus className="mr-1.5 h-4 w-4" />
        Categoría
      </Button>

      {(creando || editando) && (
        <CategoriaDialog
          categoria={editando}
          onClose={() => { setCreando(false); setEditando(null) }}
        />
      )}

      <ConfirmDialog
        open={!!aBorrar}
        onOpenChange={(v) => !v && setABorrar(null)}
        title="Eliminar categoría"
        description={
          aBorrar?.articulos_total
            ? `"${aBorrar.nombre}" tiene ${aBorrar.articulos_total} artículo(s). Muévelos antes de eliminarla.`
            : `¿Eliminar "${aBorrar?.nombre}"? Esta acción no se puede deshacer.`
        }
        confirmLabel="Eliminar"
        variant="destructive"
        loading={borrar.isPending}
        onConfirm={() => aBorrar && borrar.mutate(aBorrar.slug)}
      />
    </div>
  )
}

function FilaCategoria({
  categoria, activa, onSeleccionar, onEditar, onBorrar,
}: {
  categoria: CategoriaAyuda
  activa: boolean
  onSeleccionar: () => void
  onEditar: () => void
  onBorrar: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: categoria.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group flex items-center gap-1 rounded-lg pr-1 transition-colors',
        activa ? 'bg-rose-50' : 'hover:bg-muted',
        isDragging && 'opacity-60',
      )}
    >
      <button
        className="cursor-grab px-1 text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <button
        onClick={onSeleccionar}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2 py-2 text-left text-sm',
          activa ? 'font-medium text-rose-700' : 'text-foreground',
        )}
      >
        <DynamicIcon name={categoria.icono} className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{categoria.nombre}</span>
        <span className="ml-auto shrink-0 text-xs text-muted-foreground/60">{categoria.articulos_total}</span>
      </button>
      <div className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
        <button onClick={onEditar} className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button onClick={onBorrar} className="rounded p-1 text-muted-foreground hover:bg-background hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

function CategoriaDialog({ categoria, onClose }: { categoria: CategoriaAyuda | null; onClose: () => void }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const editar = !!categoria
  const [nombre, setNombre] = useState(categoria?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(categoria?.descripcion ?? '')
  const [icono, setIcono] = useState(categoria?.icono ?? '')

  const guardar = useMutation({
    mutationFn: () =>
      editar
        ? ayudaAdminApi.actualizarCategoria(categoria!.slug, { nombre, descripcion, icono })
        : ayudaAdminApi.crearCategoria({ nombre, descripcion, icono }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ayuda', 'gestion', 'categorias'] })
      qc.invalidateQueries({ queryKey: ['ayuda', 'categorias'] })
      toast({ title: editar ? 'Categoría actualizada' : 'Categoría creada' })
      onClose()
    },
    onError: () => toast({ title: 'No se pudo guardar', variant: 'destructive' }),
  })

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editar ? 'Editar categoría' : 'Nueva categoría'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Nombre *</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Agenda" />
          </div>
          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2}
              placeholder="Citas, disponibilidad y estados." />
          </div>
          <div className="space-y-1.5">
            <Label>Icono (nombre lucide)</Label>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-muted">
                <DynamicIcon name={icono} className="h-4 w-4 text-muted-foreground" />
              </div>
              <Input value={icono} onChange={(e) => setIcono(e.target.value)} placeholder="calendar-days" />
            </div>
            <p className="text-xs text-muted-foreground">
              Nombres en <a href="https://lucide.dev/icons/" target="_blank" rel="noreferrer" className="underline">lucide.dev/icons</a> (kebab-case).
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={guardar.isPending}>Cancelar</Button>
          <Button onClick={() => guardar.mutate()} disabled={!nombre.trim() || guardar.isPending}>
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
