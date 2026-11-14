'use client'

// Ventas por asesor: volumen y valor de cotizaciones y de ventas efectivas, con
// las mismas reglas que la tarjeta Comercial del dashboard (backend:
// /reportes/comercial/asesores/). El asesor es quien creó la cotización.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Download, Users } from 'lucide-react'
import * as XLSX from 'xlsx'
import { reportesApi } from '@/lib/api/reportes'
import { ventasApi } from '@/lib/api/cotizaciones'
import { canAccess } from '@/lib/permissions'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { PageHeader } from '@/components/shared/PageHeader'
import { LoadingState } from '@/components/shared/LoadingState'
import { VentasTabs } from '@/components/cotizaciones/VentasTabs'
import {
  ChipsFiltros, FiltroPeriodo, ListaSeleccion, MenuFiltros, SeccionFiltro, etiquetaPeriodo, nombresRepetidos,
  type ChipFiltro,
} from '@/components/shared/Filtros'
import {
  CeldaPersona, Dinero, Encabezado, FilaClic, TablaContenedor, TablaVacia, Td, Th,
} from '@/components/shared/TablaDatos'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'
import { useUserSedes } from '@/hooks/useUserSedes'
import { toTitleCase } from '@/lib/utils'
import type { FilaAsesor } from '@/types/reportes'

type Campo = 'nombre' | 'cotizaciones' | 'cotizado' | 'ventas' | 'vendido' | 'cierre' | 'ticket' | 'dias'

const VALOR: Record<Campo, (f: FilaAsesor) => number | string> = {
  nombre: (f) => f.nombre.toLowerCase(),
  cotizaciones: (f) => f.cotizaciones.cantidad,
  cotizado: (f) => Number(f.cotizaciones.valor),
  ventas: (f) => f.ventas.cantidad,
  vendido: (f) => Number(f.ventas.valor),
  cierre: (f) => Number(f.tasa_cierre_pct ?? -1),
  ticket: (f) => Number(f.ventas.ticket_promedio ?? -1),
  dias: (f) => f.ventas.dias_promedio_cierre ?? Number.MAX_SAFE_INTEGER,
}

function mesActual() {
  const hoy = new Date()
  return {
    desde: new Date(hoy.getFullYear(), hoy.getMonth(), 1).toLocaleDateString('en-CA'),
    hasta: hoy.toLocaleDateString('en-CA'),
  }
}

function Pct({ valor }: { valor: string | null }) {
  if (valor === null) return <span className="text-gray-400">—</span>
  return <span className="tabular-nums">{Number(valor).toLocaleString('es-CO', { maximumFractionDigits: 1 })}%</span>
}

function Celdas({ f, total = false }: { f: FilaAsesor; total?: boolean }) {
  const peso = total ? 'font-bold text-gray-900' : 'font-semibold text-gray-900'
  return (
    <>
      <Td align="right" className="tabular-nums">{f.cotizaciones.cantidad}</Td>
      <Td align="right" className="hidden md:table-cell"><Dinero valor={f.cotizaciones.valor} className="text-gray-600" /></Td>
      <Td align="right" className="tabular-nums">{f.ventas.cantidad}</Td>
      <Td align="right"><Dinero valor={f.ventas.valor} className={peso} /></Td>
      <Td align="right" className="hidden sm:table-cell">
        <span title={`${f.creadas_vendidas} de ${f.cotizaciones.cantidad} cotizaciones creadas ya se vendieron`}>
          <Pct valor={f.tasa_cierre_pct} />
        </span>
      </Td>
      <Td align="right" className="hidden lg:table-cell">
        {f.ventas.ticket_promedio ? <Dinero valor={f.ventas.ticket_promedio} /> : <span className="text-gray-400">—</span>}
      </Td>
      <Td align="right" className="hidden lg:table-cell tabular-nums">
        {f.ventas.dias_promedio_cierre === null
          ? <span className="text-gray-400">—</span>
          : f.ventas.dias_promedio_cierre.toLocaleString('es-CO', { maximumFractionDigits: 1 })}
      </Td>
    </>
  )
}

