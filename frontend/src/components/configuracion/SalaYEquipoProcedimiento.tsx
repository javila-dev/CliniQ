'use client'

/*
 * "Sala y equipo" del procedimiento (docs/plan-salas-y-equipos.md): si necesita
 * sala (cualquiera o solo algunas) y qué equipo usa. Por defecto no necesita
 * nada. Solo aparece si la clínica ya creó salas o equipos.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Check, Search } from 'lucide-react'
import { clinicasApi } from '@/lib/api/clinicas'
import { cn, scrollWheelFallback } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { AvisoCitasAfectadas } from '@/components/configuracion/SalasYEquipos'
import type { NecesitaSala, Recurso } from '@/types/clinicas'

export interface SalaYEquipoValor {
  necesita_sala: NecesitaSala
  salas: string[]
  equipos: string[]
}

export const SALA_Y_EQUIPO_VACIO: SalaYEquipoValor = { necesita_sala: 'no', salas: [], equipos: [] }

function igual(a: SalaYEquipoValor, b: SalaYEquipoValor) {
  const mismos = (x: string[], y: string[]) => x.length === y.length && x.every((v) => y.includes(v))
  return a.necesita_sala === b.necesita_sala && mismos(a.salas, b.salas) && mismos(a.equipos, b.equipos)
}

function Opcion({ marcada, onClick, children }: { marcada: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input type="radio" className="h-4 w-4 accent-primary" checked={marcada} onChange={onClick} />
      {children}
    </label>
  )
}

/** Desde cuántas opciones se usa la lista con buscador (con pocas, fichas). */
const LISTA_DESDE = 7

