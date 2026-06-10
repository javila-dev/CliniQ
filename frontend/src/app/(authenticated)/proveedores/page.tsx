'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Search, Truck, ShoppingCart, ChevronLeft, ChevronRight,
  Building2, Package, CheckCircle2, Clock, AlertCircle, XCircle,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { proveedoresApi } from '@/lib/api/proveedores'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDebounce } from '@/hooks/useDebounce'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { canAccess } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import type { Proveedor, OrdenCompra, EstadoOrdenCompra } from '@/types/proveedores'

// ─── constants ───────────────────────────────────────────────

const CATEGORIA_LABEL: Record<string, string> = {
  insumos_medicos: 'Insumos médicos',
  productos_belleza: 'Productos de belleza',
  equipos: 'Equipos',
  papeleria: 'Papelería',
  otro: 'Otro',
}

const ESTADO_OC_CONFIG: Record<EstadoOrdenCompra, { label: string; icon: React.ElementType; className: string }> = {
  borrador:         { label: 'Borrador',          icon: Clock,         className: 'bg-gray-50 text-gray-600 ring-gray-200' },
  enviada:          { label: 'Enviada',            icon: ShoppingCart,  className: 'bg-blue-50 text-blue-600 ring-blue-200' },
  recibida_parcial: { label: 'Rec. parcial',       icon: AlertCircle,   className: 'bg-amber-50 text-amber-600 ring-amber-200' },
  recibida_total:   { label: 'Recibida',           icon: CheckCircle2,  className: 'bg-green-50 text-green-700 ring-green-200' },
  cancelada:        { label: 'Cancelada',          icon: XCircle,       className: 'bg-red-50 text-red-600 ring-red-200' },
}

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ─── Nuevo proveedor sheet ────────────────────────────────────

const proveedorSchema = z.object({
  nombre: z.string().min(2, 'Mínimo 2 caracteres'),
  nit: z.string().min(3, 'NIT requerido'),
  categoria: z.enum(['insumos_medicos', 'productos_belleza', 'equipos', 'papeleria', 'otro']),
  contacto: z.string().optional(),
  telefono: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
})

function NuevoProveedorSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(proveedorSchema),
    defaultValues: { categoria: 'insumos_medicos' as const },
  })

  const mutation = useMutation({
    mutationFn: proveedoresApi.createProveedor,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['proveedores'] }); reset(); onClose() },
  })

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) { reset(); onClose() } }}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader><SheetTitle>Nuevo proveedor</SheetTitle></SheetHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d as Parameters<typeof proveedoresApi.createProveedor>[0]))} className="mt-6 space-y-4">

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

          <div className="space-y-1.5">
            <Label>Contacto</Label>
            <Input placeholder="Nombre del contacto" {...register('contacto')} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Teléfono</Label>
              <Input placeholder="3001234567" {...register('telefono')} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" placeholder="proveedor@empresa.com" {...register('email')} className={cn(errors.email && 'border-red-400')} />
              {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
            </div>
          </div>

          {mutation.isError && <p className="text-sm text-red-500">Error al crear proveedor.</p>}

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => { reset(); onClose() }}>Cancelar</Button>
            <Button type="submit" className="flex-1" disabled={mutation.isPending}>
              {mutation.isPending ? 'Guardando…' : 'Crear proveedor'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}

// ─── Proveedor row ────────────────────────────────────────────

function ProveedorRow({ proveedor }: { proveedor: Proveedor }) {
  return (
    <div className="flex items-center gap-4 px-5 py-3.5 border-b border-gray-100 last:border-0 hover:bg-gray-50/50 transition-colors">
      <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-blue-50 shrink-0">
        <Building2 className="h-4 w-4 text-blue-600" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{proveedor.nombre}</p>
        <p className="text-xs text-muted-foreground truncate">NIT: {proveedor.nit} · {proveedor.contacto || '—'}</p>
      </div>

      <div className="hidden sm:block w-40 shrink-0">
        <p className="text-sm text-muted-foreground truncate">{proveedor.telefono || '—'}</p>
        <p className="text-xs text-muted-foreground truncate">{proveedor.email || '—'}</p>
      </div>

      <span className="hidden md:inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ring-1 bg-gray-50 text-gray-700 ring-gray-200 shrink-0">
        {CATEGORIA_LABEL[proveedor.categoria] ?? proveedor.categoria}
      </span>

      <span className={cn(
        'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ring-1 shrink-0',
        proveedor.activo ? 'bg-green-50 text-green-700 ring-green-200' : 'bg-gray-100 text-gray-500 ring-gray-200'
      )}>
        <span className={cn('h-1.5 w-1.5 rounded-full', proveedor.activo ? 'bg-green-500' : 'bg-gray-400')} />
        {proveedor.activo ? 'Activo' : 'Inactivo'}
      </span>
    </div>
  )
}

// ─── Orden row ────────────────────────────────────────────────

