import { apiClient } from './client'

export interface EnviarEmailRequest {
  to: string[]
  subject: string
  body: string
  html_body?: string
  from_email?: string
  cc?: string[]
  bcc?: string[]
  reply_to?: string[]
}

export interface EnviarEmailResponse {
  ok: boolean
  sent?: number
  provider?: string
  error?: string
  code?: string
  detail?: string
}

export const notificacionesApi = {
  enviarEmail: async (data: EnviarEmailRequest): Promise<EnviarEmailResponse> => {
    const res = await apiClient.post<EnviarEmailResponse>('/notificaciones/emails/enviar/', data)
    return res.data
  },
}

// ─── Helpers de plantillas de bienvenida ──────────────────────

export function buildBienvenidaUsuario(params: {
  first_name: string
  last_name: string
  email: string
  password: string
  rol?: string
  role_id?: string
}): EnviarEmailRequest {
  const rolLabel = params.rol === 'admin' ? 'Administrador' : (params.rol ?? 'Usuario')
  const body =
    `Hola ${params.first_name},\n\n` +
    `Tu cuenta en CliniQ ha sido creada con rol ${rolLabel}.\n\n` +
    `Correo: ${params.email}\n` +
    `Contraseña temporal: ${params.password}\n\n` +
    `Te recomendamos cambiar tu contraseña la primera vez que ingreses.\n\n` +
    `CliniQ`

  const html_body = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
      <h2 style="font-size:20px;font-weight:700;margin:0 0 8px">Bienvenido/a a CliniQ</h2>
      <p style="color:#555;margin:0 0 24px">Tu cuenta ha sido creada con el rol <strong>${rolLabel}</strong>.</p>
      <div style="background:#f5f5f5;border-radius:8px;padding:16px 20px;margin-bottom:24px">
        <p style="margin:0 0 8px;font-size:14px"><span style="color:#888">Correo:</span> <strong>${params.email}</strong></p>
        <p style="margin:0;font-size:14px"><span style="color:#888">Contraseña temporal:</span> <strong>${params.password}</strong></p>
      </div>
      <p style="font-size:13px;color:#888">Te recomendamos cambiar tu contraseña al ingresar por primera vez.</p>
    </div>
  `

  return {
    to: [params.email],
    subject: 'Bienvenido/a a CliniQ — Tus credenciales de acceso',
    body,
    html_body,
  }
}

export function buildBienvenidaColaborador(params: {
  first_name: string
  last_name: string
  email: string
  password: string
  rol: string
}): EnviarEmailRequest {
  const rolLabel = params.rol === 'profesional' ? 'Profesional' : 'Recepción'
  const body =
    `Hola ${params.first_name},\n\n` +
    `Has sido registrado/a como colaborador/a en CliniQ con el rol ${rolLabel}.\n\n` +
    `Correo: ${params.email}\n` +
    `Contraseña temporal: ${params.password}\n\n` +
    `Te recomendamos cambiar tu contraseña la primera vez que ingreses.\n\n` +
    `CliniQ`

  const html_body = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
      <h2 style="font-size:20px;font-weight:700;margin:0 0 8px">Bienvenido/a al equipo de CliniQ</h2>
      <p style="color:#555;margin:0 0 24px">Has sido registrado/a como colaborador/a con el rol <strong>${rolLabel}</strong>.</p>
      <div style="background:#f5f5f5;border-radius:8px;padding:16px 20px;margin-bottom:24px">
        <p style="margin:0 0 8px;font-size:14px"><span style="color:#888">Correo:</span> <strong>${params.email}</strong></p>
        <p style="margin:0;font-size:14px"><span style="color:#888">Contraseña temporal:</span> <strong>${params.password}</strong></p>
      </div>
      <p style="font-size:13px;color:#888">Te recomendamos cambiar tu contraseña al ingresar por primera vez.</p>
    </div>
  `

  return {
    to: [params.email],
    subject: 'Bienvenido/a a CliniQ — Tus credenciales de acceso',
    body,
    html_body,
  }
}
