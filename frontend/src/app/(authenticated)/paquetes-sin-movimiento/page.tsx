'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { CalendarX, ClipboardCheck, Download, X } from 'lucide-react'
import * as XLSX from 'xlsx'

import { reportesApi } from '@/lib/api/reportes'
import { hasPermission, PERM, veDashboard } from '@/lib/permissions'
import { useAuthStore } from '@/store/authStore'
import { cn, formatFechaDMY } from '@/lib/utils'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { PageHeader } from '@/components/shared/PageHeader'
import { LoadingState } from '@/components/shared/LoadingState'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useUserSedes } from '@/hooks/useUserSedes'
import {
  CeldaPersona, Encabezado, FilaClic, Paginacion, TablaContenedor, TablaVacia, Td, Th,
} from '@/components/shared/TablaDatos'
import type { PaqueteSinMovimiento, ResumenPaquetes } from '@/types/reportes'

import { RegularizarPaquete } from './_regularizar'

const PAGE_SIZE = 25
const TODAS = 'todas'
const SIN_RESPONSABLE = 'sin-responsable'
const OPCIONES_DIAS = [15, 30, 60, 90]

type Origen = typeof TODAS | 'venta' | 'importado'

function Tile({ valor, etiqueta, tono }: { valor: number; etiqueta: string; tono?: 'aviso' }) {
  return (
    <div className="rounded-xl border border-gray-200/80 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <p className={cn('text-2xl font-semibold tabular-nums', tono === 'aviso' && valor > 0 ? 'text-amber-600' : 'text-gray-900')}>
        {valor}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{etiqueta}</p>
    </div>
  )
}

function EtiquetaOrigen({ origen }: { origen: PaqueteSinMovimiento['origen'] }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
        origen === 'importado' ? 'bg-violet-50 text-violet-700 ring-violet-600/15' : 'bg-sky-50 text-sky-700 ring-sky-600/15',
      )}
    >
      {origen === 'importado' ? 'Importado' : 'Venta'}
    </span>
  )
}

/** Quién vendió o importó cuántos paquetes y cuántos están quietos. */
function TablaResumen({
  titulo, filas, seleccionado, onSeleccionar,
}: {
  titulo: string
  filas: ResumenPaquetes[]
  seleccionado?: string | null
  onSeleccionar?: (id: string) => void
}) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-gray-900">{titulo}</h2>
      <TablaContenedor>
        <Encabezado>
          <Th>{titulo === 'Por sede' ? 'Sede' : 'Responsable'}</Th>
          <Th align="right">Activos</Th>
          <Th align="right">Sin movimiento</Th>
          <Th align="right" className="hidden sm:table-cell">Nunca agendados</Th>
        </Encabezado>
        <tbody>
          {filas.map((f) => {
            const id = f.id ?? SIN_RESPONSABLE
            const pct = f.activos ? Math.round((f.sin_movimiento / f.activos) * 100) : 0
            const contenido = (
              <>
                <Td>
                  <span className={cn('font-medium', seleccionado === id && 'text-primary')}>
                    {f.nombre ?? (titulo === 'Por sede' ? 'Sin sede' : 'Sin responsable')}
                  </span>
                  {f.registradas_despues > 0 && (
                    <span
                      className="block text-[11px] text-violet-700"
                      title="Sesiones hechas por fuera de la app y registradas después, también de paquetes ya completos"
                    >
                      {f.registradas_despues === 1 ? '1 registrada después' : `${f.registradas_despues} registradas después`}
                    </span>
                  )}
                </Td>
                <Td align="right" className="tabular-nums">{f.activos}</Td>
                <Td align="right">
                  <span className={cn('tabular-nums', f.sin_movimiento > 0 && 'font-medium text-amber-700')}>{f.sin_movimiento}</span>
                  <span className="ml-1.5 text-[11px] tabular-nums text-gray-500">{pct}%</span>
                </Td>
                <Td align="right" className="hidden tabular-nums sm:table-cell">{f.nunca_agendados}</Td>
              </>
            )
            return onSeleccionar ? (
              <FilaClic key={id} onClick={() => onSeleccionar(id)}>{contenido}</FilaClic>
            ) : (
              <tr key={id} className="border-b border-gray-100 last:border-0">{contenido}</tr>
            )
          })}
        </tbody>
      </TablaContenedor>
    </div>
  )
}

function Movimiento({ p }: { p: PaqueteSinMovimiento }) {
  if (p.estado === 'nunca_agendado') {
    return (
      <div className="leading-tight">
        <p className="font-medium text-amber-700">Nunca agendado</p>
        <p className="text-[11px] text-gray-500">{p.origen === 'importado' ? 'Importado' : 'Vendido'} el {formatFechaDMY(p.inicio)}</p>
      </div>
    )
  }
  return (
    <div className="leading-tight">
      <p className="text-gray-900">{p.ultima_atencion ? `Última sesión ${formatFechaDMY(p.ultima_atencion)}` : 'Sin sesiones hechas'}</p>
      <p className="text-[11px] text-gray-500">Sin próxima cita</p>
    </div>
  )
}

