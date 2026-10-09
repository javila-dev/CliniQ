// Seguimiento: oportunidades de venta (embudo) y de retención en una sola
// bandeja. Ver docs/plan-funnel-comercial.md.

export type TipoOportunidad = 'nueva' | 'recompra' | 'reactivacion' | 'paquete'
export type EtapaOportunidad = 'nuevo' | 'valoracion' | 'cotizado'
export type EstadoOportunidad = 'abierta' | 'ganada' | 'perdida' | 'resuelta_sola'
export type OrigenOportunidad =
  | 'whatsapp' | 'instagram' | 'facebook' | 'tiktok' | 'google'
  | 'referido' | 'visita' | 'llamada' | 'campana' | 'otro'
export type MotivoPerdida = 'precio' | 'otra_clinica' | 'no_responde' | 'no_candidato' | 'otro'
export type CanalGestion =
  | 'whatsapp_automatico' | 'whatsapp_plantilla' | 'whatsapp_manual' | 'llamada' | 'presencial' | 'nota'
export type ResultadoGestion =
  | 'enviado' | 'sin_respuesta' | 'interesado' | 'agendo' | 'no_interesado' | 'numero_errado' | 'otro'

export interface GestionOportunidad {
  id: string
  canal: CanalGestion
  canal_nombre: string
  resultado: ResultadoGestion
  resultado_nombre: string
  nota: string
  usuario: string | null
  usuario_nombre: string | null
  created_at: string
}

export interface Oportunidad {
  id: string
  nombre: string
  telefono: string                 // enmascarado sin permiso de datos sensibles
  paciente: string | null          // null = interesado sin ficha
  paciente_nombre: string | null
  contacto_nombre: string
  tipo: TipoOportunidad
  tipo_nombre: string
  motivo: string
  etapa: EtapaOportunidad | null
  etapa_nombre: string | null
  estado: EstadoOportunidad
  es_venta: boolean
  proximo_contacto: string | null  // YYYY-MM-DD; <= hoy -> "Para hoy"
  origen: OrigenOportunidad | ''
  origen_nombre: string
  origen_detalle: string
  responsable: string | null
  responsable_nombre: string | null
  interes: string
  valor_estimado: string | null
  sede: string | null
  cotizacion: string | null
  cotizacion_estado: string | null
  cita: string | null
  cita_fecha: string | null
  motivo_perdida: MotivoPerdida | ''
  motivo_perdida_nombre: string
  nota_perdida: string
  cerrada_en: string | null
  frase: string                    // por qué está en la lista, en una frase
  ultima_gestion: GestionOportunidad | null
  dias_sin_movimiento: number
  created_at: string
}

export interface CrearInteresadoRequest {
  nombre: string
  telefono: string
  interes?: string
  origen?: OrigenOportunidad | ''
  valor_estimado?: string | null
  proximo_contacto?: string | null
  sede?: string | null
}

export interface RegistrarGestionRequest {
  canal: CanalGestion
  resultado: ResultadoGestion
  nota?: string
  proximo_contacto?: string | null
  sin_fecha?: boolean
}

export interface EmbudoResumen {
  desde: string
  etapas: { etapa: EtapaOportunidad; nombre: string; cantidad: number; valor: string }[]
  ganadas: { cantidad: number; valor: string }
  perdidas: { cantidad: number; por_motivo: { motivo: MotivoPerdida; nombre: string; cantidad: number }[] }
  por_origen: { origen: OrigenOportunidad; nombre: string; cantidad: number; ganadas: number }[]
  para_hoy: number
}

export const ORIGENES: { value: OrigenOportunidad; label: string }[] = [
  { value: 'whatsapp',  label: 'WhatsApp' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook',  label: 'Facebook' },
  { value: 'tiktok',    label: 'TikTok' },
  { value: 'google',    label: 'Google' },
  { value: 'referido',  label: 'Referido' },
  { value: 'visita',    label: 'Pasó por la sede' },
  { value: 'otro',      label: 'Otro' },
]

export const MOTIVOS_PERDIDA: { value: MotivoPerdida; label: string }[] = [
  { value: 'precio',       label: 'Precio' },
  { value: 'otra_clinica', label: 'Eligió otra clínica' },
  { value: 'no_responde',  label: 'No responde' },
  { value: 'no_candidato', label: 'No es candidato' },
  { value: 'otro',         label: 'Otro' },
]

export const RESULTADOS_GESTION: { value: ResultadoGestion; label: string; dias: number | null }[] = [
  { value: 'enviado',       label: 'Le escribí',      dias: 2 },
  { value: 'sin_respuesta', label: 'No contestó',     dias: 1 },
  { value: 'interesado',    label: 'Interesado',      dias: 2 },
  { value: 'agendo',        label: 'Agendó',          dias: null },
  { value: 'no_interesado', label: 'No le interesa',  dias: null },
  { value: 'numero_errado', label: 'Número errado',   dias: null },
]
