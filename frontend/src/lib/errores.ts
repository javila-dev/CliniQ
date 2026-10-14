/**
 * Mensajes de error para el usuario a partir de un error de axios.
 *
 * El backend responde de varias formas: `{error, code}`, `{detail}` (DRF) o
 * errores por campo `{campo: ["mensaje"]}`. Antes cada pantalla leía solo una
 * (o ninguna) y el usuario veía "Request failed with status code 400", un
 * mensaje genérico, o nada.
 */
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'

type DatosError = Record<string, unknown>

interface ErrorHttp {
  response?: { status?: number; data?: unknown }
  request?: unknown
  message?: string
}

const PERMISO_GENERICO = /no tienes permiso para realizar esta acci[oó]n/i

const ERRORES_DE_SERVICIO: Record<string, string> = {
  WEBHOOK_NOT_CONFIGURED: 'El envío por WhatsApp no está configurado. Avísale al soporte de CliniQ.',
  WEBHOOK_ERROR: 'No se pudo conectar con el servicio de mensajes. Intenta de nuevo en unos minutos.',
  DOCUMENSO_ERROR: 'El servicio de firmas no respondió. Intenta de nuevo en unos minutos.',
}

/** Primer mensaje legible de un error de campo, aunque venga anidado
 *  (p. ej. `precios_sede: [{sede: ["..."]}]`, que antes salía "[object Object]"). */
export function primerTexto(valor: unknown): string | null {
  if (typeof valor === 'string' && valor.trim()) return valor
  if (Array.isArray(valor)) {
    for (const v of valor) {
      const t = primerTexto(v)
      if (t) return t
    }
  }
  if (valor && typeof valor === 'object') {
    for (const v of Object.values(valor as DatosError)) {
      const t = primerTexto(v)
      if (t) return t
    }
  }
  return null
}

/** Texto en español para mostrar al usuario. */
export function mensajeDeError(
  err: unknown,
  porDefecto = 'No se pudo completar la acción. Intenta de nuevo.',
): string {
  const e = err as ErrorHttp
  const status = e?.response?.status
  const data = e?.response?.data

  if (!e?.response) {
    // Sin respuesta del servidor: red caída o servidor apagado.
    if (e?.request) return 'No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.'
    return porDefecto
  }
  if (status === 429) return 'Demasiados intentos seguidos. Espera unos minutos e intenta de nuevo.'

  const obj = data && typeof data === 'object' && !Array.isArray(data) ? (data as DatosError) : null

  if (status && status >= 500) {
    // Los 502/503 de servicios externos traen texto técnico: se traduce por código.
    const porCodigo = typeof obj?.code === 'string' ? ERRORES_DE_SERVICIO[obj.code] : undefined
    return porCodigo ?? 'El sistema tuvo un problema. Intenta de nuevo en unos minutos.'
  }
  const directo = obj ? primerTexto(obj.error) ?? primerTexto(obj.detail) : null

  if (status === 403) {
    if (directo && !PERMISO_GENERICO.test(directo)) return directo
    return 'Tu rol no tiene permiso para hacer esto. Pídeselo al administrador.'
  }
  if (status === 404) return directo ?? 'No encontramos lo que buscas. Puede que se haya eliminado.'
  if (directo) return directo
  if (obj) {
    const noCampo = primerTexto(obj.non_field_errors)
    if (noCampo) return noCampo
    for (const [campo, valor] of Object.entries(obj)) {
      if (campo === 'code') continue
      const t = primerTexto(valor)
      if (t) return t
    }
  }
  return porDefecto
}

/** True si el error es de falta de permiso (403). */
export function esSinPermiso(err: unknown): boolean {
  return (err as ErrorHttp)?.response?.status === 403
}

/**
 * Pasa los errores 400 por campo al formulario (react-hook-form). Devuelve true
 * si alguno coincidió con un campo del formulario, para no repetirlo arriba.
 */
export function aplicarErroresDeCampo<T extends FieldValues>(
  err: unknown,
  setError: UseFormSetError<T>,
  campos: readonly string[],
): boolean {
  const data = (err as ErrorHttp)?.response?.data
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false
  let alguno = false
  for (const [campo, valor] of Object.entries(data as DatosError)) {
    if (!campos.includes(campo)) continue
    const texto = primerTexto(valor)
    if (texto) {
      setError(campo as Path<T>, { type: 'server', message: texto })
      alguno = true
    }
  }
  return alguno
}
