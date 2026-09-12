'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  GripVertical, MoreHorizontal, Pencil, Copy, Eye, Send, Undo2, Trash2, PlayCircle, FileText,
} from 'lucide-react'

import { ayudaAdminApi } from '@/lib/api/ayuda'
import type { ArticuloAyudaLista } from '@/types/ayuda'
import { cn, formatDate } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

interface Props {
  articulos: ArticuloAyudaLista[]
  categoriaSlug: string | null
}

const EST_BADGE: Record<string, string> = {
  publicado: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  borrador: 'border-amber-300 bg-amber-50 text-amber-700',
  archivado: 'border-zinc-300 bg-zinc-100 text-zinc-600',
}

export function ArticulosTable({ articulos, categoriaSlug }: Props) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const router = useRouter()
  const [orden, setOrden] = useState(articulos)
  const [aBorrar, setABorrar] = useState<ArticuloAyudaLista | null>(null)

  useEffect(() => setOrden(articulos), [articulos])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const puedeReordenar = !!categoriaSlug

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['ayuda', 'gestion', 'articulos'] })
    qc.invalidateQueries({ queryKey: ['ayuda', 'gestion', 'categorias'] })
  }

  const reordenar = useMutation({
    mutationFn: (ids: string[]) => ayudaAdminApi.reordenarArticulos(articulos[0]?.categoria ?? '', ids),
    onSuccess: invalidar,
    onError: () => { toast({ title: 'No se pudo guardar el orden', variant: 'destructive' }); setOrden(articulos) },
  })

  const togglePublicar = useMutation({
    mutationFn: (a: ArticuloAyudaLista) =>
      ayudaAdminApi.actualizarArticulo(a.slug, { estado: a.estado === 'publicado' ? 'borrador' : 'publicado' }),
    onSuccess: (_d, a) => { invalidar(); toast({ title: a.estado === 'publicado' ? 'Pasado a borrador' : 'Publicado' }) },
    onError: () => toast({ title: 'No se pudo cambiar el estado', variant: 'destructive' }),
  })

  const duplicar = useMutation({
    mutationFn: (a: ArticuloAyudaLista) => ayudaAdminApi.duplicarArticulo(a.slug),
    onSuccess: (nuevo) => { invalidar(); router.push(`/ayuda/gestion/articulo/${nuevo.slug}`) },
    onError: () => toast({ title: 'No se pudo duplicar', variant: 'destructive' }),
  })

  const borrar = useMutation({
    mutationFn: (a: ArticuloAyudaLista) => ayudaAdminApi.eliminarArticulo(a.slug),
    onSuccess: () => { invalidar(); toast({ title: 'Artículo eliminado' }); setABorrar(null) },
    onError: () => toast({ title: 'No se pudo eliminar', variant: 'destructive' }),
  })

  function onDragEnd(ev: DragEndEvent) {
    const { active, over } = ev
    if (!over || active.id === over.id) return
    const from = orden.findIndex((a) => a.id === active.id)
    const to = orden.findIndex((a) => a.id === over.id)
    const next = arrayMove(orden, from, to)
    setOrden(next)
    reordenar.mutate(next.map((a) => a.id))
  }

  if (orden.length === 0) {
    return (
      <div className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
        No hay artículos {categoriaSlug ? 'en esta categoría' : 'todavía'}.
      </div>
    )
  }

  const rows = (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
          {puedeReordenar && <th className="w-8" />}
          <th className="px-3 py-2 font-medium">Título</th>
          <th className="px-3 py-2 font-medium">Estado</th>
          <th className="hidden px-3 py-2 font-medium sm:table-cell">Área</th>
          <th className="hidden px-3 py-2 font-medium md:table-cell">Actualizado</th>
          <th className="w-10" />
        </tr>
      </thead>
      <tbody>
        {orden.map((a) => (
          <FilaArticulo
            key={a.id}
            articulo={a}
            sortable={puedeReordenar}
            onEditar={() => router.push(`/ayuda/gestion/articulo/${a.slug}`)}
            onPreview={() => window.open(`/ayuda/articulo/${a.slug}?preview=1`, '_blank')}
            onDuplicar={() => duplicar.mutate(a)}
            onTogglePublicar={() => togglePublicar.mutate(a)}
            onBorrar={() => setABorrar(a)}
          />
        ))}
      </tbody>
    </table>
  )

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      {puedeReordenar ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={orden.map((a) => a.id)} strategy={verticalListSortingStrategy}>
            {rows}
          </SortableContext>
        </DndContext>
      ) : (
        rows
      )}

      <ConfirmDialog
        open={!!aBorrar}
        onOpenChange={(v) => !v && setABorrar(null)}
        title="Eliminar artículo"
        description={`¿Eliminar "${aBorrar?.titulo}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        variant="destructive"
        loading={borrar.isPending}
        onConfirm={() => aBorrar && borrar.mutate(aBorrar)}
      />
    </div>
  )
}

function FilaArticulo({
  articulo, sortable, onEditar, onPreview, onDuplicar, onTogglePublicar, onBorrar,
}: {
  articulo: ArticuloAyudaLista
  sortable: boolean
  onEditar: () => void
  onPreview: () => void
  onDuplicar: () => void
  onTogglePublicar: () => void
  onBorrar: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: articulo.id, disabled: !sortable,
  })

  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('border-b last:border-0 hover:bg-muted/40', isDragging && 'opacity-60')}
    >
      {sortable && (
        <td className="pl-2">
          <button
            className="cursor-grab text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        </td>
      )}
      <td className="px-3 py-2.5">
        <button onClick={onEditar} className="flex items-center gap-2 text-left font-medium text-foreground hover:text-rose-600">
          {articulo.tiene_video ? (
            <PlayCircle className="h-3.5 w-3.5 shrink-0 text-rose-500" />
          ) : (
            <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="line-clamp-1">{articulo.titulo}</span>
          {articulo.destacado && <Badge variant="outline" className="border-rose-200 text-rose-600">Destacado</Badge>}
        </button>
      </td>
      <td className="px-3 py-2.5">
        <Badge variant="outline" className={EST_BADGE[articulo.estado]}>{articulo.estado}</Badge>
      </td>
      <td className="hidden px-3 py-2.5 text-muted-foreground sm:table-cell">{articulo.area_display || '—'}</td>
      <td className="hidden px-3 py-2.5 text-muted-foreground md:table-cell">{formatDate(articulo.updated_at)}</td>
      <td className="px-1 py-2.5">
        <DropdownMenu>
          <DropdownMenuTrigger className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEditar}><Pencil className="mr-2 h-4 w-4" />Editar</DropdownMenuItem>
            <DropdownMenuItem onClick={onPreview}><Eye className="mr-2 h-4 w-4" />Previsualizar</DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicar}><Copy className="mr-2 h-4 w-4" />Duplicar</DropdownMenuItem>
            <DropdownMenuItem onClick={onTogglePublicar}>
              {articulo.estado === 'publicado'
                ? <><Undo2 className="mr-2 h-4 w-4" />Pasar a borrador</>
                : <><Send className="mr-2 h-4 w-4" />Publicar</>}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onBorrar} className="text-destructive focus:text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  )
}
