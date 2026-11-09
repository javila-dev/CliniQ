'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { agendaApi } from '@/lib/api/agenda'
import { clinicasApi } from '@/lib/api/clinicas'
import { addDaysISO, cn, formatFechaLocal, formatTime, todayISO } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Cita } from '@/types/agenda'

/** "Cabina 2 · Soprano", o '' si la cita no ocupa sala ni equipo. */
export function nombresRecursos(cita: Pick<Cita, 'recursos'>): string {
  return (cita.recursos ?? []).map((r) => r.nombre).join(' · ')
}

/** "Falta sala", "Falta equipo" o "Falta sala y equipo"; '' si no le falta nada. */
export function textoFalta(cita: Pick<Cita, 'falta'>): string {
  const tipos = new Set((cita.falta ?? []).map((f) => f.tipo))
  if (!tipos.size) return ''
  if (tipos.size === 2) return 'Falta cabina/consultorio y equipo'
  return tipos.has('sala') ? 'Falta cabina/consultorio' : 'Falta equipo'
}

/**
 * Citas de los próximos 7 días que necesitan sala o equipo y no lo tienen
 * (se agendaron antes de configurarlo, o un equipo quedó no disponible). Solo
 * aparece cuando hay alguna (docs/plan-salas-y-equipos.md, D4).
 */
export function AvisoCitasSinSala({
  sede, className, onAbrir,
}: {
  sede?: string
  className?: string
  onAbrir: (cita: Cita) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const { data: recursos } = useQuery({
    queryKey: ['recursos', 'activos'],
    queryFn: () => clinicasApi.recursos.list({ activo: true }),
    staleTime: 5 * 60 * 1000,
  })
  const hay = (recursos?.length ?? 0) > 0
  const hoy = todayISO()
  const { data } = useQuery({
    queryKey: ['citas', 'con-falta', sede ?? '', hoy],
    queryFn: () => agendaApi.citas.list({
      fecha_inicio__date__gte: hoy,
      fecha_inicio__date__lte: addDaysISO(hoy, 7),
      estado__in: 'pendiente,confirmada,en_espera',
      ...(sede ? { sede } : {}),
      page_size: 500,
    }),
    enabled: hay,
    staleTime: 60 * 1000,
  })
  const conFalta = (data?.results ?? []).filter((c) => (c.falta?.length ?? 0) > 0)
  if (!hay || !conFalta.length) return null

  const n = conFalta.length
  const tipos = new Set(conFalta.flatMap((c) => c.falta!.map((f) => f.tipo)))
  const tipo = tipos.size > 1 ? 'cabina, consultorio o equipo' : tipos.has('equipo') ? 'equipo' : 'cabina/consultorio'
  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-left text-sm text-amber-800 transition-colors hover:bg-amber-100/70',
            className,
          )}
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          <span>
            <span className="font-semibold">{n} cita{n !== 1 ? 's' : ''}</span> sin {tipo} en los próximos 7 días
            <span className="ml-1.5 font-medium underline-offset-2 hover:underline">Revisar</span>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <p className="border-b px-3 py-2 text-xs text-muted-foreground">
          {tipo === 'equipo' ? 'Necesitan un equipo y no hay uno libre' : tipo === 'cabina/consultorio' ? 'Necesitan cabina o consultorio y no hay libre' : 'Les falta cabina, consultorio o equipo libre'} a esa hora. Muévelas a otro horario.
        </p>
        <div className="max-h-72 overflow-y-auto py-1">
          {conFalta.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => { onAbrir(c); setAbierto(false) }}
              className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-accent"
            >
              <span className="text-sm font-medium">{c.paciente_nombre}</span>
              <span className="text-xs text-muted-foreground">
                {formatFechaLocal(c.fecha_inicio.slice(0, 10), { weekday: 'short', day: 'numeric', month: 'short' })} {formatTime(c.fecha_inicio)} · {c.servicio_nombre || 'Cita'} · {textoFalta(c)}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
