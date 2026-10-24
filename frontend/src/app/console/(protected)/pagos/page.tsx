'use client'

// Pagos de todas las clínicas (cobros con tarjeta por Wompi) con su factura
// electrónica en Alegra: para conciliar y para encontrar facturas que no salieron.

import { useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Paginacion } from '@/components/shared/TablaDatos'
import { suscripcionesApi } from '@/lib/api/suscripciones'
import type { FiltrosPagos } from '@/types/suscripciones'
import { abrirFacturaAdmin, BADGE_COBRO } from '../clinicas/_suscripcion'

const PAGE_SIZE = 25
const TODOS = '__todos__'
const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
/** dd/mm/aaaa. Las fechas sin hora (periodos) se leen a mediodía para no correrse de día. */
const fecha = (iso: string) => {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function primeroDelMes() {
  const hoy = new Date()
  return new Date(hoy.getFullYear(), hoy.getMonth(), 1).toLocaleDateString('en-CA')
}

function Filtro<T extends string>({ valor, onChange, opciones, etiqueta }: {
  valor: T | ''
  onChange: (v: T | '') => void
  opciones: [T, string][]
  etiqueta: string
}) {
  return (
    <Select value={valor || TODOS} onValueChange={v => onChange(v === TODOS ? '' : (v as T))}>
      <SelectTrigger className="h-9 w-auto min-w-[150px] bg-white" aria-label={etiqueta}><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={TODOS}>{etiqueta}: todos</SelectItem>
        {opciones.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

function Dato({ etiqueta, valor, tono }: { etiqueta: string; valor: React.ReactNode; tono?: 'aviso' }) {
  return (
    <div className="bg-white p-3.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${tono === 'aviso' ? 'text-amber-600' : ''}`}>{valor}</p>
    </div>
  )
}

export default function PagosConsolaPage() {
  const qc = useQueryClient()
  const [filtros, setFiltros] = useState<FiltrosPagos>({ desde: primeroDelMes(), hasta: '', estado: '', factura: '', concepto: '', q: '' })
  const [page, setPage] = useState(1)
  const cambiar = (f: Partial<FiltrosPagos>) => { setFiltros(prev => ({ ...prev, ...f })); setPage(1) }

  const { data, isLoading } = useQuery({
    queryKey: ['admin-pagos', filtros, page],
    queryFn: () => suscripcionesApi.pagosConsola({ ...filtros, page }),
  })
  const reintentar = useMutation({
    mutationFn: (referencia: string) => suscripcionesApi.reintentarFactura(referencia),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin-pagos'] }),
  })
  const r = data?.resumen

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Pagos</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Cobros con tarjeta de todas las clínicas y su factura electrónica. Los pagos manuales no aparecen aquí.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Clínica, referencia o factura…" value={filtros.q} onChange={e => cambiar({ q: e.target.value })} className="h-9 bg-white pl-9" />
        </div>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Input type="date" aria-label="Desde" value={filtros.desde} onChange={e => cambiar({ desde: e.target.value })} className="h-9 w-[150px] bg-white" />
          a
          <Input type="date" aria-label="Hasta" value={filtros.hasta} onChange={e => cambiar({ hasta: e.target.value })} className="h-9 w-[150px] bg-white" />
        </div>
        <Filtro etiqueta="Estado" valor={filtros.estado ?? ''} onChange={v => cambiar({ estado: v })}
          opciones={[['aprobado', 'Aprobados'], ['fallido', 'Rechazados o con error'], ['pendiente', 'Pendientes']]} />
        <Filtro etiqueta="Factura" valor={filtros.factura ?? ''} onChange={v => cambiar({ factura: v })}
          opciones={[['emitida', 'Emitida'], ['pendiente', 'Pendiente'], ['error', 'En error'], ['sin_factura', 'Aprobado sin factura']]} />
        <Filtro etiqueta="Concepto" valor={filtros.concepto ?? ''} onChange={v => cambiar({ concepto: v })}
          opciones={[['primer_pago', 'Primer pago'], ['renovacion', 'Renovación'], ['cambio_plan', 'Cambio de plan'], ['reintento', 'Reintento de pago']]} />
      </div>

      {r && (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-5">
          <Dato etiqueta="Total aprobado" valor={COP.format(r.total_aprobado)} />
          <Dato etiqueta="Pagos aprobados" valor={r.aprobados} />
          <Dato etiqueta="Rechazados" valor={r.rechazados} tono={r.rechazados ? 'aviso' : undefined} />
          <Dato etiqueta="Pendientes" valor={r.pendientes} />
          <Dato etiqueta="Facturas por resolver" valor={r.facturas_con_problema} tono={r.facturas_con_problema ? 'aviso' : undefined} />
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border bg-white">
        {/* Anchos fijos: la clínica y la factura (con su error) se llevan el espacio
            sobrante; fecha, periodo, monto y estado no lo necesitan. */}
        <Table className="min-w-[1080px] table-fixed">
          <colgroup>
            <col className="w-[150px]" />
            <col />
            <col className="w-[170px]" />
            <col className="w-[120px]" />
            <col className="w-[120px]" />
            <col className="w-[140px]" />
            <col className="w-[230px]" />
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Clínica</TableHead>
              <TableHead>Concepto</TableHead>
              <TableHead>Periodo</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Factura</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">Cargando…</TableCell></TableRow>
            ) : !data?.results.length ? (
              <TableRow><TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">No hay pagos con estos filtros.</TableCell></TableRow>
            ) : data.results.map(c => (
              <TableRow key={c.referencia} className="align-top">
                <TableCell className="text-sm tabular-nums">
                  {fecha(c.created_at)}
                  <p className="truncate text-xs text-muted-foreground" title={c.referencia}>{c.referencia}</p>
                </TableCell>
                <TableCell>
                  <Link href={`/console/clinicas/${c.clinica_id}`} className="block truncate text-sm font-medium hover:underline" title={c.clinica_nombre}>
                    {c.clinica_nombre}
                  </Link>
                  {c.tarjeta && <p className="text-xs text-muted-foreground">{c.tarjeta}</p>}
                </TableCell>
                <TableCell className="text-sm">
                  {c.concepto_label}
                  <p className="text-xs text-muted-foreground">{c.plan_nombre} · {c.ciclo}</p>
                </TableCell>
                <TableCell className="text-xs tabular-nums text-muted-foreground">
                  {fecha(c.periodo_inicio)}
                  <br />
                  a {fecha(c.periodo_fin)}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{COP.format(Number(c.monto))}</TableCell>
                <TableCell>
                  <Badge variant={BADGE_COBRO[c.estado]}>{c.estado_label}</Badge>
                  {c.mensaje && c.estado !== 'aprobado' && <p className="mt-1 text-xs text-muted-foreground">{c.mensaje}</p>}
                </TableCell>
                <TableCell>
                  {c.factura?.estado === 'emitida' ? (
                    <Button size="sm" variant="ghost" className="-ml-2" onClick={() => abrirFacturaAdmin(c.referencia)}>{c.factura.numero} · PDF</Button>
                  ) : c.estado === 'aprobado' ? (
                    <div>
                      <Button size="sm" variant="outline" disabled={reintentar.isPending} onClick={() => reintentar.mutate(c.referencia)}>
                        {c.factura ? `${c.factura.estado_label} · reintentar` : 'Sin factura · emitir'}
                      </Button>
                      {c.factura?.ultimo_error && <p className="mt-1 line-clamp-3 text-xs text-muted-foreground" title={c.factura.ultimo_error}>{c.factura.ultimo_error}</p>}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {(data?.count ?? 0) > PAGE_SIZE && <Paginacion page={page} total={data?.count ?? 0} pageSize={PAGE_SIZE} onPage={setPage} />}
    </div>
  )
}
