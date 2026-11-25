'use client'

// Reportes › citas por profesional: qué pasó con cada cita del mes (atendida, cancelada, no
// asistió, sin cerrar, programada), de qué fue (sesión N de M de un tratamiento,
// procedimiento individual, cita libre) y el resumen por profesional. Backend:
// /reportes/citas-profesional/ (apps/reportes/citas_profesional.py).

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { CalendarCheck, ChevronLeft, ChevronRight, Download, Gift, Search } from 'lucide-react'
import * as XLSX from 'xlsx'
import { reportesApi } from '@/lib/api/reportes'
import { veDashboard } from '@/lib/permissions'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { PageHeader } from '@/components/shared/PageHeader'
import { LoadingState } from '@/components/shared/LoadingState'
import {
  ChipsFiltros, ListaSeleccion, MenuFiltros, SeccionFiltro, type ChipFiltro,
} from '@/components/shared/Filtros'
import {
  CeldaPersona, Encabezado, Paginacion, TablaContenedor, TablaVacia, Td, Th,
} from '@/components/shared/TablaDatos'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/hooks/use-toast'
import { useUserSedes } from '@/hooks/useUserSedes'
import { cn, toTitleCase } from '@/lib/utils'
import type {
  CitaReporte, ResultadoCita, ResumenProfesionalCitas, TipoCitaReporte,
} from '@/types/reportes'

const POR_PAGINA = 50