function VentasPorAsesor() {
  const router = useRouter()
  const { sedes } = useUserSedes()
  const [{ desde, hasta }, setPeriodo] = useState(mesActual)
  const [sede, setSede] = useState<string | null>(null)
  const [tratamientos, setTratamientos] = useState<string[]>([])
  const [orden, setOrden] = useState<{ campo: Campo; desc: boolean }>({ campo: 'vendido', desc: true })
  const [abriendo, setAbriendo] = useState<string | null>(null)

  const params = { fecha_inicio: desde, fecha_fin: hasta, sede_id: sede ?? undefined, tratamiento: tratamientos }
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['reportes', 'comercial-asesores', params],
    queryFn: () => reportesApi.getComercialAsesores(params),
  })
  const { data: catalogo = [] } = useQuery({
    queryKey: ['ventas', 'tratamientos'],
    queryFn: ventasApi.tratamientos,
    staleTime: 5 * 60 * 1000,
  })

  const filas = [...(data?.asesores ?? [])].sort((a, b) => {
    const va = VALOR[orden.campo](a)
    const vb = VALOR[orden.campo](b)
    const c = va < vb ? -1 : va > vb ? 1 : 0
    return orden.desc ? -c : c
  })
  const sentido = (campo: Campo) => (orden.campo === campo ? (orden.desc ? 'desc' : 'asc') : null)
  const ordenar = (campo: Campo) =>
    setOrden((a) => (a.campo === campo ? { campo, desc: !a.desc } : { campo, desc: campo !== 'nombre' && campo !== 'dias' }))

  const repetidos = nombresRepetidos(filas)
  const nombreDe = (lista: { id: string; nombre: string }[], id: string) => lista.find((x) => x.id === id)?.nombre ?? '…'
  const chips: ChipFiltro[] = [
    ...(sede ? [{ clave: 'sede', label: nombreDe(sedes, sede), onQuitar: () => setSede(null) }] : []),
    ...tratamientos.map((id) => ({
      clave: id, label: nombreDe(catalogo, id), onQuitar: () => setTratamientos(tratamientos.filter((x) => x !== id)),
    })),
  ]

  function verVentas(f: FilaAsesor) {
    if (!f.asesor_id) return
    setAbriendo(f.asesor_id)
    const q = new URLSearchParams({ vendedor: f.asesor_id, desde, hasta })
    if (sede) q.set('sede', sede)
    if (tratamientos.length) q.set('tratamiento', tratamientos.join(','))
    router.push(`/ventas?${q.toString()}`)
  }

  function exportarExcel() {
    if (!data) return
    try {
      const fila = (f: FilaAsesor) => ({
        Asesor: f.email && repetidos.has(f.nombre.trim().toLowerCase()) ? `${f.nombre} (${f.email})` : f.nombre,
        Cotizaciones: f.cotizaciones.cantidad,
        'Valor cotizado': Number(f.cotizaciones.valor),
        Ventas: f.ventas.cantidad,
        'Valor vendido': Number(f.ventas.valor),
        'Cierre %': f.tasa_cierre_pct === null ? '' : Number(f.tasa_cierre_pct),
        'Ticket promedio': f.ventas.ticket_promedio === null ? '' : Number(f.ventas.ticket_promedio),
        'Días a cierre': f.ventas.dias_promedio_cierre ?? '',
      })
      const ws = XLSX.utils.json_to_sheet([...filas.map(fila), fila(data.totales)])
      ws['!cols'] = [{ wch: 28 }, { wch: 13 }, { wch: 15 }, { wch: 9 }, { wch: 15 }, { wch: 9 }, { wch: 15 }, { wch: 12 }]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Por asesor')
      XLSX.writeFile(wb, `ventas_por_asesor_${desde}_${hasta}.xlsx`)
    } catch {
      toast.error('No se pudo exportar', 'Vuelve a intentarlo en un momento.')
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Ventas"
        description="Cotizaciones aceptadas: lo que cada paciente compró, cuánto ha pagado y cómo van sus sesiones."
        action={
          <Button variant="outline" className="gap-1.5" disabled={!filas.length} onClick={exportarExcel}>
            <Download className="h-4 w-4" />
            Exportar Excel
          </Button>
        }
      />
      <VentasTabs />

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <FiltroPeriodo
            desde={desde}
            hasta={hasta}
            permitirSinFechas={false}
            onChange={(d, h) => {
              // El reporte siempre va por un periodo: lo que falte se completa.
              const base = mesActual()
              setPeriodo({ desde: d || base.desde, hasta: h || base.hasta })
            }}
          />
          <MenuFiltros activos={(sede ? 1 : 0) + (tratamientos.length ? 1 : 0)}>
            {sedes.length > 1 && (
              <SeccionFiltro titulo="Sede">
                <ListaSeleccion
                  opciones={sedes.map((s) => ({ id: s.id, nombre: s.nombre }))}
                  seleccion={sede ? [sede] : []}
                  onChange={(ids) => setSede(ids[0] ?? null)}
                  todos="Todas las sedes"
                />
              </SeccionFiltro>
            )}
            <SeccionFiltro titulo="Tratamiento o procedimiento">
              <ListaSeleccion
                multiple
                opciones={catalogo.map((c) => ({
                  id: c.id, nombre: c.nombre, grupo: c.tipo === 'tratamiento' ? 'Tratamientos' : 'Procedimientos',
                }))}
                seleccion={tratamientos}
                onChange={setTratamientos}
                buscar="Buscar tratamiento…"
                vacio="Todavía no hay ventas con tratamientos del catálogo."
              />
            </SeccionFiltro>
          </MenuFiltros>
        </div>
        <ChipsFiltros chips={chips} onLimpiar={() => { setSede(null); setTratamientos([]) }} />
      </div>

      {isLoading ? (
        <LoadingState rows={4} />
      ) : isError || !data ? (
        <TablaVacia
          titulo="No pudimos cargar el reporte"
          texto="Revisa tu conexión e inténtalo de nuevo."
          accion={<Button variant="outline" size="sm" onClick={() => refetch()}>Reintentar</Button>}
        />
      ) : !filas.length ? (
        <TablaVacia
          icono={<Users className="h-5 w-5" />}
          titulo={`Sin cotizaciones ni ventas · ${etiquetaPeriodo(desde, hasta).toLowerCase()}`}
          texto="Prueba con otro periodo o quita algún filtro."
        />
      ) : (
        <>
          <TablaContenedor>
            <Encabezado>
              <Th orden={sentido('nombre')} onOrdenar={() => ordenar('nombre')}>Asesor</Th>
              <Th align="right" orden={sentido('cotizaciones')} onOrdenar={() => ordenar('cotizaciones')}>Cotizaciones</Th>
              <Th align="right" className="hidden md:table-cell" orden={sentido('cotizado')} onOrdenar={() => ordenar('cotizado')}>Cotizado</Th>
              <Th align="right" orden={sentido('ventas')} onOrdenar={() => ordenar('ventas')}>Ventas</Th>
              <Th align="right" orden={sentido('vendido')} onOrdenar={() => ordenar('vendido')}>Vendido</Th>
              <Th align="right" className="hidden sm:table-cell" orden={sentido('cierre')} onOrdenar={() => ordenar('cierre')}>Cierre</Th>
              <Th align="right" className="hidden lg:table-cell" orden={sentido('ticket')} onOrdenar={() => ordenar('ticket')}>Ticket prom.</Th>
              <Th align="right" className="hidden lg:table-cell" orden={sentido('dias')} onOrdenar={() => ordenar('dias')}>Días a cierre</Th>
              <th className="w-10" />
            </Encabezado>
            <tbody>
              {filas.map((f) => f.asesor_id ? (
                <FilaClic key={f.asesor_id} onClick={() => verVentas(f)} cargando={abriendo === f.asesor_id}>
                  <Td>
                    <CeldaPersona
                      nombre={toTitleCase(f.nombre)}
                      detalle={[
                        repetidos.has(f.nombre.trim().toLowerCase()) ? f.email : null,
                        f.activo ? null : 'Inactivo',
                      ].filter(Boolean).join(' · ') || undefined}
                    />
                  </Td>
                  <Celdas f={f} />
                </FilaClic>
              ) : (
                <tr key="sin-asesor" className="border-b border-gray-100">
                  <Td><span className="text-gray-500">Sin asesor</span></Td>
                  <Celdas f={f} />
                  <td />
                </tr>
              ))}
              <tr className="border-t-2 border-gray-200 bg-gray-50/60">
                <Td><span className="font-semibold text-gray-900">Total</span></Td>
                <Celdas f={data.totales} total />
                <td />
              </tr>
            </tbody>
          </TablaContenedor>
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Cotizaciones:</span> creadas en el periodo.{' '}
            <span className="font-medium text-foreground">Ventas:</span> aceptadas en el periodo (aunque se hayan cotizado antes).{' '}
            <span className="font-medium text-foreground">Cierre:</span> de las cotizaciones creadas en el periodo, cuántas ya se vendieron.
            {tratamientos.length > 0 && ' Con filtro de tratamiento, el valor es el de la cotización completa.'}
            {' '}El asesor es quien creó la cotización. Haz clic en un asesor para ver sus ventas.
          </p>
        </>
      )}
    </div>
  )
}

export default function VentasPorAsesorPage() {
  return (
    <RoleGuard check={canAccess.resultadosPyL}>
      <VentasPorAsesor />
    </RoleGuard>
  )
}
