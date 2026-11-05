'use client'

/*
 * Sala y equipo de la cita al agendar (docs/plan-salas-y-equipos.md). No pide
 * nada: la app elige una sala y un equipo libres y los muestra en una línea.
 * "Cambiar" ofrece los que sirven y están libres a esa hora; "+ Sala o equipo"
 * reserva uno a mano en una cita que no lo necesita.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DoorOpen, Plus, X, Zap } from 'lucide-react'
import { agendaApi, type RecursosLibresParams } from '@/lib/api/agenda'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { RecursoLibre } from '@/types/agenda'

export interface EleccionRecursos {
  /** false: la app asigna sola (no se envía nada). */
  tocado: boolean
  sala: string | null
  equipos: string[]
}

export const ELECCION_AUTOMATICA: EleccionRecursos = { tocado: false, sala: null, equipos: [] }

/** Campos para crear o editar la cita: nada si no se tocó. */
export function recursosParaEnviar(e: EleccionRecursos): { sala?: string | null; equipos?: string[] } {
  return e.tocado ? { sala: e.sala, equipos: e.equipos } : {}
}

export interface FormaCita {
  servicioId?: string
  itemCotizacionId?: string
  sesionEjecutadaId?: string
  duracionMin?: number
}

function Icono({ tipo }: { tipo: 'sala' | 'equipo' }) {
  const C = tipo === 'sala' ? DoorOpen : Zap
  return <C className="h-3.5 w-3.5 shrink-0" />
}

function Lista({ titulo, opciones, onElegir }: { titulo?: string; opciones: RecursoLibre[]; onElegir: (r: RecursoLibre) => void }) {
  if (!opciones.length) return null
  return (
    <div className="py-1">
      {titulo && <p className="px-3 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{titulo}</p>}
      {opciones.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => onElegir(r)}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent"
        >
          <Icono tipo={r.tipo} />
          {r.nombre}
        </button>
      ))}
    </div>
  )
}

