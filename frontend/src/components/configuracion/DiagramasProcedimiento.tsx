'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, LayoutTemplate, Images } from 'lucide-react'
import { clinicasApi } from '@/lib/api/clinicas'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import type { ServicioGrupoZonas } from '@/types/clinicas'
import type { GrupoZonas } from '@/types/admin'

interface Props {
  servicioId: string
}

function GrupoCard({
  g,
  onRemove,
  removing,
}: {
  g: ServicioGrupoZonas
  onRemove: () => void
  removing: boolean
}) {
  const preview = g.grupo_diagramas[0]
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3 bg-white">
      {preview?.imagen_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview.imagen_url} alt={preview.diagrama_nombre} className="h-14 w-14 object-contain rounded bg-muted shrink-0" />
      ) : (
        <div className="h-14 w-14 rounded bg-muted flex items-center justify-center shrink-0">
          <Images className="h-6 w-6 text-muted-foreground/40" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{g.grupo_nombre}</p>
        <p className="text-xs text-muted-foreground">{g.grupo_diagramas.length} diagrama{g.grupo_diagramas.length !== 1 ? 's' : ''}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
        onClick={onRemove}
        disabled={removing}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  )
}

function PickerDialog({
  open,
  onClose,
  asignados,
  onAdd,
  adding,
}: {
  open: boolean
  onClose: () => void
  asignados: Set<string>
  onAdd: (id: string) => void
  adding: boolean
}) {
  const { data: grupos = [], isLoading } = useQuery({
    queryKey: ['grupos-zonas'],
    queryFn: () => clinicasApi.gruposZonas.list(),
    staleTime: 60_000,
  })

  const disponibles = (grupos as GrupoZonas[]).filter((g) => g.activo && !asignados.has(g.id))

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Agregar grupo de zonas</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2 animate-pulse">
            {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-lg bg-muted" />)}
          </div>
        ) : disponibles.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No hay grupos disponibles para agregar.
          </p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {disponibles.map((g) => {
              const preview = g.diagramas[0]
              return (
                <button
                  key={g.id}
                  className="w-full flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors text-left disabled:opacity-50"
                  disabled={adding}
                  onClick={() => onAdd(g.id)}
                >
                  {preview?.imagen_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={preview.imagen_url} alt={preview.diagrama_nombre} className="h-12 w-12 object-contain rounded bg-muted shrink-0" />
                  ) : (
                    <div className="h-12 w-12 rounded bg-muted flex items-center justify-center shrink-0">
                      <LayoutTemplate className="h-5 w-5 text-muted-foreground/40" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{g.nombre}</span>
                    <p className="text-xs text-muted-foreground">{g.diagramas.length} diagrama{g.diagramas.length !== 1 ? 's' : ''}</p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function DiagramasProcedimiento({ servicioId }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const { toast } = useToast()
  const qc = useQueryClient()

  const { data: grupos = [], isLoading } = useQuery({
    queryKey: ['procedimiento-grupos', servicioId],
    queryFn: () => clinicasApi.procedimientos.grupos.list(servicioId),
    staleTime: 30_000,
  })

  const addMutation = useMutation({
    mutationFn: (grupoId: string) => clinicasApi.procedimientos.grupos.add(servicioId, grupoId),
    onSuccess: () => setPickerOpen(false),
    onError: (err: any) => {
      const detail =
        err?.response?.data?.detail ??
        err?.response?.data?.error ??
        (err?.response?.status === 403
          ? 'No tienes permiso para gestionar procedimientos (servicios.gestionar).'
          : 'Error al agregar el grupo')
      toast({ title: detail, variant: 'destructive' })
    },
    // Reconcilia la lista con el servidor pase lo que pase: si el POST llegó a
    // guardar pero la respuesta falló, la tabla igual refleja la realidad.
    onSettled: () => qc.invalidateQueries({ queryKey: ['procedimiento-grupos', servicioId] }),
  })

  const removeMutation = useMutation({
    mutationFn: (grupoId: string) => clinicasApi.procedimientos.grupos.remove(servicioId, grupoId),
    onError: (err: any) =>
      toast({
        title: err?.response?.data?.detail ?? 'Error al quitar el grupo',
        variant: 'destructive',
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['procedimiento-grupos', servicioId] }),
  })

  const asignados = new Set((grupos as ServicioGrupoZonas[]).map((g) => g.grupo))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Grupos de zonas</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Grupos de diagramas que aparecerán en la nota clínica de este procedimiento.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Agregar
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2 animate-pulse">
          {[1, 2].map((i) => <div key={i} className="h-20 rounded-lg bg-muted" />)}
        </div>
      ) : (grupos as ServicioGrupoZonas[]).length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <Images className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Sin grupos de zonas asignados</p>
          <p className="text-xs text-muted-foreground mt-1">
            Agrega grupos para que sus diagramas aparezcan al documentar este procedimiento.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {(grupos as ServicioGrupoZonas[]).map((g) => (
            <GrupoCard
              key={g.id}
              g={g}
              onRemove={() => removeMutation.mutate(g.grupo)}
              removing={removeMutation.isPending}
            />
          ))}
        </div>
      )}

      <PickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        asignados={asignados}
        onAdd={(id) => addMutation.mutate(id)}
        adding={addMutation.isPending}
      />
    </div>
  )
}
