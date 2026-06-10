import { Badge } from '@/components/ui/badge'
import type { EstadoCotizacion } from '@/types/cotizaciones'

const CONFIG: Record<EstadoCotizacion, { label: string; className: string }> = {
  borrador: { label: 'Borrador', className: 'bg-gray-100 text-gray-700 border-gray-200' },
  aceptada: { label: 'Aceptada', className: 'bg-green-100 text-green-700 border-green-200' },
  vencida:  { label: 'Vencida',  className: 'bg-amber-100 text-amber-700 border-amber-200' },
}

export function CotizacionEstadoBadge({ estado }: { estado: EstadoCotizacion }) {
  const { label, className } = CONFIG[estado] ?? CONFIG.borrador
  return (
    <Badge variant="outline" className={`text-xs font-medium ${className}`}>
      {label}
    </Badge>
  )
}
