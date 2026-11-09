'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Cake } from 'lucide-react'

import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon'
import { Skeleton } from '@/components/ui/skeleton'
import { pacientesApi, type CumpleanosPaciente } from '@/lib/api/pacientes'
import { cn, toTitleCase } from '@/lib/utils'

const DIAS = 7
const MAX_FILAS = 6

/** "Hoy", "Mañana" o "jue 12 nov". La fecha llega sin hora: se lee a mediodía. */
function cuando(p: CumpleanosPaciente): string {
  if (p.dias_faltan === 0) return 'Hoy'
  if (p.dias_faltan === 1) return 'Mañana'
  const d = new Date(`${p.fecha}T12:00:00`)
  return d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '')
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

/** Pacientes que cumplen años hoy y en la semana, para felicitarlos a tiempo. */
export function CumpleanosCard({ className }: { className?: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['pacientes', 'cumpleanos', DIAS],
    queryFn: () => pacientesApi.cumpleanos(DIAS),
    staleTime: 30 * 60 * 1000,
  })

  const lista = data ?? []
  const hoy = lista.filter((p) => p.dias_faltan === 0).length
  const visibles = lista.slice(0, MAX_FILAS)
  const resto = lista.length - visibles.length

  return (
    <div className={cn('rounded-xl border bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md', className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Cake className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Cumpleaños</h2>
        </div>
        <span className="text-xs text-muted-foreground">Próximos {DIAS} días</span>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ) : lista.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nadie cumple años esta semana.</p>
      ) : (
        <>
          {hoy > 0 && (
            <p className="mb-2 text-sm text-gray-600">
              <span className="font-semibold text-gray-900">{hoy}</span>{' '}
              {hoy === 1 ? 'paciente cumple' : 'pacientes cumplen'} años hoy
            </p>
          )}
          <ul className="space-y-1">
            {visibles.map((p) => {
              const wa = linkFelicitar(p)
              return (
                <li key={p.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-gray-50">
                  <Link href={`/pacientes/${p.id}`} className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-gray-800">{toTitleCase(p.nombre_completo)}</p>
                    <p className={cn('text-[11px]', p.dias_faltan === 0 ? 'font-medium text-primary' : 'text-muted-foreground')}>
                      {cuando(p)} · cumple {p.edad_cumple}
                    </p>
                  </Link>
                  {wa && (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Felicitar por WhatsApp"
                      aria-label={`Felicitar a ${p.nombres} por WhatsApp`}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-emerald-600 transition-colors hover:bg-emerald-50"
                    >
                      <WhatsAppIcon className="h-4 w-4" />
                    </a>
                  )}
                </li>
              )
            })}
          </ul>
          {resto > 0 && (
            <p className="mt-2 px-2 text-xs text-muted-foreground">y {resto} más esta semana</p>
          )}
        </>
      )}
    </div>
  )
}
