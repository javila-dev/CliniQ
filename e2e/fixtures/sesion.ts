/**
 * Sesión para los tests e2e (16/10/2026).
 *
 * El front ya no guarda tokens en localStorage: el de acceso vive en memoria y el
 * de renovación en la cookie HttpOnly `cliniq_refresh`, que el backend rota en
 * cada renovación (el anterior queda revocado). Por eso una sesión guardada con
 * `storageState` no se puede reutilizar entre tests: el primero la rota y el
 * resto queda afuera.
 *
 * Aquí se lleva la cadena: cada test pide un token nuevo a partir del último
 * (o inicia sesión si no hay) y lo entrega al navegador.
 */
import { test as base, expect, type APIRequestContext, type APIResponse, type Page } from '@playwright/test'

export const BACKEND = process.env.BACKEND_URL ?? 'http://backend:8000'

function refreshDe(res: APIResponse): string {
  const cookies = res.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie').map((h) => h.value)
  return /cliniq_refresh=([^;]+)/.exec(cookies.join('\n'))?.[1] ?? ''
}

export interface SesionApi {
  access: string
  refresh: string
  clinicaId: string | null
}

/** Login por API: el token de renovación llega en la cookie, no en el cuerpo. */
export async function loginApi(request: APIRequestContext, email: string, password: string): Promise<SesionApi> {
  const res = await request.post(`${BACKEND}/api/v1/auth/login/`, { data: { email, password } })
  expect(res.ok(), `login falló para ${email}: ${await res.text()}`).toBeTruthy()
  const { access, user } = await res.json()
  return { access, refresh: refreshDe(res), clinicaId: user?.clinica_id ?? null }
}

/** Token nuevo a partir de uno anterior (lo rota). null si ya no sirve. */
async function renovarApi(request: APIRequestContext, refresh: string): Promise<string | null> {
  const res = await request.post(`${BACKEND}/api/v1/auth/refresh/`, {
    data: { refresh },
    headers: { Cookie: '' },
  })
  return res.ok() ? refreshDe(res) || null : null
}

/**
 * Entrega la sesión al navegador. Se pasa como una sesión de la versión anterior
 * (token en localStorage): el front lo manda una vez, el backend lo pasa a la
 * cookie y el front lo borra. Si algún día se quita esa migración, cambiar esto
 * por `page.context().addCookies` con el origen del API que use el front.
 */
export async function abrirSesionEnNavegador(page: Page, refresh: string, clinicaId: string | null) {
  await page.addInitScript(({ refresh, clinicaId }) => {
    if (sessionStorage.getItem('e2e-sesion')) return
    sessionStorage.setItem('e2e-sesion', '1')
    localStorage.setItem('refresh_token', refresh)
    if (clinicaId) localStorage.setItem('clinica_id', clinicaId)
  }, { refresh, clinicaId })
}

// Perfil de cada proyecto de playwright.config.ts → variables con sus credenciales.
const PERFILES: Record<string, [string, string]> = {
  admin: ['TEST_EMAIL_ADMIN', 'TEST_PASSWORD_ADMIN'],
  profesional: ['TEST_EMAIL_PROFESIONAL', 'TEST_PASSWORD_PROFESIONAL'],
  recepcion: ['TEST_EMAIL_RECEPCION', 'TEST_PASSWORD_RECEPCION'],
}
// Último token de cada perfil (los tests corren en un solo worker, ver config).
const ultimo: Record<string, { refresh: string; clinicaId: string | null }> = {}

export const test = base.extend<{ sesionDelPerfil: void }>({
  sesionDelPerfil: [
    async ({ page, request }, use, testInfo) => {
      const perfil = testInfo.project.name
      const vars = PERFILES[perfil]
      if (!vars) return use()

      let refresh = ultimo[perfil] ? await renovarApi(request, ultimo[perfil].refresh) : null
      let clinicaId = ultimo[perfil]?.clinicaId ?? null
      if (!refresh) {
        const [emailVar, passwordVar] = vars
        const email = process.env[emailVar]
        const password = process.env[passwordVar]
        if (!email || !password) throw new Error(`Variables de entorno ${emailVar} y ${passwordVar} son requeridas`)
        const sesion = await loginApi(request, email, password)
        refresh = sesion.refresh
        clinicaId = sesion.clinicaId
      }
      ultimo[perfil] = { refresh, clinicaId }
      await abrirSesionEnNavegador(page, refresh, clinicaId)
      // Si el test termina con una renovación en vuelo, el token ya se usó pero
      // la cookie nueva no llegó: se espera la respuesta antes de leerla.
      const renovaciones: Promise<unknown>[] = []
      page.on('request', (r) => {
        if (r.url().includes('/auth/refresh/')) renovaciones.push(r.response().catch(() => null))
      })

      await use()

      await Promise.all(renovaciones)

      // El navegador rotó el token: el siguiente test sigue desde el nuevo.
      const cookie = (await page.context().cookies()).find((c) => c.name === 'cliniq_refresh')
      if (cookie?.value) ultimo[perfil] = { refresh: cookie.value, clinicaId }
    },
    { auto: true },
  ],
})

export { expect }
