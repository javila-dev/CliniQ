import type { EstadoCita } from '@/types/agenda'

export const ESTADO_CITA_CONFIG: Record<
  EstadoCita,
  {
    label: string
    variant: 'default' | 'success' | 'warning' | 'info' | 'destructive' | 'muted' | 'secondary' | 'outline'
    color: string
  }
> = {
  pendiente:  { label: 'Pendiente',   variant: 'warning',     color: 'bg-yellow-100 border-yellow-300 text-yellow-800' },
  confirmada: { label: 'Confirmada',  variant: 'info',        color: 'bg-blue-100 border-blue-300 text-blue-800' },
  en_espera:  { label: 'En espera',   variant: 'secondary',   color: 'bg-violet-100 border-violet-300 text-violet-800' },
  en_curso:   { label: 'En curso',    variant: 'default',     color: 'bg-primary/10 border-primary/30 text-primary' },
  completada: { label: 'Completada',  variant: 'success',     color: 'bg-green-100 border-green-300 text-green-800' },
  cancelada:  { label: 'Cancelada',   variant: 'destructive', color: 'bg-red-100 border-red-300 text-red-600' },
  no_asistio: { label: 'No asistió',  variant: 'muted',       color: 'bg-gray-100 border-gray-300 text-gray-500' },
}

// Valid state transitions
export const TRANSICIONES_ESTADO: Partial<Record<EstadoCita, EstadoCita[]>> = {
  pendiente:  ['confirmada', 'cancelada'],
  confirmada: ['en_espera', 'cancelada', 'no_asistio'],
  en_espera:  ['en_curso', 'cancelada'],
  en_curso:   ['completada', 'cancelada'],
}

export const CANAL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  llamada: 'Llamada',
  presencial: 'Presencial',
  telefono: 'Teléfono',
  web: 'Web',
  redes: 'Redes sociales',
}

export const TIPO_DOC_LABEL: Record<string, string> = {
  CC: 'Cédula de ciudadanía',
  CE: 'Cédula de extranjería',
  PA: 'Pasaporte',
  TI: 'Tarjeta de identidad',
  NIT: 'NIT',
}
