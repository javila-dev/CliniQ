'use client'

import { useQuery } from '@tanstack/react-query'
import { MessageCircle, Mail, FileDown, Clock } from 'lucide-react'
import { cotizacionesApi } from '@/lib/api/cotizaciones'
import { cn } from '@/lib/utils'
import type { CanalEnvio, CotizacionEnvio } from '@/types/cotizaciones'

const CANAL_CONFIG: Record<CanalEnvio, { label: string; icon: React.ElementType; className: string }> = {
  whatsapp: { label: 'WhatsApp',  icon: MessageCircle, className: 'bg-green-50 text-green-600' },
  email:    { label: 'Correo',    icon: Mail,          className: 'bg-blue-50 text-blue-600'   },
  pdf:      { label: 'PDF',       icon: FileDown,      className: 'bg-gray-100 text-gray-500'  },
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1)  return 'hace un momento'
  if (mins < 60) return `hace ${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `hace ${hrs} h`
  const days = Math.floor(hrs / 24)
  if (days < 7)  return `hace ${days} d`
  return new Date(dateStr).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
}

function EnvioRow({ envio }: { envio: CotizacionEnvio }) {
  const cfg = CANAL_CONFIG[envio.canal]
  const Icon = cfg.icon
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className={cn('flex items-center justify-center h-7 w-7 rounded-md shrink-0', cfg.className)}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground">{cfg.label}</span>
          {envio.destinatario && (
            <span className="text-xs text-muted-foreground truncate max-w-[160px]">→ {envio.destinatario}</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {envio.enviado_por_nombre}
          {envio.notas && <span className="ml-1">· {envio.notas}</span>}
        </p>
      </div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
        <Clock className="h-3 w-3" />
        {timeAgo(envio.created_at)}
      </div>
    </div>
  )
}

interface Props {
  cotizacionId: string
  /** Envíos incluidos en la carga inicial de la cotización (evita fetch extra) */
  initialEnvios?: CotizacionEnvio[]
}

export function HistorialEnvios({ cotizacionId, initialEnvios }: Props) {
  const { data: envios, isLoading } = useQuery({
    queryKey: ['cotizacion-envios', cotizacionId],
    queryFn: () => cotizacionesApi.getEnvios(cotizacionId),
    initialData: initialEnvios,
    // Refresca después del envío; sin refetch automático en background
    staleTime: 0,
  })

  return (
    <div className="bg-white rounded-xl border p-5 space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Historial de envíos
      </p>

      {isLoading && !initialEnvios ? (
        <div className="space-y-2 py-1">
          {[1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="h-7 w-7 rounded-md bg-gray-100 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-24 rounded bg-gray-100" />
                <div className="h-2.5 w-40 rounded bg-gray-100" />
              </div>
              <div className="h-2.5 w-16 rounded bg-gray-100" />
            </div>
          ))}
        </div>
      ) : !envios?.length ? (
        <p className="text-sm text-muted-foreground/60 italic py-1">
          Esta cotización no ha sido enviada todavía.
        </p>
      ) : (
        <div className="divide-y -my-0.5">
          {envios.map((e) => (
            <EnvioRow key={e.id} envio={e} />
          ))}
        </div>
      )}
    </div>
  )
}
