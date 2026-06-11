'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Plus, Search, MoreHorizontal, Building2,
  Users, MapPin, Crown, Mail, Copy, Check, AlertCircle,
} from 'lucide-react'
import { adminApi } from '@/lib/api/admin'
import { usuariosApi } from '@/lib/api/usuarios'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type { AdminTenant } from '@/types/admin'

// ─── Schema ───────────────────────────────────────────────────

const tenantSchema = z.object({
  nombre:      z.string().min(2, 'Mínimo 2 caracteres'),
  nit:         z.string().optional(),
  email:       z.string().email('Email inválido').optional().or(z.literal('')),
  telefono:    z.string().optional(),
  plan:        z.string().optional(),
  admin_email: z.string().email('Email inválido').optional().or(z.literal('')),
})

type TenantFormValues = z.infer<typeof tenantSchema>

type FiltroActivo = 'todos' | 'activos' | 'inactivos'

// ─── Sheet crear / editar tenant ─────────────────────────────

function TenantSheet({
  tenant,
  open,
  onClose,
}: {
  tenant: AdminTenant | null
  open: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()
  const isEdit = !!tenant

  const { data: planesData } = useQuery({
    queryKey: ['admin-planes'],
    queryFn: () => adminApi.planes.list(),
  })
  const planes = planesData?.results ?? []

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<TenantFormValues>({
    resolver: zodResolver(tenantSchema),
    values: tenant ? {
      nombre:   tenant.nombre,
      nit:      tenant.nit ?? '',
      email:    tenant.email ?? '',
      telefono: tenant.telefono ?? '',
      plan:     tenant.plan?.id ?? '',
    } : undefined,
  })

  const planValue = watch('plan')

  const mutation = useMutation({
    mutationFn: (data: TenantFormValues) => {
      const payload = {
        nombre:   data.nombre,
        nit:      data.nit || undefined,
        email:    data.email || undefined,
        telefono: data.telefono || undefined,
        plan:     data.plan || undefined,
      }
      if (isEdit) return adminApi.tenants.update(tenant!.id, payload)
      return adminApi.tenants.create({
        ...payload,
        admin_email: data.admin_email || undefined,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tenants'] })
      reset()
      onClose()
    },
  })

  const handleClose = () => { reset(); onClose() }

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) handleClose() }}>
      <SheetContent className="w-full sm:max-w-lg p-6 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Editar clínica' : 'Nueva clínica'}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="mt-6 space-y-5">

          <div className="space-y-1.5">
            <Label>Nombre *</Label>
            <Input placeholder="Clínica Ejemplo" {...register('nombre')} className={cn(errors.nombre && 'border-red-400')} />
            {errors.nombre && <p className="text-xs text-red-500">{errors.nombre.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>NIT</Label>
              <Input placeholder="900123456-1" {...register('nit')} />
            </div>
            <div className="space-y-1.5">
              <Label>Teléfono</Label>
              <Input placeholder="3001234567" {...register('telefono')} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" placeholder="admin@clinica.com" {...register('email')} className={cn(errors.email && 'border-red-400')} />
            {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Plan</Label>
            <Select value={planValue ?? ''} onValueChange={v => setValue('plan', v === '__none__' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Sin plan asignado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sin plan</SelectItem>
                {planes.filter(p => p.activo).map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!isEdit && (
            <div className="space-y-1.5">
              <Label>Email del admin inicial</Label>
              <Input
                type="email"
                placeholder="admin@clinica.com (opcional)"
                {...register('admin_email')}
                className={cn(errors.admin_email && 'border-red-400')}
              />
              {errors.admin_email && <p className="text-xs text-red-500">{errors.admin_email.message}</p>}
              <p className="text-xs text-muted-foreground">Si se ingresa, se crea un usuario admin y se envía invitación por email.</p>
            </div>
          )}

          {mutation.isError && (
            <p className="text-sm text-red-500">Error al guardar. Intenta de nuevo.</p>
          )}

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={handleClose}>Cancelar</Button>
            <Button type="submit" className="flex-1" disabled={mutation.isPending}>
              {mutation.isPending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear clínica'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}

// ─── Dialog reenviar invitación ──────────────────────────────

type InvitacionResult = { ok: boolean; url: string; email_enviado: boolean }

function InvitacionDialog({
  usuario,
  open,
  onClose,
}: {
  usuario: { id: string; email: string } | null
  open: boolean
  onClose: () => void
}) {
  const [result, setResult] = useState<InvitacionResult | null>(null)
  const [copied, setCopied]   = useState(false)

  const mutation = useMutation({
    mutationFn: () => usuariosApi.reenviarInvitacion(usuario!.id),
    onSuccess: (data) => setResult(data),
  })

  const handleCopy = () => {
    if (!result) return
    navigator.clipboard.writeText(result.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleClose = () => {
    setResult(null)
    setCopied(false)
    onClose()
  }

  const isAlreadyActivated =
    mutation.isError &&
    (mutation.error as any)?.response?.data?.code === 'USER_ALREADY_ACTIVATED'

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reenviar invitación</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!result && (
            <>
              <p className="text-sm text-muted-foreground">
                Se generará un nuevo link de activación para{' '}
                <span className="font-medium text-foreground">{usuario?.email}</span>.
                El link anterior quedará invalidado.
              </p>

              {isAlreadyActivated ? (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-amber-700">Este usuario ya activó su cuenta y puede iniciar sesión.</p>
                </div>
              ) : mutation.isError ? (
                <p className="text-sm text-red-500">Error al generar el link. Intenta de nuevo.</p>
              ) : null}

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={handleClose}>Cancelar</Button>
                <Button
                  className="flex-1"
                  disabled={mutation.isPending || isAlreadyActivated}
                  onClick={() => mutation.mutate()}
                >
                  <Mail className="h-4 w-4 mr-2" />
                  {mutation.isPending ? 'Generando…' : 'Generar y enviar'}
                </Button>
              </div>
            </>
          )}

          {result && (
            <div className="space-y-4">
              {result.email_enviado ? (
                <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3">
                  <Check className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-green-700">
                    Email enviado a <span className="font-medium">{usuario?.email}</span>.
                    Si no llega, comparte el link manualmente.
                  </p>
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-amber-700">
                    El email no se envió (servidor de correo no configurado). Copia el link y compártelo manualmente.
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Link de activación</p>
                <div className="flex items-center gap-2 rounded-lg border bg-gray-50 p-2.5">
                  <p className="text-xs text-muted-foreground flex-1 truncate font-mono">{result.url}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 h-7 px-2 gap-1.5"
                    onClick={handleCopy}
                  >
                    {copied
                      ? <><Check className="h-3.5 w-3.5 text-green-600" /><span className="text-xs text-green-600">Copiado</span></>
                      : <><Copy className="h-3.5 w-3.5" /><span className="text-xs">Copiar</span></>
                    }
                  </Button>
                </div>
              </div>

              <Button className="w-full" variant="outline" onClick={handleClose}>Cerrar</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Fila de la tabla ────────────────────────────────────────

function TenantRow({
  tenant,
  onEdit,
  onToggle,
  onReenviar,
}: {
  tenant: AdminTenant
  onEdit: (t: AdminTenant) => void
  onToggle: (t: AdminTenant) => void
  onReenviar: (t: AdminTenant) => void
}) {
  return (
    <TableRow className={cn(!tenant.activo && 'opacity-60')}>
      <TableCell>
        <div className="flex items-center gap-3">
          <div className={cn(
            'h-8 w-8 rounded-lg flex items-center justify-center shrink-0',
            tenant.activo ? 'bg-rose-50' : 'bg-gray-100'
          )}>
            <Building2 className={cn('h-4 w-4', tenant.activo ? 'text-rose-500' : 'text-gray-400')} />
          </div>
          <div>
            <p className="font-medium text-sm leading-tight">{tenant.nombre}</p>
            {tenant.nit && <p className="text-xs text-muted-foreground">NIT {tenant.nit}</p>}
          </div>
        </div>
      </TableCell>

      <TableCell className="text-sm text-muted-foreground">
        {tenant.email ?? <span className="text-gray-300">—</span>}
      </TableCell>

      <TableCell>
        {tenant.plan ? (
          <div className="flex items-center gap-1.5">
            <Crown className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-sm font-medium">{tenant.plan.nombre}</span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">Sin plan</span>
        )}
      </TableCell>

      <TableCell>
        <div className="flex items-center gap-1.5 text-sm">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{tenant.usuarios_activos}</span>
          <span className="text-muted-foreground">/ {tenant.total_usuarios}</span>
        </div>
      </TableCell>

      <TableCell>
        <div className="flex items-center gap-1.5 text-sm">
          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{tenant.total_sedes}</span>
        </div>
      </TableCell>

      <TableCell>
        <Badge variant={tenant.activo ? 'success' : 'muted'}>
          {tenant.activo ? 'Activa' : 'Inactiva'}
        </Badge>
      </TableCell>

      <TableCell className="text-xs text-muted-foreground">
        {new Date(tenant.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
      </TableCell>

      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(tenant)}>Editar</DropdownMenuItem>
            {tenant.admin_usuario_pendiente && (
              <DropdownMenuItem onClick={() => onReenviar(tenant)}>
                <Mail className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                Reenviar invitación admin
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onToggle(tenant)}
              className={tenant.activo ? 'text-red-600 focus:text-red-600' : 'text-green-600 focus:text-green-600'}
            >
              {tenant.activo ? 'Inactivar' : 'Activar'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i} className="animate-pulse">
          <TableCell><div className="h-4 w-40 rounded bg-gray-100" /></TableCell>
          <TableCell><div className="h-4 w-32 rounded bg-gray-100" /></TableCell>
          <TableCell><div className="h-4 w-20 rounded bg-gray-100" /></TableCell>
          <TableCell><div className="h-4 w-16 rounded bg-gray-100" /></TableCell>
          <TableCell><div className="h-4 w-12 rounded bg-gray-100" /></TableCell>
          <TableCell><div className="h-5 w-16 rounded-full bg-gray-100" /></TableCell>
          <TableCell><div className="h-4 w-24 rounded bg-gray-100" /></TableCell>
          <TableCell><div className="h-8 w-8 rounded bg-gray-100" /></TableCell>
        </TableRow>
      ))}
    </>
  )
}

// ─── Página principal ─────────────────────────────────────────

const FILTROS: { key: FiltroActivo; label: string }[] = [
  { key: 'todos',    label: 'Todos'    },
  { key: 'activos',  label: 'Activas'  },
  { key: 'inactivos',label: 'Inactivas'},
]

export default function TenantsPage() {
  const qc = useQueryClient()
  const [search, setSearch]         = useState('')
  const [filtro, setFiltro]             = useState<FiltroActivo>('todos')
  const [sheetOpen, setSheetOpen]       = useState(false)
  const [editando, setEditando]         = useState<AdminTenant | null>(null)
  const [invitacionOpen, setInvitacionOpen] = useState(false)
  const [reenviarTenant, setReenviarTenant] = useState<AdminTenant | null>(null)

  const params = {
    search:  search || undefined,
    activo:  filtro === 'todos' ? undefined : filtro === 'activos',
  }

  const { data, isLoading } = useQuery({
    queryKey: ['admin-tenants', params],
    queryFn:  () => adminApi.tenants.list(params),
  })

  const toggleMutation = useMutation({
    mutationFn: (t: AdminTenant) => adminApi.tenants.update(t.id, { activo: !t.activo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-tenants'] }),
  })

  const handleEdit          = (t: AdminTenant) => { setEditando(t); setSheetOpen(true) }
  const handleClose         = () => { setSheetOpen(false); setEditando(null) }
  const handleReenviar      = (t: AdminTenant) => { setReenviarTenant(t); setInvitacionOpen(true) }
  const handleCloseInvitacion = () => { setInvitacionOpen(false); setReenviarTenant(null) }

  const tenants = data?.results ?? []

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Clínicas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isLoading ? 'Cargando…' : `${data?.count ?? 0} clínica${(data?.count ?? 0) !== 1 ? 's' : ''} registradas`}
          </p>
        </div>
        <Button onClick={() => { setEditando(null); setSheetOpen(true) }}>
          <Plus className="h-4 w-4 mr-1.5" />
          Nueva clínica
        </Button>
      </div>

      {/* Filtros y búsqueda */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, NIT o email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-white"
          />
        </div>

        <div className="flex rounded-lg border bg-white overflow-hidden">
          {FILTROS.map(f => (
            <button
              key={f.key}
              onClick={() => setFiltro(f.key)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-colors',
                filtro === f.key
                  ? 'bg-rose-500 text-white'
                  : 'text-muted-foreground hover:text-foreground hover:bg-gray-50'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla */}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Clínica</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Usuarios</TableHead>
              <TableHead>Sedes</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Creada</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton />
            ) : tenants.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-16 text-center">
                  <Building2 className="h-10 w-10 text-muted-foreground/20 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No hay clínicas{search ? ' que coincidan con la búsqueda' : ''}</p>
                </TableCell>
              </TableRow>
            ) : (
              tenants.map(t => (
                <TenantRow
                  key={t.id}
                  tenant={t}
                  onEdit={handleEdit}
                  onToggle={t => toggleMutation.mutate(t)}
                  onReenviar={handleReenviar}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <TenantSheet tenant={editando} open={sheetOpen} onClose={handleClose} />
      <InvitacionDialog
        usuario={reenviarTenant?.admin_usuario_pendiente ?? null}
        open={invitacionOpen}
        onClose={handleCloseInvitacion}
      />
    </div>
  )
}
