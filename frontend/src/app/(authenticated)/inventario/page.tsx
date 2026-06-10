'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Search, AlertTriangle, Package, ChevronLeft, ChevronRight,
  BarChart2, TrendingDown, Layers,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { inventarioApi } from '@/lib/api/inventario'
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
import type { Insumo } from '@/types/inventario'

// ─── constants ───────────────────────────────────────────────

const UNIDAD_LABEL: Record<string, string> = {
  unidad: 'Unidad', ml: 'ml', gr: 'gr', cm: 'cm', par: 'Par', caja: 'Caja',
}

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

// ─── Ajuste stock dialog ──────────────────────────────────────

const ajusteSchema = z.object({
  cantidad_nueva: z.string().min(1, 'Requerido'),
  motivo: z.string().min(3, 'Describe el motivo'),
})

function AjusteStockSheet({
  insumo,
  open,
  onClose,
}: {
  insumo: Insumo | null
  open: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()
  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(ajusteSchema),
  })

  const mutation = useMutation({
    mutationFn: (data: { cantidad_nueva: string; motivo: string }) =>
      inventarioApi.ajustarStock(insumo!.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['insumos'] })
      qc.invalidateQueries({ queryKey: ['alertas-stock'] })
      reset()
      onClose()
    },
  })

  if (!insumo) return null

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <SheetContent className="w-full sm:max-w-md p-6">
        <SheetHeader>
          <SheetTitle>Ajustar stock — {insumo.nombre}</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="mt-6 space-y-4">
          <div className="rounded-lg bg-muted/40 p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Stock actual</span>
              <span className="font-semibold">{insumo.stock_actual} {UNIDAD_LABEL[insumo.unidad_medida]}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Stock mínimo</span>
              <span>{insumo.stock_minimo} {UNIDAD_LABEL[insumo.unidad_medida]}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cantidad_nueva">Nueva cantidad</Label>
            <Input
              id="cantidad_nueva"
              type="number"
              step="0.001"
              min="0"
              placeholder="0.000"
              {...register('cantidad_nueva')}
              className={cn(errors.cantidad_nueva && 'border-red-400')}
            />
            {errors.cantidad_nueva && (
              <p className="text-xs text-red-500">{errors.cantidad_nueva.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="motivo">Motivo del ajuste</Label>
            <Input
              id="motivo"
              placeholder="Ej. Conteo físico de cierre"
              {...register('motivo')}
              className={cn(errors.motivo && 'border-red-400')}
            />
            {errors.motivo && (
              <p className="text-xs text-red-500">{errors.motivo.message}</p>
            )}
          </div>

          {mutation.isError && (
            <p className="text-sm text-red-500">Error al ajustar stock. Intenta de nuevo.</p>
          )}

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={mutation.isPending}>
              {mutation.isPending ? 'Guardando…' : 'Guardar ajuste'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}

// ─── Nuevo insumo sheet ───────────────────────────────────────

const insumoSchema = z.object({
  nombre: z.string().min(2, 'Mínimo 2 caracteres'),
  categoria: z.string().min(1, 'Selecciona categoría'),
  es_consumo_interno: z.boolean(),
  es_venta_retail: z.boolean(),
  unidad_medida: z.enum(['unidad', 'ml', 'gr', 'cm', 'par', 'caja']),
  stock_minimo: z.string().optional(),
  costo_promedio: z.string().optional(),
  precio_venta: z.string().optional(),
}).refine(d => d.es_consumo_interno || d.es_venta_retail, {
  message: 'Selecciona al menos un uso',
  path: ['es_consumo_interno'],
})

function NuevoInsumoSheet({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()
  const { data: catData } = useQuery({
    queryKey: ['categorias-insumo'],
    queryFn: () => inventarioApi.listCategorias(),
    enabled: open,
  })

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(insumoSchema),
    defaultValues: { es_consumo_interno: true, es_venta_retail: false, unidad_medida: 'unidad' as const },
  })

  const esConsumo = watch('es_consumo_interno')
  const esRetail = watch('es_venta_retail')

  const mutation = useMutation({
    mutationFn: inventarioApi.createInsumo,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['insumos'] })
      reset()
      onClose()
    },
  })

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) { reset(); onClose() } }}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto p-6">
        <SheetHeader>
          <SheetTitle>Nuevo insumo</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d as Parameters<typeof inventarioApi.createInsumo>[0]))} className="mt-6 space-y-4">

          <div className="space-y-1.5">
            <Label>Nombre *</Label>
            <Input placeholder="Nombre del insumo" {...register('nombre')} className={cn(errors.nombre && 'border-red-400')} />
            {errors.nombre && <p className="text-xs text-red-500">{errors.nombre.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Categoría *</Label>
            <select {...register('categoria')} className={cn(
              'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm',
              errors.categoria && 'border-red-400'
            )}>
              <option value="">Seleccionar…</option>
              {catData?.results.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
            {errors.categoria && <p className="text-xs text-red-500">{errors.categoria.message}</p>}
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
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Stock mínimo</Label>
              <Input type="number" step="0.001" min="0" placeholder="0" {...register('stock_minimo')} />
            </div>
            <div className="space-y-1.5">
              <Label>Costo promedio</Label>
              <Input type="number" step="0.01" min="0" placeholder="0.00" {...register('costo_promedio')} />
            </div>
          </div>

          {esRetail && (
            <div className="space-y-1.5">
              <Label>Precio de venta</Label>
              <Input type="number" step="0.01" min="0" placeholder="0.00" {...register('precio_venta')} />
            </div>
          )}

          {mutation.isError && (
            <p className="text-sm text-red-500">Error al crear el insumo.</p>
          )}

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => { reset(); onClose() }}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={mutation.isPending}>
              {mutation.isPending ? 'Guardando…' : 'Crear insumo'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}

// ─── Insumo row ───────────────────────────────────────────────

function InsumoRow({ insumo, onAjustar }: { insumo: Insumo; onAjustar: (i: Insumo) => void }) {
  const stockBajo = insumo.stock_bajo

  return (
    <div className="flex items-center gap-4 px-5 py-3.5 border-b border-gray-100 last:border-0 hover:bg-gray-50/50 transition-colors">
      <div className={cn(
        'flex items-center justify-center h-9 w-9 rounded-lg shrink-0',
        stockBajo ? 'bg-red-100' : 'bg-emerald-50'
      )}>
        {stockBajo
          ? <AlertTriangle className="h-4 w-4 text-red-500" />
          : <Package className="h-4 w-4 text-emerald-600" />}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{insumo.nombre}</p>
        <p className="text-xs text-muted-foreground">
          {insumo.categoria_nombre} · {[
            insumo.es_consumo_interno && 'Consumo interno',
            insumo.es_venta_retail && 'Venta retail',
          ].filter(Boolean).join(' & ')}
        </p>
      </div>

      <div className="hidden sm:block w-32 shrink-0">
        <p className={cn('text-sm font-bold', stockBajo ? 'text-red-600' : 'text-foreground')}>
          {insumo.stock_actual}
        </p>
        <p className="text-xs text-muted-foreground">mín: {insumo.stock_minimo} {UNIDAD_LABEL[insumo.unidad_medida]}</p>
      </div>

      <div className="hidden md:block w-32 shrink-0">
        <p className="text-sm text-muted-foreground">{COP.format(Number(insumo.costo_promedio))}</p>
        <p className="text-xs text-muted-foreground">costo prom.</p>
      </div>

      <div className="hidden lg:block w-32 shrink-0">
        <p className="text-sm text-muted-foreground">{COP.format(Number(insumo.valor_stock))}</p>
        <p className="text-xs text-muted-foreground">valor en stock</p>
      </div>

      {stockBajo && (
        <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-red-50 text-red-600 ring-1 ring-red-200 shrink-0">
          <TrendingDown className="h-3 w-3" />
          Stock bajo
        </span>
      )}

      <Button
        variant="outline"
        size="sm"
        className="shrink-0 text-xs h-7"
        onClick={() => onAjustar(insumo)}
      >
        Ajustar
      </Button>
    </div>
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
      <div className="hidden sm:block h-8 w-32 rounded bg-gray-100" />
      <div className="hidden md:block h-8 w-32 rounded bg-gray-100" />
      <div className="h-7 w-16 rounded bg-gray-100" />
    </div>
  )
}

// ─── Pagination ───────────────────────────────────────────────

function Pagination({ page, total, pageSize, onPage }: {
  page: number; total: number; pageSize: number; onPage: (p: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between px-1 mt-5">
      <p className="text-sm text-muted-foreground">
        {total === 0 ? 'Sin resultados' : (
          <>Mostrando <span className="font-medium">{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)}</span> de <span className="font-medium">{total}</span></>
        )}
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

export default function InventarioPage() {
  return <RoleGuard check={canAccess.inventario}><InventarioContent /></RoleGuard>
}

function InventarioContent() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'consumo_interno' | 'venta_retail'>('todos')
  const [tab, setTab] = useState<'insumos' | 'alertas'>('insumos')
  const [ajustarInsumo, setAjustarInsumo] = useState<Insumo | null>(null)
  const [nuevoOpen, setNuevoOpen] = useState(false)
  const debouncedSearch = useDebounce(search, 400)

  const params = {
    search: debouncedSearch || undefined,
    es_consumo_interno: filtroTipo === 'consumo_interno' ? true : undefined,
    es_venta_retail: filtroTipo === 'venta_retail' ? true : undefined,
    page,
    page_size: 25,
  }

  const { data, isLoading } = useQuery({
    queryKey: ['insumos', params],
    queryFn: () => inventarioApi.listInsumos(params),
  })

  const { data: alertas } = useQuery({
    queryKey: ['alertas-stock'],
    queryFn: () => inventarioApi.alertasStock(),
  })

  const alertasCount = alertas?.length ?? 0
  const total = data?.count ?? 0

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground">Inventario</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isLoading ? 'Cargando…' : `${total} insumo${total !== 1 ? 's' : ''} registrados`}
          </p>
        </div>
        <Button onClick={() => setNuevoOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          Nuevo insumo
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { icon: Layers, label: 'Total insumos', value: total, color: 'text-foreground', bg: 'bg-gray-50' },
          {
            icon: AlertTriangle,
            label: 'Stock bajo',
            value: alertasCount,
            color: alertasCount > 0 ? 'text-red-600' : 'text-green-600',
            bg: alertasCount > 0 ? 'bg-red-50' : 'bg-green-50',
          },
          { icon: BarChart2, label: 'Categorías', value: '—', color: 'text-blue-600', bg: 'bg-blue-50' },
        ].map(({ icon: Icon, label, value, color, bg }) => (
          <div key={label} className={cn('rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-3', bg)}>
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-white shadow-sm shrink-0">
              <Icon className={cn('h-4 w-4', color)} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={cn('text-base font-bold', color)}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="insumos">Todos</TabsTrigger>
          <TabsTrigger value="alertas" className="relative">
            Alertas de stock
            {alertasCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-[1rem] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
                {alertasCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="insumos" className="mt-4 space-y-3">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar insumo…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className="pl-9 bg-white"
              />
            </div>
            <Select value={filtroTipo} onValueChange={(v) => { setFiltroTipo(v as typeof filtroTipo); setPage(1) }}>
              <SelectTrigger className="w-44 bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los tipos</SelectItem>
                <SelectItem value="consumo_interno">Consumo interno</SelectItem>
                <SelectItem value="venta_retail">Venta retail</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-4 px-5 py-2.5 bg-gray-50/80 border-b border-gray-100">
              <div className="w-9 shrink-0" />
              <div className="flex-1"><span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Insumo</span></div>
              <div className="hidden sm:block w-32 shrink-0"><span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Stock</span></div>
              <div className="hidden md:block w-32 shrink-0"><span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Costo prom.</span></div>
              <div className="hidden lg:block w-32 shrink-0"><span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Valor stock</span></div>
              <div className="hidden sm:block w-24 shrink-0" />
              <div className="w-16 shrink-0" />
            </div>

            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
              : data?.results.length === 0
              ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Package className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-semibold">Sin insumos</p>
                  <p className="text-sm text-muted-foreground mt-1">Crea el primer insumo usando el botón de arriba</p>
                </div>
              )
              : data?.results.map((i) => (
                <InsumoRow key={i.id} insumo={i} onAjustar={setAjustarInsumo} />
              ))
            }
          </div>

          <Pagination page={page} total={total} pageSize={25} onPage={setPage} />
        </TabsContent>

        <TabsContent value="alertas" className="mt-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {!alertas || alertas.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-3">
                  <Package className="h-6 w-6 text-green-600" />
                </div>
                <p className="text-sm font-semibold text-green-700">Todo en orden</p>
                <p className="text-sm text-muted-foreground mt-1">Ningún insumo tiene stock bajo</p>
              </div>
            ) : (
              alertas.map((i) => (
                <InsumoRow key={i.id} insumo={i} onAjustar={setAjustarInsumo} />
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      <AjusteStockSheet
        insumo={ajustarInsumo}
        open={!!ajustarInsumo}
        onClose={() => setAjustarInsumo(null)}
      />
      <NuevoInsumoSheet open={nuevoOpen} onClose={() => setNuevoOpen(false)} />
    </div>
  )
}
