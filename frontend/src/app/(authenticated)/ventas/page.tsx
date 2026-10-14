'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Download, Loader2, ShoppingBag, X } from 'lucide-react'
import * as XLSX from 'xlsx'
import { ventasApi } from '@/lib/api/cotizaciones'
import { PageHeader } from '@/components/shared/PageHeader'
import { LoadingState } from '@/components/shared/LoadingState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useDebounce } from '@/hooks/useDebounce'
import { toast } from '@/hooks/use-toast'
import { useUserSedes } from '@/hooks/useUserSedes'
import {
  CeldaFecha, CeldaPersona, Dinero, Encabezado, FilaClic, Paginacion, TablaContenedor, TablaVacia, Td, Th,
} from '@/components/shared/TablaDatos'
import type { Venta } from '@/types/cotizaciones'

const PAGE_SIZE = 25
const TODAS = 'todas'

// Columnas ordenables -> campo de ?ordering= en /ventas/.
type CampoOrden = 'aceptada_en' | 'total_venta' | 'pagado_venta' | 'saldo_venta'
type Orden = { campo: CampoOrden; desc: boolean }
const ORDEN_INICIAL: Orden = { campo: 'aceptada_en', desc: true }

/** Avance de sesiones: barra fina con "3/6". */
function Sesiones({ venta }: { venta: Venta }) {
  if (!venta.sesiones) return <span className="text-gray-400">—</span>
  const { completadas, total } = venta.sesiones
  const pct = Math.min(100, Math.round((completadas / total) * 100))
  return (
    <div className="flex items-center gap-2" title={`${completadas} de ${total} sesiones completadas`}>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100">
        <div className={pct === 100 ? 'h-full rounded-full bg-emerald-500' : 'h-full rounded-full bg-primary'} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-gray-600">{completadas}/{total}</span>
    </div>
  )
}

/** Lo pagado con su proporción del total. */
function Pagado({ venta }: { venta: Venta }) {
  const total = Number(venta.total)
  const pagado = Number(venta.total_pagado)
  const pct = total > 0 ? Math.min(100, Math.round((pagado / total) * 100)) : 0
  return (
    <div className="ml-auto w-28 leading-tight">
      <Dinero valor={pagado} className={pagado > 0 ? 'text-gray-900' : 'text-gray-400'} />
      <div className="mt-1 flex items-center justify-end gap-1.5">
        <div className="h-1 w-14 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
        </div>
        <span className="w-8 text-right text-[11px] tabular-nums text-gray-500">{pct}%</span>
      </div>
    </div>
  )
}

