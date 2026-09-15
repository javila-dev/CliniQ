'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2, Package, Plus, Loader2, AlertTriangle } from 'lucide-react'
import { historiaClinicaApi } from '@/lib/api/historiaClinica'
import { inventarioApi } from '@/lib/api/inventario'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useAuthStore } from '@/store/authStore'
import { hasPermission, PERM } from '@/lib/permissions'
import { formatDateTime } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

interface Props {
  notaId: string
}

const UNIDAD_LABEL: Record<string, string> = {
  unidad: 'Unidad', ml: 'ml', gr: 'gr', cm: 'cm', par: 'Par', caja: 'Caja',
}

export function TabInsumos({ notaId }: Props) {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const { toast } = useToast()

  const puedeRegistrar = hasPermission(user, PERM.INVENTARIO_CONSUMO_REGISTRAR)
  const puedeEliminar = hasPermission(user, PERM.INVENTARIO_CONSUMO_ELIMINAR)

  const [open, setOpen] = useState(false)
  const [insumoId, setInsumoId] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [notas, setNotas] = useState('')

  const resetForm = () => {
    setInsumoId('')
    setCantidad('')
    setNotas('')
  }

  const qKey = ['nota-consumos-insumo', notaId]

  const { data: consumos, isLoading } = useQuery({
    queryKey: qKey,
    queryFn: () => historiaClinicaApi.consumosInsumo.list(notaId),
  })

  const { data: insumos } = useQuery({
    queryKey: ['insumos-consumo-interno'],
    queryFn: () => inventarioApi.listInsumos({ es_consumo_interno: true, activo: true, page_size: 200 }),
    enabled: puedeRegistrar,
    staleTime: 60_000,
  })

  const createMut = useMutation({
    mutationFn: () => historiaClinicaApi.consumosInsumo.create({ nota: notaId, insumo: insumoId, cantidad: Number(cantidad), notas }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qKey })
      qc.invalidateQueries({ queryKey: ['insumos-consumo-interno'] })
      resetForm()
      setOpen(false)
      toast({ title: 'Consumo registrado', description: 'El insumo quedó descontado del inventario.' })
    },
    onError: (err: unknown) => {
      const description = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'No se pudo registrar el consumo. Intenta de nuevo.'
      toast({ title: 'Error al registrar', description, variant: 'destructive' })
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => historiaClinicaApi.consumosInsumo.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qKey })
      qc.invalidateQueries({ queryKey: ['insumos-consumo-interno'] })
      toast({ title: 'Consumo eliminado', description: 'El stock del insumo fue devuelto al inventario.' })
    },
    onError: () => {
      toast({ title: 'Error al eliminar', description: 'No se pudo revertir el consumo. Intenta de nuevo.', variant: 'destructive' })
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="max-w-[80%] space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Insumos utilizados</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {consumos?.length ?? 0} registro{consumos?.length !== 1 ? 's' : ''}
          </p>
        </div>
        {puedeRegistrar && (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Nuevo insumo
          </Button>
        )}
      </div>

      {!puedeRegistrar && (
        <div className="flex items-start gap-2 rounded-md bg-muted/60 border px-3 py-2.5">
          <AlertTriangle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground font-medium">
            No tienes permiso para registrar insumos consumidos en esta atención.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {(!consumos || consumos.length === 0) && (
          <div className="rounded-lg border border-dashed py-10 text-center">
            <Package className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Sin insumos registrados en esta atención.</p>
          </div>
        )}

        {consumos?.map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
            <div>
              <p className="text-sm font-medium">
                {c.insumo_nombre} — {c.cantidad} {UNIDAD_LABEL[c.unidad_medida] ?? c.unidad_medida}
              </p>
              {c.notas && <p className="text-xs text-muted-foreground">{c.notas}</p>}
              <p className="text-[10px] text-muted-foreground">{formatDateTime(c.created_at)}</p>
            </div>
            {puedeEliminar && (
              <button
                type="button"
                disabled={deleteMut.isPending}
                onClick={() => {
                  if (window.confirm(`¿Eliminar el consumo de "${c.insumo_nombre}"? El stock será devuelto al inventario.`)) {
                    deleteMut.mutate(c.id)
                  }
                }}
                className="text-muted-foreground hover:text-destructive disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo insumo</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => { e.preventDefault(); if (insumoId && cantidad) createMut.mutate() }}
            className="space-y-3"
          >
            <div className="space-y-1.5">
              <Label>Insumo</Label>
              <Select value={insumoId} onValueChange={setInsumoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un insumo" />
                </SelectTrigger>
                <SelectContent>
                  {insumos?.results.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.nombre} — stock {i.stock_actual} {UNIDAD_LABEL[i.unidad_medida]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Cantidad</Label>
              <Input
                type="number"
                step="0.001"
                min="0"
                placeholder="0.000"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Notas (opcional)</Label>
              <Input
                placeholder="Ej. Aplicado en zona frontal"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { resetForm(); setOpen(false) }}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!insumoId || !cantidad || createMut.isPending}>
                Registrar consumo
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