function OrdenRow({ orden, onVerDetalle }: { orden: OrdenCompra; onVerDetalle: (o: OrdenCompra) => void }) {
  const cfg = ESTADO_OC_CONFIG[orden.estado]
  const Icon = cfg.icon

  return (
    <div
      onClick={() => onVerDetalle(orden)}
      className="flex items-center gap-4 px-5 py-3.5 border-b border-gray-100 last:border-0 hover:bg-gray-50/50 transition-colors cursor-pointer"
    >
      <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-purple-50 shrink-0">
        <ShoppingCart className="h-4 w-4 text-purple-600" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">{orden.numero}</p>
        <p className="text-xs text-muted-foreground truncate">{orden.proveedor_nombre ?? '—'} · {fmtDate(orden.fecha)}</p>
      </div>

      <div className="hidden sm:block w-32 shrink-0 text-right">
        <p className="text-sm font-semibold text-foreground">{COP.format(Number(orden.total))}</p>
        <p className="text-xs text-muted-foreground">{orden.items?.length ?? 0} ítems</p>
      </div>

      <span className={cn('inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ring-1 shrink-0', cfg.className)}>
        <Icon className="h-3 w-3" />
        {cfg.label}
      </span>
    </div>
  )
}

// ─── Orden detalle sheet ──────────────────────────────────────

