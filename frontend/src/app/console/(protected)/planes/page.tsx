'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, MoreHorizontal, Crown, Pencil, Trash2 } from 'lucide-react'
import { adminApi } from '@/lib/api/admin'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { Plan } from '@/types/admin'

// ─── Schema ───────────────────────────────────────────────────

const planSchema = z.object({
  nombre:        z.string().min(2, 'Mínimo 2 caracteres'),
  descripcion:   z.string().optional(),
  max_usuarios:  z.string().min(1, 'Requerido'),
  max_sedes:     z.string().min(1, 'Requerido'),
  precio:        z.string().min(1, 'Requerido'),
})

type PlanFormValues = z.infer<typeof planSchema>

// ─── Dialog crear / editar plan ──────────────────────────────

function PlanDialog({
  plan,
  open,
  onClose,
}: {
  plan: Plan | null
  open: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()
  const isEdit = !!plan

  const { register, handleSubmit, reset, formState: { errors } } = useForm<PlanFormValues>({
    resolver: zodResolver(planSchema),
    values: plan ? {
      nombre:       plan.nombre,
      descripcion:  plan.descripcion ?? '',
      max_usuarios: String(plan.max_usuarios),
      max_sedes:    String(plan.max_sedes),
      precio:       plan.precio,
    } : undefined,
  })

  const mutation = useMutation({
    mutationFn: (data: PlanFormValues) => {
      const payload = {
        nombre:       data.nombre,
        descripcion:  data.descripcion || undefined,
        max_usuarios: parseInt(data.max_usuarios, 10),
        max_sedes:    parseInt(data.max_sedes, 10),
        precio:       parseFloat(data.precio),
      }
      return isEdit ? adminApi.planes.update(plan!.id, payload) : adminApi.planes.create(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-planes'] })
      reset()
      onClose()
    },
  })

  const handleClose = () => { reset(); onClose() }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar plan' : 'Nuevo plan'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Nombre *</Label>
            <Input placeholder="Pro" {...register('nombre')} className={cn(errors.nombre && 'border-red-400')} />
            {errors.nombre && <p className="text-xs text-red-500">{errors.nombre.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Textarea
              placeholder="Ideal para clínicas medianas…"
              rows={2}
              {...register('descripcion')}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Máx. usuarios *</Label>
              <Input
                type="number"
                min={1}
                placeholder="10"
                {...register('max_usuarios')}
                className={cn(errors.max_usuarios && 'border-red-400')}
              />
              {errors.max_usuarios && <p className="text-xs text-red-500">{errors.max_usuarios.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Máx. sedes *</Label>
              <Input
                type="number"
                min={1}
                placeholder="3"
                {...register('max_sedes')}
                className={cn(errors.max_sedes && 'border-red-400')}
              />
              {errors.max_sedes && <p className="text-xs text-red-500">{errors.max_sedes.message}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Precio (COP) *</Label>
            <Input
              type="number"
              min={0}
              step={1000}
              placeholder="299000"
              {...register('precio')}
              className={cn(errors.precio && 'border-red-400')}
            />
            {errors.precio && <p className="text-xs text-red-500">{errors.precio.message}</p>}
          </div>

          {mutation.isError && (
            <p className="text-sm text-red-500">Error al guardar. Intenta de nuevo.</p>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={handleClose}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear plan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Dialog confirmar eliminación ────────────────────────────

function DeleteDialog({
  plan,
  open,
  onClose,
}: {
  plan: Plan | null
  open: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => adminApi.planes.delete(plan!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-planes'] })
      onClose()
    },
  })

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>¿Eliminar plan?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground py-2">
          Se eliminará <span className="font-semibold">{plan?.nombre}</span>. Esta acción no se puede deshacer.
        </p>
        {mutation.isError && (
          <p className="text-sm text-red-500">No se puede eliminar. Puede tener clínicas asignadas.</p>
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

// ─── Página principal ─────────────────────────────────────────

function formatPrecio(precio: string) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(parseFloat(precio))
}

export default function PlanesPage() {
  const [dialogOpen, setDialogOpen]   = useState(false)
  const [deleteOpen, setDeleteOpen]   = useState(false)
  const [editando, setEditando]       = useState<Plan | null>(null)
  const [eliminando, setEliminando]   = useState<Plan | null>(null)

  const { data: planesData, isLoading } = useQuery({
    queryKey: ['admin-planes'],
    queryFn:  () => adminApi.planes.list(),
  })
  const planes = planesData?.results ?? []

  const qc = useQueryClient()

  const toggleMutation = useMutation({
    mutationFn: (p: Plan) => adminApi.planes.update(p.id, { activo: !p.activo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-planes'] }),
  })

  const handleEdit = (p: Plan) => { setEditando(p); setDialogOpen(true) }
  const handleDelete = (p: Plan) => { setEliminando(p); setDeleteOpen(true) }
  const handleCloseDialog = () => { setDialogOpen(false); setEditando(null) }
  const handleCloseDelete = () => { setDeleteOpen(false); setEliminando(null) }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Planes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isLoading ? 'Cargando…' : `${planes.length} plan${planes.length !== 1 ? 'es' : ''} configurado${planes.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <Button onClick={() => { setEditando(null); setDialogOpen(true) }}>
          <Plus className="h-4 w-4 mr-1.5" />
          Nuevo plan
        </Button>
      </div>

      {/* Tabla */}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Plan</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead className="text-center">Máx. usuarios</TableHead>
              <TableHead className="text-center">Máx. sedes</TableHead>
              <TableHead>Precio</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i} className="animate-pulse">
                  <TableCell><div className="h-4 w-24 rounded bg-gray-100" /></TableCell>
                  <TableCell><div className="h-4 w-40 rounded bg-gray-100" /></TableCell>
                  <TableCell><div className="h-4 w-12 rounded bg-gray-100 mx-auto" /></TableCell>
                  <TableCell><div className="h-4 w-12 rounded bg-gray-100 mx-auto" /></TableCell>
                  <TableCell><div className="h-4 w-28 rounded bg-gray-100" /></TableCell>
                  <TableCell><div className="h-5 w-16 rounded-full bg-gray-100" /></TableCell>
                  <TableCell><div className="h-8 w-8 rounded bg-gray-100" /></TableCell>
                </TableRow>
              ))
            ) : planes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-16 text-center">
                  <Crown className="h-10 w-10 text-muted-foreground/20 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No hay planes creados</p>
                </TableCell>
              </TableRow>
            ) : (
              planes.map(p => (
                <TableRow key={p.id} className={cn(!p.activo && 'opacity-60')}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Crown className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      <span className="font-medium text-sm">{p.nombre}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-xs">
                    <span className="line-clamp-1">{p.descripcion ?? '—'}</span>
                  </TableCell>
                  <TableCell className="text-center text-sm">{p.max_usuarios}</TableCell>
                  <TableCell className="text-center text-sm">{p.max_sedes}</TableCell>
                  <TableCell className="text-sm font-medium">{formatPrecio(p.precio)}</TableCell>
                  <TableCell>
                    <Badge variant={p.activo ? 'success' : 'muted'}>
                      {p.activo ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(p)}>
                          <Pencil className="h-3.5 w-3.5 mr-2" />Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => toggleMutation.mutate(p)}
                          className={p.activo ? 'text-amber-600 focus:text-amber-600' : 'text-green-600 focus:text-green-600'}
                        >
                          {p.activo ? 'Desactivar' : 'Activar'}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleDelete(p)}
                          className="text-red-600 focus:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-2" />Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <PlanDialog plan={editando} open={dialogOpen} onClose={handleCloseDialog} />
      <DeleteDialog plan={eliminando} open={deleteOpen} onClose={handleCloseDelete} />
    </div>
  )
}
