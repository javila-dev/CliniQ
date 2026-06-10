'use client'

import { useQuery } from '@tanstack/react-query'
import { MessageSquare, Phone, Wifi, MapPin, Link, Mail, Clock } from 'lucide-react'
import { agendaApi } from '@/lib/api/agenda'
import { formatDateTime } from '@/lib/utils'
import type { MedioConfirmacion, RegistroConfirmacion } from '@/types/agenda'

const MEDIO_CONFIG: Record<MedioConfirmacion, { label: string; icon: React.ElementType; color: string }> = {
  whatsapp:   { label: 'WhatsApp',   icon: MessageSquare, color: 'text-green-600' },
  llamada:    { label: 'Llamada',    icon: Phone,         color: 'text-blue-600' },
  sms:        { label: 'SMS',        icon: Wifi,          color: 'text-purple-600' },
  presencial: { label: 'Presencial', icon: MapPin,        color: 'text-rose-600' },
  link:       { label: 'Link',       icon: Link,          color: 'text-muted-foreground' },
  email:      { label: 'Email',      icon: Mail,          color: 'text-orange-600' },
}

const ESTADO_LABEL: Record<string, { label: string; color: string }> = {
  confirmada:  { label: 'Confirmó',        color: 'text-green-700 bg-green-50 border-green-200' },
  cancelada:   { label: 'Canceló',         color: 'text-red-700 bg-red-50 border-red-200' },
  no_asistio:  { label: 'No asistió',      color: 'text-gray-700 bg-gray-50 border-gray-200' },
  en_curso:    { label: 'Inició atención', color: 'text-rose-700 bg-rose-50 border-rose-200' },
}

function RegistroItem({ registro }: { registro: RegistroConfirmacion }) {
  const estado = ESTADO_LABEL[registro.estado_resultante] ?? { label: registro.estado_resultante, color: 'text-muted-foreground bg-muted' }
  const medio = registro.medio ? MEDIO_CONFIG[registro.medio] : null
  const MedioIcon = medio?.icon ?? Clock

  return (
    <div className="flex gap-3">
      {/* Línea de tiempo */}
      <div className="flex flex-col items-center">
        <div className={`h-6 w-6 rounded-full border flex items-center justify-center shrink-0 ${estado.color}`}>
          <MedioIcon className="h-3 w-3" />
        </div>
        <div className="w-px flex-1 bg-border mt-1" />
      </div>

      <div className="pb-4 min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${estado.color}`}>
            {estado.label}
          </span>
          {medio && (
            <span className={`text-xs flex items-center gap-1 ${medio.color}`}>
              <MedioIcon className="h-3 w-3" />
              {medio.label}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">{registro.usuario_nombre}</p>
        {registro.nota && (
          <p className="text-xs text-foreground mt-1 bg-muted/50 rounded px-2 py-1 italic">
            "{registro.nota}"
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-1">{formatDateTime(registro.created_at)}</p>
      </div>
    </div>
  )
}

interface RegistrosConfirmacionProps {
  citaId: string
}

export function RegistrosConfirmacion({ citaId }: RegistrosConfirmacionProps) {
  const { data: registros, isLoading } = useQuery({
    queryKey: ['registros-confirmacion', citaId],
    queryFn: () => agendaApi.citas.registrosConfirmacion(citaId),
  })

  if (isLoading) return <p className="text-xs text-muted-foreground">Cargando historial…</p>
  if (!registros?.length) return (
    <p className="text-xs text-muted-foreground italic">Sin registros de contacto aún</p>
  )

  return (
    <div>
      {registros.map((r, idx) => (
        <div key={r.id} className={idx === registros.length - 1 ? '[&_.w-px]:hidden' : ''}>
          <RegistroItem registro={r} />
        </div>
      ))}
    </div>
  )
}
