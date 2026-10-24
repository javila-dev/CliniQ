export type TipoFoto = 'antes' | 'durante' | 'despues'

export type TipoAplicacion = 'equipo' | 'inyectable' | 'topico' | 'laser' | 'otro' | ''

export interface AnotacionZona {
  id: string
  nota: string
  diagrama: string
  diagrama_nombre: string
  x: number
  y: number
  radio: number
  texto: string
  tipo_aplicacion: TipoAplicacion
  parametros: Record<string, string>
  activo: boolean
  created_at: string
  updated_at: string
}

export interface DiagramaConAnotaciones {
  id: string
  nombre: string
  imagen_url: string | null
  orden: number
}

export interface ZonasNota {
  diagramas: DiagramaConAnotaciones[]
  anotaciones: AnotacionZona[]
}

/** Lo que se puede agregar a la pestaña Zonas de una atención. */
export interface OpcionesZonas {
  grupos: { id: string; nombre: string; diagramas: string[] }[]
  diagramas: DiagramaConAnotaciones[]
  /** Atención anterior del paciente con zonas marcadas, para repetirlas. */
  anterior: { nota_id: string; fecha: string; servicio: string | null; diagramas: string[] } | null
}

export interface ZonasVisita {
  nota_id: string
  fecha: string
  servicio: string | null
  diagramas: DiagramaConAnotaciones[]
  anotaciones: AnotacionZona[]
}

export interface ConsumoInsumo {
  id: string
  nota: string
  insumo: string
  insumo_nombre: string
  unidad_medida: string
  cantidad: string
  notas: string
  registrado_por: string
  activo: boolean
  created_at: string
}
export type TipoFitzpatrick = 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI'

export interface HistoriaClinica {
  id: string
  numero: string
  paciente: string
  paciente_nombre: string
  motivo_consulta: string
  plan_manejo: string
  created_at: string
  updated_at: string
}

export interface ArchivoResultadoExamen {
  id: string
  nombre: string
  url: string | null
  subido_por: string | null
  subido_por_nombre: string | null
  puede_quitar: boolean
  created_at: string
}

export interface ResultadoExamen {
  id: string
  historia: string
  /** Atención en la que se cargó; null = cargado desde la historia, después. */
  nota: string | null
  nota_fecha: string | null
  titulo: string
  descripcion: string
  archivos: ArchivoResultadoExamen[]
  fecha: string
  created_by: string | null
  created_by_nombre: string | null
  /** Quien lo cargó (o el admin) mientras su atención, si tiene, siga abierta. */
  puede_modificar: boolean
  created_at: string
}

/** Versión resumida que viene dentro de una nota. */
export type ResultadoExamenEmbed = Pick<ResultadoExamen, 'id' | 'titulo' | 'fecha' | 'descripcion'> & {
  archivos: Omit<ArchivoResultadoExamen, 'puede_quitar'>[]
}

export interface PlantillaOrden {
  id: string
  nombre: string
  contenido: string
  permite_edicion_profesional: boolean
  activa: boolean
  /** Falso: personal, solo la ve quien la creó. */
  compartida: boolean
  es_mia: boolean
  created_by_nombre?: string | null
  /** Solo en /sugeridas/: veces que se usó en el procedimiento de la cita. */
  usos_procedimiento?: number
}

export interface OrdenMedica {
  id: string
  historia: string
  cita: string | null
  nota?: string | null        // H26: FK a NotaClinica
  plantilla_origen: string | null
  plantilla_nombre: string | null
  /** Título del PDF, fijado al emitir. */
  titulo: string
  contenido: string
  fue_editada: boolean
  profesional_nombre: string
  created_at: string
}

export interface FotoClinica {
  id: string
  nota: string
  tipo: TipoFoto
  zona: string
  descripcion: string | null
  url_firmada: string
  created_at: string
}

