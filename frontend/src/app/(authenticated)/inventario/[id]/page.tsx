'use client'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft, TrendingUp, TrendingDown, ArrowUpCircle, ArrowDownCircle,
  ChevronLeft, ChevronRight, Search,
} from 'lucide-react'
import { inventarioApi } from '@/lib/api/inventario'
import { clinicasApi } from '@/lib/api/clinicas'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { PageHeader } from '@/components/shared/PageHeader'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import { AjusteStockSheet } from '@/components/inventario/AjusteStockSheet'
import { MovimientoDetalleModal } from '@/components/inventario/MovimientoDetalleModal'
import { canAccess, hasPermission, PERM } from '@/lib/permissions'
import { useAuthStore } from '@/store/authStore'
import { useDebounce } from '@/hooks/useDebounce'
import { UNIDAD_LABEL } from '@/lib/inventarioLabels'
import { cn } from '@/lib/utils'
import type { MovimientoInventario, TipoMovimiento } from '@/types/inventario'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const PAGE_SIZE = 20

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function formatCantidad(value: string): string {
  const n = Number(value)
  return isNaN(n) ? value : n.toLocaleString('es-CO', { maximumFractionDigits: 2 })
}

const TIPO_CONFIG: Record<TipoMovimiento, { label: string; icon: React.ElementType; className: string; signo: '+' | '-' }> = {
  entrada:         { label: 'Entrada',    icon: TrendingUp,      className: 'text-emerald-600', signo: '+' },
  salida:          { label: 'Salida',     icon: TrendingDown,    className: 'text-red-600',     signo: '-' },
  ajuste_positivo: { label: 'Ajuste (+)', icon: ArrowUpCircle,   className: 'text-emerald-600', signo: '+' },
  ajuste_negativo: { label: 'Ajuste (-)', icon: ArrowDownCircle, className: 'text-red-600',     signo: '-' },
  baja:            { label: 'Baja',       icon: TrendingDown,    className: 'text-red-600',     signo: '-' },
}

const ORIGEN_LABEL: Record<string, string> = {
  compra: 'Compra',
  consumo_cita: 'Consumo en atención',
  venta_retail: 'Venta retail',
  ajuste_manual: 'Ajuste manual',
  baja_vencimiento: 'Baja por vencimiento',
}

function usoLabel(es_consumo_interno: boolean, es_venta_retail: boolean): string {
  return [
    es_consumo_interno && 'Consumo interno',
    es_venta_retail && 'Venta retail',
  ].filter(Boolean).join(' & ') || '—'
}

interface Props { params: Promise<{ id: string }> }

export default function InsumoDetallePage({ params }: Props) {
  const { id } = use(params)
  return <RoleGuard check={canAccess.inventario}><InsumoDetalleContent id={id} /></RoleGuard>
}