function normalizar(t: string): string {
  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

/**
 * Marcar salas o equipos. Con pocas opciones: fichas en una fila. Con muchas:
 * lista con buscador, casillas, grupos por sede (con "Marcar todos") y alto
 * fijo con scroll, para que el diálogo no crezca sin fin.
 */
function Marcables({
  recursos, marcados, onChange, tipo,
}: {
  recursos: Recurso[]
  marcados: string[]
  onChange: (ids: string[]) => void
  tipo: 'sala' | 'equipo'
}) {
  const [q, setQ] = useState('')
  const sedes = Array.from(new Set(recursos.map((r) => r.sede_nombre)))
  const variasSedes = sedes.length > 1
  const alternar = (id: string) => onChange(marcados.includes(id) ? marcados.filter((x) => x !== id) : [...marcados, id])

  if (recursos.length < LISTA_DESDE && !variasSedes) {
    return (
      <div className="flex flex-wrap gap-1.5 pl-6">
        {recursos.map((r) => {
          const activo = marcados.includes(r.id)
          return (
            <button
              key={r.id}
              type="button"
              aria-pressed={activo}
              onClick={() => alternar(r.id)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm transition-colors',
                activo ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted',
              )}
            >
              {activo && <Check className="h-3 w-3" />}
              {r.nombre}
            </button>
          )
        })}
      </div>
    )
  }

  const n = normalizar(q.trim())
  const visibles = n
    ? recursos.filter((r) => normalizar(`${r.nombre} ${r.sede_nombre}`).includes(n))
    : recursos
  const plural = tipo === 'sala' ? 'cabinas y consultorios' : 'equipos'

  return (
    <div className="ml-6 overflow-hidden rounded-md border bg-background">
      <div className="flex items-center gap-2 border-b p-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
            placeholder={`Buscar ${tipo === 'sala' ? 'cabina/consultorio' : 'equipo'}${variasSedes ? ' o sede' : ''}…`}
            className="h-8 pl-8 text-sm"
            aria-label={`Buscar ${plural}`}
          />
        </div>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {marcados.length} de {recursos.length}
        </span>
      </div>
      <div className="max-h-56 overflow-y-auto py-1" onWheel={scrollWheelFallback}>
        {visibles.length === 0 ? (
          <p className="px-3 py-3 text-center text-sm text-muted-foreground">Ninguno coincide con «{q}»</p>
        ) : sedes.map((sede) => {
          const delGrupo = visibles.filter((r) => r.sede_nombre === sede)
          if (!delGrupo.length) return null
          const todos = delGrupo.every((r) => marcados.includes(r.id))
          const ids = delGrupo.map((r) => r.id)
          return (
            <div key={sede}>
              {(variasSedes || delGrupo.length > 3) && (
                <div className="sticky top-0 z-10 flex items-center justify-between bg-background/95 px-3 py-1.5 backdrop-blur">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {variasSedes ? sede : tipo === 'sala' ? 'Todas las cabinas y consultorios' : 'Todos los equipos'}
                  </span>
                  <button
                    type="button"
                    onClick={() => onChange(todos ? marcados.filter((x) => !ids.includes(x)) : Array.from(new Set([...marcados, ...ids])))}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    {todos ? 'Quitar todos' : 'Marcar todos'}
                  </button>
                </div>
              )}
              {delGrupo.map((r) => (
                <label key={r.id} className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-accent">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={marcados.includes(r.id)}
                    onChange={() => alternar(r.id)}
                  />
                  <span className="truncate">{r.nombre}</span>
                </label>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface GrupoEquipo {
  clave: string
  nombre: string
  ids: string[]
  sedes: string[]
}

/** Equipos con el mismo nombre en varias sedes son "el mismo equipo" para elegir. */
function agruparPorNombre(equipos: Recurso[]): GrupoEquipo[] {
  const grupos = new Map<string, GrupoEquipo>()
  for (const e of equipos) {
    const clave = normalizar(e.nombre.trim())
    const g = grupos.get(clave) ?? { clave, nombre: e.nombre, ids: [], sedes: [] }
    g.ids.push(e.id)
    if (!g.sedes.includes(e.sede_nombre)) g.sedes.push(e.sede_nombre)
    grupos.set(clave, g)
  }
  return Array.from(grupos.values()).sort((a, b) => a.nombre.localeCompare(b.nombre))
}

/**
 * Equipos del procedimiento, uno por nombre: "Soprano" marca el Soprano de
 * todas las sedes que lo tienen (cada uno sigue siendo un aparato aparte en
 * la agenda). Con muchos: buscador, alto fijo y "Marcar todos".
 */
function EquiposPorNombre({
  equipos, marcados, onChange,
}: {
  equipos: Recurso[]
  marcados: string[]
  onChange: (ids: string[]) => void
}) {
  const [q, setQ] = useState('')
  const grupos = agruparPorNombre(equipos)
  const variasSedes = new Set(equipos.map((e) => e.sede)).size > 1
  const estado = (g: GrupoEquipo) => {
    const n = g.ids.filter((id) => marcados.includes(id)).length
    return n === 0 ? 'no' : n === g.ids.length ? 'si' : 'parcial'
  }
  // Marcar = todas sus unidades; desmarcar = ninguna (también si estaba a medias).
  const alternar = (g: GrupoEquipo) => onChange(
    estado(g) === 'si'
      ? marcados.filter((id) => !g.ids.includes(id))
      : Array.from(new Set([...marcados, ...g.ids])),
  )
  const dondeEsta = (g: GrupoEquipo) => {
    if (!variasSedes) return null
    const e = estado(g)
    if (e === 'parcial') {
      const enSedes = equipos.filter((x) => g.ids.includes(x.id) && marcados.includes(x.id)).map((x) => x.sede_nombre)
      return `Solo en ${Array.from(new Set(enSedes)).join(', ')} · márcalo para todas`
    }
    return g.sedes.join(', ')
  }

  if (grupos.length < LISTA_DESDE) {
    return (
      <div className="flex flex-wrap gap-1.5 pl-6">
        {grupos.map((g) => {
          const e = estado(g)
          return (
            <button
              key={g.clave}
              type="button"
              aria-pressed={e === 'si'}
              title={variasSedes ? `En ${g.sedes.join(', ')}` : undefined}
              onClick={() => alternar(g)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm transition-colors',
                e === 'si' ? 'border-primary bg-primary/10 text-primary'
                  : e === 'parcial' ? 'border-dashed border-primary/60 text-primary'
                  : 'hover:bg-muted',
              )}
            >
              {e !== 'no' && <Check className="h-3 w-3" />}
              {g.nombre}
              {variasSedes && g.sedes.length > 1 && (
                <span className={cn('text-xs', e === 'si' ? 'text-primary/70' : 'text-muted-foreground')}>· {g.sedes.length} sedes</span>
              )}
            </button>
          )
        })}
      </div>
    )
  }

  const n = normalizar(q.trim())
  const visibles = n ? grupos.filter((g) => normalizar(`${g.nombre} ${g.sedes.join(' ')}`).includes(n)) : grupos
  const todosVisibles = visibles.every((g) => estado(g) === 'si')
  const marcadosNombres = grupos.filter((g) => estado(g) !== 'no').length

  return (
    <div className="ml-6 overflow-hidden rounded-md border bg-background">
      <div className="flex items-center gap-2 border-b p-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
            placeholder={variasSedes ? 'Buscar equipo o sede…' : 'Buscar equipo…'}
            className="h-8 pl-8 text-sm"
            aria-label="Buscar equipos"
          />
        </div>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {marcadosNombres} de {grupos.length}
        </span>
      </div>
      <div className="max-h-56 overflow-y-auto py-1" onWheel={scrollWheelFallback}>
        {visibles.length === 0 ? (
          <p className="px-3 py-3 text-center text-sm text-muted-foreground">Ninguno coincide con «{q}»</p>
        ) : (
          <>
            <div className="sticky top-0 z-10 flex items-center justify-between bg-background/95 px-3 py-1.5 backdrop-blur">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {n ? `${visibles.length} encontrado${visibles.length === 1 ? '' : 's'}` : 'Todos los equipos'}
              </span>
              <button
                type="button"
                onClick={() => {
                  const ids = visibles.flatMap((g) => g.ids)
                  onChange(todosVisibles ? marcados.filter((x) => !ids.includes(x)) : Array.from(new Set([...marcados, ...ids])))
                }}
                className="text-xs font-medium text-primary hover:underline"
              >
                {todosVisibles ? 'Quitar todos' : 'Marcar todos'}
              </button>
            </div>
            {visibles.map((g) => {
              const e = estado(g)
              const donde = dondeEsta(g)
              return (
                <label key={g.clave} className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-accent">
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 accent-primary"
                    checked={e === 'si'}
                    ref={(el) => { if (el) el.indeterminate = e === 'parcial' }}
                    onChange={() => alternar(g)}
                  />
                  <span className="min-w-0 truncate">{g.nombre}</span>
                  {donde && (
                    <span className={cn('ml-auto shrink-0 truncate text-xs', e === 'parcial' ? 'text-amber-700' : 'text-muted-foreground')}>
                      {donde}
                    </span>
                  )}
                </label>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}

export function SalaYEquipoProcedimiento({
  value, onChange, procedimientoId, inicial,
}: {
  value: SalaYEquipoValor
  onChange: (v: SalaYEquipoValor) => void
  /** Al editar: muestra qué pasaría con las citas ya agendadas. */
  procedimientoId?: string
  inicial?: SalaYEquipoValor
}) {
  const { data: recursos } = useQuery({
    queryKey: ['recursos', 'activos'],
    queryFn: () => clinicasApi.recursos.list({ activo: true }),
  })
  const salas = (recursos ?? []).filter((r) => r.tipo === 'sala')
  const equipos = (recursos ?? []).filter((r) => r.tipo === 'equipo')
  // "Necesita equipo" se marca antes de elegir cuál: no se preselecciona ninguno.
  const [necesitaEquipo, setNecesitaEquipo] = useState(value.equipos.length > 0)
  useEffect(() => { if (value.equipos.length > 0) setNecesitaEquipo(true) }, [value.equipos.length])

  // Aviso de lo agendado: se pide un momento después del último cambio.
  const cambio = !!procedimientoId && !!inicial && !igual(value, inicial)
  const [pedido, setPedido] = useState<SalaYEquipoValor | null>(null)
  useEffect(() => {
    if (!cambio) { setPedido(null); return }
    const t = setTimeout(() => setPedido(value), 500)
    return () => clearTimeout(t)
  }, [cambio, value])
  const { data: previa } = useQuery({
    queryKey: ['previsualizar-procedimiento', procedimientoId, pedido],
    queryFn: () => clinicasApi.recursos.previsualizar({ procedimiento_id: procedimientoId!, procedimiento: pedido! }),
    enabled: !!pedido && !!procedimientoId && !(pedido.necesita_sala === 'algunas' && pedido.salas.length === 0),
  })

  if (!recursos) return null
  if (recursos.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        ¿Usas cabinas o equipos que no pueden estar en dos citas a la vez?{' '}
        <Link href="/configuracion/cabinas-y-equipos" className="font-medium text-primary hover:underline">Configúralos en Sedes</Link>.
      </p>
    )
  }

  return (
    <div className="space-y-4 rounded-lg border px-4 py-3">
      <div>
        <p className="text-sm font-medium">Cabina/consultorio y equipo</p>
        <p className="text-xs text-muted-foreground">Al agendar, la cita toma sola una cabina o consultorio y un equipo libres.</p>
      </div>

      {salas.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-muted-foreground">Cabina/consultorio</p>
          <Opcion marcada={value.necesita_sala === 'no'} onClick={() => onChange({ ...value, necesita_sala: 'no', salas: [] })}>
            No necesita
          </Opcion>
          <Opcion marcada={value.necesita_sala === 'cualquiera'} onClick={() => onChange({ ...value, necesita_sala: 'cualquiera', salas: [] })}>
            Cualquier cabina o consultorio libre
          </Opcion>
          <Opcion marcada={value.necesita_sala === 'algunas'} onClick={() => onChange({ ...value, necesita_sala: 'algunas' })}>
            Solo estas cabinas o consultorios
          </Opcion>
          {value.necesita_sala === 'algunas' && (
            <>
              <Marcables tipo="sala" recursos={salas} marcados={value.salas} onChange={(ids) => onChange({ ...value, salas: ids })} />
              {value.salas.length === 0 && <p className="pl-6 text-xs text-amber-700">Elige al menos una cabina o consultorio.</p>}
            </>
          )}
        </div>
      )}

      {equipos.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-muted-foreground">Equipo</p>
          <Opcion marcada={!necesitaEquipo} onClick={() => { setNecesitaEquipo(false); onChange({ ...value, equipos: [] }) }}>
            No necesita
          </Opcion>
          <Opcion marcada={necesitaEquipo} onClick={() => setNecesitaEquipo(true)}>
            Uno de estos
          </Opcion>
          {necesitaEquipo && (
            <>
              <EquiposPorNombre equipos={equipos} marcados={value.equipos} onChange={(ids) => onChange({ ...value, equipos: ids })} />
              <p className={cn('pl-6 text-xs', value.equipos.length ? 'text-muted-foreground' : 'text-amber-700')}>
                {value.equipos.length === 0
                  ? 'Marca al menos uno. Sin ninguno se guarda como "No necesita".'
                  : agruparPorNombre(equipos.filter((e) => value.equipos.includes(e.id))).length > 1
                    ? 'Sirve cualquiera de los marcados que esté libre en la sede de la cita.'
                    : 'La cita usará este equipo (el de su sede).'}
              </p>
            </>
          )}
        </div>
      )}

      {cambio && previa && <AvisoCitasAfectadas previa={previa} />}
    </div>
  )
}