// ─── NotaClinica — modelo F21/H26 ─────────────────────────────────────────
// Cada atención genera una nota que agrega el contenido de todos los tabs.
export interface NotaClinica {
  id: string
  historia: string
  cita: string | null
  cotizacion: string | null
  estado: 'borrador' | 'completada'
  motivo_consulta: string | null   // TabMotivoConsulta
  plan_manejo: string | null       // TabPlanManejo
  examenes: ResultadoExamenEmbed[] // TabExamenes  (via FK nota)
  ordenes: OrdenMedica[]           // TabOrdenesMedicas (via FK nota)
  fotos: FotoClinica[]             // TabFotos
  // Campos legacy (pre-H26) — presentes en notas antiguas, no se crean nuevos
  servicio_nombre?: string
  profesional_nombre?: string
  anamnesis?: string | null              // deprecated → motivo_consulta
  diagnostico?: string | null
  tipo?: string
  nota_aclarada?: string | null
  zona_tratada?: ZonaTratada[] | null
  productos_usados?: ProductoUsado[] | null
  tecnica?: string | null
  reacciones_adversas?: string | null
  cuidados_post?: string | null
  proxima_cita_sugerida?: string | null
  observaciones?: string | null
  created_at: string
  updated_at?: string
  /** Zonas, insumos y mediciones de la nota (solo en el detalle). */
  otros_registros?: number | null
}

export interface ZonaTratada {
  zona: string
  descripcion?: string
  unidades?: string
}

export interface ProductoUsado {
  nombre: string
  marca?: string
  lote?: string
  cantidad?: string
  unidad?: string
}

export interface GaleriaFoto extends FotoClinica {
  cita: string | null
  cita_fecha: string | null
  servicio_nombre: string | null
}

export interface GaleriaResponse {
  total: number
  por_tipo: { antes: number; durante: number; despues: number }
  fotos: GaleriaFoto[]
}

// Shape real del GET /pacientes/{id}/antecedentes/ — todo anidado
export interface AntecedentePaciente {
  paciente: string
  updated_at: string
  created_at?: string
  personales: {
    toxicologicos: { tabaquismo: boolean; alcohol: boolean; drogas: boolean; otros: string }
    patologicos: string
    quirurgicos: string
    traumaticos: string
    farmacologicos: string    // = medicamentos_actuales
    alergicos: string         // = alergias
    contraindicaciones: string
    tipo_piel: TipoFitzpatrick | ''
    antecedentes_esteticos: string
  } | null
  ginecoobstetricos: {
    gestaciones: number | null
    partos: number | null
    abortos: number | null
    cesareas: number | null
    fum: string | null
    planificacion_familiar: string
    metodo_anticonceptivo: string
  } | null
  familiares: string
}

// Shape plano para PUT /pacientes/{id}/antecedentes/
export interface AntecedentePacienteUpdate {
  alergias: string
  medicamentos_actuales: string
  patologicos: string           // backend usa "patologicos", no "condiciones_medicas"
  contraindicaciones: string
  tipo_piel: TipoFitzpatrick | ''
  antecedentes_esteticos: string
  ant_quirurgicos: string
  ant_traumaticos: string
  ant_familiares: string
  gestaciones: number | null
  partos: number | null
  abortos: number | null
  cesareas: number | null
  fum: string | null
  planificacion_familiar: string
  metodo_anticonceptivo: string
}

export interface ResumenConsentimiento {
  id: string | null
  documenso_template_token: string
  template_nombre: string
  firmado: boolean
  vigente: boolean
  fecha_firma: string | null
  fecha_vencimiento: string | null
}

export interface ConsentimientoInformado {
  id: string
  paciente: string
  documenso_template_token: string
  documenso_template_nombre: string
  fecha_firma: string | null
  firmado: boolean
  /** Solo en la respuesta de verificar_firma: el paciente rechazó el documento. */
  rechazado?: boolean
  url_firmada: string | null
  archivo: string | null
  archivo_url: string | null
  documenso_document_id: string | null
  vigencia_meses: number
  fecha_vencimiento: string | null
  vigente: boolean
  /** Firma diferida: el profesional que atiende la primera cita firma el mismo documento. */
  requiere_firma_profesional?: boolean
  pendiente_firma_profesional?: boolean
  fecha_firma_profesional?: string | null
  notas: string
  created_at: string
  updated_at: string
}
