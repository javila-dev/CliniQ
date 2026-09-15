'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Plus, Search, Building2, Users, MapPin, Crown, AlertCircle, Sparkles, ChevronRight,
} from 'lucide-react'
import { adminApi } from '@/lib/api/admin'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { AdminTenant } from '@/types/admin'
import { serverErrorMessage } from './_shared'

// ─── Schema ───────────────────────────────────────────────────

const nuevaClinicaSchema = z.object({
  nombre:      z.string().min(2, 'Mínimo 2 caracteres'),
  nit:         z.string().optional(),
  email:       z.string().email('Email inválido').optional().or(z.literal('')),
  telefono:    z.string().optional(),
  plan:        z.string().optional(),
  admin_email: z.string().min(1, 'El email del admin es obligatorio').email('Email inválido'),
})
type NuevaClinicaValues = z.infer<typeof nuevaClinicaSchema>

type FiltroActivo = 'todos' | 'activos' | 'inactivos'

// ─── Sheet crear clínica ────────────────────────────────────────
// Editar los datos de una clínica ya existente (incluidos los add-ons) vive
// en su página de detalle — este sheet solo cubre el alta inicial.

function NuevaClinicaSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (tenant: AdminTenant) => void
}) {
  const qc = useQueryClient()

  const { data: planesData } = useQuery({
    queryKey: ['admin-planes'],
    queryFn: () => adminApi.planes.list(),
    enabled: open,
  })
  const planes = planesData?.results ?? []

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<NuevaClinicaValues>({
    resolver: zodResolver(nuevaClinicaSchema),
  })
  const planValue = watch('plan')

  const mutation = useMutation({
    mutationFn: (data: NuevaClinicaValues) => adminApi.tenants.create({
      nombre:      data.nombre,
      nit:         data.nit || undefined,
      email:       data.email || undefined,
      telefono:    data.telefono || undefined,
      plan:        data.plan || undefined,
      admin_email: data.admin_email.trim(),
    }),
    onSuccess: (tenant) => {
      qc.invalidateQueries({ queryKey: ['admin-tenants'] })
      reset()
      onCreated(tenant)
    },
  })

  const handleClose = () => { reset(); onClose() }

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) handleClose() }}>
      <SheetContent className="w-full sm:max-w-lg p-6 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Nueva clínica</SheetTitle>
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

          <div className="space-y-1.5">
            <Label>Email del admin inicial *</Label>
            <Input
              type="email"
              placeholder="admin@clinica.com"
              {...register('admin_email')}
              className={cn(errors.admin_email && 'border-red-400')}
            />
            {errors.admin_email && <p className="text-xs text-red-500">{errors.admin_email.message}</p>}
            <p className="text-xs text-muted-foreground">Se crea el usuario administrador de la clínica y se le envía la invitación por email.</p>
          </div>

          {mutation.isError && (
            <p className="text-sm text-red-500">
              {serverErrorMessage(mutation.error) ?? 'Error al guardar. Intenta de nuevo.'}
            </p>
          )}

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={handleClose}>Cancelar</Button>
            <Button type="submit" className="flex-1" disabled={mutation.isPending}>
              {mutation.isPending ? 'Creando…' : 'Crear clínica'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}

// ─── Fila de la tabla ────────────────────────────────────────

function TenantRow({ tenant }: { tenant: AdminTenant }) {
  const router = useRouter()

  return (
    <TableRow
      className={cn('cursor-pointer hover:bg-gray-50/80', !tenant.activo && 'opacity-60')}
      onClick={() => router.push(`/console/clinicas/${tenant.id}`)}
    >
      <TableCell>
        <div className="flex items-center gap-3">
          <div className={cn(
            'h-8 w-8 rounded-lg flex items-center justify-center shrink-0',
            tenant.activo ? 'bg-rose-50' : 'bg-gray-100',
          )}>
            <Building2 className={cn('h-4 w-4', tenant.activo ? 'text-rose-500' : 'text-gray-400')} />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm leading-tight truncate">{tenant.nombre}</p>
            {tenant.nit && <p className="text-xs text-muted-foreground truncate">NIT {tenant.nit}</p>}
            {tenant.sin_admin && (
              <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                <AlertCircle className="h-2.5 w-2.5" />
                Sin admin
              </span>
            )}
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
          <span className={cn(
            tenant.plan && tenant.plan.max_usuarios > 0 && tenant.usuarios_activos >= tenant.plan.max_usuarios
              && 'font-semibold text-amber-600',
          )}>
            {tenant.usuarios_activos}
          </span>
          <span className="text-muted-foreground">
            / {tenant.plan && tenant.plan.max_usuarios > 0 ? tenant.plan.max_usuarios : '∞'}
          </span>
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

      <TableCell>
        {tenant.facial_verificacion_habilitada ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
            <Sparkles className="h-2.5 w-2.5" />
            Facial
          </span>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </TableCell>

      <TableCell className="w-8">
        <ChevronRight className="h-4 w-4 text-gray-300" />
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
          <TableCell colSpan={8} className="py-4">
            <div className="h-4 w-full max-w-md rounded bg-gray-100" />
          </TableCell>
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
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [filtro, setFiltro] = useState<FiltroActivo>('todos')
  const [sheetOpen, setSheetOpen] = useState(false)

  const params = {
    search:  search || undefined,
    activo:  filtro === 'todos' ? undefined : filtro === 'activos',
  }

  const { data, isLoading } = useQuery({
    queryKey: ['admin-tenants', params],
    queryFn:  () => adminApi.tenants.list(params),
  })

  const tenants = data?.results ?? []
  const sinAdminCount = tenants.filter(t => t.sin_admin).length

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
        <Button onClick={() => setSheetOpen(true)}>
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

      {/* Aviso de tenants huérfanos */}
      {sinAdminCount > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-700">
            {sinAdminCount === 1
              ? '1 clínica no tiene administrador.'
              : `${sinAdminCount} clínicas no tienen administrador.`}{' '}
            Entra a su página de detalle para crearle uno.
          </p>
        </div>
      )}

      {/* Tabla */}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Clínica</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Usuarios</TableHead>
              <TableHead>Sedes</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Add-ons</TableHead>
              <TableHead className="w-8" />
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
              tenants.map(t => <TenantRow key={t.id} tenant={t} />)
            )}
          </TableBody>
        </Table>
      </div>

      <NuevaClinicaSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onCreated={(tenant) => { setSheetOpen(false); router.push(`/console/clinicas/${tenant.id}`) }}
      />
    </div>
  )
}
