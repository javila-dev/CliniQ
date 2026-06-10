'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, XCircle, Clock, Smartphone, ChevronDown, ChevronRight, Loader2, Stethoscope } from 'lucide-react'
import { protocolosApi } from '@/lib/api/protocolos'
import { ConsentimientosSesionCheck } from './ConsentimientosSesionCheck'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { CheckinSheet } from './CheckinSheet'
import type { SesionProcedimiento, SesionEjecutada, TratamientoPaciente, GrupoSesiones } from '@/types/protocolos'

// ─── Vista legacy (sesiones planas, backend actual) ───────────

function SesionFilaLegacy({
  sesion, citaId, tratamientoId, completarMut,
}: {
  sesion: SesionProcedimiento
  citaId: string
  tratamientoId: string
  completarMut: ReturnType<typeof useMutation>
}) {
  const [checkinSesion, setCheckinSesion] = useState<SesionProcedimiento | null>(null)

  return (
    <>
      <div className={cn(
        'flex items-center gap-2 px-3 py-2',
        sesion.estado === 'completado' && 'opacity-60',
        sesion.estado === 'inasistencia' && 'opacity-40',
      )}>
        <div className="shrink-0">
          {sesion.estado === 'completado'   && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
          {sesion.estado === 'inasistencia' && <XCircle className="h-3.5 w-3.5 text-red-400" />}
          {sesion.estado === 'pendiente'    && <Clock className="h-3.5 w-3.5 text-muted-foreground/40" />}
        </div>
        <p className="flex-1 text-xs truncate">
          <span className="text-muted-foreground">{sesion.paso_orden}.</span>{' '}
          {sesion.paso_nombre}
          {sesion.paso_es_control && <span className="ml-1 text-[10px] text-muted-foreground">(ctrl)</span>}
        </p>
        {sesion.estado === 'pendiente' && (
          <div className="flex items-center gap-1 shrink-0">
            {sesion.checkin_verificado
              ? <Badge variant="outline" className="text-[10px] gap-1 text-green-600 py-0"><CheckCircle2 className="h-2.5 w-2.5" /> OK</Badge>
              : <button onClick={() => setCheckinSesion(sesion)} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center transition-colors" title="Verificar presencia"><Smartphone className="h-3 w-3" /></button>
            }
            <Button size="sm" className="h-5 text-[10px] px-2 py-0"
              onClick={() => (completarMut as any).mutate(sesion.id)}
              disabled={(completarMut as any).isPending}>
              {(completarMut as any).isPending ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : '✓'}
            </Button>
          </div>
        )}
      </div>
      {checkinSesion && (
        <CheckinSheet open={!!checkinSesion} onOpenChange={(v) => { if (!v) setCheckinSesion(null) }}
          sesion={checkinSesion} tratamientoId={tratamientoId} />
      )}
    </>
  )
}

function PanelLegacy({ tratamientoResumen, citaId }: { tratamientoResumen: TratamientoPaciente; citaId: string }) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(true)

  const { data: tratamiento } = useQuery({
    queryKey: ['tratamiento', tratamientoResumen.id],
    queryFn: () => protocolosApi.tratamientos.get(tratamientoResumen.id),
    initialData: tratamientoResumen,
  })

  const completarMut = useMutation({
    mutationFn: (sesionId: string) => protocolosApi.sesiones.marcarCompletado(sesionId, { cita: citaId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tratamiento', tratamientoResumen.id] }),
  })

  const totalPendientes = tratamiento?.sesiones?.filter((s) => s.estado === 'pendiente').length ?? 0
  const totalCompletadas = tratamiento?.sesiones?.filter((s) => s.estado === 'completado').length ?? 0

  // Agrupar por paso
  type StepGroup = { pasoId: string; pasoNombre: string; pasoOrden: number; pasoEsControl: boolean; sesiones: SesionProcedimiento[] }
  const grupos: StepGroup[] = []
  const groupMap = new Map<string, StepGroup>()
  for (const s of (tratamiento?.sesiones ?? [])) {
    if (!groupMap.has(s.paso)) {
      const g: StepGroup = { pasoId: s.paso, pasoNombre: s.paso_nombre, pasoOrden: s.paso_orden, pasoEsControl: s.paso_es_control, sesiones: [] }
      groupMap.set(s.paso, g)
      grupos.push(g)
    }
    groupMap.get(s.paso)!.sesiones.push(s)
  }
  grupos.sort((a, b) => a.pasoOrden - b.pasoOrden)

  return (
    <div className="rounded-lg border bg-white overflow-hidden">
      <button className="w-full flex items-center gap-2 px-3 py-2.5 bg-gray-50/60 border-b hover:bg-gray-100/60 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}>
        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        <p className="text-xs font-semibold flex-1">{tratamiento.servicio_nombre}</p>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {tratamiento.pasos_completados}/{tratamiento.total_pasos}
        </span>
        <div className="w-16 h-1.5 rounded-full bg-gray-200 overflow-hidden">
          <div className="h-full rounded-full bg-primary" style={{ width: `${tratamiento.progreso_pct}%` }} />
        </div>
      </button>

      {expanded && (
        <div className="divide-y">
          {grupos.map((grupo) => {
            const esUnica = grupo.sesiones.length === 1
            const completadasG = grupo.sesiones.filter((s) => s.estado === 'completado').length
            return (
              <div key={grupo.pasoId}>
                {!esUnica && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50/40">
                    <span className="text-[10px] text-muted-foreground w-4 shrink-0">{grupo.pasoOrden}.</span>
                    <p className="text-xs font-semibold flex-1">{grupo.pasoNombre}</p>
                    {grupo.pasoEsControl && <span className="text-[9px] text-muted-foreground">(ctrl)</span>}
                    <span className="text-[10px] text-muted-foreground tabular-nums">{completadasG}/{grupo.sesiones.length}</span>
                    <span className="flex items-center gap-0.5">
                      {grupo.sesiones.map((s, i) => (
                        <span key={s.id} className={cn('inline-block h-1.5 w-1.5 rounded-full',
                          s.estado === 'completado' ? 'bg-green-500' : s.estado === 'inasistencia' ? 'bg-red-400' : 'bg-gray-200')} />
                      ))}
                    </span>
                  </div>
                )}
                {grupo.sesiones.map((sesion) => (
                  <SesionFilaLegacy key={sesion.id} sesion={sesion} citaId={citaId}
                    tratamientoId={tratamientoResumen.id} completarMut={completarMut} />
                ))}
              </div>
            )
          })}
          {totalPendientes === 0 && totalCompletadas > 0 && (
            <div className="px-3 py-2.5 text-center">
              <p className="text-xs text-green-600 font-medium">Tratamiento completado ✓</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Vista H27 (grupos por TipoSesion) ───────────────────────

function GrupoSesionPanel({
  grupo, pacienteId, citaId, tratamientoId,
}: {
  grupo: GrupoSesiones
  pacienteId: string
  citaId: string
  tratamientoId: string
}) {
  const qc = useQueryClient()
  const [sesionSeleccionada, setSesionSeleccionada] = useState<SesionEjecutada | null>(null)
  const [mostrarConsentimientos, setMostrarConsentimientos] = useState(false)
  const [puedeEjecutar, setPuedeEjecutar] = useState(true)

  const proxPendiente = grupo.sesiones.find((s) => s.estado === 'pendiente')

  const completarMut = useMutation({
    mutationFn: (sesion: SesionEjecutada) =>
      protocolosApi.sesionesEjecutadas.marcarCompletada(sesion.id, {
        procedimientos_ejecutados: sesion.tipo_sesion_id
          ? grupo.sesiones[0]?.procedimientos_ejecutados ?? []
          : [],
        cita: citaId,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tratamiento', tratamientoId] }),
  })

  return (
    <div className="border-b last:border-0">
      {/* Header del grupo */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50/40">
        <p className="text-xs font-semibold flex-1">{grupo.tipo_sesion_nombre}</p>
        {/* Procedimientos como chips mini */}
        <div className="flex items-center gap-1">
          {grupo.procedimientos.map((p) => (
            <span key={p} className="text-[9px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full border border-emerald-200">
              {p}
            </span>
          ))}
        </div>
        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
          {grupo.completadas}/{grupo.total}
        </span>
        <span className="flex items-center gap-0.5 shrink-0">
          {grupo.sesiones.map((s, i) => (
            <span key={s.id} className={cn('inline-block h-1.5 w-1.5 rounded-full',
              s.estado === 'completada' ? 'bg-green-500' : s.estado === 'inasistencia' ? 'bg-red-400' : 'bg-gray-200')} />
          ))}
        </span>
      </div>

      {/* Próxima sesión pendiente */}
      {proxPendiente && (
        <div className="px-3 py-2 space-y-2">
          {/* Consentimientos toggle */}
          {grupo.procedimientos.length > 0 && (
            <button type="button"
              className="text-[10px] text-muted-foreground hover:text-foreground underline transition-colors"
              onClick={() => setMostrarConsentimientos((v) => !v)}>
              {mostrarConsentimientos ? 'Ocultar consentimientos' : 'Ver estado de consentimientos'}
            </button>
          )}
          {mostrarConsentimientos && (
            <ConsentimientosSesionCheck
              sesionId={proxPendiente.id}
              pacienteId={pacienteId}
              onPuedeContinuar={setPuedeEjecutar}
            />
          )}
          {/* Acciones */}
          <div className="flex items-center gap-2">
            <Button size="sm" className="h-6 text-[10px] px-2 py-0 flex-1"
              disabled={completarMut.isPending || !puedeEjecutar}
              onClick={() => completarMut.mutate(proxPendiente)}
              title={!puedeEjecutar ? 'Hay consentimientos faltantes o vencidos' : undefined}>
              {completarMut.isPending ? <Loader2 className="h-2.5 w-2.5 animate-spin mr-1" /> : '✓ '}
              Completar sesión {proxPendiente.numero}/{grupo.total}
            </Button>
          </div>
        </div>
      )}

      {/* Sesiones completadas */}
      {grupo.sesiones.filter((s) => s.estado !== 'pendiente').map((s) => (
        <div key={s.id} className={cn('flex items-center gap-2 px-3 py-1.5', s.estado === 'completada' ? 'opacity-50' : 'opacity-40')}>
          {s.estado === 'completada'
            ? <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
            : <XCircle className="h-3 w-3 text-red-400 shrink-0" />}
          <p className="text-[10px] text-muted-foreground">
            Sesión {s.numero}
            {s.fecha && ` · ${new Date(s.fecha).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}`}
          </p>
        </div>
      ))}
    </div>
  )
}

function PanelH27({ tratamientoResumen, citaId }: { tratamientoResumen: TratamientoPaciente; citaId: string }) {
  const [expanded, setExpanded] = useState(true)

  const { data: tratamiento } = useQuery({
    queryKey: ['tratamiento', tratamientoResumen.id],
    queryFn: () => protocolosApi.tratamientos.get(tratamientoResumen.id),
    initialData: tratamientoResumen,
  })

  const grupos = tratamiento?.grupos ?? []
  const completadas = grupos.reduce((a, g) => a + g.completadas, 0)
  const total = grupos.reduce((a, g) => a + g.total, 0)

  return (
    <div className="rounded-lg border bg-white overflow-hidden">
      <button className="w-full flex items-center gap-2 px-3 py-2.5 bg-gray-50/60 border-b hover:bg-gray-100/60 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}>
        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        <p className="text-xs font-semibold flex-1">{tratamiento.tratamiento_catalogo_nombre ?? tratamiento.servicio_nombre}</p>
        <span className="text-[10px] text-muted-foreground tabular-nums">{completadas}/{total}</span>
        <div className="w-16 h-1.5 rounded-full bg-gray-200 overflow-hidden">
          <div className="h-full rounded-full bg-primary" style={{ width: `${tratamiento.progreso_pct}%` }} />
        </div>
      </button>

      {expanded && grupos.length > 0 && (
        <div>
          {grupos.map((grupo) => (
            <GrupoSesionPanel key={grupo.tipo_sesion_id}
              grupo={grupo}
              pacienteId={tratamientoResumen.paciente}
              citaId={citaId}
              tratamientoId={tratamientoResumen.id}
            />
          ))}
        </div>
      )}

      {expanded && grupos.length === 0 && (
        <p className="px-3 py-3 text-xs text-muted-foreground text-center">Sin sesiones registradas</p>
      )}
    </div>
  )
}

// ─── Panel principal ──────────────────────────────────────────

interface ProtocoloPanelAtencionProps {
  pacienteId: string
  citaId: string
  itemCotizacionId?: string | null
}

export function ProtocoloPanelAtencion({ pacienteId, citaId, itemCotizacionId }: ProtocoloPanelAtencionProps) {
  const { data: tratamientos = [], isLoading } = useQuery({
    queryKey: ['tratamientos-paciente', pacienteId],
    queryFn: () => protocolosApi.tratamientos.list({ paciente: pacienteId, estado: 'activo' }),
    enabled: Boolean(pacienteId),
  })

  if (isLoading) return (
    <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
  )
  if (tratamientos.length === 0) return null

  const relevante = itemCotizacionId
    ? tratamientos.find((t) => t.cotizacion_item === itemCotizacionId)
    : null

  const mostrar = relevante ? [relevante] : tratamientos

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Protocolo activo</p>
      {mostrar.map((t) =>
        // Si el backend devuelve grupos (H27), usar la vista nueva; si no, vista legacy
        t.grupos && t.grupos.length > 0
          ? <PanelH27 key={t.id} tratamientoResumen={t} citaId={citaId} />
          : <PanelLegacy key={t.id} tratamientoResumen={t} citaId={citaId} />
      )}
    </div>
  )
}
