'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Trash2, Plus, Loader2, ShieldCheck, ChevronDown } from 'lucide-react'
import { clinicasApi } from '@/lib/api/clinicas'
import { configuracionApi } from '@/lib/api/configuracion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ServicioConsentimientoRequerido } from '@/types/clinicas'

// ─── Fila sortable ─────────────────────────────────────────────────────────────

function ConsentimientoRow({
  item,
  servicioId,
  onDelete,
}: {
  item: ServicioConsentimientoRequerido
  servicioId: string
  onDelete: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={cn('group border-b last:border-0 transition-colors', isDragging ? 'bg-blue-50 shadow-md z-10' : 'hover:bg-gray-50/50')}
    >
      <td className="pl-3 pr-1 py-2.5 w-8 text-muted-foreground">
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-0.5 rounded hover:text-foreground">
          <GripVertical className="h-4 w-4" />
        </button>
      </td>
      <td className="px-2 py-2.5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium">{item.template_nombre}</span>
        </div>
        <p className="text-[10px] text-muted-foreground font-mono pl-5 mt-0.5">
          {item.template_token.slice(0, 8)}…
        </p>
      </td>
      <td className="px-3 py-2.5 w-24">
        <Badge variant={item.activo ? 'default' : 'secondary'} className="text-[10px]">
          {item.activo ? 'Activo' : 'Inactivo'}
        </Badge>
      </td>
      <td className="pr-3 py-2.5 w-10">
        <button
          onClick={() => onDelete(item.id)}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:text-destructive text-muted-foreground"
          title="Desvincular template"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  )
}

// ─── Combobox para agregar ─────────────────────────────────────────────────────

function AgregarConsentimiento({
  servicioId,
  tokensBloqueados,
}: {
  servicioId: string
  tokensBloqueados: string[]
}) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)

  const { data: disponibles = [] } = useQuery({
    queryKey: ['documenso-templates-disponibles'],
    queryFn: () => configuracionApi.documensoTemplates.disponibles(),
    enabled: open,
  })

  const opciones = disponibles.filter((t) => !tokensBloqueados.includes(t.token))

  const addMut = useMutation({
    mutationFn: (templateId: string) => clinicasApi.procedimientos.consentimientos.add(servicioId, templateId),
    onSuccess: () => {
      setOpen(false)
      qc.invalidateQueries({ queryKey: ['consentimientos-servicio', servicioId] })
    },
  })

  return (
    <div className="relative">
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs gap-1"
        onClick={() => setOpen((v) => !v)}
        disabled={addMut.isPending}
      >
        <Plus className="h-3.5 w-3.5" />
        Agregar
        <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-white border rounded-lg shadow-lg min-w-64 max-h-60 overflow-y-auto">
            {opciones.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted-foreground text-center">
                Todos los templates ya están vinculados
              </p>
            ) : (
              opciones.map((t) => (
                <button
                  key={t.token}
                  onClick={() => addMut.mutate(String(t.id))}
                  disabled={addMut.isPending}
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 transition-colors"
                >
                  <p className="font-medium">{t.nombre}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">{t.token.slice(0, 8)}…</p>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface ConsentimientosServicioProps {
  servicioId: string
}

export function ConsentimientosServicio({ servicioId }: ConsentimientosServicioProps) {
  const qc = useQueryClient()
  const [localItems, setLocalItems] = useState<ServicioConsentimientoRequerido[]>([])

  const { data: items, isLoading } = useQuery({
    queryKey: ['consentimientos-servicio', servicioId],
    queryFn: () => clinicasApi.procedimientos.consentimientos.list(servicioId),
  })

  useEffect(() => { setLocalItems(items ?? []) }, [items])

  const reordenarMut = useMutation({
    mutationFn: (orden: { id: string; orden: number }[]) =>
      clinicasApi.procedimientos.consentimientos.reordenar(servicioId, orden),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consentimientos-servicio', servicioId] }),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => clinicasApi.procedimientos.consentimientos.remove(servicioId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consentimientos-servicio', servicioId] }),
  })

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = localItems.findIndex((p) => p.id === active.id)
    const newIndex = localItems.findIndex((p) => p.id === over.id)
    const reordenado = arrayMove(localItems, oldIndex, newIndex)
    setLocalItems(reordenado)
    reordenarMut.mutate(reordenado.map((p, i) => ({ id: p.id, orden: i + 1 })))
  }

  const tokensBloqueados = (localItems.length ? localItems : (items ?? [])).map((i) => i.template_token)

  return (
    <div className="rounded-xl border bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50/50">
        <div>
          <p className="text-sm font-semibold">Consentimientos requeridos</p>
          <p className="text-xs text-muted-foreground mt-0.5">Plantillas Documenso que el paciente debe firmar</p>
        </div>
        <AgregarConsentimiento servicioId={servicioId} tokensBloqueados={tokensBloqueados} />
      </div>

      {isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && (
        <table className="w-full text-sm">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={(localItems.length ? localItems : (items ?? [])).map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <tbody>
                {(localItems.length ? localItems : (items ?? [])).map((item) => (
                  <ConsentimientoRow
                    key={item.id}
                    item={item}
                    servicioId={servicioId}
                    onDelete={(id) => deleteMut.mutate(id)}
                  />
                ))}
                {(items ?? []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      Sin consentimientos vinculados. Agrega el primero.
                    </td>
                  </tr>
                )}
              </tbody>
            </SortableContext>
          </DndContext>
        </table>
      )}
    </div>
  )
}
