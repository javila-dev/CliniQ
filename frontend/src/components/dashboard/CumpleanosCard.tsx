'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Cake, ChevronDown, ChevronUp } from 'lucide-react'

import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useUserSedes } from '@/hooks/useUserSedes'
import { pacientesApi, type CumpleanosPaciente } from '@/lib/api/pacientes'
import { cn, toTitleCase } from '@/lib/utils'

const DIAS = 7
const MAX_FILAS = 5

/** "Hoy", "Mañana" o "jue 12". La fecha llega sin hora: se lee a mediodía. */
function cuando(p: CumpleanosPaciente): string {
  if (p.dias_faltan === 0) return 'Hoy'
  if (p.dias_faltan === 1) return 'Mañana'
  const d = new Date(`${p.fecha}T12:00:00`)
  return d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric' }).replace(/\./g, '')
}

/** wa.me con el saludo listo. Sin teléfono o enmascarado -> null. */
function linkFelicitar(p: CumpleanosPaciente): string | null {
  if (!p.telefono || p.telefono.includes('•')) return null
  const digitos = p.telefono.replace(/\D/g, '')
  if (digitos.length < 7) return null
  const numero = digitos.length === 10 ? `57${digitos}` : digitos
  const nombre = toTitleCase(p.nombres.split(' ')[0] ?? '')
  const texto = p.dias_faltan === 0
    ? `¡Feliz cumpleaños, ${nombre}! `
    : `Hola ${nombre}, `
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`
}

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/)
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase()
}

const TODAS = 'todas'

/** Pacientes que cumplen años hoy y en la semana, para felicitarlos a tiempo.
 *  Con varias sedes se filtra por sede: entra quien se registró, se atendió o se
 *  cotizó ahí (quien va a dos sedes sale en las dos). Quien está acotado a una
 *  sede arranca en la suya. */
export function CumpleanosCard({ className }: { className?: string }) {
  const { sedes, isAllSedes, defaultSedeId } = useUserSedes()
  const [eleccion, setEleccion] = useState<string | null>(null)
  const [verTodos, setVerTodos] = useState(false)
  const filtro = eleccion ?? defaultSedeId ?? TODAS
  const sede = filtro === TODAS ? undefined : filtro
  const ofrecerFiltro = sedes.length > 1 || (!isAllSedes && sedes.length === 1)

  const { data, isLoading } = useQuery({
    queryKey: ['pacientes', 'cumpleanos', DIAS, sede ?? null],
    queryFn: () => pacientesApi.cumpleanos(DIAS, sede),
    staleTime: 30 * 60 * 1000,
  })

  const lista = data ?? []
  const hoy = lista.filter((p) => p.dias_faltan === 0).length
  const visibles = verTodos ? lista : lista.slice(0, MAX_FILAS)
  const resto = lista.length - MAX_FILAS

  return (
    <div className={cn('flex flex-col rounded-xl border bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md', className)}>
      <div className="flex items-center justify-between gap-2 border-b px-5 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Cake className="h-4 w-4 shrink-0 text-primary" />
          <h2 className="text-sm font-semibold">Cumpleaños</h2>
          {!isLoading && hoy > 0 && (
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-primary">
              {hoy} hoy
            </span>
          )}
        </div>
        {ofrecerFiltro ? (
          <Select value={filtro} onValueChange={(v) => { setEleccion(v); setVerTodos(false) }}>
            <SelectTrigger
              className="h-7 w-auto min-w-0 max-w-[9.5rem] shrink gap-1 border-0 bg-transparent px-1.5 text-xs text-muted-foreground shadow-none hover:bg-gray-50 focus:ring-0"
              aria-label="Sede"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value={TODAS}>Todas las sedes</SelectItem>
              {sedes.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="shrink-0 text-xs text-muted-foreground">Próximos {DIAS} días</span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2 px-5 py-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-7 w-full rounded-lg" />)}
        </div>
      ) : lista.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">
          {sede ? 'Nadie de esta sede cumple años esta semana.' : 'Nadie cumple años esta semana.'}
        </p>
      ) : (
        <>
          <ul className={cn('divide-y', verTodos && 'max-h-80 overflow-y-auto')}>
            {visibles.map((p) => {
              const wa = linkFelicitar(p)
              const esHoy = p.dias_faltan === 0
              const nombre = toTitleCase(p.nombre_completo)
              return (
                <li key={p.id} className="flex items-center gap-3 px-5 py-2 transition-colors hover:bg-gray-50">
                  <span
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
                      esHoy ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-500',
                    )}
                    aria-hidden
                  >
                    {iniciales(nombre)}
                  </span>
                  <Link href={`/pacientes/${p.id}`} className="min-w-0 flex-1 truncate text-[13px] font-medium text-gray-800 hover:text-primary">
                    {nombre}
                  </Link>
                  <span className={cn('shrink-0 text-xs tabular-nums', esHoy ? 'font-medium text-primary' : 'text-muted-foreground')}>
                    {cuando(p)} · {p.edad_cumple} años
                  </span>
                  {wa ? (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Felicitar por WhatsApp"
                      aria-label={`Felicitar a ${p.nombres} por WhatsApp`}
                      className="-mr-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-emerald-600 transition-colors hover:bg-emerald-50"
                    >
                      <WhatsAppIcon className="h-4 w-4" />
                    </a>
                  ) : (
                    <span className="-mr-1.5 h-7 w-7 shrink-0" aria-hidden />
                  )}
                </li>
              )
            })}
          </ul>
          {resto > 0 && (
            <button
              type="button"
              onClick={() => setVerTodos((v) => !v)}
              className="flex items-center justify-between border-t px-5 py-2.5 text-xs text-muted-foreground transition-colors hover:bg-gray-50 hover:text-primary"
            >
              <span>{verTodos ? 'Ver menos' : `${resto} más esta semana`}</span>
              {verTodos ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          )}
        </>
      )}
    </div>
  )
}