function InsumoDetalleContent({ id }: { id: string }) {
  const searchParams = useSearchParams()
  const { user } = useAuthStore()
  const puedeAjustarStock = hasPermission(user, PERM.INVENTARIO_AJUSTAR_STOCK)
  const puedeVerKardex = hasPermission(user, PERM.INVENTARIO_KARDEX_VER)

  const [sede, setSede] = useState(searchParams.get('sede') ?? '')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [ajustarOpen, setAjustarOpen] = useState(false)
  const [movimientoSel, setMovimientoSel] = useState<MovimientoInventario | null>(null)
  const debouncedSearch = useDebounce(search, 350)

  const { data: sedesData } = useQuery({
    queryKey: ['sedes-select'],
    queryFn: () => clinicasApi.sedes.list({ activa: true }),
  })
  const sedes = sedesData?.results ?? []

  useEffect(() => {
    if (!sede && sedes.length > 0) setSede(sedes[0].id)
  }, [sede, sedes])

  const todasLasSedes = sede === 'todas'
  const sedeParaStock = todasLasSedes ? undefined : sede

  const { data: insumo, isLoading, isError, refetch } = useQuery({
    queryKey: ['insumo', id, sedeParaStock],
    queryFn: () => inventarioApi.getInsumo(id, sedeParaStock),
    enabled: !!sede,
  })

  const { data: kardex, isLoading: loadingKardex } = useQuery({
    queryKey: ['kardex', id, sedeParaStock, debouncedSearch, page],
    queryFn: () => inventarioApi.listKardex({
      insumo: id, sede: sedeParaStock, search: debouncedSearch || undefined, page, page_size: PAGE_SIZE,
    }),
    enabled: !!sede && puedeVerKardex,
  })

  if (isLoading || !sede) return <LoadingState rows={5} />
  if (isError || !insumo) return <ErrorState onRetry={refetch} />

  const totalMovs = kardex?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalMovs / PAGE_SIZE))

  return (
    <div className="space-y-5">
      <PageHeader
        title={insumo.nombre}
        description={usoLabel(insumo.es_consumo_interno, insumo.es_venta_retail)}
        action={
          <Button variant="outline" size="sm" asChild>
            <Link href="/inventario"><ArrowLeft className="h-4 w-4 mr-1.5" />Inventario</Link>
          </Button>
        }
      />

      {/* Ficha general */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          {todasLasSedes ? (
            <div className="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              Selecciona una sede para ver el stock y poder ajustarlo. El kardex de abajo sí muestra los movimientos de todas las sedes.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Stock actual</p>
                  <p className={cn('text-lg font-bold tabular-nums', insumo.stock_bajo ? 'text-red-600' : 'text-foreground')}>
                    {formatCantidad(insumo.stock_actual)} <span className="text-xs font-normal text-muted-foreground">{UNIDAD_LABEL[insumo.unidad_medida]}</span>
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Stock mínimo</p>
                  <p className="text-lg font-bold tabular-nums">
                    {formatCantidad(insumo.stock_minimo)} <span className="text-xs font-normal text-muted-foreground">{UNIDAD_LABEL[insumo.unidad_medida]}</span>
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Costo promedio</p>
                  <p className="text-lg font-bold tabular-nums">{COP.format(Number(insumo.costo_promedio))}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Valor en stock</p>
                  <p className="text-lg font-bold tabular-nums">{COP.format(Number(insumo.valor_stock))}</p>
                </div>
              </div>

              {insumo.stock_bajo && (
                <div className="flex items-center gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600 font-medium">
                  Stock bajo — igual o por debajo del mínimo configurado
                </div>
              )}
            </>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-t pt-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Categoría</p>
              <p>{insumo.categoria_nombre ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Precio de venta</p>
              <p>{insumo.precio_venta ? COP.format(Number(insumo.precio_venta)) : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Requiere lote</p>
              <p>{insumo.requiere_lote ? 'Sí' : 'No'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Permite stock negativo</p>
              <p>{insumo.permite_stock_negativo ? 'Sí' : 'No'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {(sedes.length > 1 || puedeAjustarStock || puedeVerKardex) && (
        <div className="flex items-center justify-between gap-2.5 flex-wrap">
          {puedeVerKardex ? (
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar en el kardex…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className="pl-9 bg-white"
              />
            </div>
          ) : <div />}

          <div className="flex items-center gap-2.5">
            {sedes.length > 1 && (
              <Select value={sede} onValueChange={(v) => { setSede(v); setPage(1) }}>
                <SelectTrigger className="w-56 bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas las sedes</SelectItem>
                  {sedes.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {puedeAjustarStock && !todasLasSedes && (
              <Button size="sm" onClick={() => setAjustarOpen(true)}>Ajustar stock</Button>
            )}
          </div>
        </div>
      )}

      {/* Kardex */}
      <div className="space-y-3">

        {!puedeVerKardex ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
            No tienes permiso para ver el kardex de este insumo.
          </CardContent></Card>
        ) : loadingKardex ? (
          <LoadingState rows={5} />
        ) : !kardex?.results.length ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
            Sin movimientos registrados para esta sede.
          </CardContent></Card>
        ) : (
          <>
            <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/60 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    <th className="text-left px-5 py-2.5">Fecha</th>
                    <th className="text-left px-5 py-2.5">Tipo</th>
                    <th className="text-left px-5 py-2.5 hidden md:table-cell">Origen</th>
                    {todasLasSedes && <th className="text-left px-5 py-2.5 hidden md:table-cell">Sede</th>}
                    <th className="text-right px-5 py-2.5">Cantidad</th>
                    <th className="text-right px-5 py-2.5 hidden sm:table-cell">Stock resultante</th>
                    <th className="text-left px-5 py-2.5 hidden lg:table-cell">Realizó</th>
                  </tr>
                </thead>
                <tbody>
                  {kardex.results.map((m) => {
                    const cfg = TIPO_CONFIG[m.tipo]
                    const Icon = cfg.icon
                    return (
                      <tr
                        key={m.id}
                        onClick={() => setMovimientoSel(m)}
                        className="border-b border-gray-100 last:border-0 hover:bg-muted/30 cursor-pointer"
                      >
                        <td className="px-5 py-3 text-muted-foreground whitespace-nowrap">{fmtDateTime(m.fecha)}</td>
                        <td className="px-5 py-3">
                          <span className={cn('inline-flex items-center gap-1.5 font-medium whitespace-nowrap', cfg.className)}>
                            <Icon className="h-3.5 w-3.5" />
                            {cfg.label}
                          </span>
                          <p className="text-[11px] text-muted-foreground md:hidden">{ORIGEN_LABEL[m.origen] ?? m.origen}</p>
                        </td>
                        <td className="px-5 py-3 hidden md:table-cell text-muted-foreground">{ORIGEN_LABEL[m.origen] ?? m.origen}</td>
                        {todasLasSedes && <td className="px-5 py-3 hidden md:table-cell text-muted-foreground">{m.sede_nombre ?? '—'}</td>}
                        <td className={cn('px-5 py-3 text-right font-semibold tabular-nums whitespace-nowrap', cfg.className)}>
                          {cfg.signo}{formatCantidad(m.cantidad)}
                        </td>
                        <td className="px-5 py-3 hidden sm:table-cell text-right text-muted-foreground tabular-nums whitespace-nowrap">
                          {formatCantidad(m.stock_resultante)}
                        </td>
                        <td className="px-5 py-3 hidden lg:table-cell text-muted-foreground truncate">{m.realizado_por_nombre ?? '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between text-sm">
                <p className="text-muted-foreground">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalMovs)} de {totalMovs}</p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                  <span className="text-muted-foreground tabular-nums">{page} / {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <AjusteStockSheet
        insumo={insumo}
        sede={sede}
        open={ajustarOpen}
        onClose={() => setAjustarOpen(false)}
      />
      <MovimientoDetalleModal
        movimiento={movimientoSel}
        open={!!movimientoSel}
        onClose={() => setMovimientoSel(null)}
      />
    </div>
  )
}
