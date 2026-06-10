'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown, ChevronRight, CheckCircle2, XCircle, Clock,
  Download, Smartphone, Camera, Loader2,
} from 'lucide-react'
import { protocolosApi } from '@/lib/api/protocolos'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn, formatDate } from '@/lib/utils'
import { CheckinSheet } from './CheckinSheet'
import type { TratamientoPaciente, SesionProcedimiento } from '@/types/protocolos'

// ─── Estado del tratamiento ───────────────────────────────────

const ESTADO_TRAT: Record<string, { label: string; className: string }> = {
  activo:     { label: 'En curso',   className: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'  },
  completado: { label: 'Completado', className: 'bg-green-50 text-green-700 ring-1 ring-green-200'},
  abandonado: { label: 'Abandonado', className: 'bg-gray-50 text-gray-600 ring-1 ring-gray-200'  },
}

// ─── Agrupación de sesiones por paso ─────────────────────────

interface StepGroup {
  pasoId: string
  pasoNombre: string
  pasoOrden: number
  pasoSemana: number | null
  pasoEsControl: boolean
  sesiones: SesionProcedimiento[]
}

function buildStepGroups(sesiones: SesionProcedimiento[]): StepGroup[] {
  const map = new Map<string, StepGroup>()
  for (const s of sesiones) {
    if (!map.has(s.paso)) {
      map.set(s.paso, {
        pasoId: s.paso,
        pasoNombre: s.paso_nombre,
        pasoOrden: s.paso_orden,
        pasoSemana: s.paso_semana,
        pasoEsControl: s.paso_es_control,
        sesiones: [],
      })
    }
    map.get(s.paso)!.sesiones.push(s)
  }
  return Array.from(map.values()).sort((a, b) => a.pasoOrden - b.pasoOrden)
}

// ─── Indicador de sesiones (puntos) ──────────────────────────

function SesionDots({ sesiones }: { sesiones: SesionProcedimiento[] }) {
  if (sesiones.length <= 1) return null
  return (
    <span className="flex items-center gap-0.5 ml-1">
      {sesiones.map((s, i) => (
        <span
          key={s.id}
          title={`Sesión ${i + 1}: ${s.estado}`}
          className={cn(
            'inline-block h-2 w-2 rounded-full',
            s.estado === 'completado'   ? 'bg-green-500'   :
            s.estado === 'inasistencia' ? 'bg-red-400'     :
            'bg-gray-200',
          )}
        />
      ))}
    </span>
  )
}

// ─── Fila de una sesión individual ───────────────────────────

function SesionFila({
  sesion,
  sesionNumero,
  esUnica,
  tratamientoId,
}: {
  sesion: SesionProcedimiento
  sesionNumero: number   // 1-indexed dentro del grupo
  esUnica: boolean       // true si el paso solo tiene 1 sesión
  tratamientoId: string
}) {
  const qc = useQueryClient()
  const [checkinOpen, setCheckinOpen] = useState(false)

  const completarMut = useMutation({
    mutationFn: () => protocolosApi.sesiones.marcarCompletado(sesion.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tratamiento', tratamientoId] }),
  })
  const inasistenciaMut = useMutation({
    mutationFn: () => protocolosApi.sesiones.marcarInasistencia(sesion.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tratamiento', tratamientoId] }),
  })
  const isPending = completarMut.isPending || inasistenciaMut.isPending

  const label = esUnica ? sesion.paso_nombre : `Sesión ${sesionNumero}`

  return (
    <>
      <div className={cn(
        'flex items-center gap-3 py-2.5 border-b last:border-0',
        esUnica ? 'px-4' : 'px-8',   // sesiones múltiples van indentadas
        sesion.estado === 'completado'   && 'bg-green-50/30',
        sesion.estado === 'inasistencia' && 'bg-red-50/20',
      )}>
        <div className="shrink-0">
          {sesion.estado === 'completado'   && <CheckCircle2 className="h-4 w-4 text-green-500" />}
          {sesion.estado === 'inasistencia' && <XCircle className="h-4 w-4 text-red-400" />}
          {sesion.estado === 'pendiente'    && <Clock className="h-4 w-4 text-muted-foreground/40" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {esUnica && (
              <span className="text-xs text-muted-foreground tabular-nums w-5 shrink-0">
                {sesion.paso_orden}.
              </span>
            )}
            <p className={cn(
              'text-sm font-medium truncate',
              sesion.estado !== 'pendiente' && 'text-muted-foreground',
            )}>
              {label}
            </p>
            {esUnica && sesion.paso_es_control && (
              <Badge variant="outline" className="text-[10px] shrink-0">Control</Badge>
            )}
            {esUnica && sesion.paso_semana != null && (
              <span className="text-[10px] text-muted-foreground shrink-0">Sem {sesion.paso_semana}</span>
            )}
          </div>

          {sesion.estado === 'completado' && (
            <div className="flex items-center gap-3 mt-0.5 pl-7 text-xs text-muted-foreground">
              {sesion.fecha && <span>{formatDate(sesion.fecha)}</span>}
              {sesion.profesional_nombre && <span>{sesion.profesional_nombre}</span>}
              {sesion.checkin_verificado && (
                <span className={cn(
                  'inline-flex items-center gap-1',
                  sesion.checkin_metodo === 'otp_whatsapp' ? 'text-green-600' : 'text-blue-600',
                )}>
                  {sesion.checkin_metodo === 'otp_whatsapp'
                    ? <><Smartphone className="h-3 w-3" /> OTP</>
                    : <><Camera className="h-3 w-3" /> Foto</>}
                </span>
              )}
            </div>
          )}
          {sesion.estado === 'inasistencia' && sesion.observaciones && (
            <p className="text-xs text-muted-foreground mt-0.5 pl-7">{sesion.observaciones}</p>
          )}
        </div>

        {sesion.estado === 'pendiente' && (
          <div className="flex items-center gap-1 shrink-0">
            {!sesion.checkin_verificado && (
              <Button size="sm" variant="ghost"
                className="h-6 text-[11px] px-2 gap-1 text-muted-foreground"
                onClick={() => setCheckinOpen(true)} disabled={isPending}
              >
                <Smartphone className="h-3 w-3" />Check-in
              </Button>
            )}
            {sesion.checkin_verificado && (
              <Badge variant="outline" className="text-[10px] gap-1 text-green-600">
                <CheckCircle2 className="h-3 w-3" /> Presente
              </Badge>
            )}
            <Button size="sm" variant="ghost"
              className="h-6 text-[11px] px-2 text-green-700"
              onClick={() => completarMut.mutate()} disabled={isPending}
            >
              {completarMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : '✓ Completar'}
            </Button>
            <button
              onClick={() => inasistenciaMut.mutate()} disabled={isPending}
              className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-destructive rounded transition-colors"
              title="Marcar inasistencia"
            >
              {inasistenciaMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : '✕'}
            </button>
          </div>
        )}
      </div>

      <CheckinSheet
        open={checkinOpen}
        onOpenChange={setCheckinOpen}
        sesion={sesion}
        tratamientoId={tratamientoId}
      />
    </>
  )
}

// ─── Grupo de paso (cuando cantidad > 1) ─────────────────────

function StepGroupRow({
  group,
  tratamientoId,
}: {
  group: StepGroup
  tratamientoId: string
}) {
  const esUnica = group.sesiones.length === 1
  const completadas = group.sesiones.filter((s) => s.estado === 'completado').length
  const total = group.sesiones.length

  return (
    <>
      {/* Header del grupo (solo si tiene más de 1 sesión) */}
      {!esUnica && (
        <div className="flex items-center gap-2.5 px-4 py-2 bg-gray-50/70 border-b">
          <span className="text-xs text-muted-foreground tabular-nums w-5 shrink-0 text-center">
            {group.pasoOrden}.
          </span>
          <p className="text-sm font-semibold flex-1 text-foreground">{group.pasoNombre}</p>
          {group.pasoEsControl && <Badge variant="outline" className="text-[10px] shrink-0">Control</Badge>}
          {group.pasoSemana != null && (
            <span className="text-[10px] text-muted-foreground shrink-0">Sem {group.pasoSemana}</span>
          )}
          <span className="text-xs tabular-nums text-muted-foreground shrink-0">{completadas}/{total}</span>
          <SesionDots sesiones={group.sesiones} />
        </div>
      )}

      {/* Filas de sesión */}
      {group.sesiones.map((s, idx) => (
        <SesionFila
          key={s.id}
          sesion={s}
          sesionNumero={(s.sesion_numero ?? idx) + (s.sesion_numero == null ? 1 : 0)}
          esUnica={esUnica}
          tratamientoId={tratamientoId}
        />
      ))}
    </>
  )
}

// ─── Componente principal ─────────────────────────────────────

interface TratamientoCardProps {
  tratamiento: TratamientoPaciente
  defaultExpanded?: boolean
}

export function TratamientoCard({ tratamiento, defaultExpanded = false }: TratamientoCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  const { data: detalle, isLoading } = useQuery({
    queryKey: ['tratamiento', tratamiento.id],
    queryFn: () => protocolosApi.tratamientos.get(tratamiento.id),
    enabled: expanded,
  })

  const pct = tratamiento.progreso_pct
  const estadoStyle = ESTADO_TRAT[tratamiento.estado] ?? ESTADO_TRAT.activo

  const groups = detalle?.sesiones ? buildStepGroups(detalle.sesiones) : []

  return (
    <div className="rounded-xl border bg-white overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50/50 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded
          ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm">{tratamiento.servicio_nombre}</p>
            <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', estadoStyle.className)}>
              {estadoStyle.label}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Iniciado {formatDate(tratamiento.fecha_inicio)} · {tratamiento.pasos_completados}/{tratamiento.total_pasos} sesiones
          </p>
        </div>

        <div className="shrink-0 w-24 space-y-1 hidden sm:block">
          <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', pct === 100 ? 'bg-green-500' : 'bg-primary')}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground text-right tabular-nums">{pct}%</p>
        </div>
      </button>

      {/* Sesiones */}
      {expanded && (
        <div className="border-t">
          <div className="flex justify-end px-4 py-2 border-b bg-gray-50/30">
            <Button size="sm" variant="ghost"
              className="h-7 text-xs gap-1 text-muted-foreground"
              onClick={() => window.open(`/api/v1${protocolosApi.tratamientos.pdf(tratamiento.id)}`, '_blank')}
            >
              <Download className="h-3.5 w-3.5" />Descargar PDF
            </Button>
          </div>

          {isLoading && (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {groups.map((group) => (
            <StepGroupRow key={group.pasoId} group={group} tratamientoId={tratamiento.id} />
          ))}

          {detalle && groups.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-6">Sin sesiones registradas</p>
          )}
        </div>
      )}
    </div>
  )
}
