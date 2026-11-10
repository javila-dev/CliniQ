'use client'

/*
 * Sala y equipo de la cita al agendar (docs/plan-salas-y-equipos.md). Va antes
 * del horario: por defecto "la que esté libre" (no pide nada); si la paciente
 * pide una cabina o un equipo concreto se elige aquí y los horarios muestran
 * solo cuándo está libre. Con la hora elegida dice cuál le va a tocar.
 */

import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DoorOpen, Plus, X, Zap } from 'lucide-react'
import { agendaApi, type RecursosLibresParams } from '@/lib/api/agenda'
import { clinicasApi } from '@/lib/api/clinicas'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { RecursoLibre, RecursosLibres } from '@/types/agenda'
import { SelectorRecurso } from './SelectorRecurso'

export interface EleccionRecursos {
  /** false: la app asigna sola (no se envía nada). */
  tocado: boolean
  sala: string | null
  equipos: string[]
  /** Sede y forma de la cita para las que se eligió: con otras, ya no vale. */
  clave?: string
}

export const ELECCION_AUTOMATICA: EleccionRecursos = { tocado: false, sala: null, equipos: [] }

/** Campos para crear o editar la cita (y para filtrar los horarios): nada si no se tocó. */
export function recursosParaEnviar(e: EleccionRecursos): { sala?: string | null; equipos?: string[] } {
  return e.tocado ? { sala: e.sala, equipos: e.equipos } : {}
}

export interface FormaCita {
  servicioId?: string
  itemCotizacionId?: string
  sesionEjecutadaId?: string
  duracionMin?: number
}

function Icono({ tipo, className }: { tipo: 'sala' | 'equipo'; className?: string }) {
  const C = tipo === 'sala' ? DoorOpen : Zap
  return <C className={cn('h-4 w-4 shrink-0 text-muted-foreground', className)} />
}

/** ¿La sede tiene salas o equipos? (para mostrar o no el paso "Sala y equipo"). */
export function useSedeConRecursos(sedeId?: string | null): boolean {
  const { data: activos } = useQuery({
    queryKey: ['recursos', 'activos'],
    queryFn: () => clinicasApi.recursos.list({ activo: true }),
    staleTime: 5 * 60 * 1000,
  })
  return Boolean(sedeId && activos?.some((r) => r.sede === sedeId))
}

export function RecursosDeLaCita({
  sedeId, fechaInicio, forma, citaId, value, onChange,
}: {
  sedeId: string
  /** Horario elegido (ISO), si ya hay: muestra cuál le va a tocar. */
  fechaInicio?: string
  forma: FormaCita
  citaId?: string
  value: EleccionRecursos
  onChange: (v: EleccionRecursos) => void
}) {
  const tieneForma = Boolean(forma.servicioId || forma.itemCotizacionId || (forma.duracionMin && forma.duracionMin > 0))
  // Sin salas ni equipos en la sede no hay campo (la clínica que no los usa
  // agenda como siempre, sin pedidos de más).
  const sedeConRecursos = useSedeConRecursos(sedeId)

  const params = (hora?: string): RecursosLibresParams | null => {
    if (!sedeId || !tieneForma) return null
    const base = {
      sede_id: sedeId,
      ...(hora ? { fecha_inicio: hora } : {}),
      ...(citaId ? { cita_id: citaId } : {}),
    }
    if (forma.itemCotizacionId) {
      return { ...base, item_cotizacion_id: forma.itemCotizacionId, ...(forma.sesionEjecutadaId ? { sesion_ejecutada_id: forma.sesionEjecutadaId } : {}) }
    }
    if (forma.servicioId) return { ...base, servicio_id: forma.servicioId }
    return { ...base, duracion_min: forma.duracionMin! }
  }
  const paramsBase = params()
  const paramsHora = fechaInicio ? params(fechaInicio) : null

  // Lo que sirve a esta cita (sin hora): para elegir antes del horario.
  const { data: base } = useQuery({
    queryKey: ['recursos-libres', paramsBase],
    queryFn: () => agendaApi.citas.recursosLibres(paramsBase!),
    enabled: !!paramsBase && sedeConRecursos,
  })
  // Con la hora elegida: a cuál le toca "la que esté libre".
  const { data: aLaHora } = useQuery({
    queryKey: ['recursos-libres', paramsHora],
    queryFn: () => agendaApi.citas.recursosLibres(paramsHora!),
    enabled: !!paramsHora && sedeConRecursos,
    // Lo libre cambia con cada cita que se agenda: siempre se vuelve a pedir.
    staleTime: 0,
  })

  // Otra sede u otro procedimiento: vuelve a "la que esté libre".
  const clave = JSON.stringify([sedeId, forma])
  const vigente = value.tocado && value.clave === clave
  useEffect(() => {
    if (value.tocado && value.clave !== clave) onChange(ELECCION_AUTOMATICA)
  }, [clave, value.tocado, value.clave, onChange])

  if (!sedeConRecursos) return null

  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      {!tieneForma ? (
        <p className="text-sm text-muted-foreground">Elige qué se va a hacer y aquí verás la cabina o consultorio y el equipo que necesita.</p>
      ) : !base ? (
        <p className="text-sm text-muted-foreground">Cargando cabinas, consultorios y equipos…</p>
      ) : (
        <Eleccion
          base={base}
          aLaHora={fechaInicio ? aLaHora : undefined}
          vigente={vigente}
          value={value}
          clave={clave}
          onChange={onChange}
        />
      )}
    </div>
  )
}

