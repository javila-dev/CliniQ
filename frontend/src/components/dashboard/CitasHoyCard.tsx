'use client'

import Link from 'next/link'
import { ArrowRight, CalendarDays, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn, formatTime } from '@/lib/utils'
import type { Cita, EstadoCita } from '@/types/agenda'

// Orden de la barra del día: lo resuelto primero, lo que falta después.
const SEGMENTOS: { estado: EstadoCita; label: string; barra: string; texto?: string }[] = [
  { estado: 'completada', label: 'atendidas', barra: 'bg-green-400' },
  { estado: 'en_curso', label: 'en curso', barra: 'bg-primary' },
  { estado: 'en_espera', label: 'en sala de espera', barra: 'bg-violet-400' },
  { estado: 'confirmada', label: 'confirmadas', barra: 'bg-blue-400' },
  { estado: 'pendiente', label: 'sin confirmar', barra: 'bg-yellow-400', texto: 'text-amber-700 font-medium' },
  { estado: 'no_asistio', label: 'no vinieron', barra: 'bg-gray-300' },
]

const ETIQUETA: Partial<Record<EstadoCita, { texto: string; clase: string }>> = {
  en_curso: { texto: 'En curso', clase: 'text-primary' },
  en_espera: { texto: 'En sala', clase: 'text-violet-700' },
  confirmada: { texto: 'Confirmada', clase: 'text-muted-foreground' },
  pendiente: { texto: 'Sin confirmar', clase: 'text-amber-700' },
}

// Filas de la lista: lo que está pasando más lo próximo, nunca la agenda entera.
const MAX_FILAS = 5

// "08:00 a. m." en una sola línea: el "a. m." chico para que no parta la fila en dos.
function HoraCorta({ iso }: { iso: string }) {
  const [hora, ...resto] = formatTime(iso).split(/\s+/)
  return (
    <>
      {hora}
      {resto.length > 0 && <span className="ml-0.5 text-[10px] font-medium opacity-70">{resto.join(' ')}</span>}
    </>
  )
}

interface Props {
  citas: Cita[] | undefined
  loading: boolean
  titulo: string
  /** Recepción ve varias agendas: muestra quién atiende cada cita. */
  mostrarProfesional?: boolean
  /** Botón del estado vacío; sin él (p. ej. sin permiso de agendar) no se muestra. */
  accionVacia?: { href: string; label: string; crear?: boolean }
  className?: string
}

