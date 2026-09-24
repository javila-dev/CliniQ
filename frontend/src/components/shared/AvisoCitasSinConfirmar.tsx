'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Bell } from 'lucide-react'
import { agendaApi } from '@/lib/api/agenda'
import { addDaysISO, cn, formatFechaLocal, todayISO } from '@/lib/utils'

function etiquetaFecha(fechaDesde: string, fechaHasta: string): string {
  const manana = addDaysISO(todayISO(), 1)
  if (fechaDesde === fechaHasta) {
    if (fechaDesde === manana) return 'mañana'
    return formatFechaLocal(fechaDesde, { weekday: 'long', day: 'numeric', month: 'long' })
  }
  // Distintas sedes con distinto próximo día hábil: se muestra el rango completo.
  return `entre el ${formatFechaLocal(fechaDesde, { day: 'numeric', month: 'short' })} y el ${
    formatFechaLocal(fechaHasta, { weekday: 'long', day: 'numeric', month: 'long' })}`
}

interface AvisoCitasSinConfirmarProps {
  className?: string
  compact?: boolean
}

/** Citas sin confirmar del próximo día que la clínica trabaja (no siempre "mañana" en el
 * calendario: si la sede no abre mañana, corre hasta el siguiente día hábil). */
export function AvisoCitasSinConfirmar({ className, compact }: AvisoCitasSinConfirmarProps) {
  const { data } = useQuery({
    queryKey: ['citas-sin-confirmar-proximo-dia-habil'],
    queryFn: () => agendaApi.citas.sinConfirmarProximoDiaHabil(),
    staleTime: 5 * 60 * 1000,
  })

  if (!data || data.total === 0 || !data.fecha_desde || !data.fecha_hasta) return null

  return (
    <Link
      href={`/agenda?fecha=${data.fecha_desde}`}
      className={cn(
        'flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100/70 transition-colors',
        compact ? 'px-3 py-1.5' : 'px-3.5 py-2.5',
        className,
      )}
    >
      <Bell className="h-4 w-4 text-amber-600 shrink-0" />
      <p className="text-sm text-amber-800 leading-snug">
        <span className="font-semibold">{data.total} cita{data.total !== 1 ? 's' : ''} sin confirmar</span>
        {' '}para {etiquetaFecha(data.fecha_desde, data.fecha_hasta)}
      </p>
    </Link>
  )
}
