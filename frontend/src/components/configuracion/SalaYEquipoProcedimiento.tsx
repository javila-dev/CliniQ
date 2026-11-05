'use client'

/*
 * "Sala y equipo" del procedimiento (docs/plan-salas-y-equipos.md): si necesita
 * sala (cualquiera o solo algunas) y qué equipo usa. Por defecto no necesita
 * nada. Solo aparece si la clínica ya creó salas o equipos.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { clinicasApi } from '@/lib/api/clinicas'
import { cn } from '@/lib/utils'
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

/** Fichas para marcar salas o equipos, agrupadas por sede si hay varias. */
function Fichas({ recursos, marcados, onChange }: { recursos: Recurso[]; marcados: string[]; onChange: (ids: string[]) => void }) {
  const sedes = Array.from(new Set(recursos.map((r) => r.sede_nombre)))
  return (
    <div className="space-y-2 pl-6">
      {sedes.map((sede) => (
        <div key={sede} className="space-y-1">
          {sedes.length > 1 && <p className="text-xs text-muted-foreground">{sede}</p>}
          <div className="flex flex-wrap gap-1.5">
            {recursos.filter((r) => r.sede_nombre === sede).map((r) => {
              const activo = marcados.includes(r.id)
              return (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={activo}
                  onClick={() => onChange(activo ? marcados.filter((x) => x !== r.id) : [...marcados, r.id])}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[13px] transition-colors',
                    activo ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted',
                  )}
                >
                  {activo && <Check className="h-3 w-3" />}
                  {r.nombre}
                </button>
              )
            })}
          </div>
        </div>
      ))}
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
        <Link href="/configuracion/sedes#salas-y-equipos" className="font-medium text-primary hover:underline">Configúralos en Sedes</Link>.
      </p>
    )
  }

  return (
    <div className="space-y-4 rounded-lg border px-4 py-3">
      <div>
        <p className="text-sm font-medium">Sala y equipo</p>
        <p className="text-xs text-muted-foreground">Al agendar, la cita toma una sala y un equipo libres sola.</p>
      </div>

      {salas.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[13px] font-medium text-muted-foreground">Sala</p>
          <Opcion marcada={value.necesita_sala === 'no'} onClick={() => onChange({ ...value, necesita_sala: 'no', salas: [] })}>
            No necesita
          </Opcion>
          <Opcion marcada={value.necesita_sala === 'cualquiera'} onClick={() => onChange({ ...value, necesita_sala: 'cualquiera', salas: [] })}>
            Cualquier sala libre
          </Opcion>
          <Opcion marcada={value.necesita_sala === 'algunas'} onClick={() => onChange({ ...value, necesita_sala: 'algunas' })}>
            Solo estas salas
          </Opcion>
          {value.necesita_sala === 'algunas' && (
            <>
              <Fichas recursos={salas} marcados={value.salas} onChange={(ids) => onChange({ ...value, salas: ids })} />
              {value.salas.length === 0 && <p className="pl-6 text-xs text-amber-700">Elige al menos una sala.</p>}
            </>
          )}
        </div>
      )}

      {equipos.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[13px] font-medium text-muted-foreground">Equipo</p>
          <Opcion marcada={value.equipos.length === 0} onClick={() => onChange({ ...value, equipos: [] })}>
            No necesita
          </Opcion>
          <Opcion
            marcada={value.equipos.length > 0}
            onClick={() => { if (!value.equipos.length) onChange({ ...value, equipos: [equipos[0].id] }) }}
          >
            Necesita
          </Opcion>
          {value.equipos.length > 0 && (
            <>
              <Fichas recursos={equipos} marcados={value.equipos} onChange={(ids) => onChange({ ...value, equipos: ids })} />
              {value.equipos.length > 1 && (
                <p className="pl-6 text-xs text-muted-foreground">Si eliges varios, sirve cualquiera que esté libre.</p>
              )}
            </>
          )}
        </div>
      )}

      {cambio && previa && <AvisoCitasAfectadas previa={previa} />}
    </div>
  )
}
