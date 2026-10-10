import { Send } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { EstadoComercial } from '@/types/cotizaciones'

// Recibe el estado comercial ("vencida" se deriva en el backend); también
// acepta el `estado` guardado, que es un subconjunto.
const CONFIG: Record<EstadoComercial, { label: string; className: string }> = {
  borrador:   { label: 'Abierta',    className: 'bg-gray-100 text-gray-700 border-gray-200'  },
  aceptada:   { label: 'Vendida',    className: 'bg-green-100 text-green-700 border-green-200' },
  vencida:    { label: 'Vencida',    className: 'bg-amber-100 text-amber-700 border-amber-200' },
  descartada: { label: 'Descartada', className: 'bg-red-100 text-red-700 border-red-200'      },
}

export function CotizacionEstadoBadge({ estado }: { estado: EstadoComercial }) {
  const { label, className } = CONFIG[estado] ?? CONFIG.borrador
  return (
    <Badge variant="outline" className={`text-xs font-medium ${className}`}>
      {label}
    </Badge>
  )
}

/** Marca de "ya se envió al paciente": acompaña al estado, no lo reemplaza. */
export function CotizacionEnviadaChip({ enviadaEn }: { enviadaEn?: string | null }) {
  if (!enviadaEn) return null
  const fecha = new Date(enviadaEn).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-200"
      title={`Enviada al paciente el ${new Date(enviadaEn).toLocaleDateString('es-CO')}`}
    >
      <Send className="h-3 w-3" />
      Enviada {fecha}
    </span>
  )
}