export function RecursosDeLaCita({
  sedeId, fechaInicio, forma, citaId, value, onChange,
}: {
  sedeId: string
  /** Horario elegido (ISO). Sin horario no se muestra nada. */
  fechaInicio: string
  forma: FormaCita
  citaId?: string
  value: EleccionRecursos
  onChange: (v: EleccionRecursos) => void
}) {
  const [abierto, setAbierto] = useState<string | null>(null)
  const tieneForma = Boolean(forma.servicioId || forma.itemCotizacionId || (forma.duracionMin && forma.duracionMin > 0))

  const params: RecursosLibresParams | null = (() => {
    if (!sedeId || !fechaInicio || !tieneForma) return null
    const base = { sede_id: sedeId, fecha_inicio: fechaInicio, ...(citaId ? { cita_id: citaId } : {}) }
    if (forma.itemCotizacionId) {
      return { ...base, item_cotizacion_id: forma.itemCotizacionId, ...(forma.sesionEjecutadaId ? { sesion_ejecutada_id: forma.sesionEjecutadaId } : {}) }
    }
    if (forma.servicioId) return { ...base, servicio_id: forma.servicioId }
    return { ...base, duracion_min: forma.duracionMin! }
  })()

  const { data } = useQuery({
    queryKey: ['recursos-libres', params],
    queryFn: () => agendaApi.citas.recursosLibres(params!),
    enabled: !!params,
  })

  // Otro horario u otro procedimiento: vuelve a elegir la app.
  const clave = JSON.stringify([sedeId, fechaInicio, forma])
  const claveAnterior = useRef(clave)
  useEffect(() => {
    if (claveAnterior.current !== clave) {
      claveAnterior.current = clave
      if (value.tocado) onChange(ELECCION_AUTOMATICA)
    }
  }, [clave, value.tocado, onChange])

  const nombres = useMemo(() => {
    const m = new Map<string, RecursoLibre>()
    data?.necesarios.forEach((n) => n.recursos.forEach((r) => m.set(r.id, r)))
    data?.otros.forEach((r) => m.set(r.id, r))
    data?.actuales.forEach((r) => m.set(r.id, r))
    return m
  }, [data])

  if (!data) return null
  const { necesarios, otros, actuales } = data
  if (!necesarios.length && !otros.length && !actuales.length) return null

  // Lo que se muestra: lo que eligió la persona, o lo que la app eligió sola.
  const automatico = {
    requeridos: necesarios.map((n) => n.sugerido),
    aMano: actuales.filter((a) => a.elegido_a_mano).map((a) => a.id),
  }
  const elegidos: string[] = value.tocado
    ? [value.sala, ...value.equipos].filter((x): x is string => !!x)
    : [...automatico.requeridos.filter((x): x is string => !!x), ...automatico.aMano]

  const fijar = (ids: string[]) => {
    const recursos = ids.map((id) => nombres.get(id)).filter((r): r is RecursoLibre => !!r)
    onChange({
      tocado: true,
      sala: recursos.find((r) => r.tipo === 'sala')?.id ?? null,
      equipos: recursos.filter((r) => r.tipo === 'equipo').map((r) => r.id),
    })
  }

  // Cada sala o equipo que pide el procedimiento: el elegido entre los que sirven.
  const filas = necesarios.map((n, i) => {
    const elegido = elegidos.find((id) => n.recursos.some((r) => r.id === id)) ?? null
    return { n, i, elegido }
  })
  const enFilas = new Set(filas.map((f) => f.elegido).filter(Boolean))
  const aMano = elegidos.filter((id) => !enFilas.has(id))
  const pideSala = necesarios.some((n) => n.tipo === 'sala')
  const tieneSalaAMano = aMano.some((id) => nombres.get(id)?.tipo === 'sala')
  const agregables = otros.filter((r) =>
    !elegidos.includes(r.id) && !(r.tipo === 'sala' && (pideSala || tieneSalaAMano)),
  )

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      {filas.map(({ n, i, elegido }) => {
        const r = elegido ? nombres.get(elegido) : null
        const cambios = n.libres.filter((l) => l.id !== elegido)
        return (
          <span
            key={`n${i}`}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1',
              r ? 'border-border bg-white' : 'border-amber-200 bg-amber-50 text-amber-800',
            )}
          >
            <Icono tipo={n.tipo} />
            {r ? r.nombre : `No hay ${n.tipo === 'sala' ? 'sala' : 'equipo'} libre a esa hora`}
            {cambios.length > 0 && (
              <Popover open={abierto === `n${i}`} onOpenChange={(v) => setAbierto(v ? `n${i}` : null)}>
                <PopoverTrigger asChild>
                  <button type="button" className="ml-0.5 text-xs font-medium text-primary hover:underline">Cambiar</button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-56 p-0">
                  <Lista
                    titulo="Libres a esa hora"
                    opciones={cambios}
                    onElegir={(nuevo) => {
                      fijar([...elegidos.filter((id) => id !== elegido), nuevo.id])
                      setAbierto(null)
                    }}
                  />
                </PopoverContent>
              </Popover>
            )}
          </span>
        )
      })}

      {aMano.map((id) => {
        const r = nombres.get(id)
        if (!r) return null
        return (
          <span key={id} className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-primary">
            <Icono tipo={r.tipo} />
            {r.nombre}
            <button
              type="button"
              aria-label={`Quitar ${r.nombre}`}
              onClick={() => fijar(elegidos.filter((x) => x !== id))}
              className="rounded-full hover:bg-primary/10"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        )
      })}

      {agregables.length > 0 && (
        <Popover open={abierto === 'agregar'} onOpenChange={(v) => setAbierto(v ? 'agregar' : null)}>
          <PopoverTrigger asChild>
            <button type="button" className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
              <Plus className="h-3.5 w-3.5" />
              {agregables.some((r) => r.tipo === 'sala')
                ? agregables.some((r) => r.tipo === 'equipo') ? 'Sala o equipo' : 'Sala'
                : 'Equipo'}
              <span className="font-normal">(opcional)</span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 p-0">
            <p className="border-b px-3 py-2 text-xs text-muted-foreground">Libres a esa hora. Quedan reservados para esta cita.</p>
            <Lista titulo="Salas" opciones={agregables.filter((r) => r.tipo === 'sala')} onElegir={(r) => { fijar([...elegidos, r.id]); setAbierto(null) }} />
            <Lista titulo="Equipos" opciones={agregables.filter((r) => r.tipo === 'equipo')} onElegir={(r) => { fijar([...elegidos, r.id]); setAbierto(null) }} />
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}
