'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CreditCard, Lock, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { formasPagoApi } from '@/lib/api/formasPago'
import { useAuthStore } from '@/store/authStore'
import { hasPermission, PERM } from '@/lib/permissions'
import { toast } from '@/hooks/use-toast'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { FormaDePago, TipoBaseFormaPago } from '@/types/formasPago'

const TIPO_BASE_OPTIONS: { value: TipoBaseFormaPago; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'tarjeta_debito', label: 'Tarjeta débito' },
  { value: 'tarjeta_credito', label: 'Tarjeta crédito' },
  { value: 'credito', label: 'Crédito' },
  { value: 'cuotas', label: 'Cuotas' },
  { value: 'financiamiento', label: 'Financiamiento' },
  { value: 'otro', label: 'Otro' },
]

const formaSchema = z.object({
  nombre: z.string().min(2, 'Mínimo 2 caracteres'),
  tipo_base: z.string().min(1, 'Selecciona un tipo'),
})

type FormaFormValues = z.infer<typeof formaSchema>

function FormaDialog({
  forma,
  open,
  onClose,
}: {
  forma: FormaDePago | null
  open: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()
  const isEdit = !!forma

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormaFormValues>({
    resolver: zodResolver(formaSchema),
    values: forma ? { nombre: forma.nombre, tipo_base: forma.tipo_base } : { nombre: '', tipo_base: '' },
  })

  const mutation = useMutation({
    mutationFn: (data: FormaFormValues) =>
      isEdit
        ? formasPagoApi.patch(forma!.id, { nombre: data.nombre })
        : formasPagoApi.create({ nombre: data.nombre, tipo_base: data.tipo_base as TipoBaseFormaPago }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['formas-pago'] })
      toast.success(isEdit ? 'Forma de pago actualizada' : 'Forma de pago creada')
      handleClose()
    },
    onError: (err: any) => {
      const data = err?.response?.data
      toast.error('No se pudo guardar', data?.error ?? data?.nombre?.[0] ?? data?.tipo_base?.[0] ?? 'Intenta de nuevo.')
    },
  })

  function handleClose() {
    reset()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar forma de pago' : 'Nueva forma de pago'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Nombre *</Label>
            <Input
              placeholder="Ej: Nequi, Bono regalo"
              {...register('nombre')}
              className={cn(errors.nombre && 'border-red-400')}
            />
            {errors.nombre && <p className="text-xs text-red-500">{errors.nombre.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Tipo *</Label>
            <Select
              value={watch('tipo_base')}
              onValueChange={(v) => setValue('tipo_base', v)}
              disabled={isEdit}
            >
              <SelectTrigger className={cn(errors.tipo_base && 'border-red-400')}>
                <SelectValue placeholder="Seleccionar…" />
              </SelectTrigger>
              <SelectContent>
                {TIPO_BASE_OPTIONS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.tipo_base && <p className="text-xs text-red-500">{errors.tipo_base.message}</p>}
            {isEdit && (
              <p className="text-xs text-muted-foreground">El tipo no se puede cambiar después de creada.</p>
            )}
          </div>

          {mutation.isError && !errors.nombre && !errors.tipo_base && (
            <p className="text-sm text-red-500">Error al guardar. Intenta de nuevo.</p>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={handleClose}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear forma de pago'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DeleteFormaDialog({
  forma,
  open,
  onClose,
}: {
  forma: FormaDePago | null
  open: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => formasPagoApi.delete(forma!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['formas-pago'] })
      toast.success('Forma de pago eliminada')
      onClose()
    },
    onError: (err: any) => {
      toast.error('No se pudo eliminar', err?.response?.data?.error ?? 'Puede tener pagos o cuotas registrados.')
    },
  })

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>¿Eliminar forma de pago?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground py-2">
          Se eliminará <span className="font-semibold">{forma?.nombre}</span>. Si ya tiene pagos o cuotas
          registrados, no se podrá eliminar: desactívala en su lugar.
        </p>
        {mutation.isError && (
          <p className="text-sm text-red-500">No se pudo eliminar. Ya está en uso.</p>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button variant="destructive" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? 'Eliminando…' : 'Eliminar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function FormasPagoPage() {
  const { user } = useAuthStore()
  const puedeGestionar = hasPermission(user, PERM.FORMAS_PAGO_GESTIONAR)

  const qc = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editando, setEditando] = useState<FormaDePago | null>(null)
  const [eliminando, setEliminando] = useState<FormaDePago | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['formas-pago', 'admin'],
    queryFn: () => formasPagoApi.list(),
  })
  const formas = data?.results ?? []

  const toggleMutation = useMutation({
    mutationFn: (f: FormaDePago) => formasPagoApi.patch(f.id, { activo: !f.activo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['formas-pago'] }),
  })

  function handleEdit(f: FormaDePago) { setEditando(f); setDialogOpen(true) }
  function handleDelete(f: FormaDePago) { setEliminando(f); setDeleteOpen(true) }
  function closeDialog() { setDialogOpen(false); setEditando(null) }
  function closeDelete() { setDeleteOpen(false); setEliminando(null) }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Formas de pago"
        description="Los medios de pago y planes que usa tu clínica al cobrar o al declarar el plan de pagos de una cotización."
        action={puedeGestionar && (
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nueva forma de pago
          </Button>
        )}
      />

      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead className="w-40">Tipo</TableHead>
              <TableHead className="w-28">Estado</TableHead>
              {puedeGestionar && <TableHead className="w-12" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="animate-pulse">
                  <TableCell><div className="h-4 w-40 rounded bg-gray-100" /></TableCell>
                  <TableCell><div className="h-4 w-24 rounded bg-gray-100" /></TableCell>
                  <TableCell><div className="h-5 w-16 rounded-full bg-gray-100" /></TableCell>
                  {puedeGestionar && <TableCell><div className="h-8 w-8 rounded bg-gray-100" /></TableCell>}
                </TableRow>
              ))
            ) : formas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={puedeGestionar ? 4 : 3} className="py-16 text-center">
                  <CreditCard className="h-10 w-10 text-muted-foreground/20 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No hay formas de pago creadas</p>
                </TableCell>
              </TableRow>
            ) : (
              formas.map((f) => (
                <TableRow key={f.id} className={cn(!f.activo && 'opacity-50')}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{f.nombre}</span>
                      {f.es_sistema && (
                        <span title="Forma de pago del sistema">
                          <Lock className="h-3 w-3 text-muted-foreground/50" />
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{f.tipo_base_display}</TableCell>
                  <TableCell>
                    <Badge variant={f.activo ? 'success' : 'muted'}>
                      {f.activo ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </TableCell>
                  {puedeGestionar && (
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(f)}>
                            <Pencil className="h-3.5 w-3.5 mr-2" />Editar nombre
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => toggleMutation.mutate(f)}
                            className={f.activo ? 'text-amber-600 focus:text-amber-600' : 'text-green-600 focus:text-green-600'}
                          >
                            {f.activo ? 'Desactivar' : 'Activar'}
                          </DropdownMenuItem>
                          {!f.es_sistema && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleDelete(f)}
                                className="text-red-600 focus:text-red-600"
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-2" />Eliminar
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <FormaDialog forma={editando} open={dialogOpen} onClose={closeDialog} />
      <DeleteFormaDialog forma={eliminando} open={deleteOpen} onClose={closeDelete} />
    </div>
  )
}
