'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Trash2, Plus, Loader2, AlertTriangle } from 'lucide-react'
import { clinicasApi } from '@/lib/api/clinicas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { PasoProtocolo } from '@/types/clinicas'

// ─── Fila sortable ────────────────────────────────────────────

interface PasoRowProps {
  paso: PasoProtocolo
  servicioId: string
  onDelete: (paso: PasoProtocolo) => void
}

function PasoRow({ paso, servicioId, onDelete }: PasoRowProps) {
  const qc = useQueryClient()
  const [nombre, setNombre] = useState(paso.nombre)
  const [semana, setSemana] = useState<string>(paso.semana != null ? String(paso.semana) : '')
  const [esControl, setEsControl] = useState(paso.es_control)
  const [cantidad, setCantidad] = useState<string>(String(paso.cantidad ?? 1))

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: paso.id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  const patchMut = useMutation({
    mutationFn: (data: Parameters<typeof clinicasApi.procedimientos.pasos.update>[2]) =>
      clinicasApi.procedimientos.pasos.update(servicioId, paso.id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pasos-protocolo', servicioId] }),
  })

  const handleNombreBlur = () => {
    if (nombre.trim() && nombre.trim() !== paso.nombre) patchMut.mutate({ nombre: nombre.trim() })
    else setNombre(paso.nombre)
  }

  const handleSemanaBlur = () => {
    const val = semana === '' ? null : parseInt(semana, 10)
    if (val !== paso.semana) patchMut.mutate({ semana: val })
  }

  const handleControlChange = (checked: boolean) => {
    setEsControl(checked)
    patchMut.mutate({ es_control: checked })
  }

  const handleCantidadBlur = () => {
    const val = Math.max(1, parseInt(cantidad, 10) || 1)
    setCantidad(String(val))
    if (val !== (paso.cantidad ?? 1)) patchMut.mutate({ cantidad: val })
  }

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={cn(
        'group border-b last:border-0 transition-colors',
        isDragging ? 'bg-blue-50 shadow-md z-10' : 'hover:bg-gray-50/50',
      )}
    >
      {/* Drag handle */}
      <td className="pl-3 pr-1 py-2 w-8 text-muted-foreground">
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-0.5 rounded hover:text-foreground">
          <GripVertical className="h-4 w-4" />
        </button>
      </td>

      {/* Orden */}
      <td className="px-2 py-2 text-xs text-muted-foreground w-8 tabular-nums text-center">{paso.orden}</td>

      {/* Nombre */}
      <td className="px-2 py-2">
        <Input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onBlur={handleNombreBlur}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
          className="h-7 text-sm border-transparent bg-transparent hover:border-input focus:border-input px-2"
          placeholder="Nombre del paso..."
        />
      </td>

      {/* Sesiones (cantidad) */}
      <td className="px-2 py-2 w-20">
        <div className="relative">
          <Input
            type="number"
            min={1}
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            onBlur={handleCantidadBlur}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
            className="h-7 text-xs text-center border-transparent bg-transparent hover:border-input focus:border-input px-2 w-16"
            title="Número de sesiones que genera este paso"
          />
        </div>
      </td>

      {/* Semana */}
      <td className="px-2 py-2 w-20">
        <Input
          type="number"
          min={1}
          value={semana}
          onChange={(e) => setSemana(e.target.value)}
          onBlur={handleSemanaBlur}
          placeholder="—"
          className="h-7 text-xs border-transparent bg-transparent hover:border-input focus:border-input px-2 w-16 text-center"
        />
      </td>

      {/* Control */}
      <td className="px-3 py-2 w-14 text-center">
        <input
          type="checkbox"
          checked={esControl}
          onChange={(e) => handleControlChange(e.target.checked)}
          className="h-3.5 w-3.5 accent-primary"
          title="Marcar como control"
        />
      </td>

      {/* Eliminar */}
      <td className="pr-3 py-2 w-10">
        <button
          onClick={() => onDelete(paso)}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:text-destructive text-muted-foreground"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  )
}

// ─── Fila de nuevo paso ────────────────────────────────────────

function NuevaPasoRow({ servicioId, onCreated }: { servicioId: string; onCreated: () => void }) {
  const qc = useQueryClient()
  const [nombre, setNombre] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const createMut = useMutation({
    mutationFn: (nombre: string) => clinicasApi.procedimientos.pasos.create(servicioId, { nombre }),
    onSuccess: () => {
      setNombre('')
      qc.invalidateQueries({ queryKey: ['pasos-protocolo', servicioId] })
      onCreated()
    },
  })

  const confirmar = () => {
    if (nombre.trim()) createMut.mutate(nombre.trim())
  }

  return (
    <tr className="border-t bg-gray-50/30">
      <td className="pl-3 pr-1 py-2 w-8" />
      <td className="px-2 py-2 w-8" />
      <td className="px-2 py-2" colSpan={4}>
        <Input
          ref={inputRef}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onBlur={confirmar}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); confirmar() }
            if (e.key === 'Escape') { setNombre(''); e.currentTarget.blur() }
          }}
          placeholder="Nombre del nuevo paso... (Enter para guardar)"
          className="h-7 text-sm"
          disabled={createMut.isPending}
        />
      </td>
      <td className="pr-3 py-2 w-10">
        {createMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </td>
    </tr>
  )
}

