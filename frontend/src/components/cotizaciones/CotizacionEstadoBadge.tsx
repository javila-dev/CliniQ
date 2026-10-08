import { Badge } from '@/components/ui/badge'
import type { EstadoComercial } from '@/types/cotizaciones'

// Recibe el estado comercial (incluye "enviada", derivado en el backend);
// también acepta el `estado` guardado, que es un subconjunto.
const CONFIG: Record<EstadoComercial, { label: string; className: string }> = {
  borrador:   { label: 'Borrador',   className: 'bg-gray-100 text-gray-700 border-gray-200'  },
  enviada:    { label: 'Enviada',    className: 'bg-blue-100 text-blue-700 border-blue-200'  },
  aceptada:   { label: 'Aceptada',   className: 'bg-green-100 text-green-700 border-green-200' },
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
