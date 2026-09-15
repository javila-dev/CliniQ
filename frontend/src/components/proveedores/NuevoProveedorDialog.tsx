'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { proveedoresApi } from '@/lib/api/proveedores'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { Proveedor } from '@/types/proveedores'

export const CATEGORIA_LABEL: Record<string, string> = {
  insumos_medicos: 'Insumos médicos',
  productos_belleza: 'Productos de belleza',
  equipos: 'Equipos',
  papeleria: 'Papelería',
  otro: 'Otro',
}

const proveedorSchema = z.object({
  nombre: z.string().min(2, 'Mínimo 2 caracteres'),
  nit: z.string().min(3, 'NIT requerido'),
  direccion: z.string().optional(),
  regimen_tributario: z.string().optional(),
  categoria: z.enum(['insumos_medicos', 'productos_belleza', 'equipos', 'papeleria', 'otro']),
  contacto: z.string().optional(),
  telefono: z.string().min(1, 'Teléfono requerido'),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
})

function mensajeError(err: unknown): string {
  const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data
  if (!data) return 'Error al crear proveedor.'
  const primero = Object.values(data)[0]
  const mensaje = Array.isArray(primero) ? primero[0] : primero
  return typeof mensaje === 'string' ? mensaje : 'Error al crear proveedor.'
}

interface Props {
  open: boolean
  onClose: () => void
  /** Se dispara al crear con éxito, además de cerrar el modal e invalidar el listado. */
  onCreated?: (proveedor: Proveedor) => void
}

export function NuevoProveedorDialog({ open, onClose, onCreated }: Props) {
  const qc = useQueryClient()
  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(proveedorSchema),
    defaultValues: { categoria: 'insumos_medicos' as const },
  })

  const mutation = useMutation({
    mutationFn: proveedoresApi.createProveedor,
    onSuccess: (proveedor) => {
      qc.invalidateQueries({ queryKey: ['proveedores'] })
      qc.invalidateQueries({ queryKey: ['proveedores-select'] })
      reset()
      onClose()
      onCreated?.(proveedor)
    },
  })

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose() } }}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nuevo proveedor</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d as Parameters<typeof proveedoresApi.createProveedor>[0]))} className="mt-2 space-y-4">

          <div className="space-y-1.5">
            <Label>Nombre *</Label>
            <Input placeholder="Razón social o nombre" {...register('nombre')} className={cn(errors.nombre && 'border-red-400')} />
            {errors.nombre && <p className="text-xs text-red-500">{errors.nombre.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>NIT *</Label>
              <Input placeholder="900123456-1" {...register('nit')} className={cn(errors.nit && 'border-red-400')} />
              {errors.nit && <p className="text-xs text-red-500">{errors.nit.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Categoría *</Label>
              <select {...register('categoria')} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
                {Object.entries(CATEGORIA_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Dirección</Label>
              <Input placeholder="Dirección fiscal" {...register('direccion')} />
            </div>
            <div className="space-y-1.5">
              <Label>Régimen tributario</Label>
              <Input placeholder="Ej. Régimen simple" {...register('regimen_tributario')} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Contacto</Label>
            <Input placeholder="Nombre del contacto" {...register('contacto')} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Teléfono *</Label>
              <Input placeholder="3001234567" {...register('telefono')} className={cn(errors.telefono && 'border-red-400')} />
              {errors.telefono && <p className="text-xs text-red-500">{errors.telefono.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" placeholder="proveedor@empresa.com" {...register('email')} className={cn(errors.email && 'border-red-400')} />
              {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
            </div>
          </div>

          {mutation.isError && <p className="text-sm text-red-500">{mensajeError(mutation.error)}</p>}

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => { reset(); onClose() }}>Cancelar</Button>
            <Button type="submit" className="flex-1" disabled={mutation.isPending}>
              {mutation.isPending ? 'Guardando…' : 'Crear proveedor'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