// ─── Componente principal ────────────────────────────────────

interface ProtocoloPasosProps {
  servicioId: string
}

export function ProtocoloPasos({ servicioId }: ProtocoloPasosProps) {
  const qc = useQueryClient()
  const [addingNew, setAddingNew] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<PasoProtocolo | null>(null)
  const [localPasos, setLocalPasos] = useState<PasoProtocolo[]>([])

  const { data: pasos, isLoading } = useQuery({
    queryKey: ['pasos-protocolo', servicioId],
    queryFn: () => clinicasApi.procedimientos.pasos.list(servicioId),
  })

  useEffect(() => { setLocalPasos(pasos ?? []) }, [pasos])

  const reordenarMut = useMutation({
    mutationFn: (orden: { id: string; orden: number }[]) =>
      clinicasApi.procedimientos.pasos.reordenar(servicioId, orden),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pasos-protocolo', servicioId] }),
  })

  const deleteMut = useMutation({
    mutationFn: (pasoId: string) => clinicasApi.procedimientos.pasos.delete(servicioId, pasoId),
    onSuccess: () => {
      setDeleteTarget(null)
      qc.invalidateQueries({ queryKey: ['pasos-protocolo', servicioId] })
    },
  })

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = localPasos.findIndex((p) => p.id === active.id)
    const newIndex = localPasos.findIndex((p) => p.id === over.id)
    const reordenado = arrayMove(localPasos, oldIndex, newIndex)
    setLocalPasos(reordenado)
    reordenarMut.mutate(reordenado.map((p, i) => ({ id: p.id, orden: i + 1 })))
  }

  const totalSesiones = localPasos.reduce((acc, p) => acc + (p.cantidad ?? 1), 0)

  return (
    <div className="rounded-xl border bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50/50">
        <div>
          <p className="text-sm font-semibold">Pasos del protocolo</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {localPasos.length} paso{localPasos.length !== 1 ? 's' : ''}
            {totalSesiones > localPasos.length && (
              <span className="ml-1.5">· <strong>{totalSesiones} sesiones</strong> totales al iniciar tratamiento</span>
            )}
            {' · '}arrastra para reordenar
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1"
          onClick={() => setAddingNew(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          Agregar paso
        </Button>
      </div>

      {isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50/30">
                <th className="w-8" />
                <th className="px-2 py-2 text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-8">#</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Nombre</th>
                <th className="px-2 py-2 text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-20" title="Número de sesiones que genera este paso">Ses.</th>
                <th className="px-2 py-2 text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-20">Semana</th>
                <th className="px-2 py-2 text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-14">Ctrl</th>
                <th className="w-10" />
              </tr>
            </thead>
            <SortableContext items={localPasos.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              <tbody>
                {localPasos.map((paso) => (
                  <PasoRow key={paso.id} paso={paso} servicioId={servicioId} onDelete={setDeleteTarget} />
                ))}
                {addingNew && (
                  <NuevaPasoRow servicioId={servicioId} onCreated={() => setAddingNew(false)} />
                )}
                {localPasos.length === 0 && !addingNew && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      Sin pasos configurados. Agrega el primero.
                    </td>
                  </tr>
                )}
              </tbody>
            </SortableContext>
          </table>
        </DndContext>
      )}

      {/* Confirm delete */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm">¿Eliminar paso?</p>
                <p className="text-xs text-muted-foreground mt-1">
                  <span className="font-medium text-foreground">"{deleteTarget.nombre}"</span> será eliminado permanentemente.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)} disabled={deleteMut.isPending}>
                Cancelar
              </Button>
              <Button
                variant="destructive" size="sm"
                onClick={() => deleteMut.mutate(deleteTarget.id)}
                disabled={deleteMut.isPending}
              >
                {deleteMut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                Eliminar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
