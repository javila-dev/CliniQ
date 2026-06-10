'use client'

import { useQuery } from '@tanstack/react-query'
import { agendaApi } from '@/lib/api/agenda'
import { Skeleton } from '@/components/ui/skeleton'
import { cn, formatTime } from '@/lib/utils'

interface SlotPickerProps {
  profesionalId: string
  sedeId: string
  fecha: string
  value: string
  onSelect: (slot: string) => void
  servicioId?: string
  itemCotizacionId?: string
  duracionMin?: number
}

const PLACEHOLDER: Record<string, string> = {
  profesional: 'profesional',
  sede:        'sede',
  fecha:       'fecha',
  fuente:      'servicio o duración',
}

export function SlotPicker({
  profesionalId,
  sedeId,
  fecha,
  value,
  onSelect,
  servicioId,
  itemCotizacionId,
  duracionMin,
}: SlotPickerProps) {
  const tieneFuente = Boolean(servicioId || itemCotizacionId || (duracionMin && duracionMin > 0))
  const enabled = Boolean(profesionalId && sedeId && fecha && tieneFuente)

  const slotParams = (() => {
    const base = { profesional_id: profesionalId, sede_id: sedeId, fecha }
    if (itemCotizacionId) return { ...base, item_cotizacion_id: itemCotizacionId }
    if (duracionMin)      return { ...base, duracion_min: duracionMin }
    return { ...base, servicio_id: servicioId! }
  })()

  const queryKey = ['slots', profesionalId, sedeId, fecha, servicioId, itemCotizacionId, duracionMin]

  const { data: slots, isLoading } = useQuery({
    queryKey,
    queryFn: () => agendaApi.citas.slotsDisponibles(slotParams),
    enabled,
  })

  if (!enabled) {
    const falta = !profesionalId ? PLACEHOLDER.profesional
      : !sedeId ? PLACEHOLDER.sede
      : !fecha ? PLACEHOLDER.fecha
      : PLACEHOLDER.fuente
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        Selecciona {falta} para ver horarios disponibles
      </p>
    )
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full rounded-md" />
        ))}
      </div>
    )
  }

  const now = new Date()
  const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const isToday = fecha === todayLocal
  const allSlots = slots ?? []
  const visibleSlots = isToday ? allSlots.filter((s) => new Date(s) > now) : allSlots

  if (!visibleSlots.length) {
    const dayOfWeek = new Date(`${fecha}T12:00:00`).getDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

    let msg = 'No hay horarios disponibles para esta fecha.'
    let hint: string | null = null

    if (allSlots.length > 0 && isToday) {
      msg = 'Todos los horarios de hoy ya pasaron.'
      hint = 'Selecciona una fecha futura para ver disponibilidad.'
    } else if (isWeekend) {
      hint = 'Esta fecha es fin de semana. Verifica que la sede o el profesional tengan horario configurado para este día.'
    }

    return (
      <div className="text-center py-4 space-y-1">
        <p className="text-sm text-muted-foreground">{msg}</p>
        {hint && <p className="text-xs text-muted-foreground/70">{hint}</p>}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
      {visibleSlots.map((slot) => (
        <button
          key={slot}
          type="button"
          onClick={() => onSelect(slot)}
          className={cn(
            'rounded-md border px-2 py-2 text-sm font-medium transition-colors',
            value === slot
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-input bg-background hover:bg-accent'
          )}
        >
          {formatTime(slot)}
        </button>
      ))}
    </div>
  )
}
