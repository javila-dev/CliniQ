// Suscripción de la clínica a CliniQ (ver docs/plan-trial-suscripciones-y-facturacion.md).

export type EstadoSuscripcion = 'prueba' | 'activa' | 'en_gracia' | 'solo_lectura' | 'suspendida' | 'cancelada'

/** total = usa todo; lectura = solo consulta; ninguno = suspendida. */
export type AccesoSuscripcion = 'total' | 'lectura' | 'ninguno'

export interface Suscripcion {
  estado: EstadoSuscripcion
  estado_label: string
  estado_desde: string
  acceso: AccesoSuscripcion
  modo_cobro: 'automatico' | 'manual'
  ciclo: 'mensual' | 'anual'
  prueba_termina_el: string | null
  dias_restantes_prueba: number | null
  periodo_inicio: string | null
  periodo_fin: string | null
  cancelar_al_terminar_periodo: boolean
  /** En mora: cuándo pasa a solo lectura. */
  solo_lectura_el: string | null
  /** En solo lectura o cancelada: cuándo se suspende. */
  suspension_el: string | null
  plan_nombre: string | null
  clinica_nombre: string
  /** Próximo intento de cobro con tarjeta (último día del periodo, o el reintento). */
  proximo_cobro_el: string | null
  precio_periodo: string | null
  tarjeta: { marca: string; ultimos4: string; expira_mes: string; expira_anio: string } | null
  /** Bajar de plan o cambiar de ciclo: se aplica al renovar. */
  plan_pendiente_nombre: string | null
  ciclo_pendiente: '' | 'mensual' | 'anual'
}

export interface PreparacionResumen {
  nivel: string
  completados: number
  total: number
  todo_listo: boolean
}

export type SuscripcionConContacto = Suscripcion & {
  contacto_ventas_url: string
  /** Quien administra aún no ve la bienvenida de la prueba. */
  bienvenida_pendiente: boolean
  /** Avance de "Preparar mi clínica" (solo en prueba). */
  preparacion: PreparacionResumen | null
  /** Hay pago con tarjeta (Wompi configurado); si no, "Elegir plan" va a ventas. */
  pago_en_linea: boolean
  /** Con cobro automático: faltan datos para la factura electrónica. */
  facturacion_incompleta: boolean
}

/** Respuesta de /suscripcion/: sin suscripción, la cuenta no tiene restricción. */
export type MiSuscripcion = SuscripcionConContacto | { estado: null; acceso: 'total' }

export interface PerfilBienvenida {
  visto?: boolean
  /** Rol de quien registró la clínica (pregunta del registro). */
  cargo?: 'duenio' | 'director_medico' | 'administrador' | 'profesional' | 'recepcion' | 'otro'
  profesionales?: '1' | '2-3' | '4-10' | 'mas_10'
  especialidad?: 'estetica' | 'obesidad' | 'dermatologia' | 'spa' | 'otra'
}

export interface SuscripcionAdmin extends Suscripcion {
  nota_interna: string
  intentos_fallidos: number
  perfil: PerfilBienvenida
  whatsapp_autorizado_at: string | null
  updated_at: string
}

export interface ExtenderPruebaRequest {
  dias: number
  motivo: string
}

export interface PagoManualRequest {
  /** null = sin vencimiento. */
  pagado_hasta: string | null
  ciclo: 'mensual' | 'anual'
  nota?: string
}

// ─── Seguimiento de pruebas (consola) ───────────────────────────────────────

export type SemaforoActivacion = 'activada' | 'en_camino' | 'en_riesgo' | 'dormida'

export type FiltroSeguimiento = 'pruebas' | 'por_vencer' | 'en_riesgo' | 'activadas' | 'vencidas' | 'manuales_sin_fecha' | 'todas'

export interface HitoActivacion {
  clave: string
  etiqueta: string
  alcanzado_el: string | null
}

export type CanalNota = 'llamada' | 'whatsapp' | 'correo' | 'reunion' | 'otro'

export interface NotaSeguimiento {
  id: string
  canal: CanalNota
  texto: string
  proximo_contacto: string | null
  autor_nombre: string | null
  created_at: string
}

export interface FilaSeguimiento {
  clinica_id: string
  clinica_nombre: string
  registrada_el: string
  contacto: { nombre: string; email: string; telefono: string; whatsapp_url: string }
  suscripcion: SuscripcionAdmin
  hitos: HitoActivacion[]
  atenciones_completadas: number
  numero_propio_conectado: boolean
  dias_activos: number
  usuarios_activos_7d: number
  ultima_actividad: string | null
  activada: boolean
  semaforo: SemaforoActivacion
  motivo: string
  ultima_nota: { texto: string; canal: CanalNota; created_at: string; autor_nombre: string | null } | null
  proximo_contacto: string | null
}

