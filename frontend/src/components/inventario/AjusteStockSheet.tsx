'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { inventarioApi } from '@/lib/api/inventario'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { UNIDAD_LABEL } from '@/lib/inventarioLabels'
import { cn } from '@/lib/utils'
import type { Insumo } from '@/types/inventario'

const ajusteSchema = z.object({
  cantidad_nueva: z.string().min(1, 'Requerido'),
  motivo: z.string().min(3, 'Describe el motivo'),
})

export function AjusteStockSheet({
  insumo,
  sede,
  open,
  onClose,
}: {
  insumo: Insumo | null
  sede: string
  open: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()
  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(ajusteSchema),
  })

  const mutation = useMutation({
    mutationFn: (data: { cantidad_nueva: string; motivo: string }) =>
      inventarioApi.ajustarStock(insumo!.id, { ...data, sede }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['insumos'] })
      qc.invalidateQueries({ queryKey: ['alertas-stock'] })
      qc.invalidateQueries({ queryKey: ['insumo', insumo?.id] })
      qc.invalidateQueries({ queryKey: ['kardex'] })
      reset()
      onClose()
    },
  })

  if (!insumo) return null

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <SheetContent className="w-full sm:max-w-md p-6">
        <SheetHeader>
          <SheetTitle>Ajustar stock — {insumo.nombre}</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="mt-6 space-y-4">
          <div className="rounded-lg bg-muted/40 p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Stock actual</span>
              <span className="font-semibold">{Number(insumo.stock_actual).toLocaleString('es-CO', { maximumFractionDigits: 2 })} {UNIDAD_LABEL[insumo.unidad_medida]}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Stock mínimo</span>
              <span>{Number(insumo.stock_minimo).toLocaleString('es-CO', { maximumFractionDigits: 2 })} {UNIDAD_LABEL[insumo.unidad_medida]}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cantidad_nueva">Nueva cantidad</Label>
            <Input
              id="cantidad_nueva"
              type="number"
              step="0.001"
              min="0"
              placeholder="0.000"
              {...register('cantidad_nueva')}
              className={cn(errors.cantidad_nueva && 'border-red-400')}
            />
            {errors.cantidad_nueva && (
              <p className="text-xs text-red-500">{errors.cantidad_nueva.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="motivo">Motivo del ajuste</Label>
            <Input
              id="motivo"
              placeholder="Ej. Conteo físico de cierre"
              {...register('motivo')}
              className={cn(errors.motivo && 'border-red-400')}
            />
            {errors.motivo && (
              <p className="text-xs text-red-500">{errors.motivo.message}</p>
            )}
          </div>

          {mutation.isError && (
            <p className="text-sm text-red-500">Error al ajustar stock. Intenta de nuevo.</p>
          )}

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={mutation.isPending}>
              {mutation.isPending ? 'Guardando…' : 'Guardar ajuste'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
