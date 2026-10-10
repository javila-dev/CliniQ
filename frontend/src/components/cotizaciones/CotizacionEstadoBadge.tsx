import { Send } from 'lucide-react'
import { formatFechaDMY } from '@/lib/utils'
import type { EstadoComercial } from '@/types/cotizaciones'

// Recibe el estado comercial ("vencida" se deriva en el backend); también
// acepta el `estado` guardado, que es un subconjunto.
const CONFIG: Record<EstadoComercial, { label: string; className: string; punto: string }> = {
  borrador:   { label: 'Abierta',    className: 'bg-sky-50 text-sky-700 ring-sky-600/15',          punto: 'bg-sky-500' },
  aceptada:   { label: 'Vendida',    className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15', punto: 'bg-emerald-500' },
  vencida:    { label: 'Vencida',    className: 'bg-amber-50 text-amber-700 ring-amber-600/20',     punto: 'bg-amber-500' },
  descartada: { label: 'Descartada', className: 'bg-gray-100 text-gray-600 ring-gray-500/15',       punto: 'bg-gray-400' },
}

export function CotizacionEstadoBadge({ estado }: { estado: EstadoComercial }) {
  const { label, className, punto } = CONFIG[estado] ?? CONFIG.borrador
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${punto}`} aria-hidden />
      {label}
    </span>
  )
}

/** Marca de "ya se envió al paciente": acompaña al estado, no lo reemplaza. */
export function CotizacionEnviadaChip({ enviadaEn }: { enviadaEn?: string | null }) {
  if (!enviadaEn) return null
  const fecha = formatFechaDMY(enviadaEn)
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-gray-600 ring-1 ring-inset ring-gray-200"
      title={`Enviada al paciente el ${fecha}`}
    >
      <Send className="h-3 w-3 text-gray-400" />
      Enviada {fecha.slice(0, 5)}
    </span>
  )
}
