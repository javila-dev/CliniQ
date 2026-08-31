'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, CheckCircle2, Clock, XCircle, AlertCircle, Download, Loader2, CalendarPlus, ChevronDown, ChevronRight, History } from 'lucide-react'
import { cotizacionesApi } from '@/lib/api/cotizaciones'
import { protocolosApi } from '@/lib/api/protocolos'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { NuevaCitaModal } from '@/components/agenda/NuevaCitaModal'
import { SesionTimeline } from './SesionTimeline'
import { formatDateTime } from '@/lib/utils'
import type { HistorialSesion, TipoItemCotizacion } from '@/types/cotizaciones'
import type { BusquedaPaciente } from '@/types/pacientes'
import type { GrupoSesiones, SesionEjecutada } from '@/types/protocolos'

interface SesionesCotizacionPanelProps {
  cotizacionId: string
  pacienteId: string
}

const ESTADO_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'success' | 'destructive' | 'outline'; icon: React.ElementType }> = {
  pendiente:   { label: 'Confirmar',   variant: 'secondary',   icon: Clock         },
  confirmada:  { label: 'Confirmada',  variant: 'outline',     icon: CheckCircle2  },
  en_espera:   { label: 'En espera',   variant: 'secondary',   icon: Clock         },
  en_curso:    { label: 'En curso',    variant: 'default',     icon: Clock         },
  completada:  { label: 'Completada',  variant: 'success',     icon: CheckCircle2  },
  cancelada:   { label: 'Cancelada',   variant: 'destructive', icon: XCircle       },
  no_asistio:  { label: 'No asistió',  variant: 'destructive', icon: AlertCircle   },
}

function EstadoBadge({ estado }: { estado: string }) {
  const cfg = ESTADO_CONFIG[estado] ?? { label: estado, variant: 'secondary', icon: Clock }
  return (
    <Badge variant={cfg.variant as any} className="text-xs gap-1">
      <cfg.icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  )
}

/** Fila de una sesión: ya agendada (con datos de cita) o pendiente de agendar. */
interface SesionFila {
  key: string
  titulo: string
  // Agendada / ejecutada
  citaEstado?: string
  fecha?: string | null
  detalle?: string | null
  citaId?: string | null   // para enlazar la línea de tiempo de la sesión
  // Pendiente de agendar
  agendable?: boolean
  sesionEjecutadaId?: string | null
}

function SesionRow({
  fila,
  onAgendar,
  historial,
  historialAbierto,
  onToggleHistorial,
}: {
  fila: SesionFila
  onAgendar: (sesionEjecutadaId: string | null) => void
  historial?: HistorialSesion
  historialAbierto: boolean
  onToggleHistorial: () => void
}) {
  const tieneHistorial = !!historial && historial.eventos.length > 0
  return (
    <div>
      <div className="flex items-center justify-between px-3 py-2 gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium">{fila.titulo}</p>
          {fila.fecha ? (
            <p className="text-xs text-muted-foreground truncate">
              {formatDateTime(fila.fecha)}
              {fila.detalle ? ` · ${fila.detalle}` : ''}
            </p>
          ) : fila.detalle ? (
            <p className="text-xs text-muted-foreground truncate">{fila.detalle}</p>
          ) : (
            <p className="text-xs text-muted-foreground">Sin agendar</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {tieneHistorial && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-muted-foreground"
              onClick={onToggleHistorial}
              aria-expanded={historialAbierto}
              aria-label="Ver historial de la sesión"
              title="Historial de la sesión"
            >
              <History className="h-3.5 w-3.5" />
            </Button>
          )}
          {fila.agendable ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => onAgendar(fila.sesionEjecutadaId ?? null)}
            >
              <CalendarPlus className="h-3.5 w-3.5 mr-1.5" />
              Agendar
            </Button>
          ) : fila.citaEstado ? (
            <EstadoBadge estado={fila.citaEstado} />
          ) : null}
        </div>
      </div>
      {tieneHistorial && historialAbierto && (
        <div className="border-t bg-muted/20 pb-1">
          <SesionTimeline eventos={historial!.eventos} />
        </div>
      )}
    </div>
  )
}

