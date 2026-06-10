export type TipoFoto = 'antes' | 'durante' | 'despues'
export type TipoFitzpatrick = 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI'

export interface HistoriaClinica {
  id: string
  paciente: string
  paciente_nombre: string
  motivo_consulta: string
  plan_manejo: string
  created_at: string
  updated_at: string
}

export interface ResultadoExamen {
  id: string
  historia: string
  nota?: string | null        // H26: FK a NotaClinica
  titulo: string
  descripcion: string
  archivo_url: string | null
  fecha: string
  created_by_nombre: string
  created_at: string
}

export interface PlantillaOrden {
  id: string
  nombre: string
  contenido: string
  permite_edicion_profesional: boolean
  activa: boolean
}

export interface OrdenMedica {
  id: string
  historia: string
  cita: string | null
  nota?: string | null        // H26: FK a NotaClinica
  plantilla_origen: string | null
  plantilla_nombre: string | null
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
  estado: 'borrador' | 'completada'
  motivo_consulta: string | null   // TabMotivoConsulta
  plan_manejo: string | null       // TabPlanManejo
  examenes: ResultadoExamen[]      // TabExamenes  (via FK nota)
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
  cita: string
  cita_fecha: string
  servicio_nombre: string
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
  url_firmada: string | null
  archivo: string | null
  archivo_url: string | null
  documenso_document_id: string | null
  vigencia_meses: number
  fecha_vencimiento: string | null
  vigente: boolean
  notas: string
  created_at: string
  updated_at: string
}
