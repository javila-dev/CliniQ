import axios from 'axios'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'

// Cliente sin interceptores de auth — para endpoints públicos
const publicClient = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

export interface ClinicaPublica {
  clinica_id: string
  clinica_nombre: string
  logo_url: string | null
  tab_personal_requerido?: boolean
  tab_salud_requerido?: boolean
  paso_verificacion_facial?: boolean
}

export interface RegistroPublicoPayload {
  token: string
  nombres: string
  apellidos: string
  tipo_documento: string
  numero_documento: string
  sexo: string
  fecha_nacimiento?: string
  telefono: string
  email?: string
  canal_confirmacion: string
  autoriza_datos: boolean
  direccion?: string
  ciudad?: string
  barrio?: string
  estado_civil?: string
  ocupacion?: string
  escolaridad?: string
  grupo_etnico?: string
  grupo_sanguineo?: string
  eps?: string
  tipo_afiliado?: string
  regimen?: string
  nombre_responsable?: string
  parentesco_responsable?: string
  telefono_responsable?: string
}

export interface RegistroPublicoResponse {
  id: string
  nombre_completo: string
  clinica_nombre: string
}

export const registroPublicoApi = {
  getClinica: async (token: string): Promise<ClinicaPublica> => {
    const res = await publicClient.get<ClinicaPublica>('/registro-publico/clinica/', {
      params: { token },
    })
    return res.data
  },

  registrar: async (data: RegistroPublicoPayload): Promise<RegistroPublicoResponse> => {
    const res = await publicClient.post<RegistroPublicoResponse>('/registro-publico/pacientes/', data)
    return res.data
  },

  enrollment: async (pacienteId: string, token: string, photo: File): Promise<void> => {
    const form = new FormData()
    form.append('token', token)
    form.append('photo', photo)
    await publicClient.post(`/registro-publico/pacientes/${pacienteId}/enrollment/`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}
