export interface ConfiguracionGlobal {
  centro_ayuda_habilitado: boolean
  /** Correos automáticos de la prueba (bienvenida, "tu prueba vence"...). */
  correos_ciclo_vida_habilitados: boolean
  /** Días de prueba gratuita de las clínicas nuevas. */
  dias_prueba: number
  /** Plan cuyos límites y funciones tiene una clínica mientras está en prueba (id); null = el de la clínica. */
  plan_prueba: string | null
  /** Envíos de WhatsApp por el número de CliniQ durante toda la prueba (0 = sin límite). */
  whatsapp_envios_prueba: number
  /** Última vez que terminó la tarea programada `procesar_suscripciones` (null = nunca). */
  suscripciones_procesadas_el: string | null
  updated_at: string
}

export interface LogAccion {
  id:             string
  usuario_nombre: string
  accion:         string
  objeto_tipo:    string
  objeto_id:      string
  detalle:        Record<string, unknown>
  ip:             string | null
  created_at:     string
}