/** Citas de hoy en poco espacio: cómo va el día y lo que sigue ahora. */
export function CitasHoyCard({ citas, loading, titulo, mostrarProfesional, accionVacia, className }: Props) {
  const ahora = Date.now()
  const activas = (citas ?? []).filter((c) => c.estado !== 'cancelada')
  const conteo = (estado: EstadoCita) => activas.filter((c) => c.estado === estado).length
  const atendidas = conteo('completada')
  const total = activas.length

  const porHora = (a: Cita, b: Cita) => a.fecha_inicio.localeCompare(b.fecha_inicio)
  const enCurso = activas.filter((c) => c.estado === 'en_curso' || c.estado === 'en_espera').sort(porHora)
  const porVenir = activas.filter((c) => c.estado === 'pendiente' || c.estado === 'confirmada').sort(porHora)
  // Pendientes cuya hora ya terminó: siguen abiertas y conviene cerrarlas.
  const atrasadas = porVenir.filter((c) => new Date(c.fecha_fin).getTime() < ahora)
  const proximas = porVenir.filter((c) => new Date(c.fecha_fin).getTime() >= ahora)
  const filas = [...enCurso, ...proximas].slice(0, MAX_FILAS)
  const restantes = proximas.length - Math.max(0, filas.length - enCurso.length)

  const resumenPie = [
    restantes > 0 && `${restantes} más después`,
    atendidas > 0 && `${atendidas} ya atendida${atendidas !== 1 ? 's' : ''}`,
    atrasadas.length > 0 && `${atrasadas.length} sin cerrar`,
  ].filter(Boolean)

  // Columna flexible: si la vecina de fila es más alta, el espacio queda bajo la
  // lista y el pie sigue abajo, en vez de un hueco debajo de la tarjeta.
  return (
    <div className={cn('flex flex-col bg-white rounded-xl border shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md', className)}>
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-sm">{titulo}</h2>
        </div>
        <Link href="/agenda" className="text-xs text-primary hover:underline flex items-center gap-1">
          Ver agenda <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {loading ? (
        <div className="p-4 space-y-3">
          <Skeleton className="h-10 w-full rounded-lg" />
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
        </div>
      ) : total === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-10 text-center px-4">
          <CalendarDays className="h-10 w-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground font-medium">Sin citas para hoy</p>
          {accionVacia && (
            <Button size="sm" className="mt-3" asChild>
              <Link href={accionVacia.href}>
                {accionVacia.crear && <Plus className="h-3.5 w-3.5 mr-1.5" />}
                {accionVacia.label}
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Cómo va el día */}
          <div className="px-5 py-3.5 space-y-2">
            <div className="flex items-baseline justify-between text-xs text-muted-foreground">
              <span>
                <span className="text-sm font-semibold text-foreground tabular-nums">{atendidas}</span> de {total} atendidas
              </span>
              <span className="tabular-nums">{Math.round((atendidas / total) * 100)}%</span>
            </div>
            <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-gray-100" aria-hidden>
              {SEGMENTOS.map(({ estado, barra }) => {
                const n = conteo(estado)
                return n > 0 ? <div key={estado} className={barra} style={{ flex: n }} /> : null
              })}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              {SEGMENTOS.map(({ estado, label, barra, texto }) => {
                const n = conteo(estado)
                if (n === 0) return null
                return (
                  <span key={estado} className={cn('inline-flex items-center gap-1.5', texto)}>
                    <span className={cn('h-1.5 w-1.5 rounded-full', barra)} />
                    {n} {label}
                  </span>
                )
              })}
            </div>
          </div>

          {/* Ahora y lo que sigue */}
          <div className="flex-1 border-t divide-y">
            {filas.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">
                {atrasadas.length > 0 ? 'No quedan citas por venir, pero hay citas sin cerrar.' : 'No quedan citas por hoy.'}
              </p>
            ) : (
              filas.map((cita) => {
                const actual = cita.estado === 'en_curso' || cita.estado === 'en_espera'
                const etiqueta = ETIQUETA[cita.estado]
                return (
                  <Link
                    key={cita.id}
                    href={`/agenda?cita=${cita.id}`}
                    className={cn(
                      'flex items-center gap-3 px-5 py-2 transition-colors',
                      actual ? 'bg-primary/[0.06] hover:bg-primary/10' : 'hover:bg-gray-50',
                    )}
                  >
                    <span className={cn('w-[4.5rem] shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums', actual ? 'text-primary' : 'text-foreground')}>
                      {actual && cita.estado === 'en_curso' ? 'Ahora' : <HoraCorta iso={cita.fecha_inicio} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      <span className="font-medium">{cita.paciente_nombre}</span>
                      <span className="text-muted-foreground">
                        {' · '}{cita.servicio_nombre}{mostrarProfesional && cita.profesional_nombre ? ` · ${cita.profesional_nombre}` : ''}
                      </span>
                    </span>
                    {etiqueta && <span className={cn('shrink-0 text-[11px] font-medium', etiqueta.clase)}>{etiqueta.texto}</span>}
                  </Link>
                )
              })
            )}
          </div>

          {resumenPie.length > 0 && (
            <Link
              href="/agenda"
              className="flex items-center justify-between gap-2 border-t px-5 py-2.5 text-xs text-muted-foreground hover:bg-gray-50 transition-colors rounded-b-xl"
            >
              <span>{resumenPie.join(' · ')}</span>
              <span className="text-primary flex items-center gap-1 shrink-0">Ver todas <ArrowRight className="h-3 w-3" /></span>
            </Link>
          )}
        </>
      )}
    </div>
  )
}
