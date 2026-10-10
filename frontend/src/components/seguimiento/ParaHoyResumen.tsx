'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, CheckCircle2, PhoneCall } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { seguimientoApi } from '@/lib/api/seguimiento'
import { cn } from '@/lib/utils'
import { GRUPOS, grupoDe, type GrupoClave } from './ParaHoyLista'

/**
 * Tarjeta del dashboard para recepción: a cuántas personas toca contactar hoy,
 * por tipo, con el acceso directo a Seguimiento.
 */
export function ParaHoyResumen({ sede }: { sede?: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['seguimiento', 'oportunidades', 'hoy', 'resumen', sede ?? null],
    queryFn: () => seguimientoApi.list({ para_hoy: '1', sede, page_size: 200 }),
    staleTime: 60_000,
  })

  const lista = data?.results ?? []
  const total = data?.count ?? 0
  const porGrupo = new Map<GrupoClave, number>()
  for (const op of lista) porGrupo.set(grupoDe(op), (porGrupo.get(grupoDe(op)) ?? 0) + 1)
  const grupos = GRUPOS.filter((g) => porGrupo.has(g.clave))

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <PhoneCall className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Para contactar hoy</h2>
        </div>
        <Link href="/seguimiento" className="flex items-center gap-1 text-xs text-primary hover:underline">
          Ir a Seguimiento <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ) : total === 0 ? (
        <div className="flex items-center gap-3 rounded-lg bg-emerald-50/60 px-3 py-3">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
          <div>
            <p className="text-sm font-medium text-gray-900">¡Todo al día!</p>
            <p className="text-xs text-muted-foreground">No hay a quién contactar hoy.</p>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-600">
            <span className="text-2xl font-semibold tabular-nums text-gray-900">{total}</span>{' '}
            {total === 1 ? 'persona espera' : 'personas esperan'} tu contacto
          </p>
          <ul className="mt-3 space-y-1.5">
            {grupos.map((g) => {
              const Icono = g.icono
              return (
                <li key={g.clave}>
                  <Link
                    href="/seguimiento"
                    className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-gray-50"
                  >
                    <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md', g.tono)}>
                      <Icono className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-gray-700">{g.titulo}</span>
                    <span className="text-[13px] font-semibold tabular-nums text-gray-900">{porGrupo.get(g.clave)}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
