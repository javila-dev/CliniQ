'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { PhoneCall } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { seguimientoApi } from '@/lib/api/seguimiento'
import { useAuthStore } from '@/store/authStore'
import { hasPermission, PERM } from '@/lib/permissions'
import { formatFechaDMY } from '@/lib/utils'
import type { Oportunidad } from '@/types/seguimiento'

/** Texto corto de por qué está en seguimiento. */
function etiqueta(op: Oportunidad): string {
  if (op.tipo === 'paquete') {
    const { sesion, total } = op.detalle ?? {}
    return sesion && total ? `Paquete atrasado · sesión ${sesion} de ${total}` : 'Paquete atrasado'
  }
  const etapa = { nuevo: 'interesado', valoracion: 'en valoración', cotizado: 'cotizado' }[op.etapa ?? 'nuevo']
  return `En seguimiento · ${etapa}`
}

/**
 * En la ficha del paciente: si tiene un seguimiento abierto, una etiqueta que lo
 * dice y lleva a Seguimiento. El tooltip explica el motivo y cuándo se contacta.
 */
export function EtiquetaSeguimientoPaciente({ pacienteId }: { pacienteId: string }) {
  const { user } = useAuthStore()
  const puedeVer = hasPermission(user, PERM.SEGUIMIENTO_VER)
  const { data } = useQuery({
    queryKey: ['seguimiento', 'oportunidades', 'paciente', pacienteId],
    queryFn: () => seguimientoApi.list({ paciente: pacienteId, page_size: 5 }),
    enabled: puedeVer,
    staleTime: 60_000,
  })
  const abiertas = data?.results ?? []
  if (!puedeVer || abiertas.length === 0) return null
  // La más urgente primero: la que antes toca contactar.
  const op = [...abiertas].sort((a, b) => (a.proximo_contacto ?? '9999').localeCompare(b.proximo_contacto ?? '9999'))[0]

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href="/seguimiento"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-inset ring-violet-600/15 transition-colors hover:bg-violet-100"
          >
            <PhoneCall className="h-3 w-3" />
            {etiqueta(op)}
            {abiertas.length > 1 && <span className="text-violet-500">+{abiertas.length - 1}</span>}
          </Link>
        </TooltipTrigger>
        <TooltipContent className="max-w-72">
          <p>{op.frase}</p>
          {op.proximo_contacto && <p className="mt-1 text-muted-foreground">Próximo contacto: {formatFechaDMY(op.proximo_contacto)}</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
