'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { inventarioApi } from '@/lib/api/inventario'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { aplicarErroresDeCampo, mensajeDeError } from '@/lib/errores'
import { UNIDAD_LABEL } from '@/lib/inventarioLabels'
import { cn } from '@/lib/utils'
import type { Insumo } from '@/types/inventario'

const insumoSchema = z.object({
  nombre: z.string().min(2, 'Mínimo 2 caracteres'),
  es_consumo_interno: z.boolean(),
  es_venta_retail: z.boolean(),
  unidad_medida: z.enum(['unidad', 'ml', 'gr', 'cm', 'par', 'caja']),
  stock_minimo: z.string().optional(),
  precio_venta: z.string().optional(),
  permite_stock_negativo: z.boolean(),
}).refine(d => d.es_consumo_interno || d.es_venta_retail, {
  message: 'Selecciona al menos un uso',
  path: ['es_consumo_interno'],
})

type InsumoForm = z.infer<typeof insumoSchema>

const CAMPOS_FORM = ['nombre', 'unidad_medida', 'stock_minimo', 'precio_venta'] as const

function valoresIniciales(insumo?: Insumo | null): InsumoForm {
  if (!insumo) {
    return {
      nombre: '',
      es_consumo_interno: true,
      es_venta_retail: false,
      unidad_medida: 'unidad',
      stock_minimo: '',
      precio_venta: '',
      permite_stock_negativo: false,
    }
  }
  return {
    nombre: insumo.nombre,
    es_consumo_interno: insumo.es_consumo_interno,
    es_venta_retail: insumo.es_venta_retail,
    unidad_medida: insumo.unidad_medida,
    // El backend manda "5.000"; el input numérico lo muestra como 5.
    stock_minimo: insumo.stock_minimo ? String(Number(insumo.stock_minimo)) : '',
    precio_venta: insumo.precio_venta ? String(Number(insumo.precio_venta)) : '',
    permite_stock_negativo: insumo.permite_stock_negativo,
  }
}

/** Crea un insumo o, si recibe `insumo`, edita su ficha (catálogo compartido entre sedes). */
export function InsumoSheet({
  open,
  onClose,
  insumo,
}: {
  open: boolean
  onClose: () => void
  insumo?: Insumo | null
}) {
  const qc = useQueryClient()
  const esEdicion = !!insumo
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)

  const { register, handleSubmit, reset, watch, setValue, setError, formState: { errors } } = useForm<InsumoForm>({
    resolver: zodResolver(insumoSchema),
    defaultValues: valoresIniciales(insumo),
  })

  // Al abrir se cargan los datos actuales del insumo (o el formulario vacío).
  // Depende del id y no del objeto: un refetch con el sheet abierto no debe
  // borrar lo que el usuario lleva escrito.
  useEffect(() => {
    if (open) {
      reset(valoresIniciales(insumo))
      setErrorGeneral(null)
    }
  }, [open, insumo?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const esConsumo = watch('es_consumo_interno')
  const esRetail = watch('es_venta_retail')

  const mutation = useMutation({
    mutationFn: (data: InsumoForm) => {
      const payload = {
        nombre: data.nombre,
        es_consumo_interno: data.es_consumo_interno,
        es_venta_retail: data.es_venta_retail,
        unidad_medida: data.unidad_medida,
        permite_stock_negativo: data.permite_stock_negativo,
      }
      return esEdicion
        ? inventarioApi.updateInsumo(insumo!.id, {
            ...payload,
            stock_minimo: data.stock_minimo || '0',
            precio_venta: data.precio_venta || null,
          })
        : inventarioApi.createInsumo({
            ...payload,
            stock_minimo: data.stock_minimo || undefined,
            precio_venta: data.precio_venta || undefined,
          })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['insumos'] })
      qc.invalidateQueries({ queryKey: ['alertas-stock'] })
      qc.invalidateQueries({ queryKey: ['insumos-consumo-interno'] })
      if (insumo) qc.invalidateQueries({ queryKey: ['insumo', insumo.id] })
      onClose()
    },
    onError: (err) => {
      const enCampos = aplicarErroresDeCampo(err, setError, CAMPOS_FORM)
      setErrorGeneral(
        enCampos ? null : mensajeDeError(err, esEdicion ? 'No se pudo guardar el insumo.' : 'No se pudo crear el insumo.'),
      )
    },
  })

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto p-6">
        <SheetHeader>
          <SheetTitle>{esEdicion ? 'Editar insumo' : 'Nuevo insumo'}</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit((d) => { setErrorGeneral(null); mutation.mutate(d) })} className="mt-6 space-y-4">

          <div className="space-y-1.5">
            <Label>Nombre *</Label>
            <Input placeholder="Nombre del insumo" {...register('nombre')} className={cn(errors.nombre && 'border-red-400')} />
            {errors.nombre && <p className="text-xs text-red-500">{errors.nombre.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Uso *</Label>
            <div className={cn('flex flex-col gap-2 rounded-md border p-3', errors.es_consumo_interno && 'border-red-400')}>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={esConsumo}
                  onChange={e => setValue('es_consumo_interno', e.target.checked)}
                  className="h-4 w-4 rounded border-input accent-rose-500"
                />
                <span className="text-sm">Consumo interno</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={esRetail}
                  onChange={e => setValue('es_venta_retail', e.target.checked)}
                  className="h-4 w-4 rounded border-input accent-rose-500"
                />
                <span className="text-sm">Venta retail</span>
              </label>
            </div>
            {errors.es_consumo_interno && (
              <p className="text-xs text-red-500">{errors.es_consumo_interno.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Unidad *</Label>
            <select {...register('unidad_medida')} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
              {Object.entries(UNIDAD_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            {errors.unidad_medida && <p className="text-xs text-red-500">{errors.unidad_medida.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Stock mínimo</Label>
            <Input type="number" step="0.001" min="0" placeholder="0" {...register('stock_minimo')} className={cn(errors.stock_minimo && 'border-red-400')} />
            {errors.stock_minimo && <p className="text-xs text-red-500">{errors.stock_minimo.message}</p>}
            <p className="text-[11px] text-muted-foreground">Umbral para la alerta de stock bajo, compartido entre sedes.</p>
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer rounded-md border p-3">
            <input
              type="checkbox"
              {...register('permite_stock_negativo')}
              className="h-4 w-4 mt-0.5 rounded border-input accent-rose-500"
            />
            <span>
              <span className="text-sm block">Permitir stock negativo</span>
              <span className="text-[11px] text-muted-foreground">
                Deja registrar consumo o venta de este insumo aunque el stock disponible no alcance.
              </span>
            </span>
          </label>

          {esRetail && (
            <div className="space-y-1.5">
              <Label>Precio de venta</Label>
              <Input type="number" step="0.01" min="0" placeholder="0.00" {...register('precio_venta')} className={cn(errors.precio_venta && 'border-red-400')} />
              {errors.precio_venta && <p className="text-xs text-red-500">{errors.precio_venta.message}</p>}
            </div>
          )}

          {errorGeneral && <p className="text-sm text-red-500">{errorGeneral}</p>}

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={mutation.isPending}>
              {mutation.isPending ? 'Guardando…' : esEdicion ? 'Guardar cambios' : 'Crear insumo'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