export function SesionesCotizacionPanel({ cotizacionId, pacienteId }: SesionesCotizacionPanelProps) {
  const queryClient = useQueryClient()
  const [descargando, setDescargando] = useState(false)
  // Ítems cuya lista de sesiones está desplegada. Colapsada por defecto: una
  // cotización puede tener muchas sesiones y todas abiertas satura la pantalla.
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [modal, setModal] = useState<{
    itemId: string
    itemTipo: TipoItemCotizacion
    sesionEjecutadaId: string | null
  } | null>(null)

  // staleTime 0 + refetchOnMount 'always': los estados de cita/sesión cambian desde
  // agenda y atención sin invalidar estas queries, así que forzamos datos frescos
  // cada vez que se entra a la cotización (o se recarga la página).
  const SIEMPRE_FRESCO = { staleTime: 0, refetchOnMount: 'always' as const }

  const { data, isLoading } = useQuery({
    queryKey: ['cotizacion-sesiones', cotizacionId],
    queryFn: () => cotizacionesApi.sesiones(cotizacionId),
    ...SIEMPRE_FRESCO,
  })

  // Línea de tiempo por sesión (agendó/reagendó/confirmó/check-in/atendió/canceló),
  // indexada por cita para engancharla a cada fila.
  const { data: historial } = useQuery({
    queryKey: ['cotizacion-historial-sesiones', cotizacionId],
    queryFn: () => cotizacionesApi.historialSesiones(cotizacionId),
    ...SIEMPRE_FRESCO,
  })
  const historialByCita = useMemo(
    () => new Map((historial?.sesiones ?? []).map((s) => [s.cita_id, s])),
    [historial],
  )
  const [historialAbierto, setHistorialAbierto] = useState<Set<string>>(new Set())
  function toggleHistorial(citaId: string) {
    setHistorialAbierto((prev) => {
      const next = new Set(prev)
      if (next.has(citaId)) next.delete(citaId)
      else next.add(citaId)
      return next
    })
  }

  // Tratamientos activos del paciente → para resolver las sesiones tipadas de cada ítem
  const { data: tratamientos } = useQuery({
    queryKey: ['tratamientos-cotizacion-panel', pacienteId],
    queryFn: () => protocolosApi.tratamientos.list({ paciente: pacienteId, estado: 'activo' }),
    enabled: Boolean(pacienteId),
    ...SIEMPRE_FRESCO,
  })

  const tratIdByItem = useMemo(() => {
    const m = new Map<string, string>()
    for (const item of data?.items ?? []) {
      if (item.tipo !== 'tratamiento') continue
      const t = tratamientos?.find((tp) => tp.cotizacion_item === item.item_id)
      if (t) m.set(item.item_id, t.id)
    }
    return m
  }, [data?.items, tratamientos])

  const detalleQueries = useQueries({
    queries: [...tratIdByItem.values()].map((id) => ({
      queryKey: ['tratamiento-detalle-panel', id],
      queryFn: () => protocolosApi.tratamientos.get(id),
      ...SIEMPRE_FRESCO,
    })),
  })
  const gruposByTratId = useMemo(() => {
    const m = new Map<string, ReturnType<typeof mapGrupos>>()
    for (const q of detalleQueries) {
      if (q.data) m.set(q.data.id, mapGrupos(q.data.grupos ?? []))
    }
    return m
  }, [detalleQueries])

  const pacienteBusqueda = useMemo<BusquedaPaciente>(() => ({
    id: pacienteId,
    nombre_completo: data?.paciente_nombre ?? '',
    numero_documento: '',
    tipo_documento: 'CC',
    telefono: '',
    canal_confirmacion: 'whatsapp',
  }), [pacienteId, data?.paciente_nombre])

  async function descargarConsolidado() {
    setDescargando(true)
    try {
      const blob = await cotizacionesApi.descargarConsolidadoAsistencia(cotizacionId)
      const url = URL.createObjectURL(blob)
      Object.assign(document.createElement('a'), {
        href: url,
        download: `consolidado-asistencia-${cotizacionId.slice(0, 8)}.pdf`,
      }).click()
      URL.revokeObjectURL(url)
    } finally {
      setDescargando(false)
    }
  }

  function refrescar() {
    queryClient.invalidateQueries({ queryKey: ['cotizacion-sesiones', cotizacionId] })
    queryClient.invalidateQueries({ queryKey: ['cotizacion-historial-sesiones', cotizacionId] })
    queryClient.invalidateQueries({ queryKey: ['tratamientos-cotizacion-panel', pacienteId] })
    queryClient.invalidateQueries({ queryKey: ['tratamiento-detalle-panel'] })
  }

  function toggleItem(itemId: string) {
    setExpandidos((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Seguimiento de sesiones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </CardContent>
      </Card>
    )
  }

  if (!data?.items.length) return null

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              Seguimiento de sesiones
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={descargarConsolidado} disabled={descargando}>
                {descargando ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                )}
                Consolidado
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link href={`/agenda`}>Ir a agenda</Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {data.items.map((item) => {
            const usadas = item.num_citas - item.citas_restantes
            const pct = item.num_citas > 0 ? Math.round((usadas / item.num_citas) * 100) : 0

            const tratId = tratIdByItem.get(item.item_id)
            const grupos = tratId ? gruposByTratId.get(tratId) : undefined

            const filas: SesionFila[] = grupos
              ? construirFilasTipadas(grupos, item.citas, item.num_citas)
              : construirFilasOrdinales(item.descripcion, item.num_citas, item.citas)

            const abierto = expandidos.has(item.item_id)

            return (
              <div key={item.item_id} className="space-y-3">
                {/* Header del ítem */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-medium">{item.descripcion}</p>
                      {item.tipo && item.tipo !== 'libre' && (
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${
                          item.tipo === 'tratamiento'
                            ? 'bg-violet-100 text-violet-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {item.tipo === 'tratamiento' ? 'Tratamiento' : 'Procedimiento'}
                        </span>
                      )}
                    </div>
                    {item.periodicidad && (
                      <p className="text-xs text-muted-foreground">{item.periodicidad}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-semibold tabular-nums">{usadas}/{item.num_citas}</p>
                    <p className="text-xs text-muted-foreground">{item.citas_restantes} restantes</p>
                  </div>
                </div>

                {/* Barra de progreso */}
                <div className="space-y-1">
                  <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>{item.citas_completadas} completadas · {item.citas_agendadas} agendadas</span>
                    <span>{pct}%</span>
                  </div>
                </div>

                {/* Lista de sesiones individuales (desplegable) */}
                {filas.length > 0 && (
                  <div className="rounded-md border">
                    <button
                      type="button"
                      onClick={() => toggleItem(item.item_id)}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors"
                      aria-expanded={abierto}
                    >
                      <span className="text-xs font-medium text-muted-foreground">
                        {abierto ? 'Ocultar' : 'Ver'} {filas.length} {filas.length === 1 ? 'sesión' : 'sesiones'}
                      </span>
                      {abierto
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                    </button>
                    {abierto && (
                      <div className="divide-y border-t text-sm">
                        {filas.map((fila) => (
                          <SesionRow
                            key={fila.key}
                            fila={fila}
                            historial={fila.citaId ? historialByCita.get(fila.citaId) : undefined}
                            historialAbierto={!!fila.citaId && historialAbierto.has(fila.citaId)}
                            onToggleHistorial={() => { if (fila.citaId) toggleHistorial(fila.citaId) }}
                            onAgendar={(sesionEjecutadaId) =>
                              setModal({
                                itemId: item.item_id,
                                itemTipo: (item.tipo ?? 'libre') as TipoItemCotizacion,
                                sesionEjecutadaId,
                              })
                            }
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>

      <NuevaCitaModal
        open={modal !== null}
        onOpenChange={(o) => { if (!o) setModal(null) }}
        defaultPaciente={pacienteBusqueda}
        defaultModo="cotizacion"
        defaultItemCotizacion={modal?.itemId ?? null}
        defaultItemCotizacionTipo={modal?.itemTipo ?? null}
        defaultSesionEjecutada={modal?.sesionEjecutadaId ?? null}
        onCreated={refrescar}
      />
    </>
  )
}

// ── Helpers de construcción de filas ───────────────────────────

type GrupoMapeado = {
  tipoSesionNombre: string
  total: number
  sesiones: SesionEjecutada[]
}

function mapGrupos(grupos: GrupoSesiones[]): GrupoMapeado[] {
  return grupos.map((g) => ({
    tipoSesionNombre: g.tipo_sesion_nombre,
    total: g.total,
    sesiones: [...g.sesiones].sort((a, b) => a.numero - b.numero),
  }))
}

/** Sesiones tipadas (ítems de tipo tratamiento). */
function construirFilasTipadas(
  grupos: GrupoMapeado[],
  citas: { cita_id: string; fecha_inicio: string; estado: string; profesional_nombre: string; sede_nombre: string }[],
  totalItem: number,
): SesionFila[] {
  const citaById = new Map(citas.map((c) => [c.cita_id, c]))
  const filas: SesionFila[] = []
  const total = totalItem || grupos.reduce((n, g) => n + g.total, 0)

  // Numeración global del ítem (corrida entre todos los tipos de sesión), no
  // por tipo: "Sesión 3/11 · NUTRICION" en vez de "Sesión 1/6 · NUTRICION".
  let indice = 0
  for (const grupo of grupos) {
    for (const s of grupo.sesiones) {
      indice += 1
      const titulo = `Sesión ${indice}/${total} · ${grupo.tipoSesionNombre}`

      if (s.estado === 'completada') {
        const cita = s.cita ? citaById.get(s.cita) : undefined
        filas.push({
          key: s.id,
          titulo,
          citaEstado: 'completada',
          citaId: cita?.cita_id ?? null,
          fecha: cita?.fecha_inicio ?? s.fecha,
          detalle: cita ? `${cita.profesional_nombre} · ${cita.sede_nombre}` : s.profesional_nombre,
        })
        continue
      }
      if (s.estado === 'inasistencia') {
        const cita = s.cita ? citaById.get(s.cita) : undefined
        filas.push({ key: s.id, titulo, citaEstado: 'no_asistio', citaId: cita?.cita_id ?? null, fecha: s.fecha, detalle: s.profesional_nombre })
        continue
      }

      // pendiente
      const cita = s.cita ? citaById.get(s.cita) : undefined
      if (cita && cita.estado !== 'cancelada') {
        filas.push({
          key: s.id,
          titulo,
          citaEstado: cita.estado,
          citaId: cita.cita_id,
          fecha: cita.fecha_inicio,
          detalle: `${cita.profesional_nombre} · ${cita.sede_nombre}`,
        })
      } else {
        // Sin cita, o la única cita quedó cancelada: la sesión vuelve a ser
        // agendable (el backend ya liberó el cupo vía citas_no_canceladas()).
        filas.push({
          key: s.id,
          titulo,
          agendable: true,
          sesionEjecutadaId: s.id,
          detalle: cita ? 'Cita anterior cancelada' : null,
        })
      }
    }
  }
  return filas
}

/** Slots ordinales (ítems de tipo procedimiento / libre, sin sesiones tipadas). */
function construirFilasOrdinales(
  descripcion: string,
  numCitas: number,
  citas: { cita_id: string; fecha_inicio: string; estado: string; profesional_nombre: string; sede_nombre: string }[],
): SesionFila[] {
  // Las citas canceladas no ocupan slot: el cupo se libera y la sesión vuelve a
  // ser agendable (igual que citas_no_canceladas() en el backend).
  const ordenadas = citas
    .filter((c) => c.estado !== 'cancelada')
    .sort((a, b) => new Date(a.fecha_inicio).getTime() - new Date(b.fecha_inicio).getTime())
  const filas: SesionFila[] = []
  for (let i = 0; i < Math.max(numCitas, ordenadas.length); i++) {
    const titulo = `Sesión ${i + 1}${numCitas ? `/${numCitas}` : ''}`
    const cita = ordenadas[i]
    if (cita) {
      filas.push({
        key: cita.cita_id,
        titulo,
        citaEstado: cita.estado,
        citaId: cita.cita_id,
        fecha: cita.fecha_inicio,
        detalle: `${cita.profesional_nombre} · ${cita.sede_nombre}`,
      })
    } else {
      filas.push({ key: `${descripcion}-slot-${i}`, titulo, agendable: true, sesionEjecutadaId: null })
    }
  }
  return filas
}
