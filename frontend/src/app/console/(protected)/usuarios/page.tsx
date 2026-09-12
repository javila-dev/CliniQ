'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, MoreHorizontal, ShieldCheck, Mail, Ban, CheckCircle2 } from 'lucide-react'

import { adminApi } from '@/lib/api/admin'
import { useAuthStore } from '@/store/authStore'
import { formatDate, cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import type { ConsoleUsuario } from '@/types/admin'

// ─── Schema ───────────────────────────────────────────────────

const schema = z.object({
  email: z.string().email('Correo inválido'),
  first_name: z.string().min(1, 'Requerido'),
  last_name: z.string().optional(),
  es_superadmin: z.boolean(),
})
type FormValues = z.infer<typeof schema>

// ─── Dialog crear usuario ───────────────────────────────────────

function NuevoUsuarioDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const { toast } = useToast()

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', first_name: '', last_name: '', es_superadmin: false },
  })
  const esSuperadmin = watch('es_superadmin')

  const mutation = useMutation({
    mutationFn: (data: FormValues) => adminApi.usuarios.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['console-usuarios'] })
      toast({ title: 'Usuario creado', description: 'Le enviamos un correo para activar su cuenta.' })
      reset()
      onClose()
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.email?.[0] || e?.response?.data?.error || 'No se pudo crear el usuario'
      toast({ title: String(msg), variant: 'destructive' })
    },
  })

  const handleClose = () => { reset(); onClose() }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo usuario de consola</DialogTitle>
          <DialogDescription>
            No pertenece a ninguna clínica. Le mandamos un correo para que active su cuenta.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Correo *</Label>
            <Input placeholder="persona@cliniq.com" {...register('email')} className={cn(errors.email && 'border-red-400')} />
            {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nombre *</Label>
              <Input placeholder="María" {...register('first_name')} className={cn(errors.first_name && 'border-red-400')} />
              {errors.first_name && <p className="text-xs text-red-500">{errors.first_name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Apellido</Label>
              <Input placeholder="Gómez" {...register('last_name')} />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>Superadmin</Label>
              <p className="text-xs text-muted-foreground">Acceso total a la plataforma. Si no, queda como staff.</p>
            </div>
            <Switch checked={esSuperadmin} onCheckedChange={(v) => setValue('es_superadmin', v)} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={mutation.isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Creando…' : 'Crear e invitar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Página ───────────────────────────────────────────────────

export default function ConsoleUsuariosPage() {
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()
  const { toast } = useToast()
  const yo = useAuthStore((s) => s.user)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['console-usuarios'],
    queryFn: () => adminApi.usuarios.list(),
  })

  const toggleActivo = useMutation({
    mutationFn: ({ id, activo }: { id: string; activo: boolean }) => adminApi.usuarios.setActivo(id, activo),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['console-usuarios'] })
      toast({ title: 'Actualizado' })
    },
    onError: (e: any) => toast({ title: e?.response?.data?.error ?? 'No se pudo actualizar', variant: 'destructive' }),
  })

  const reenviar = useMutation({
    mutationFn: (id: string) => adminApi.usuarios.reenviarInvitacion(id),
    onSuccess: (r) => toast({ title: r.email_enviado ? 'Invitación reenviada' : 'Link generado (revisa la config. de correo)' }),
    onError: (e: any) => toast({ title: e?.response?.data?.error ?? 'No se pudo reenviar', variant: 'destructive' }),
  })

  const usuarios = data?.results ?? []

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Usuarios de consola</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Superadmin y equipo interno. Sin clínica asociada — no operan dentro de una clínica.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Nuevo usuario
        </Button>
      </div>

      {isLoading ? (
        <LoadingState rows={5} />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : usuarios.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
          Todavía no hay usuarios de consola.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuario</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Último ingreso</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {usuarios.map((u: ConsoleUsuario) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <p className="font-medium text-foreground">{u.nombre_completo || u.email}</p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </TableCell>
                  <TableCell>
                    {u.es_superadmin ? (
                      <Badge className="gap-1 border-violet-200 bg-violet-50 text-violet-700" variant="outline">
                        <ShieldCheck className="h-3 w-3" /> Superadmin
                      </Badge>
                    ) : (
                      <Badge variant="outline">Staff</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {!u.activo ? (
                      <Badge variant="outline" className="border-zinc-300 text-zinc-500">Desactivado</Badge>
                    ) : u.invitacion_pendiente ? (
                      <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                        Invitación pendiente
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">Activo</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {u.last_login ? formatDate(u.last_login) : '—'}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {u.invitacion_pendiente && (
                          <DropdownMenuItem onClick={() => reenviar.mutate(u.id)}>
                            <Mail className="mr-2 h-4 w-4" />Reenviar invitación
                          </DropdownMenuItem>
                        )}
                        {u.activo ? (
                          <DropdownMenuItem
                            disabled={u.id === yo?.id}
                            onClick={() => toggleActivo.mutate({ id: u.id, activo: false })}
                            className="text-destructive focus:text-destructive"
                          >
                            <Ban className="mr-2 h-4 w-4" />Desactivar
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => toggleActivo.mutate({ id: u.id, activo: true })}>
                            <CheckCircle2 className="mr-2 h-4 w-4" />Activar
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <NuevoUsuarioDialog open={open} onClose={() => setOpen(false)} />
    </div>
  )
}
