import axios from 'axios'

/**
 * Sesión sin tokens en localStorage.
 *
 * El token de acceso vive solo en memoria y el de renovación en una cookie
 * HttpOnly que pone el backend (JavaScript no la puede leer). Antes los dos
 * estaban en localStorage, al alcance de cualquier script de la página. Al
 * recargar, el token de acceso se pide de nuevo con la cookie.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'

let accessToken: string | null = null
let suplantando = false

export const getAccessToken = () => accessToken
export function setAccessToken(token: string | null) { accessToken = token }

/** Superadmin dentro de la sesión de otro usuario: su token no se renueva. */
export const estaSuplantando = () => suplantando
export function setSuplantando(valor: boolean) { suplantando = valor }

// Cada pestaña tiene su token en memoria: cuando una cierra o inicia sesión,
// avisa a las demás del mismo navegador. Antes compartían el de localStorage y
// cerrar sesión en una las cerraba todas (computador compartido de recepción).
export type CambioDeSesion = 'logout' | 'login'
const canal = typeof window !== 'undefined' && 'BroadcastChannel' in window
  ? new BroadcastChannel('cliniq-sesion')
  : null

export function avisarOtrasPestanas(cambio: CambioDeSesion) {
  try { canal?.postMessage(cambio) } catch { /* canal cerrado */ }
}

export function escucharOtrasPestanas(fn: (cambio: CambioDeSesion) => void): () => void {
  if (!canal) return () => {}
  const alRecibir = (e: MessageEvent) => fn(e.data as CambioDeSesion)
  canal.addEventListener('message', alRecibir)
  return () => canal.removeEventListener('message', alRecibir)
}

// Lo que guardaba la versión anterior: se borra en cuanto se pueda.
const CLAVES_VIEJAS = ['access_token', 'refresh_token', 'original_access_token', 'original_refresh_token', 'original_clinica_id']

export function limpiarTokensViejos() {
  try { CLAVES_VIEJAS.forEach((clave) => localStorage.removeItem(clave)) } catch { /* sin almacenamiento */ }
}

function tokenViejo(): string | null {
  try { return localStorage.getItem('refresh_token') } catch { return null }
}

const pedirRenovacion = (cuerpo: Record<string, string> = {}) =>
  axios.post<{ access: string }>(`${BASE_URL}/auth/refresh/`, cuerpo, { withCredentials: true })

async function renovar(): Promise<string> {
  // Una sesión abierta antes de este cambio tiene el token en localStorage: se
  // manda una vez para que el backend lo pase a la cookie, y se borra.
  const viejo = tokenViejo()
  try {
    const { data } = await pedirRenovacion(viejo ? { refresh: viejo } : {})
    accessToken = data.access
    return data.access
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status
    if (status !== 401) throw err
    // Otra pestaña pudo renovar al mismo tiempo: el backend rota el token y el
    // que mandamos quedó revocado, pero la cookie ya trae el nuevo.
    await new Promise((resolver) => setTimeout(resolver, 400))
    const { data } = await pedirRenovacion()
    accessToken = data.access
    return data.access
  } finally {
    if (viejo) limpiarTokensViejos()
  }
}

/**
 * Las pestañas se turnan para renovar: el backend rota el token en cada
 * renovación, así que si dos lo hacen a la vez con la misma cookie una recibe
 * 401. Con el candado, la segunda espera y usa la cookie que dejó la primera
 * (al restaurar el navegador se abren varias pestañas juntas).
 */
function enTurno(fn: () => Promise<string>): Promise<string> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  // El tipo de lib.dom no aplana la promesa del callback; `then` sí.
  return locks ? locks.request('cliniq-renovar-sesion', fn).then((token) => token) : fn()
}

let enCurso: Promise<string> | null = null

/** Token de acceso nuevo a partir de la cookie. Una sola petición a la vez. */
export function renovarSesion(): Promise<string> {
  if (!enCurso) enCurso = enTurno(renovar).finally(() => { enCurso = null })
  return enCurso
}