function OrdenDetalleSheet({
  orden,
  open,
  onClose,
}: {
  orden: OrdenCompra | null
  open: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()

  const recibirMutation = useMutation({
    mutationFn: (items: { item_id: string; cantidad: string }[]) =>
      proveedoresApi.recibirOrden(orden!.id, { items_recibidos: items }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ordenes'] })
      onClose()
    },
  })

  const [cantidades, setCantidades] = useState<Record<string, string>>({})

  if (!orden) return null

  const cfg = ESTADO_OC_CONFIG[orden.estado]
  const Icon = cfg.icon
  const puedeRecibir = orden.estado === 'enviada' || orden.estado === 'recibida_parcial'

  const handleRecibir = () => {
    const items = orden.items
      .filter((i) => cantidades[i.id] && Number(cantidades[i.id]) > 0)
      .map((i) => ({ item_id: i.id, cantidad: cantidades[i.id] }))
    if (items.length === 0) return
    recibirMutation.mutate(items)
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {orden.numero}
            <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ring-1', cfg.className)}>
              <Icon className="h-3 w-3" />
              {cfg.label}
            </span>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-5 space-y-4">
          <div className="rounded-lg bg-muted/40 p-3 text-sm space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Proveedor</span>
              <span className="font-medium">{orden.proveedor_nombre ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fecha</span>
              <span>{fmtDate(orden.fecha)}</span>
            </div>
            {orden.fecha_entrega_esperada && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Entrega esperada</span>
                <span>{fmtDate(orden.fecha_entrega_esperada)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold border-t pt-1.5 mt-1">
              <span>Total</span>
              <span>{COP.format(Number(orden.total))}</span>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Ítems</p>
            <div className="space-y-2">
              {orden.items.map((item) => (
                <div key={item.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">{item.insumo_nombre ?? item.insumo}</p>
                    <p className="text-sm font-semibold text-foreground shrink-0">{COP.format(Number(item.subtotal))}</p>
                  </div>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span>Cant: {item.cantidad}</span>
                    <span>Precio u.: {COP.format(Number(item.precio_unitario))}</span>
                    <span>Recibido: {item.cantidad_recibida}</span>
                  </div>

                  {puedeRecibir && Number(item.pendiente_recibir) > 0 && (
                    <div className="flex items-center gap-2 pt-1">
                      <Label className="text-xs shrink-0">Recibir ahora:</Label>
                      <Input
                        type="number"
                        step="0.001"
                        min="0"
                        max={item.pendiente_recibir}
                        placeholder={item.pendiente_recibir}
                        value={cantidades[item.id] ?? ''}
                        onChange={(e) => setCantidades((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        className="h-7 text-xs"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {puedeRecibir && (
            <Button
              className="w-full"
              onClick={handleRecibir}
              disabled={recibirMutation.isPending || Object.values(cantidades).every((v) => !v || Number(v) <= 0)}
            >
              {recibirMutation.isPending ? 'Registrando…' : 'Registrar recepción'}
            </Button>
          )}

          {recibirMutation.isError && (
            <p className="text-sm text-red-500 text-center">Error al registrar recepción. Revisa las cantidades.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 px-5 py-3.5 border-b border-gray-100 animate-pulse">
      <div className="h-9 w-9 rounded-lg bg-gray-100 shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 w-40 rounded bg-gray-100" />
        <div className="h-3 w-28 rounded bg-gray-100" />
      </div>
      <div className="hidden sm:block h-8 w-24 rounded bg-gray-100" />
      <div className="h-6 w-20 rounded bg-gray-100" />
    </div>
  )
}

function Pagination({ page, total, pageSize, onPage }: {
  page: number; total: number; pageSize: number; onPage: (p: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between px-1 mt-5">
      <p className="text-sm text-muted-foreground">
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total}
      </p>
      <div className="flex items-center gap-1">
        <button onClick={() => onPage(page - 1)} disabled={page === 1} className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button onClick={() => onPage(page + 1)} disabled={page >= totalPages} className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────

export default function ProveedoresPage() {
  return <RoleGuard check={canAccess.proveedores}><ProveedoresContent /></RoleGuard>
}

function ProveedoresContent() {
  const [tab, setTab] = useState<'proveedores' | 'ordenes'>('proveedores')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [nuevoProvOpen, setNuevoProvOpen] = useState(false)
  const [ordenDetalle, setOrdenDetalle] = useState<OrdenCompra | null>(null)
  const debouncedSearch = useDebounce(search, 400)

  const { data: provData, isLoading: provLoading } = useQuery({
    queryKey: ['proveedores', { search: debouncedSearch, page }],
    queryFn: () => proveedoresApi.listProveedores({ search: debouncedSearch || undefined, page, page_size: 25 }),
    enabled: tab === 'proveedores',
  })

  const { data: ordData, isLoading: ordLoading } = useQuery({
    queryKey: ['ordenes', { search: debouncedSearch, estado: filtroEstado, page }],
    queryFn: () => proveedoresApi.listOrdenes({
      search: debouncedSearch || undefined,
      estado: filtroEstado !== 'todos' ? filtroEstado : undefined,
      page,
      page_size: 25,
    }),
    enabled: tab === 'ordenes',
  })

  const handleTabChange = (v: string) => {
    setTab(v as typeof tab)
    setSearch('')
    setPage(1)
  }

  return (
    <div className="space-y-5">

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground">Proveedores</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {tab === 'proveedores'
              ? (provLoading ? 'Cargando…' : `${provData?.count ?? 0} proveedores`)
              : (ordLoading ? 'Cargando…' : `${ordData?.count ?? 0} órdenes de compra`)}
          </p>
        </div>
        {tab === 'proveedores' && (
          <Button onClick={() => setNuevoProvOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nuevo proveedor
          </Button>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-gray-100 bg-blue-50 px-4 py-3 flex items-center gap-3">
          <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-white shadow-sm shrink-0">
            <Truck className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Proveedores</p>
            <p className="text-base font-bold text-blue-600">{provData?.count ?? '—'}</p>
          </div>
        </div>
        <div className="rounded-xl border border-gray-100 bg-purple-50 px-4 py-3 flex items-center gap-3">
          <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-white shadow-sm shrink-0">
            <Package className="h-4 w-4 text-purple-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Órdenes</p>
            <p className="text-base font-bold text-purple-600">{ordData?.count ?? '—'}</p>
          </div>
        </div>
        <div className="rounded-xl border border-gray-100 bg-amber-50 px-4 py-3 flex items-center gap-3">
          <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-white shadow-sm shrink-0">
            <AlertCircle className="h-4 w-4 text-amber-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Pendientes</p>
            <p className="text-base font-bold text-amber-600">—</p>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="proveedores"><Truck className="h-3.5 w-3.5 mr-1.5" />Proveedores</TabsTrigger>
          <TabsTrigger value="ordenes"><ShoppingCart className="h-3.5 w-3.5 mr-1.5" />Órdenes de compra</TabsTrigger>
        </TabsList>

        {/* Proveedores tab */}
        <TabsContent value="proveedores" className="mt-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, NIT…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="pl-9 bg-white"
            />
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {provLoading
              ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
              : !provData?.results.length
              ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Truck className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-semibold">Sin proveedores</p>
                  <p className="text-sm text-muted-foreground mt-1">Agrega el primer proveedor</p>
                </div>
              )
              : provData.results.map((p) => <ProveedorRow key={p.id} proveedor={p} />)
            }
          </div>
          <Pagination page={page} total={provData?.count ?? 0} pageSize={25} onPage={setPage} />
        </TabsContent>

        {/* Órdenes tab */}
        <TabsContent value="ordenes" className="mt-4 space-y-3">
          <div className="flex gap-2.5">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Número, proveedor…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className="pl-9 bg-white"
              />
            </div>
            <Select value={filtroEstado} onValueChange={(v) => { setFiltroEstado(v); setPage(1) }}>
              <SelectTrigger className="w-44 bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los estados</SelectItem>
                <SelectItem value="borrador">Borrador</SelectItem>
                <SelectItem value="enviada">Enviada</SelectItem>
                <SelectItem value="recibida_parcial">Recibida parcial</SelectItem>
                <SelectItem value="recibida_total">Recibida total</SelectItem>
                <SelectItem value="cancelada">Cancelada</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {ordLoading
              ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
              : !ordData?.results.length
              ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <ShoppingCart className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-semibold">Sin órdenes</p>
                  <p className="text-sm text-muted-foreground mt-1">Las órdenes de compra aparecerán aquí</p>
                </div>
              )
              : ordData.results.map((o) => (
                <OrdenRow key={o.id} orden={o} onVerDetalle={setOrdenDetalle} />
              ))
            }
          </div>
          <Pagination page={page} total={ordData?.count ?? 0} pageSize={25} onPage={setPage} />
        </TabsContent>
      </Tabs>

      <NuevoProveedorSheet open={nuevoProvOpen} onClose={() => setNuevoProvOpen(false)} />
      <OrdenDetalleSheet orden={ordenDetalle} open={!!ordenDetalle} onClose={() => setOrdenDetalle(null)} />
    </div>
  )
}
