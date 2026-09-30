// WhatsApp con número propio de la clínica (Coexistence vía Lyvio).
// Backend: apps/notificaciones/numero_propio.py

export type EstadoNumeroWhatsapp = 'conectado' | 'plantillas_pendientes' | 'activo' | 'error'

export type EstadoPlantillaWhatsapp = 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED' | 'DISABLED' | 'ERROR'

/** Desde qué número envía una sede. */
export type TipoAsignacionSede = 'por_defecto' | 'numero' | 'cliniq'

/** Problema del número que no depende de las plantillas ('' = ninguno). */
export type BloqueoNumeroWhatsapp = '' | 'pago' | 'conexion'

export interface NumeroWhatsapp {
  id: string
  numero_visible: string
  estado: EstadoNumeroWhatsapp
  estado_display: string
  bloqueo: BloqueoNumeroWhatsapp
  ultimo_error: string
  es_por_defecto: boolean
}

export interface SedeWhatsapp {
  id: string
  nombre: string
  tipo: TipoAsignacionSede
  numero_id: string | null  // solo con tipo 'numero'
}

export interface WhatsappPropioEstado {
  habilitado: boolean              // add-on de número propio (exige el de WhatsApp)
  whatsapp_habilitado: boolean     // add-on base de WhatsApp
  numeros_incluidos: number        // cuántos números puede conectar; 0 sin el add-on
  numero_cliniq: string            // número compartido tal como lo ve el paciente; '' si no está configurado
  contacto_ventas_url: string      // wa.me para pedir el add-on; '' si no está configurado
  meta_app_id: string
  meta_config_id: string
  pago_meta_configurado: boolean
  numero_por_defecto_id: string | null
  numeros: NumeroWhatsapp[]
  sedes: SedeWhatsapp[]
}

export interface ConfigurarWhatsappPropioRequest {
  pago_meta_configurado?: boolean
  numero_por_defecto_id?: string
  asignaciones?: { sede_id: string; tipo: TipoAsignacionSede; numero_id?: string | null }[]
}

/** Resultado del Embedded Signup de Meta que el backend canjea en Lyvio. */
export interface ConectarWhatsappRequest {
  evento: string
  code: string
  waba_id: string
  phone_number_id?: string
  business_id?: string
}

// ─── Consola (superadmin) ────────────────────────────────────

export interface PlantillaWhatsappNumero {
  tipo: string
  nombre: string
  idioma: string
  estado: EstadoPlantillaWhatsapp
  estado_display: string
  categoria: string
  ultimo_error: string
}

export interface NumeroWhatsappAdmin extends NumeroWhatsapp {
  lyvio_inbox_id: string
  waba_id: string
  ultimo_chequeo_en: string | null
  plantillas: PlantillaWhatsappNumero[]
}

export interface WhatsappPropioDetalleAdmin extends Omit<WhatsappPropioEstado, 'numeros'> {
  numeros: NumeroWhatsappAdmin[]
  catalogo: { tipo: string; nombre: string; categoria: string }[]
}

export interface ResultadoCrearPlantilla {
  nombre: string
  resultado: 'creada' | 'ya_existia' | 'ya_creada' | 'error' | 'reintentar' | 'requiere_version'
  estado: EstadoPlantillaWhatsapp
  error: string
}

export interface AccionNumeroWhatsappResponse {
  detalle: WhatsappPropioDetalleAdmin
  resultados?: ResultadoCrearPlantilla[]
  salud?: Record<string, unknown>
}