const RESULTADO: Record<ResultadoCita, { label: string; clase: string }> = {
  atendida:   { label: 'Atendida',   clase: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15' },
  cancelada:  { label: 'Cancelada',  clase: 'bg-gray-100 text-gray-600 ring-gray-500/15' },
  no_asistio: { label: 'No asistió', clase: 'bg-red-50 text-red-700 ring-red-600/15' },
  sin_cerrar: { label: 'Sin cerrar', clase: 'bg-amber-50 text-amber-800 ring-amber-600/20' },
  programada: { label: 'Programada', clase: 'bg-blue-50 text-blue-700 ring-blue-600/15' },
}
const ORDEN_RESULTADOS: ResultadoCita[] = ['atendida', 'cancelada', 'no_asistio', 'sin_cerrar', 'programada']

const TIPO: Record<TipoCitaReporte, string> = {
  tratamiento: 'Sesión de tratamiento',
  procedimiento: 'Procedimiento individual',
  item_libre: 'Ítem de una venta',
  cita_libre: 'Cita libre',
}

const ESTADO_ABIERTO: Record<string, string> = {
  pendiente: 'pendiente', confirmada: 'confirmada', en_espera: 'en espera', en_curso: 'en curso',
}
const HISTORIA: Record<CitaReporte['historia'], string> = {
  firmada: 'Nota firmada', borrador: 'Nota en borrador', sin_nota: 'Sin nota',
}
const CONFIRMACION: Record<string, string> = {
  sin_enviar: 'Sin enviar', enviado: 'Enviado', confirmado: 'Confirmado', sin_respuesta: 'Sin respuesta',
}
const CANAL: Record<string, string> = { presencial: 'Presencial', telefono: 'Teléfono', web: 'Web', redes: 'Redes' }
const FIRMA: Record<string, string> = { sin_firma: 'Sin firma', enviada: 'Enviada', firmada: 'Firmada', rechazada: 'Rechazada' }

// ── Mes ──

function mesDe(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function moverMes(mes: string, delta: number) {
  const [y, m] = mes.split('-').map(Number)
  return mesDe(new Date(y, m - 1 + delta, 1))
}

function nombreMes(mes: string) {
  const [y, m] = mes.split('-').map(Number)
  const texto = new Date(y, m - 1, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function SelectorMes({ mes, onChange }: { mes: string; onChange: (m: string) => void }) {
  const actual = mesDe(new Date())
  return (
    <div className="inline-flex h-9 items-center rounded-md border border-input bg-white">
      <button
        type="button"
        onClick={() => onChange(moverMes(mes, -1))}
        className="grid h-full w-8 place-items-center text-muted-foreground hover:text-foreground"
        aria-label="Mes anterior"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="min-w-[9.5rem] px-1 text-center text-sm font-medium tabular-nums">{nombreMes(mes)}</span>
      <button
        type="button"
        onClick={() => onChange(moverMes(mes, 1))}
        className="grid h-full w-8 place-items-center text-muted-foreground hover:text-foreground"
        aria-label="Mes siguiente"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
      {mes !== actual && (
        <button
          type="button"
          onClick={() => onChange(actual)}
          className="h-full border-l px-2.5 text-xs text-muted-foreground hover:text-foreground"
        >
          Este mes
        </button>
      )}
    </div>
  )
}

// ── Formatos ──

function fechaCorta(iso: string) {
  const texto = new Date(`${iso}T00:00:00`).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/** Número de serie de Excel para una fecha sin hora (un Date local se corre por la zona horaria). */
function serialExcel(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000
}

function horas(minutos: number) {
  return (minutos / 60).toLocaleString('es-CO', { maximumFractionDigits: 1 })
}

function sesionTexto(c: CitaReporte) {
  if (c.sesion_numero === null) return ''
  const total = c.sesion_total ? ` de ${c.sesion_total}` : ''
  return `Sesión ${c.sesion_numero}${total}${c.tipo_sesion ? ` · ${c.tipo_sesion}` : ''}`
}

function queFue(c: CitaReporte) {
  return c.tratamiento || c.servicio || c.motivo || 'Sin servicio'
}

function detalleResultado(c: CitaReporte) {
  if (c.resultado === 'sin_cerrar') return `Quedó ${ESTADO_ABIERTO[c.estado] ?? c.estado}`
  if (c.resultado === 'cancelada') return c.motivo_cancelacion
  // Una atención cerrada otro día trae la fecha delante («24/01 08:00»).
  if (c.resultado === 'atendida' && c.fin_real?.includes('/')) return `Cerrada el ${c.fin_real}`
  if (c.resultado === 'atendida' && c.inicio_real) return `${c.inicio_real}–${c.fin_real ?? '…'}`
  if (c.resultado === 'programada') return CONFIRMACION[c.confirmacion] ?? ''
  return ''
}

function Pastilla({ resultado }: { resultado: ResultadoCita }) {
  const r = RESULTADO[resultado]
  return (
    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset', r.clase)}>
      {r.label}
    </span>
  )
}

// ── Resumen ──

function sumar(filas: ResumenProfesionalCitas[]): ResumenProfesionalCitas {
  const t: ResumenProfesionalCitas = {
    profesional_id: null, profesional: 'Total', total: 0, atendida: 0, cancelada: 0, no_asistio: 0,
    sin_cerrar: 0, programada: 0,
    atendidas_por_tipo: { tratamiento: 0, procedimiento: 0, item_libre: 0, cita_libre: 0 },
    pacientes_atendidos: 0, minutos_atendidos: 0, atendidas_sin_nota_firmada: 0, pct_asistencia: null,
  }
  for (const f of filas) {
    for (const k of ['total', 'atendida', 'cancelada', 'no_asistio', 'sin_cerrar', 'programada',
      'pacientes_atendidos', 'minutos_atendidos', 'atendidas_sin_nota_firmada'] as const) t[k] += f[k]
    for (const k of Object.keys(t.atendidas_por_tipo) as TipoCitaReporte[]) t.atendidas_por_tipo[k] += f.atendidas_por_tipo[k]
  }
  const base = t.atendida + t.no_asistio
  t.pct_asistencia = base ? Math.round((t.atendida * 100) / base) : null
  return t
}

function Tarjeta({ titulo, valor, detalle, activa, onClick, tono }: {
  titulo: string; valor: string | number; detalle?: string; activa?: boolean; onClick?: () => void
  tono?: 'aviso' | 'malo'
}) {
  const contenido = (
    <>
      <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
      <p className={cn(
        'mt-1 text-2xl font-semibold tabular-nums text-gray-900',
        tono === 'aviso' && Number(valor) > 0 && 'text-amber-700',
        tono === 'malo' && Number(valor) > 0 && 'text-red-700',
      )}>
        {valor}
      </p>
      {detalle && <p className="mt-0.5 w-full truncate text-xs text-muted-foreground" title={detalle}>{detalle}</p>}
    </>
  )
  const base = 'flex flex-col items-start justify-start rounded-xl border bg-white px-4 py-3 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)]'
  if (!onClick) return <div className={cn(base, 'border-gray-200/80')}>{contenido}</div>
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className={cn(base, 'transition-colors hover:border-primary/40', activa ? 'border-primary ring-1 ring-primary/30' : 'border-gray-200/80')}
    >
      {contenido}
    </button>
  )
}

function CeldasResumen({ f, total = false }: { f: ResumenProfesionalCitas; total?: boolean }) {
  const n = (v: number, clase?: string) => (
    <span className={cn('tabular-nums', v === 0 ? 'text-gray-300' : clase)}>{v}</span>
  )
  return (
    <>
      <Td align="right">{n(f.total, total ? 'font-bold text-gray-900' : 'font-semibold text-gray-900')}</Td>
      <Td align="right">{n(f.atendida, 'text-emerald-700')}</Td>
      <Td align="right">{n(f.cancelada)}</Td>
      <Td align="right">{n(f.no_asistio, 'text-red-700')}</Td>
      <Td align="right">{n(f.sin_cerrar, 'font-medium text-amber-700')}</Td>
      <Td align="right" className="hidden xl:table-cell">{n(f.programada, 'text-blue-700')}</Td>
      <Td align="right" className="hidden sm:table-cell tabular-nums">
        {f.pct_asistencia === null ? <span className="text-gray-300">—</span> : `${f.pct_asistencia}%`}
      </Td>
      <Td align="right" className="hidden 2xl:table-cell">{n(f.pacientes_atendidos)}</Td>
      <Td align="right" className="hidden lg:table-cell tabular-nums">{f.minutos_atendidos ? horas(f.minutos_atendidos) : <span className="text-gray-300">0</span>}</Td>
      <Td align="right" className="hidden 2xl:table-cell">
        <span title="Sesiones de tratamiento · procedimientos individuales · citas libres" className="tabular-nums text-gray-600">
          {f.atendidas_por_tipo.tratamiento} · {f.atendidas_por_tipo.procedimiento + f.atendidas_por_tipo.item_libre} · {f.atendidas_por_tipo.cita_libre}
        </span>
      </Td>
      <Td align="right" className="hidden md:table-cell">{n(f.atendidas_sin_nota_firmada, 'font-medium text-amber-700')}</Td>
    </>
  )
}

// ── Pantalla ──

function CitasPorProfesional() {
  const { sedes } = useUserSedes()
  const [mes, setMes] = useState(() => mesDe(new Date()))
  const [sede, setSede] = useState<string | null>(null)
  const [profesionales, setProfesionales] = useState<string[]>([])
  const [resultados, setResultados] = useState<string[]>([])
  const [tipos, setTipos] = useState<string[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [pagina, setPagina] = useState(1)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['reportes', 'citas-profesional', mes, sede],
    queryFn: () => reportesApi.getCitasProfesional({ mes, sede_id: sede ?? undefined }),
  })

  const conReinicio = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPagina(1) }

  const resumen = useMemo(() => {
    const todos = data?.profesionales ?? []
    return profesionales.length ? todos.filter((p) => profesionales.includes(p.profesional_id ?? '')) : todos
  }, [data, profesionales])
  const totales = useMemo(
    () => (profesionales.length ? sumar(resumen) : data?.totales ?? null),
    [data, resumen, profesionales.length],
  )

  const citas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return (data?.citas ?? []).filter((c) =>
      (!profesionales.length || profesionales.includes(c.profesional_id))
      && (!resultados.length || resultados.includes(c.resultado))
      && (!tipos.length || tipos.includes(c.tipo))
      && (!q || [c.paciente, c.documento, c.tratamiento, c.servicio].some((v) => v.toLowerCase().includes(q))),
    )
  }, [data, profesionales, resultados, tipos, busqueda])
  const visibles = citas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)

  const variasSedes = sedes.length > 1 && !sede
  const opcionesProfesional = (data?.profesionales ?? []).map((p) => ({ id: p.profesional_id ?? '', nombre: toTitleCase(p.profesional) }))
  const nombreDe = (lista: { id: string; nombre: string }[], id: string) => lista.find((x) => x.id === id)?.nombre ?? '…'
  const chips: ChipFiltro[] = [
    ...(sede ? [{ clave: 'sede', label: nombreDe(sedes, sede), onQuitar: () => conReinicio(setSede)(null) }] : []),
    ...profesionales.map((id) => ({
      clave: `p-${id}`, label: nombreDe(opcionesProfesional, id),
      onQuitar: () => conReinicio(setProfesionales)(profesionales.filter((x) => x !== id)),
    })),
    ...resultados.map((r) => ({
      clave: `r-${r}`, label: RESULTADO[r as ResultadoCita].label,
      onQuitar: () => conReinicio(setResultados)(resultados.filter((x) => x !== r)),
    })),
    ...tipos.map((t) => ({
      clave: `t-${t}`, label: TIPO[t as TipoCitaReporte],
      onQuitar: () => conReinicio(setTipos)(tipos.filter((x) => x !== t)),
    })),
  ]
  const limpiar = () => { setSede(null); setProfesionales([]); setResultados([]); setTipos([]); setPagina(1) }
  const alternarResultado = (r: ResultadoCita) =>
    conReinicio(setResultados)(resultados.length === 1 && resultados[0] === r ? [] : [r])
  const alternarProfesional = (id: string | null) => {
    if (!id) return
    conReinicio(setProfesionales)(profesionales.length === 1 && profesionales[0] === id ? [] : [id])
  }

  function exportarExcel() {
    if (!data || !totales) return
    try {
      const filaResumen = (f: ResumenProfesionalCitas) => ({
        Profesional: toTitleCase(f.profesional),
        Citas: f.total,
        Atendidas: f.atendida,
        Canceladas: f.cancelada,
        'No asistió': f.no_asistio,
        'Sin cerrar': f.sin_cerrar,
        Programadas: f.programada,
        'Asistencia %': f.pct_asistencia ?? '',
        'Pacientes atendidos': f.pacientes_atendidos,
        'Horas atendidas': Math.round((f.minutos_atendidos / 60) * 10) / 10,
        'Sesiones de tratamiento': f.atendidas_por_tipo.tratamiento,
        'Procedimientos individuales': f.atendidas_por_tipo.procedimiento + f.atendidas_por_tipo.item_libre,
        'Citas libres': f.atendidas_por_tipo.cita_libre,
        'Atendidas sin nota firmada': f.atendidas_sin_nota_firmada,
      })
      const hojaResumen = XLSX.utils.json_to_sheet([...resumen.map(filaResumen), filaResumen(totales)])
      hojaResumen['!cols'] = [{ wch: 28 }, ...Array(13).fill({ wch: 14 })]

      const filaCita = (c: CitaReporte) => {
        return {
          Fecha: serialExcel(c.fecha),
          Hora: c.hora,
          'Hora fin': c.hora_fin,
          'Duración (min)': c.duracion_min ?? '',
          Profesional: toTitleCase(c.profesional),
          Sede: c.sede,
          'Sala / equipo': c.recursos,
          Paciente: toTitleCase(c.paciente),
          Documento: c.documento,
          Teléfono: c.telefono,
          Resultado: RESULTADO[c.resultado].label,
          'Estado en la agenda': c.estado.replace('_', ' '),
          'Tipo de atención': TIPO[c.tipo] + (c.es_obsequio ? ' (obsequio)' : ''),
          'Tratamiento / servicio': queFue(c),
          Sesión: c.sesion_numero ?? '',
          'De (total sesiones)': c.sesion_total ?? '',
          'Tipo de sesión': c.tipo_sesion,
          'Motivo de cancelación': c.motivo_cancelacion,
          Confirmación: CONFIRMACION[c.confirmacion] ?? c.confirmacion,
          'Llegada': c.llegada ?? '',
          'Inicio real': c.inicio_real ?? '',
          'Fin real': c.fin_real ?? '',
          'Duración real (min)': c.duracion_real_min ?? '',
          'Historia clínica': HISTORIA[c.historia],
          'Firma de asistencia': FIRMA[c.firma_asistencia] ?? c.firma_asistencia,
          'Agendada por': toTitleCase(c.agendada_por),
          'Agendada el': c.agendada_en.slice(0, 10),
          Canal: CANAL[c.canal_origen] ?? c.canal_origen,
          'Vendida por': toTitleCase(c.vendida_por),
          Motivo: c.motivo,
        }
      }
      const hojaCitas = XLSX.utils.json_to_sheet(citas.map(filaCita))
      citas.forEach((_, i) => {
        const celda = hojaCitas[XLSX.utils.encode_cell({ r: i + 1, c: 0 })]
        if (celda) celda.z = 'dd/mm/yyyy'
      })
      hojaCitas['!cols'] = [
        { wch: 11 }, { wch: 6 }, { wch: 8 }, { wch: 9 }, { wch: 24 }, { wch: 14 }, { wch: 16 }, { wch: 26 },
        { wch: 16 }, { wch: 13 }, { wch: 11 }, { wch: 13 }, { wch: 24 }, { wch: 28 }, { wch: 7 }, { wch: 8 },
        { wch: 16 }, { wch: 24 }, { wch: 13 }, { wch: 8 }, { wch: 9 }, { wch: 8 }, { wch: 10 }, { wch: 16 },
        { wch: 12 }, { wch: 22 }, { wch: 11 }, { wch: 11 }, { wch: 22 }, { wch: 24 },
      ]
      hojaCitas['!autofilter'] = { ref: hojaCitas['!ref'] ?? 'A1' }

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, hojaResumen, 'Resumen')
      XLSX.utils.book_append_sheet(wb, hojaCitas, 'Citas')
      XLSX.writeFile(wb, `citas_por_profesional_${mes}.xlsx`)
    } catch {
      toast.error('No se pudo exportar', 'Vuelve a intentarlo en un momento.')
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reportes"
        description="Citas por profesional: qué pasó con cada cita del mes, de qué fue y cómo le fue a cada profesional."
        helpSlug="reporte-de-citas-por-profesional"
        action={
          <Button variant="outline" className="gap-1.5" disabled={!citas.length} onClick={exportarExcel}>
            <Download className="h-4 w-4" />
            Exportar Excel
          </Button>
        }
      />

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <SelectorMes mes={mes} onChange={conReinicio(setMes)} />
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar paciente o tratamiento…"
              aria-label="Buscar paciente o tratamiento"
              value={busqueda}
              onChange={(e) => conReinicio(setBusqueda)(e.target.value)}
              className="h-9 pl-8"
            />
          </div>
          <MenuFiltros activos={(sede ? 1 : 0) + (profesionales.length ? 1 : 0) + (resultados.length ? 1 : 0) + (tipos.length ? 1 : 0)}>
            {sedes.length > 1 && (
              <SeccionFiltro titulo="Sede">
                <ListaSeleccion
                  opciones={sedes.map((s) => ({ id: s.id, nombre: s.nombre }))}
                  seleccion={sede ? [sede] : []}
                  onChange={(ids) => conReinicio(setSede)(ids[0] ?? null)}
                  todos="Todas las sedes"
                />
              </SeccionFiltro>
            )}
            <SeccionFiltro titulo="Profesional">
              <ListaSeleccion
                multiple
                opciones={opcionesProfesional}
                seleccion={profesionales}
                onChange={conReinicio(setProfesionales)}
                buscar="Buscar profesional…"
                vacio="Nadie tiene citas en este mes."
              />
            </SeccionFiltro>
            <SeccionFiltro titulo="Resultado">
              <ListaSeleccion
                multiple
                opciones={ORDEN_RESULTADOS.map((r) => ({ id: r, nombre: RESULTADO[r].label }))}
                seleccion={resultados}
                onChange={conReinicio(setResultados)}
              />
            </SeccionFiltro>
            <SeccionFiltro titulo="Tipo de atención">
              <ListaSeleccion
                multiple
                opciones={(Object.keys(TIPO) as TipoCitaReporte[]).map((t) => ({ id: t, nombre: TIPO[t] }))}
                seleccion={tipos}
                onChange={conReinicio(setTipos)}
              />
            </SeccionFiltro>
          </MenuFiltros>
        </div>
        <ChipsFiltros chips={chips} onLimpiar={limpiar} />
      </div>

      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError || !data || !totales ? (
        <TablaVacia
          titulo="No pudimos cargar el reporte"
          texto="Revisa tu conexión e inténtalo de nuevo."
          accion={<Button variant="outline" size="sm" onClick={() => refetch()}>Reintentar</Button>}
        />
      ) : !data.citas.length ? (
        <TablaVacia
          icono={<CalendarCheck className="h-5 w-5" />}
          titulo={`Sin citas en ${nombreMes(mes).toLowerCase()}`}
          texto="Prueba con otro mes o con otra sede."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Tarjeta titulo="Citas" valor={totales.total} detalle={`${totales.programada} programadas`} />
            <Tarjeta
              titulo="Atendidas" valor={totales.atendida}
              detalle={`${totales.pacientes_atendidos} ${totales.pacientes_atendidos === 1 ? 'paciente' : 'pacientes'} · ${horas(totales.minutos_atendidos)} h`}
              activa={resultados.length === 1 && resultados[0] === 'atendida'} onClick={() => alternarResultado('atendida')}
            />
            <Tarjeta
              titulo="Canceladas" valor={totales.cancelada}
              detalle={totales.total ? `${Math.round((totales.cancelada * 100) / totales.total)}% de las citas` : undefined}
              activa={resultados.length === 1 && resultados[0] === 'cancelada'} onClick={() => alternarResultado('cancelada')}
            />
            <Tarjeta
              titulo="No asistió" valor={totales.no_asistio} tono="malo" detalle="Cupos perdidos"
              activa={resultados.length === 1 && resultados[0] === 'no_asistio'} onClick={() => alternarResultado('no_asistio')}
            />
            <Tarjeta
              titulo="Sin cerrar" valor={totales.sin_cerrar} tono="aviso" detalle="Nadie las cerró"
              activa={resultados.length === 1 && resultados[0] === 'sin_cerrar'} onClick={() => alternarResultado('sin_cerrar')}
            />
            <Tarjeta
              titulo="Asistencia" valor={totales.pct_asistencia === null ? '—' : `${totales.pct_asistencia}%`}
              detalle="Atendidas vs. no asistió"
            />
          </div>

          <TablaContenedor>
            <Encabezado>
              <Th>Profesional</Th>
              <Th align="right">Citas</Th>
              <Th align="right">Atendidas</Th>
              <Th align="right">Canceladas</Th>
              <Th align="right">No asistió</Th>
              <Th align="right">Sin cerrar</Th>
              <Th align="right" className="hidden xl:table-cell">Programadas</Th>
              <Th align="right" className="hidden sm:table-cell">Asistencia</Th>
              <Th align="right" className="hidden 2xl:table-cell">Pacientes</Th>
              <Th align="right" className="hidden lg:table-cell">Horas</Th>
              <Th align="right" className="hidden 2xl:table-cell">Trat. · Proc. · Libres</Th>
              <Th align="right" className="hidden md:table-cell">Sin nota</Th>
            </Encabezado>
            <tbody>
              {resumen.map((f) => (
                <tr
                  key={f.profesional_id}
                  onClick={() => alternarProfesional(f.profesional_id)}
                  className={cn(
                    'cursor-pointer border-b border-gray-100 transition-colors hover:bg-gray-50/80',
                    profesionales.length === 1 && profesionales[0] === f.profesional_id && 'bg-primary/[0.04]',
                  )}
                >
                  <Td><CeldaPersona nombre={toTitleCase(f.profesional)} /></Td>
                  <CeldasResumen f={f} />
                </tr>
              ))}
              {resumen.length > 1 && (
                <tr className="border-t-2 border-gray-200 bg-gray-50/60">
                  <Td><span className="font-semibold text-gray-900">Total</span></Td>
                  <CeldasResumen f={totales} total />
                </tr>
              )}
            </tbody>
          </TablaContenedor>

          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-900">
              Detalle de citas
              <span className="ml-1.5 font-normal text-muted-foreground tabular-nums">{citas.length}</span>
            </h2>
            {!citas.length ? (
              <TablaVacia titulo="Ninguna cita con estos filtros" texto="Quita algún filtro para ver más." />
            ) : (
              <TablaContenedor
                pie={citas.length > POR_PAGINA
                  ? <Paginacion page={pagina} total={citas.length} pageSize={POR_PAGINA} onPage={setPagina} />
                  : undefined}
              >
                <Encabezado>
                  <Th>Fecha</Th>
                  <Th>Profesional</Th>
                  <Th>Paciente</Th>
                  <Th>Atención</Th>
                  <Th>Resultado</Th>
                  <Th className="hidden lg:table-cell">Historia</Th>
                  {variasSedes && <Th className="hidden xl:table-cell">Sede</Th>}
                </Encabezado>
                <tbody>
                  {visibles.map((c) => (
                    <tr key={c.id} className="border-b border-gray-100 last:border-0 align-top">
                      <Td className="whitespace-nowrap py-2.5">
                        <p className="font-medium text-gray-900">{fechaCorta(c.fecha)}</p>
                        <p className="text-xs tabular-nums text-gray-500">{c.hora}–{c.hora_fin}</p>
                      </Td>
                      <Td className="py-2.5">
                        <p className="max-w-[11rem] truncate text-gray-700">{toTitleCase(c.profesional)}</p>
                        {c.recursos && <p className="max-w-[11rem] truncate text-xs text-gray-500">{c.recursos}</p>}
                      </Td>
                      <Td className="py-2.5">
                        <Link href={`/pacientes/${c.paciente_id}`} className="block max-w-[13rem] truncate font-medium text-gray-900 hover:text-primary hover:underline">
                          {toTitleCase(c.paciente)}
                        </Link>
                        {c.documento && <p className="text-xs tabular-nums text-gray-500">{c.documento}</p>}
                      </Td>
                      <Td className="py-2.5">
                        <p className="max-w-[16rem] truncate text-gray-900" title={queFue(c)}>{queFue(c)}</p>
                        <p className="flex items-center gap-1 text-xs text-gray-500">
                          <span className="truncate">{sesionTexto(c) || TIPO[c.tipo]}</span>
                          {c.es_obsequio && (
                            <span className="inline-flex shrink-0 items-center gap-0.5 text-pink-700">
                              <Gift className="h-3 w-3" /> Obsequio
                            </span>
                          )}
                        </p>
                      </Td>
                      <Td className="py-2.5">
                        <Pastilla resultado={c.resultado} />
                        {detalleResultado(c) && (
                          <p className="mt-0.5 max-w-[12rem] truncate text-xs text-gray-500" title={detalleResultado(c)}>
                            {detalleResultado(c)}
                          </p>
                        )}
                      </Td>
                      <Td className="hidden lg:table-cell py-2.5">
                        {c.resultado === 'atendida' || c.estado === 'en_curso' ? (
                          <span className={cn('text-xs', c.historia === 'firmada' ? 'text-gray-500' : 'font-medium text-amber-700')}>
                            {HISTORIA[c.historia]}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </Td>
                      {variasSedes && <Td className="hidden xl:table-cell py-2.5 text-gray-600">{c.sede}</Td>}
                    </tr>
                  ))}
                </tbody>
              </TablaContenedor>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Sin cerrar:</span> ya pasó su hora y sigue pendiente,
            confirmada, en espera o en curso: nadie registró si el paciente vino.{' '}
            <span className="font-medium text-foreground">Asistencia:</span> atendidas sobre las que se resolvieron
            (atendidas + no asistió). Las sesiones cargadas en la puesta en marcha no cuentan.
            Haz clic en un profesional para ver solo sus citas.
          </p>
        </>
      )}
    </div>
  )
}

export default function CitasPorProfesionalPage() {
  return (
    <RoleGuard check={veDashboard}>
      <CitasPorProfesional />
    </RoleGuard>
  )
}
