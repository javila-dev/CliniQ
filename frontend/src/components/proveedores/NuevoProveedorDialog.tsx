'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { proveedoresApi } from '@/lib/api/proveedores'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { aplicarErroresDeCampo, mensajeDeError } from '@/lib/errores'
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

type ProveedorForm = z.infer<typeof proveedorSchema>

const CAMPOS_FORM = ['nombre', 'nit', 'direccion', 'regimen_tributario', 'categoria', 'contacto', 'telefono', 'email'] as const

function valoresIniciales(proveedor?: Proveedor | null): ProveedorForm {
  return {
    nombre: proveedor?.nombre ?? '',
    nit: proveedor?.nit ?? '',
    direccion: proveedor?.direccion ?? '',
    regimen_tributario: proveedor?.regimen_tributario ?? '',
    categoria: proveedor?.categoria ?? 'insumos_medicos',
    contacto: proveedor?.contacto ?? '',
    telefono: proveedor?.telefono ?? '',
    email: proveedor?.email ?? '',
  }
}

interface Props {
  open: boolean
  onClose: () => void
  /** Si se pasa, el modal edita ese proveedor en vez de crear uno nuevo. */
  proveedor?: Proveedor | null
  /** Se dispara al crear con éxito, además de cerrar el modal e invalidar el listado. */
  onCreated?: (proveedor: Proveedor) => void
}

export function NuevoProveedorDialog({ open, onClose, proveedor, onCreated }: Props) {
  const qc = useQueryClient()
  const esEdicion = !!proveedor
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm<ProveedorForm>({
    resolver: zodResolver(proveedorSchema),
    defaultValues: valoresIniciales(proveedor),
  })

  // Al abrir se cargan los datos del proveedor a editar (o el formulario vacío).
  useEffect(() => {
    if (open) {
      reset(valoresIniciales(proveedor))
      setErrorGeneral(null)
    }
  }, [open, proveedor?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const mutation = useMutation({
    mutationFn: (data: ProveedorForm) =>
      esEdicion
        ? proveedoresApi.updateProveedor(proveedor!.id, data)
        : proveedoresApi.createProveedor(data),
    onSuccess: (guardado) => {
      qc.invalidateQueries({ queryKey: ['proveedores'] })
      qc.invalidateQueries({ queryKey: ['proveedores-select'] })
      onClose()
      if (!esEdicion) onCreated?.(guardado)
    },
    onError: (err) => {
      const enCampos = aplicarErroresDeCampo(err, setError, CAMPOS_FORM)
      setErrorGeneral(
        enCampos ? null : mensajeDeError(err, esEdicion ? 'No se pudo guardar el proveedor.' : 'No se pudo crear el proveedor.'),
      )
    },
  })

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{esEdicion ? 'Editar proveedor' : 'Nuevo proveedor'}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit((d) => { setErrorGeneral(null); mutation.mutate(d) })} className="mt-2 space-y-4">

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
              {errors.categoria && <p className="text-xs text-red-500">{errors.categoria.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Dirección</Label>
              <Input placeholder="Dirección fiscal" {...register('direccion')} className={cn(errors.direccion && 'border-red-400')} />
              {errors.direccion && <p className="text-xs text-red-500">{errors.direccion.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Régimen tributario</Label>
              <Input placeholder="Ej. Régimen simple" {...register('regimen_tributario')} className={cn(errors.regimen_tributario && 'border-red-400')} />
              {errors.regimen_tributario && <p className="text-xs text-red-500">{errors.regimen_tributario.message}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Contacto</Label>
            <Input placeholder="Nombre del contacto" {...register('contacto')} className={cn(errors.contacto && 'border-red-400')} />
            {errors.contacto && <p className="text-xs text-red-500">{errors.contacto.message}</p>}
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

          {errorGeneral && <p className="text-sm text-red-500">{errorGeneral}</p>}

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button type="submit" className="flex-1" disabled={mutation.isPending}>
              {mutation.isPending ? 'Guardando…' : esEdicion ? 'Guardar cambios' : 'Crear proveedor'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
