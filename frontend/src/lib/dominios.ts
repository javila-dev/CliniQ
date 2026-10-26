/**
 * Sitio público (landing y registro de clínicas) y aplicación en dominios
 * distintos (docs/plan-separacion-dominios.md).
 *
 * Las URLs se hornean en el build desde frontend/.env.production. Sin las dos,
 * todo sigue en un solo dominio como antes: el landing en /landing y los
 * enlaces relativos.
 */

const sinSlashFinal = (url?: string) => (url || '').trim().replace(/\/+$/, '')

const hostDe = (url: string) => {
  try {
    return url ? new URL(url).host.toLowerCase() : ''
  } catch {
    return ''
  }
}

export const SITIO_URL = sinSlashFinal(process.env.NEXT_PUBLIC_SITIO_URL)
export const APP_URL = sinSlashFinal(process.env.NEXT_PUBLIC_APP_URL)

/** Solo se separa si están los dos dominios. */
export const DOMINIOS_SEPARADOS = Boolean(hostDe(SITIO_URL) && hostDe(APP_URL))

export const HOST_SITIO = DOMINIOS_SEPARADOS ? hostDe(SITIO_URL) : ''

/** Otros dominios del sitio (www, .co) que redirigen al principal. */
export const HOSTS_ALIAS_SITIO = (process.env.NEXT_PUBLIC_SITIO_ALIAS || '')
  .split(',')
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean)

/** Una ruta de la app, para enlazarla desde el sitio público. */
export const urlApp = (ruta: string) => (DOMINIOS_SEPARADOS ? `${APP_URL}${ruta}` : ruta)

/** Una ruta del sitio público, para enlazarla desde la app. */
export const urlSitio = (ruta: string) => (DOMINIOS_SEPARADOS ? `${SITIO_URL}${ruta}` : ruta)

/** Inicio del sitio público: en un solo dominio el landing sigue en /landing. */
export const INICIO_SITIO = DOMINIOS_SEPARADOS ? '/' : '/landing'
