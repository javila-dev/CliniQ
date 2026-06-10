'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { historiaClinicaApi } from '@/lib/api/historiaClinica'
import type { PlantillaOrden } from '@/types/historia'

const schema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido'),
  contenido: z.string().min(10, 'El contenido debe tener al menos 10 caracteres'),
  permite_edicion_profesional: z.boolean(),
})

type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onClose: () => void
  plantilla?: PlantillaOrden | null
}

export function PlantillaOrdenSheet({ open, onClose, plantilla }: Props) {
  const queryClient = useQueryClient()
  const esNueva = !plantilla

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { nombre: '', contenido: '', permite_edicion_profesional: true },
  })

  useEffect(() => {
    if (open) {
      reset(plantilla
        ? { nombre: plantilla.nombre, contenido: plantilla.contenido, permite_edicion_profesional: plantilla.permite_edicion_profesional }
        : { nombre: '', contenido: '', permite_edicion_profesional: true }
      )
    }
  }, [open, plantilla, reset])

  const { mutate, isPending } = useMutation({
    mutationFn: (values: FormValues) =>
      esNueva
        ? historiaClinicaApi.plantillasOrdenes.create(values)
        : historiaClinicaApi.plantillasOrdenes.patch(plantilla!.id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plantillas-ordenes'] })
      onClose()
    },
  })

  const permiteEdicion = watch('permite_edicion_profesional')

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{esNueva ? 'Nueva plantilla' : 'Editar plantilla'}</SheetTitle>
        </SheetHeader>

        <form
          onSubmit={handleSubmit((v) => mutate(v))}
          className="flex-1 flex flex-col gap-5 overflow-y-auto px-6 py-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="nombre">Nombre</Label>
            <Input id="nombre" placeholder="Ej. Orden de laboratorio general" {...register('nombre')} />
            {errors.nombre && <p className="text-xs text-destructive">{errors.nombre.message}</p>}
          </div>

          <div className="space-y-1.5 flex-1">
            <Label htmlFor="contenido">Contenido</Label>
            <Textarea
              id="contenido"
              rows={12}
              className="resize-none text-sm h-full min-h-[200px]"
              placeholder="Escriba aquí el contenido de la orden médica. Puede usar variables como {{nombre_paciente}}, {{fecha}}, etc."
              {...register('contenido')}
            />
            {errors.contenido && <p className="text-xs text-destructive">{errors.contenido.message}</p>}
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
            <div>
              <p className="text-sm font-medium">Permite edición por el profesional</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Si está activo, el profesional podrá modificar el texto al usar esta plantilla.
              </p>
            </div>
            <Switch
              checked={permiteEdicion}
              onCheckedChange={(v) => setValue('permite_edicion_profesional', v)}
            />
          </div>
        </form>

        <SheetFooter className="px-6 pt-4 border-t gap-2">
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancelar</Button>
          <Button onClick={handleSubmit((v) => mutate(v))} disabled={isPending}>
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
            {esNueva ? 'Crear plantilla' : 'Guardar cambios'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
