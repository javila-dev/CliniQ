'use client'

import {
  CalendarPlus, CalendarClock, CheckCircle2, Clock, PlayCircle, MapPin, XCircle, AlertCircle,
} from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import type { HistorialSesionEvento } from '@/types/cotizaciones'

const EVENTO_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  agendada:   { label: 'Agendó',            icon: CalendarPlus,  color: 'text-blue-700 bg-blue-50 border-blue-200' },
  reagendada: { label: 'Reagendó',          icon: CalendarClock, color: 'text-amber-700 bg-amber-50 border-amber-200' },
  confirmada: { label: 'Confirmó',          icon: CheckCircle2,  color: 'text-green-700 bg-green-50 border-green-200' },
  en_espera:  { label: 'En sala de espera', icon: Clock,         color: 'text-slate-700 bg-slate-50 border-slate-200' },
  en_curso:   { label: 'Inició atención',   icon: PlayCircle,    color: 'text-rose-700 bg-rose-50 border-rose-200' },
  checkin:    { label: 'Check-in',          icon: MapPin,        color: 'text-teal-700 bg-teal-50 border-teal-200' },
  atendida:   { label: 'Atendido',          icon: CheckCircle2,  color: 'text-green-700 bg-green-50 border-green-200' },
  cancelada:  { label: 'Canceló',           icon: XCircle,       color: 'text-red-700 bg-red-50 border-red-200' },
  no_asistio: { label: 'No asistió',        icon: AlertCircle,   color: 'text-gray-700 bg-gray-50 border-gray-200' },
}

function EventoRow({ evento, ultimo }: { evento: HistorialSesionEvento; ultimo: boolean }) {
  const cfg = EVENTO_CONFIG[evento.tipo] ?? {
    label: evento.tipo, icon: Clock, color: 'text-muted-foreground bg-muted border-border',
  }
  const Icon = cfg.icon
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`h-6 w-6 rounded-full border flex items-center justify-center shrink-0 ${cfg.color}`}>
          <Icon className="h-3 w-3" />
        </div>
        {!ultimo && <div className="w-px flex-1 bg-border mt-1" />}
      </div>
      <div className="pb-4 min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${cfg.color}`}>{cfg.label}</span>
          <span className="text-xs text-muted-foreground">{formatDateTime(evento.fecha)}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{evento.usuario}</p>
        {evento.detalle && (
          <p className="text-xs text-foreground mt-1 bg-muted/50 rounded px-2 py-1">{evento.detalle}</p>
        )}
      </div>
    </div>
  )
}

/** Línea de tiempo de una sesión: agendó / reagendó / confirmó / check-in / atendió / canceló. */
export function SesionTimeline({ eventos }: { eventos: HistorialSesionEvento[] }) {
  if (eventos.length === 0) {
    return <p className="text-xs text-muted-foreground italic px-3 py-3">Sin movimientos registrados.</p>
  }
  return (
    <div className="px-3 pt-3">
      {eventos.map((ev, i) => (
        <EventoRow key={`${ev.tipo}-${ev.fecha}-${i}`} evento={ev} ultimo={i === eventos.length - 1} />
      ))}
    </div>
  )
}