function Eleccion({
  base, aLaHora, vigente, value, clave, onChange,
}: {
  base: RecursosLibres
  aLaHora?: RecursosLibres
  vigente: boolean
  value: EleccionRecursos
  clave: string
  onChange: (v: EleccionRecursos) => void
}) {
  const { necesarios, otros, actuales } = base

  const nombres = useMemo(() => {
    const m = new Map<string, RecursoLibre>()
    necesarios.forEach((n) => n.recursos.forEach((r) => m.set(r.id, r)))
    otros.forEach((r) => m.set(r.id, r))
    actuales.forEach((r) => m.set(r.id, r))
    return m
  }, [necesarios, otros, actuales])

  // Lo elegido a propósito; sin tocar, lo que la cita ya tenía reservado a mano (al editar).
  const elegidos: string[] = vigente
    ? [value.sala, ...value.equipos].filter((x): x is string => !!x)
    : actuales.filter((a) => a.elegido_a_mano).map((a) => a.id)

  const fijar = (ids: string[]) => {
    const recursos = ids.map((id) => nombres.get(id)).filter((r): r is RecursoLibre => !!r)
    onChange({
      tocado: true,
      sala: recursos.find((r) => r.tipo === 'sala')?.id ?? null,
      equipos: recursos.filter((r) => r.tipo === 'equipo').map((r) => r.id),
      clave,
    })
  }

  // Por cada sala o equipo que pide el procedimiento: el elegido (o "el que esté libre").
  const filas = necesarios.map((n, i) => {
    const elegido = elegidos.find((id) => n.recursos.some((r) => r.id === id)) ?? null
    const tocaria = aLaHora?.necesarios[i]?.sugerido ?? null
    return { n, i, elegido, tocaria }
  })
  const enFilas = new Set(filas.map((f) => f.elegido).filter(Boolean))
  const extras = elegidos.filter((id) => !enFilas.has(id))
  const pideSala = necesarios.some((n) => n.tipo === 'sala')
  const tieneSalaExtra = extras.some((id) => nombres.get(id)?.tipo === 'sala')
  const agregables = otros.filter((r) =>
    !elegidos.includes(r.id) && !(r.tipo === 'sala' && (pideSala || tieneSalaExtra)),
  )
  const hayHora = aLaHora !== undefined

  return (
    <div className="space-y-2.5 text-sm">
      {filas.length === 0 && extras.length === 0 && (
        <p className="text-muted-foreground">No necesita cabina, consultorio ni equipo.</p>
      )}

      {filas.map(({ n, i, elegido, tocaria }) => {
        const esSala = n.tipo === 'sala'
        const unico = n.recursos.length === 1
        const nombreTocaria = tocaria ? nombres.get(tocaria)?.nombre : null
        return (
          <div key={`n${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex w-40 shrink-0 items-center gap-2 whitespace-nowrap text-muted-foreground">
              <Icono tipo={n.tipo} />{esSala ? 'Cabina/consultorio' : 'Equipo'}
            </span>
            {unico ? (
              <span className="font-medium">
                {n.recursos[0].nombre}
                <span className="ml-1.5 font-normal text-muted-foreground">({esSala ? 'es la única opción' : 'el único que sirve'})</span>
              </span>
            ) : (
              <SelectorRecurso
                ariaLabel={esSala ? 'Cabina/consultorio' : 'Equipo'}
                opciones={n.recursos}
                valor={elegido}
                auto={{ texto: esSala ? 'Cualquiera libre' : 'El que esté libre' }}
                onElegir={(id) => fijar([...elegidos.filter((x) => x !== elegido), ...(id ? [id] : [])])}
              />
            )}
            {/* Con la hora: a cuál le toca "la que esté libre", o que no hay. */}
            {hayHora && !elegido && !unico && (
              nombreTocaria
                ? <span className="text-muted-foreground">Le tocará {nombreTocaria}</span>
                : <span className="text-amber-700">{esSala ? 'No hay cabina ni consultorio libre' : 'No hay uno libre'} a esa hora</span>
            )}
          </div>
        )
      })}

      {extras.map((id) => {
        const r = nombres.get(id)
        if (!r) return null
        return (
          <div key={id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex w-40 shrink-0 items-center gap-2 whitespace-nowrap text-muted-foreground">
              <Icono tipo={r.tipo} />{r.tipo === 'sala' ? 'Cabina/consultorio' : 'Equipo'}
            </span>
            <span className="font-medium">{r.nombre}</span>
            <span className="text-muted-foreground">solo para esta cita</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={() => fijar(elegidos.filter((x) => x !== id))}
            >
              <X className="mr-1 h-3.5 w-3.5" />Quitar
            </Button>
          </div>
        )
      })}

      {agregables.length > 0 && (
        <SelectorRecurso
          ariaLabel="Reservar cabina, consultorio o equipo"
          opciones={agregables}
          ayuda="Queda reservado solo para esta cita. Los horarios mostrarán cuándo está libre."
          onElegir={(id) => { if (id) fijar([...elegidos, id]) }}
          trigger={
            <button type="button" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              <Plus className="h-4 w-4" />
              {filas.length || extras.length ? 'Reservar otra cabina, consultorio o equipo' : 'Reservar cabina, consultorio o equipo (opcional)'}
            </button>
          }
        />
      )}
    </div>
  )
}