function PaquetesSinMovimiento() {
  const router = useRouter()
  const { sedes } = useUserSedes()
  const [sede, setSede] = useState(TODAS)
  const [dias, setDias] = useState(30)
  const [origen, setOrigen] = useState<Origen>(TODAS)
  const [responsable, setResponsable] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [abriendo, setAbriendo] = useState<string | null>(null)
  const [regularizando, setRegularizando] = useState<PaqueteSinMovimiento | null>(null)
  const { user } = useAuthStore()
  const puedeRegularizar = hasPermission(user, PERM.REPORTES_REGULARIZAR)

  const params = {
    dias,
    ...(sede !== TODAS && { sede_id: sede }),
    ...(origen !== TODAS && { origen }),
  }
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['reportes', 'paquetes-sin-movimiento', params],
    queryFn: () => reportesApi.getPaquetesSinMovimiento(params),
  })

  // El resumen se calcula sobre todos; el filtro por responsable solo acota la lista.
  const paquetes = useMemo(
    () => (data?.paquetes ?? []).filter(
      (p) => !responsable || (p.responsable_id ?? SIN_RESPONSABLE) === responsable,
    ),
    [data, responsable],
  )
  const visibles = paquetes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const nombreResponsable = responsable
    ? data?.por_responsable.find((r) => (r.id ?? SIN_RESPONSABLE) === responsable)?.nombre ?? 'Sin responsable'
    : null
  const hayFiltros = sede !== TODAS || origen !== TODAS || dias !== 30 || !!responsable

  function conReinicio<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v)
      setPage(1)
    }
  }

  function limpiar() {
    setSede(TODAS)
    setOrigen(TODAS)
    setDias(30)
    setResponsable(null)
    setPage(1)
  }

  function abrir(p: PaqueteSinMovimiento) {
    setAbriendo(p.item_id)
    router.push(p.origen === 'venta' ? `/ventas/${p.cotizacion_id}` : `/pacientes/${p.paciente_id}`)
  }

  function exportarExcel() {
    const filas = paquetes.map((p) => ({
      Paciente: p.paciente_nombre,
      Tratamiento: p.tratamiento,
      Origen: p.origen === 'importado' ? 'Importado' : 'Venta',
      Responsable: p.responsable_nombre ?? '',
      Sede: p.sede_nombre ?? '',
      'Vendido o importado': p.inicio ? new Date(`${p.inicio}T00:00:00`) : '',
      'Sesiones hechas': p.sesiones_hechas,
      'Sesiones vendidas': p.sesiones_total,
      'Citas en la app': p.citas_en_app,
      'Última sesión': p.ultima_atencion ? new Date(`${p.ultima_atencion}T00:00:00`) : '',
      'Días sin movimiento': p.dias_sin_movimiento,
      'Registradas después': p.registradas_despues,
      Estado: p.estado === 'nunca_agendado' ? 'Nunca agendado' : 'Sin próxima cita',
    }))
    const ws = XLSX.utils.json_to_sheet(filas, { cellDates: true, dateNF: 'dd/mm/yyyy' })
    ws['!cols'] = [
      { wch: 28 }, { wch: 26 }, { wch: 10 }, { wch: 24 }, { wch: 16 }, { wch: 12 },
      { wch: 9 }, { wch: 9 }, { wch: 9 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 16 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sin movimiento')
    XLSX.writeFile(wb, `paquetes_sin_movimiento_${new Date().toLocaleDateString('en-CA')}.xlsx`)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Paquetes sin movimiento"
        description={
          puedeRegularizar
            ? 'Tratamientos vendidos o importados a los que les faltan sesiones y no tienen próxima cita. Si se atendieron por fuera de la app, regístralas desde cada paquete.'
            : 'Tratamientos vendidos o importados a los que les faltan sesiones y no tienen próxima cita. Si se atienden por fuera de la app, aparecen aquí.'
        }
        backHref="/dashboard"
        action={
          <Button variant="outline" className="gap-1.5" disabled={!paquetes.length} onClick={exportarExcel}>
            <Download className="h-4 w-4" />
            Exportar Excel
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Sin movimiento hace</label>
          <Select value={String(dias)} onValueChange={(v) => conReinicio(setDias)(Number(v))}>
            <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {OPCIONES_DIAS.map((d) => <SelectItem key={d} value={String(d)}>{d} días o más</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {sedes.length > 1 && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Sede</label>
            <Select value={sede} onValueChange={conReinicio(setSede)}>
              <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS}>Todas las sedes</SelectItem>
                {sedes.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Origen</label>
          <Select value={origen} onValueChange={(v) => conReinicio(setOrigen)(v as Origen)}>
            <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODAS}>Todos</SelectItem>
              <SelectItem value="venta">Solo ventas</SelectItem>
              <SelectItem value="importado">Solo importados</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {hayFiltros && (
          <Button variant="ghost" size="sm" className="h-9" onClick={limpiar}>
            <X className="mr-1.5 h-3.5 w-3.5" />
            Limpiar
          </Button>
        )}
      </div>

      {isLoading ? (
        <LoadingState rows={4} />
      ) : isError || !data ? (
        <TablaVacia
          titulo="No pudimos cargar el reporte"
          texto="Revisa tu conexión e inténtalo de nuevo."
          accion={<Button variant="outline" size="sm" onClick={() => refetch()}>Reintentar</Button>}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile valor={data.totales.activos} etiqueta="Paquetes con sesiones por hacer" />
            <Tile valor={data.totales.sin_movimiento} etiqueta={`Sin movimiento hace ${dias} días o más`} tono="aviso" />
            <Tile valor={data.totales.nunca_agendados} etiqueta="Nunca se agendaron en la app" tono="aviso" />
            <Tile valor={data.totales.sesiones_pendientes} etiqueta="Sesiones por hacer en ellos" />
          </div>

          {data.totales.activos > 0 && (
            <div className={cn('grid gap-4', data.por_sede.length > 1 && 'lg:grid-cols-2')}>
              <TablaResumen
                titulo="Por responsable"
                filas={data.por_responsable}
                seleccionado={responsable}
                onSeleccionar={(id) => { setResponsable(id === responsable ? null : id); setPage(1) }}
              />
              {data.por_sede.length > 1 && <TablaResumen titulo="Por sede" filas={data.por_sede} />}
            </div>
          )}

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-900">
                {paquetes.length} paquete{paquetes.length !== 1 ? 's' : ''} sin movimiento
              </h2>
              {nombreResponsable && (
                <button
                  type="button"
                  onClick={() => { setResponsable(null); setPage(1) }}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
                >
                  {nombreResponsable}
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            {!paquetes.length ? (
              <TablaVacia
                icono={<CalendarX className="h-5 w-5" />}
                titulo="Nada quieto"
                texto={`Todos los paquetes con sesiones por hacer tienen próxima cita o se movieron hace menos de ${dias} días.`}
              />
            ) : (
              <TablaContenedor pie={<Paginacion page={page} total={paquetes.length} pageSize={PAGE_SIZE} onPage={setPage} />}>
                <Encabezado>
                  <Th>Paciente</Th>
                  <Th className="hidden md:table-cell">Responsable</Th>
                  <Th className="hidden lg:table-cell">Sesiones</Th>
                  <Th>Movimiento</Th>
                  <Th align="right">Días</Th>
                  {puedeRegularizar && <Th align="right"><span className="sr-only">Acciones</span></Th>}
                </Encabezado>
                <tbody>
                  {visibles.map((p) => (
                    <FilaClic key={p.item_id} onClick={() => abrir(p)} cargando={abriendo === p.item_id}>
                      <Td><CeldaPersona nombre={p.paciente_nombre} detalle={p.tratamiento} /></Td>
                      <Td className="hidden md:table-cell">
                        <div className="leading-tight">
                          <p className="text-gray-900">{p.responsable_nombre ?? 'Sin responsable'}</p>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <EtiquetaOrigen origen={p.origen} />
                            {sedes.length > 1 && p.sede_nombre && <span className="text-[11px] text-gray-500">{p.sede_nombre}</span>}
                          </div>
                        </div>
                      </Td>
                      <Td className="hidden lg:table-cell">
                        <span className="tabular-nums text-gray-700">{p.sesiones_hechas}/{p.sesiones_total}</span>
                        <span className="ml-1.5 text-[11px] text-gray-500">
                          {p.citas_en_app} cita{p.citas_en_app !== 1 ? 's' : ''} en la app
                        </span>
                        {p.registradas_despues > 0 && (
                          <span className="block text-[11px] text-violet-700">
                            {p.registradas_despues} registrada{p.registradas_despues !== 1 ? 's' : ''} después
                          </span>
                        )}
                      </Td>
                      <Td><Movimiento p={p} /></Td>
                      <Td align="right">
                        <span className="font-medium tabular-nums text-gray-900">{p.dias_sin_movimiento}</span>
                      </Td>
                      {puedeRegularizar && (
                        <Td align="right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 px-2.5 text-xs"
                            title="Registrar sesiones hechas por fuera de la app"
                            aria-label={`Regularizar el paquete de ${p.paciente_nombre}`}
                            onClick={(e) => { e.stopPropagation(); setRegularizando(p) }}
                          >
                            <ClipboardCheck className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Regularizar</span>
                          </Button>
                        </Td>
                      )}
                    </FilaClic>
                  ))}
                </tbody>
              </TablaContenedor>
            )}
          </div>
        </>
      )}

      {puedeRegularizar && <RegularizarPaquete paquete={regularizando} onClose={() => setRegularizando(null)} />}
    </div>
  )
}

export default function PaquetesSinMovimientoPage() {
  return (
    <RoleGuard check={veDashboard}>
      <PaquetesSinMovimiento />
    </RoleGuard>
  )
}
