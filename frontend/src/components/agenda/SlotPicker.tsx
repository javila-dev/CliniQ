'use client'

import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { agendaApi } from '@/lib/api/agenda'
import { Skeleton } from '@/components/ui/skeleton'
import { cn, formatTime } from '@/lib/utils'
import { mensajeDeError } from '@/lib/errores'
import type { MotivoHorarios } from '@/types/agenda'

/** Por qué no quedan horarios, cuando es por una sala o un equipo. */
function textoMotivo(m: MotivoHorarios): string {
  const uno = m.recursos.length === 1 ? m.recursos[0] : null
  const sala = m.tipo === 'sala'
  if (m.causa === 'sin_compatible') return 'Ninguna sala/cabina sirve para todos los procedimientos de esta cita.'
  if (m.causa === 'fuera_de_horario') {
    if (uno) return `${uno} no está disponible este día.`
    return sala ? 'Ninguna de las salas/cabinas que sirven está disponible este día.' : 'Ninguno de los equipos que sirven está disponible este día.'
  }
  if (m.causa === 'bloqueado') {
    return uno ? `${uno} está marcado como no disponible este día.` : 'Lo que necesita esta cita está marcado como no disponible este día.'
  }
  if (uno) return `${uno} ya está ${sala ? 'ocupada' : 'ocupado'} en los horarios libres de este día.`
  return sala ? 'Todas las salas/cabinas que sirven están ocupadas en los horarios libres de este día.' : `Los equipos que sirven (${m.recursos.join(', ')}) están ocupados en los horarios libres de este día.`
}

function textoProximo(iso: string): string {
  const d = new Date(iso)
  const dia = d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' })
  return `${dia}, ${formatTime(iso)}`
}

interface SlotPickerProps {
  profesionalId: string
  sedeId: string
  fecha: string
  value: string
  onSelect: (slot: string) => void
  servicioId?: string
  itemCotizacionId?: string
  /** Sesión del paquete elegida: los horarios usan su duración. */
  sesionEjecutadaId?: string
  duracionMin?: number
  /** Al editar una cita: no cuenta su propio horario como ocupado. */
  citaId?: string
  /** Hora (0-23) del hueco en que se hizo clic en la agenda: se elige el
   *  primer horario libre de esa hora (M3-30). */
  horaPreferida?: number
  /** "Ver el próximo horario libre": cambia la fecha y elige ese horario. */
  onIrA?: (slot: string) => void
  /** Sala o equipos elegidos: solo los horarios en que están libres. */
  sala?: string | null
  equipos?: string[]
}

const PLACEHOLDER: Record<string, string> = {
  profesional: 'el profesional',
  sede:        'la sede',
  fecha:       'la fecha',
  fuente:      'qué se va a hacer',
}

export function SlotPicker({
  profesionalId,
  sedeId,
  fecha,
  value,
  onSelect,
  servicioId,
  itemCotizacionId,
  sesionEjecutadaId,
  duracionMin,
  citaId,
  horaPreferida,
  onIrA,
  sala,
  equipos,
}: SlotPickerProps) {
  const tieneFuente = Boolean(servicioId || itemCotizacionId || (duracionMin && duracionMin > 0))
  const enabled = Boolean(profesionalId && sedeId && fecha && tieneFuente)

  const slotParams = (() => {
    const base = {
      profesional_id: profesionalId, sede_id: sedeId, fecha,
      ...(citaId ? { cita_id: citaId } : {}),
      ...(sala ? { sala } : {}),
      ...(equipos?.length ? { equipos: equipos.join(',') } : {}),
    }
    if (itemCotizacionId) {
      return { ...base, item_cotizacion_id: itemCotizacionId, ...(sesionEjecutadaId ? { sesion_ejecutada_id: sesionEjecutadaId } : {}) }
    }
    if (duracionMin)      return { ...base, duracion_min: duracionMin }
    return { ...base, servicio_id: servicioId! }
  })()

  const queryKey = ['slots', profesionalId, sedeId, fecha, servicioId, itemCotizacionId, sesionEjecutadaId, duracionMin, citaId, sala ?? '', (equipos ?? []).join(',')]

  // Con el detalle: si se descartaron horarios por una sala o un equipo, dice
  // por qué y cuál es el próximo libre.
  const { data: detalle, isLoading, isError, error, refetch } = useQuery({
    queryKey,
    queryFn: () => agendaApi.citas.horariosDetalle(slotParams),
    enabled,
  })
  const slots = detalle?.horarios

  // El horario elegido dejó de servir (se cambió la sala o el equipo y ya no
  // está en la lista): se quita para no agendar uno ocupado. Al editar no: la
  // hora actual de la cita puede no estar en la lista (ya pasó) y se conserva;
  // el backend valida al guardar.
  useEffect(() => {
    if (!citaId && value && slots && !slots.includes(value)) onSelect('')
  }, [citaId, value, slots, onSelect])

  // Solo una vez por hora preferida: si la persona elige otro horario, no se pisa.
  const preferidaAplicada = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (horaPreferida === undefined || value || !slots?.length) return
    if (preferidaAplicada.current === horaPreferida) return
    const ahora = new Date()
    const elegido = slots.find((s) => {
      const d = new Date(s)
      return d.getHours() === horaPreferida && d > ahora
    })
    preferidaAplicada.current = horaPreferida
    if (elegido) onSelect(elegido)
  }, [horaPreferida, slots, value, onSelect])

  if (!enabled) {
    // En el orden en que se llena el formulario: qué, dónde, con quién, cuándo.
    const falta = !tieneFuente ? PLACEHOLDER.fuente
      : !sedeId ? PLACEHOLDER.sede
      : !profesionalId ? PLACEHOLDER.profesional
      : PLACEHOLDER.fecha
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        Elige {falta} para ver los horarios libres.
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

  // El backend explica por qué no puede calcular horarios (p. ej. falta la duración).
  if (isError) {
    return (
      <div className="text-center py-4 space-y-2">
        <p className="text-sm text-destructive">{mensajeDeError(error, 'No se pudieron cargar los horarios.')}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-xs font-medium text-primary hover:underline"
        >
          Reintentar
        </button>
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

    // Sin horarios por una sala o un equipo: se explica y se ofrece el próximo libre.
    if (detalle?.motivo && !(allSlots.length > 0 && isToday)) {
      return (
        <div className="text-center py-4 space-y-2">
          <p className="text-sm text-foreground">{textoMotivo(detalle.motivo)}</p>
          {detalle.proximo ? (
            onIrA ? (
              <button
                type="button"
                onClick={() => onIrA(detalle.proximo!)}
                className="text-sm font-medium text-primary hover:underline"
              >
                Primer horario libre: {textoProximo(detalle.proximo)} →
              </button>
            ) : (
              <p className="text-xs text-muted-foreground">Primer horario libre: {textoProximo(detalle.proximo)}</p>
            )
          ) : (
            <p className="text-xs text-muted-foreground">No hay horarios libres en las próximas tres semanas.</p>
          )}
        </div>
      )
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