export interface CohorteEmbudo {
  semana: string | null
  clinicas: number
  activadas: number
  pagaron: number
  hitos: { clave: string; etiqueta: string; alcanzaron: number; mediana_dias: number | null }[]
}

export interface EmbudoActivacion {
  total: CohorteEmbudo
  cohortes: CohorteEmbudo[]
}

// ─── Pago con tarjeta (Wompi) ───────────────────────────────────────────────

/** Consola → Pagos: el cobro con su clínica. */
export interface CobroAdmin extends CobroSuscripcion {
  clinica_id: string
  clinica_nombre: string
  wompi_transaccion_id: string
}

export interface PagosConsola {
  count: number
  results: CobroAdmin[]
  /** Totales del periodo y búsqueda filtrados (sin el filtro de estado). */
  resumen: {
    aprobados: number
    total_aprobado: number
    rechazados: number
    pendientes: number
    facturas_con_problema: number
  }
}

export interface FiltrosPagos {
  desde?: string
  hasta?: string
  estado?: '' | 'aprobado' | 'fallido' | 'pendiente'
  factura?: '' | 'emitida' | 'pendiente' | 'error' | 'sin_factura'
  concepto?: '' | 'primer_pago' | 'renovacion' | 'cambio_plan'
  q?: string
  page?: number
}

export type Ciclo = 'mensual' | 'anual'

export interface PlanPago {
  id: string
  nombre: string
  descripcion: string
  max_usuarios: number
  max_sedes: number
  precio_mensual: string
  precio_anual: string
  descuento_anual_pct: number
  /** Funciones que la clínica tiene hoy (p. ej. en la prueba) y este plan no incluye. */
  pierdes: string[]
  /** Si el uso actual (usuarios, sedes) supera el plan: por qué no se puede elegir. */
  bloqueo: string
}

export interface DatosFacturacion {
  tipo_persona: 'juridica' | 'natural'
  tipo_documento: 'NIT' | 'CC' | 'CE' | 'PP'
  numero_documento: string
  dv: string
  razon_social: string
  nombres: string
  apellidos: string
  email_facturacion: string
  telefono: string
  direccion: string
  ciudad: string
  departamento: string
  responsable_iva: boolean
  /** Ids de Alegra: 5 O-13, 7 O-15, 12 O-23, 114 O-47. */
  responsabilidades_fiscales: string[]
}

/** Datos de facturación con los catálogos del formulario (GET/PUT /suscripcion/pago/facturacion/). */
export interface FormularioFacturacion {
  datos_facturacion: DatosFacturacion
  /** Campo → qué falta; vacío si sirven para facturar. */
  datos_facturacion_faltantes: Partial<Record<keyof DatosFacturacion, string>>
  /** Departamento → municipios, con los nombres exactos de Alegra. */
  ubicaciones: Record<string, string[]>
  responsabilidades_fiscales: Record<string, string>
}

export interface ConfigPago {
  disponible: boolean
  ambiente?: 'sandbox' | 'production'
  llave_publica?: string
  url_api?: string
  aceptacion?: {
    acceptance_token: string
    acceptance_permalink: string
    personal_auth_token: string
    personal_auth_permalink: string
  }
  planes?: PlanPago[]
  plan_actual_id?: string | null
  datos_facturacion?: DatosFacturacion
  datos_facturacion_faltantes?: FormularioFacturacion['datos_facturacion_faltantes']
  ubicaciones?: Record<string, string[]>
  responsabilidades_fiscales?: Record<string, string>
  suscripcion?: Suscripcion
}

/** Lo que devuelve Wompi al tokenizar: solo para mostrar la tarjeta. */
export interface TarjetaVista {
  marca: string
  ultimos4: string
  expira_mes: string
  expira_anio: string
  titular: string
}

export interface TarjetaNueva {
  token: string
  acceptance_token: string
  accept_personal_auth: string
  tarjeta: TarjetaVista
}

export interface CobroSuscripcion {
  referencia: string
  concepto: 'primer_pago' | 'renovacion' | 'cambio_plan'
  concepto_label: string
  plan_nombre: string
  ciclo: Ciclo
  periodo_inicio: string
  periodo_fin: string
  monto: string
  estado: 'pendiente' | 'aprobado' | 'rechazado' | 'error' | 'anulado'
  estado_label: string
  mensaje: string
  tarjeta: string
  /** Factura electrónica (Alegra) del cobro; null si aún no se intentó. */
  factura: {
    numero: string
    estado: 'pendiente' | 'emitida' | 'error'
    estado_label: string
    enviada_at: string | null
    ultimo_error: string
  } | null
  created_at: string
  resuelto_at: string | null
}