function Saldo({ venta }: { venta: Venta }) {
  if (Number(venta.saldo_pendiente) <= 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/15">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
        Pagada
      </span>
    )
  }
  return (
    <div className="leading-tight">
      <Dinero valor={venta.saldo_pendiente} className="font-medium text-gray-900" />
      {venta.en_mora && (
        <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-red-600">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden />
          En mora
        </p>
      )}
    </div>
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
  // El backend ya filtraba ?con_mora=1; faltaba en la pantalla (M5-30).
  const [pagos, setPagos] = useState<typeof TODAS | 'mora'>(TODAS)
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
  if (pagos === 'mora') params.con_mora = '1'

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['ventas', params],
    queryFn: () => ventasApi.list(params),
  })

  const total = data?.count ?? 0
  const hayFiltros = Boolean(debouncedBusqueda || desde || hasta || sede !== TODAS || vendedor !== TODAS || pagos !== TODAS)

  function conReinicio<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v)
      setPage(1)
    }
  }

  const sentido = (campo: CampoOrden) => (orden.campo === campo ? (orden.desc ? 'desc' : 'asc') : null)

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
    setPagos(TODAS)
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
        // Fecha real (no texto) para poder ordenar y filtrar en Excel.
        Fecha: v.aceptada_en ? new Date(new Date(v.aceptada_en).toLocaleDateString('en-CA') + 'T00:00:00') : '',
        Paciente: v.paciente_nombre,
        Sede: v.sede_nombre ?? '',
        Profesional: v.vendedor_nombre ?? '',
        Total: Number(v.total),
        Pagado: Number(v.total_pagado),
        Saldo: Number(v.saldo_pendiente),
        'En mora': v.en_mora ? 'Sí' : 'No',
        Sesiones: v.sesiones ? `${v.sesiones.completadas}/${v.sesiones.total}` : '',
      }))
      const ws = XLSX.utils.json_to_sheet(filas, { cellDates: true, dateNF: 'dd/mm/yyyy' })
      ws['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 18 }, { wch: 24 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 9 }, { wch: 10 }]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Ventas')
      XLSX.writeFile(wb, `ventas_${new Date().toLocaleDateString('en-CA')}.xlsx`)
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
        <div className="space-y-1 w-full sm:w-auto">
          <label className="text-xs font-medium text-muted-foreground">Buscar</label>
          <Input
            placeholder="Paciente…"
            value={busqueda}
            onChange={(e) => conReinicio(setBusqueda)(e.target.value)}
            className="w-full sm:w-56 h-9"
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
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Pagos</label>
          <Select value={pagos} onValueChange={(v) => conReinicio(setPagos)(v as typeof pagos)}>
            <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODAS}>Todas</SelectItem>
              <SelectItem value="mora">En mora</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {hayFiltros && (
          <Button variant="ghost" size="sm" className="h-9" onClick={limpiar}>
            <X className="h-3.5 w-3.5 mr-1.5" />
            Limpiar
          </Button>
        )}
      </div>

      {isLoading ? (
        <LoadingState rows={4} />
      ) : isError ? (
        <TablaVacia
          titulo="No pudimos cargar las ventas"
          texto="Revisa tu conexión e inténtalo de nuevo."
          accion={<Button variant="outline" size="sm" onClick={() => refetch()}>Reintentar</Button>}
        />
      ) : !data?.results?.length ? (
        <TablaVacia
          icono={<ShoppingBag className="h-5 w-5" />}
          titulo={hayFiltros ? 'Sin ventas para estos filtros' : 'Todavía no hay ventas'}
          texto={hayFiltros ? 'Prueba con otras fechas o quita algún filtro.' : 'Cuando un paciente acepta una cotización, aparece aquí.'}
        />
      ) : (
        <TablaContenedor pie={<Paginacion page={page} total={total} pageSize={PAGE_SIZE} onPage={setPage} />}>
          <Encabezado>
            <Th orden={sentido('aceptada_en')} onOrdenar={() => ordenar('aceptada_en')}>Fecha</Th>
            <Th>Paciente</Th>
            <Th className="hidden lg:table-cell">Sesiones</Th>
            <Th align="right" orden={sentido('total_venta')} onOrdenar={() => ordenar('total_venta')}>Total</Th>
            <Th align="right" className="hidden sm:table-cell" orden={sentido('pagado_venta')} onOrdenar={() => ordenar('pagado_venta')}>Pagado</Th>
            <Th align="right" className="hidden sm:table-cell" orden={sentido('saldo_venta')} onOrdenar={() => ordenar('saldo_venta')}>Saldo</Th>
            <th className="w-10" />
          </Encabezado>
          <tbody>
            {data.results.map((v) => (
              <FilaClic key={v.id} onClick={() => abrir(v)} cargando={abriendo === v.id}>
                <Td className="w-32"><CeldaFecha fecha={v.aceptada_en} /></Td>
                <Td>
                  <CeldaPersona
                    nombre={v.paciente_nombre}
                    detalle={[v.vendedor_nombre, sedes.length > 1 ? v.sede_nombre : null].filter(Boolean).join(' · ') || undefined}
                  />
                </Td>
                <Td className="hidden lg:table-cell"><Sesiones venta={v} /></Td>
                <Td align="right"><Dinero valor={v.total} className="font-semibold text-gray-900" /></Td>
                <Td align="right" className="hidden sm:table-cell"><Pagado venta={v} /></Td>
                <Td align="right" className="hidden sm:table-cell"><Saldo venta={v} /></Td>
              </FilaClic>
            ))}
          </tbody>
        </TablaContenedor>
      )}
    </div>
  )
}
