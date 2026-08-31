'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, FileSignature } from 'lucide-react'
import { clinicasApi } from '@/lib/api/clinicas'
import { toast } from '@/hooks/use-toast'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import type { PlantillaAsistencia } from '@/types/clinicas'

function PlantillaDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: PlantillaAsistencia | null
}) {
  const queryClient = useQueryClient()
  const [nombre, setNombre] = useState('')
  const [token, setToken] = useState('')
  const [activo, setActivo] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    if (editing) {
      setNombre(editing.nombre)
      setToken(editing.documenso_template_token)
      setActivo(editing.activo)
    } else {
      setNombre('')
      setToken('')
      setActivo(true)
    }
    setError(null)
  }, [open, editing])

  const { mutate, isPending } = useMutation({
    mutationFn: () => {
      if (!nombre.trim()) throw new Error('El nombre es requerido')
      if (!token.trim()) throw new Error('El token de plantilla Documenso es requerido')
      if (editing) {
        return clinicasApi.plantillasAsistencia.update(editing.id, { nombre: nombre.trim(), documenso_template_token: token.trim(), activo })
      }
      return clinicasApi.plantillasAsistencia.create({ nombre: nombre.trim(), documenso_template_token: token.trim(), activo })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plantillas-asistencia'] })
      toast.success(editing ? 'Plantilla actualizada' : 'Plantilla creada')
      onOpenChange(false)
    },
    onError: (err: any) => {
      setError(err?.message ?? err?.response?.data?.detail ?? 'Error al guardar')
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar plantilla' : 'Nueva plantilla de asistencia'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nombre *</Label>
            <Input
              placeholder="Ej: Firma de asistencia estética"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Token de plantilla Documenso *</Label>
            <Input
              placeholder="Ej: tpl_xxxxxxxxxxxxxxxx"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              ID del template en Documenso que se usará para generar el documento.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              checked={activo}
              onCheckedChange={setActivo}
              id="activo-switch"
            />
            <Label htmlFor="activo-switch" className="cursor-pointer">Plantilla activa</Label>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => mutate()} disabled={isPending}>
            {isPending ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear plantilla'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function PlantillasAsistenciaPage() {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<PlantillaAsistencia | null>(null)

  const { data: plantillas, isLoading } = useQuery({
    queryKey: ['plantillas-asistencia'],
    queryFn: () => clinicasApi.plantillasAsistencia.list(),
  })

  const { mutate: eliminar } = useMutation({
    mutationFn: (id: string) => clinicasApi.plantillasAsistencia.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plantillas-asistencia'] })
      toast.success('Plantilla eliminada')
    },
    onError: () => toast.error('No se pudo eliminar la plantilla'),
  })

  function openCreate() { setEditing(null); setDialogOpen(true) }
  function openEdit(p: PlantillaAsistencia) { setEditing(p); setDialogOpen(true) }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plantillas de asistencia"
        description="Templates de Documenso para solicitar firma electrónica de asistencia durante la atención."
      />

      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1.5" />
          Nueva plantilla
        </Button>
      </div>

      {isLoading && (
        <div className="rounded-xl border bg-white p-8 text-center text-sm text-muted-foreground">
          Cargando plantillas...
        </div>
      )}

      {!isLoading && (!plantillas || plantillas.length === 0) && (
        <div className="rounded-xl border bg-white p-8 text-center space-y-2">
          <FileSignature className="h-8 w-8 text-muted-foreground/40 mx-auto" />
          <p className="text-sm text-muted-foreground">No hay plantillas configuradas.</p>
          <Button size="sm" variant="outline" onClick={openCreate}>Crear primera plantilla</Button>
        </div>
      )}

      {plantillas && plantillas.length > 0 && (
        <div className="rounded-xl border bg-white divide-y">
          {plantillas.map((p) => (
            <div key={p.id} className="flex items-center justify-between px-5 py-4 gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{p.nombre}</p>
                  {!p.activo && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded border bg-gray-50 text-gray-400 border-gray-200">
                      Inactiva
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">{p.documenso_template_token}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => openEdit(p)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    if (window.confirm(`¿Eliminar la plantilla "${p.nombre}"?`)) eliminar(p.id)
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <PlantillaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
      />
    </div>
  )
}
