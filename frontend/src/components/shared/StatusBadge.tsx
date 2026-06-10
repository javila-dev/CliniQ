import { Badge } from '@/components/ui/badge'
import type { EstadoCita } from '@/types/agenda'
import type { EstadoConsentimiento } from '@/types/consentimientos'

const citaConfig: Record<EstadoCita, { label: string; variant: 'default' | 'success' | 'warning' | 'info' | 'destructive' | 'muted' | 'secondary' | 'outline' }> = {
  pendiente:  { label: 'Pendiente',  variant: 'warning' },
  confirmada: { label: 'Confirmada', variant: 'info' },
  en_espera:  { label: 'En espera',  variant: 'secondary' },
  en_curso:   { label: 'En curso',   variant: 'default' },
  completada: { label: 'Completada', variant: 'success' },
  cancelada:  { label: 'Cancelada',  variant: 'destructive' },
  no_asistio: { label: 'No asistió', variant: 'muted' },
}

const consentimientoConfig: Record<EstadoConsentimiento, { label: string; variant: 'default' | 'success' | 'warning' | 'info' | 'destructive' | 'muted' | 'secondary' | 'outline' }> = {
  pendiente: { label: 'Pendiente firma', variant: 'warning' },
  firmado: { label: 'Firmado', variant: 'success' },
  revocado: { label: 'Revocado', variant: 'destructive' },
}

export function CitaStatusBadge({ estado }: { estado: EstadoCita }) {
  const { label, variant } = citaConfig[estado] ?? { label: estado, variant: 'outline' }
  return <Badge variant={variant}>{label}</Badge>
}

export function ConsentimientoStatusBadge({ estado }: { estado: EstadoConsentimiento }) {
  const { label, variant } = consentimientoConfig[estado] ?? { label: estado, variant: 'outline' }
  return <Badge variant={variant}>{label}</Badge>
}
