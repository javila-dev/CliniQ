'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, Loader2, ShoppingBag, X } from 'lucide-react'
import * as XLSX from 'xlsx'
import { ventasApi } from '@/lib/api/cotizaciones'
import { PageHeader } from '@/components/shared/PageHeader'
import { LoadingState } from '@/components/shared/LoadingState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useDebounce } from '@/hooks/useDebounce'
import { toast } from '@/hooks/use-toast'
import { useUserSedes } from '@/hooks/useUserSedes'
import { cn } from '@/lib/utils'
import type { Venta } from '@/types/cotizaciones'

const PAGE_SIZE = 25
const TODAS = 'todas'

// Columnas ordenables -> campo de ?ordering= en /ventas/.
type CampoOrden = 'aceptada_en' | 'total_venta' | 'pagado_venta' | 'saldo_venta'
type Orden = { campo: CampoOrden; desc: boolean }
const ORDEN_INICIAL: Orden = { campo: 'aceptada_en', desc: true }

function formatCOP(value: string | number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(Number(value))
}

function formatFecha(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function Sesiones({ venta }: { venta: Venta }) {
  if (!venta.sesiones) return <span className="text-xs text-muted-foreground">—</span>
  const { completadas, total } = venta.sesiones
  const pct = Math.min(100, Math.round((completadas / total) * 100))
  return (
    <div className="w-28 space-y-1" title={`${completadas} de ${total} sesiones completadas`}>
      <div className="flex items-center justify-between text-xs tabular-nums">
        <span className="font-medium text-foreground">{completadas}/{total}</span>
        <span className="text-muted-foreground">sesiones</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function ColumnaOrdenable({
  label, campo, orden, onOrdenar, className,
}: {
  label: string
  campo: CampoOrden
  orden: Orden
  onOrdenar: (campo: CampoOrden) => void
  className?: string
}) {
  const activa = orden.campo === campo
  const Icono = !activa ? ArrowUpDown : orden.desc ? ArrowDown : ArrowUp
  return (
    <th
      className={cn('text-left px-4 py-2.5 text-xs font-medium', className)}
      aria-sort={activa ? (orden.desc ? 'descending' : 'ascending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onOrdenar(campo)}
        className={cn(
          'inline-flex items-center gap-1 transition-colors hover:text-foreground',
          activa ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {label}
        <Icono className={cn('h-3 w-3', !activa && 'opacity-50')} />
      </button>
    </th>
  )
}

export default function VentasPage() {
  const router = useRouter()
  const { sedes } = useUserSedes()
  const [busqueda, setBusqueda] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [sede, setSede] = useState(TODAS)
  const [vendedor, setVendedor] = useState(TODAS)
  const [orden, setOrden] = useState<Orden>(ORDEN_INICIAL)
  const [page, setPage] = useState(1)
  const [abriendo, setAbriendo] = useState<string | null>(null)
  const [exportando, setExportando] = useState(false)
  const debouncedBusqueda = useDebounce(busqueda, 350)

  const { data: vendedores = [] } = useQuery({
    queryKey: ['ventas', 'vendedores'],
    queryFn: ventasApi.vendedores,
    staleTime: 5 * 60 * 1000,
  })

  const params: Parameters<typeof ventasApi.list>[0] = {
    page,
    ordering: `${orden.desc ? '-' : ''}${orden.campo}`,
  }
  if (debouncedBusqueda) params.search = debouncedBusqueda
  if (desde) params.aceptada_desde = desde
  if (hasta) params.aceptada_hasta = hasta
  if (sede !== TODAS) params.sede = sede
  if (vendedor !== TODAS) params.vendedor = vendedor

  const { data, isLoading } = useQuery({
    queryKey: ['ventas', params],
    queryFn: () => ventasApi.list(params),
  })

  const total = data?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hayFiltros = Boolean(debouncedBusqueda || desde || hasta || sede !== TODAS || vendedor !== TODAS)

  function conReinicio<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v)
      setPage(1)
    }
  }

  // Primer clic en una columna: de mayor a menor. Segundo clic: invierte.
  function ordenar(campo: CampoOrden) {
    setOrden((actual) => (actual.campo === campo ? { campo, desc: !actual.desc } : { campo, desc: true }))
    setPage(1)
  }

  function limpiar() {
    setBusqueda('')
    setDesde('')
    setHasta('')
    setSede(TODAS)
    setVendedor(TODAS)
    setPage(1)
  }

  // Exporta todas las ventas que cumplen los filtros (no solo la página visible),
  // en el mismo orden de la tabla.
  async function exportarExcel() {
    setExportando(true)
    try {
      const ventas: Venta[] = []
      for (let pagina = 1; ; pagina++) {
        const res = await ventasApi.list({ ...params, page: pagina })
        ventas.push(...res.results)
        if (!res.next) break
      }
      const filas = ventas.map((v) => ({
        Fecha: formatFecha(v.aceptada_en),
        Paciente: v.paciente_nombre,
        Sede: v.sede_nombre ?? '',
        Profesional: v.vendedor_nombre ?? '',
        Total: Number(v.total),
        Pagado: Number(v.total_pagado),
        Saldo: Number(v.saldo_pendiente),
        'En mora': v.en_mora ? 'Sí' : 'No',
        Sesiones: v.sesiones ? `${v.sesiones.completadas}/${v.sesiones.total}` : '',
      }))
      const ws = XLSX.utils.json_to_sheet(filas)
      ws['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 18 }, { wch: 24 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 9 }, { wch: 10 }]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Ventas')
      XLSX.writeFile(wb, `ventas_${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch {
      toast.error('No se pudo exportar', 'Vuelve a intentarlo en un momento.')
    } finally {
      setExportando(false)
    }
  }

  function abrir(v: Venta) {
    setAbriendo(v.id)
    router.push(`/ventas/${v.id}`)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Ventas"
        description="Cotizaciones aceptadas: lo que cada paciente compró, cuánto ha pagado y cómo van sus sesiones."
        action={
          <Button variant="outline" className="gap-1.5" disabled={!total || exportando} onClick={exportarExcel}>
            {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Exportar Excel
          </Button>
        }
      />

      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Buscar</label>
          <Input
            placeholder="Paciente…"
            value={busqueda}
            onChange={(e) => conReinicio(setBusqueda)(e.target.value)}
            className="w-56 h-9"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Vendidas desde</label>
          <Input
            type="date"
            value={desde}
            max={hasta || undefined}
            onChange={(e) => conReinicio(setDesde)(e.target.value)}
            className="w-40 h-9"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Hasta</label>
          <Input
            type="date"
            value={hasta}
            min={desde || undefined}
            onChange={(e) => conReinicio(setHasta)(e.target.value)}
            className="w-40 h-9"
          />
        </div>
        {sedes.length > 1 && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Sede</label>
            <Select value={sede} onValueChange={conReinicio(setSede)}>
              <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS}>Todas las sedes</SelectItem>
                {sedes.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {vendedores.length > 1 && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Profesional</label>
            <Select value={vendedor} onValueChange={conReinicio(setVendedor)}>
              <SelectTrigger className="w-48 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS}>Todos</SelectItem>
                {vendedores.map((v) => <SelectItem key={v.id} value={v.id}>{v.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {hayFiltros && (
          <Button variant="ghost" size="sm" className="h-9" onClick={limpiar}>
            <X className="h-3.5 w-3.5 mr-1.5" />
            Limpiar
          </Button>
        )}
      </div>

      {isLoading ? (
        <LoadingState rows={4} />
      ) : !data?.results?.length ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ShoppingBag className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">
              {hayFiltros ? 'Sin ventas para los filtros seleccionados' : 'Todavía no hay ventas'}
            </p>
            {!hayFiltros && (
              <p className="text-xs text-muted-foreground mt-1">
                Cuando un paciente acepta una cotización, aparece aquí.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="rounded-lg border bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <ColumnaOrdenable label="Fecha" campo="aceptada_en" orden={orden} onOrdenar={ordenar} />
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Paciente</th>
                  <ColumnaOrdenable label="Total" campo="total_venta" orden={orden} onOrdenar={ordenar} />
                  <ColumnaOrdenable label="Pagado" campo="pagado_venta" orden={orden} onOrdenar={ordenar} className="hidden sm:table-cell" />
                  <ColumnaOrdenable label="Saldo" campo="saldo_venta" orden={orden} onOrdenar={ordenar} className="hidden sm:table-cell" />
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden lg:table-cell">Sesiones</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">Profesional</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {data.results.map((v) => (
                  <tr
                    key={v.id}
                    className={`border-b last:border-0 hover:bg-muted/20 cursor-pointer transition-colors${abriendo === v.id ? ' opacity-60 pointer-events-none' : ''}`}
                    onClick={() => abrir(v)}
                  >
                    <td className="px-4 py-3 text-muted-foreground tabular-nums whitespace-nowrap">{formatFecha(v.aceptada_en)}</td>
                    <td className="px-4 py-3 font-medium">{v.paciente_nombre}</td>
                    <td className="px-4 py-3 font-semibold tabular-nums">{formatCOP(v.total)}</td>
                    <td className="px-4 py-3 tabular-nums hidden sm:table-cell">
                      <span className={Number(v.total_pagado) > 0 ? 'text-green-600 font-medium' : 'text-muted-foreground'}>
                        {formatCOP(v.total_pagado)}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums hidden sm:table-cell">
                      <div className="flex items-center gap-2">
                        <span className={Number(v.saldo_pendiente) > 0 ? 'text-amber-600 font-medium' : 'text-green-600'}>
                          {Number(v.saldo_pendiente) > 0 ? formatCOP(v.saldo_pendiente) : 'Pagada'}
                        </span>
                        {v.en_mora && (
                          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-200">
                            En mora
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell"><Sesiones venta={v} /></td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{v.vendedor_nombre ?? '—'}</td>
                    <td className="px-4 py-3 w-8">
                      {abriendo === v.id && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-1">
            <p className="text-sm text-muted-foreground">
              Mostrando{' '}
              <span className="font-medium text-foreground">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)}
              </span>{' '}
              de <span className="font-medium text-foreground">{total}</span>
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page === 1} onClick={() => setPage(page - 1)} aria-label="Página anterior">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm tabular-nums text-muted-foreground px-2">{page} / {totalPages}</span>
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(page + 1)} aria-label="Página siguiente">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
