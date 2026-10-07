'use client'

import { create } from 'zustand'

// Confirmación para enviar un WhatsApp desde el número de CliniQ cuando el
// número propio de la clínica no puede enviarlo: el backend responde
// NUMERO_PROPIO_NO_DISPONIBLE y nunca cae al de CliniQ sin preguntar. El
// diálogo vive en ConfirmarNumeroCliniqDialog (montado en AppShell).

interface Pendiente {
  mensaje: string
  responder: (enviar: boolean) => void
}

interface NumeroCliniqState {
  pendiente: Pendiente | null
  preguntar: (mensaje: string) => Promise<boolean>
  responder: (enviar: boolean) => void
}

export const useNumeroCliniqStore = create<NumeroCliniqState>((set, get) => ({
  pendiente: null,
  preguntar: (mensaje) => new Promise<boolean>((resolve) => {
    get().pendiente?.responder(false)
    set({ pendiente: { mensaje, responder: resolve } })
  }),
  responder: (enviar) => {
    get().pendiente?.responder(enviar)
    set({ pendiente: null })
  },
}))

const CODIGO = 'NUMERO_PROPIO_NO_DISPONIBLE'

function mensajeNumeroNoDisponible(err: unknown): string | null {
  const data = (err as { response?: { data?: { code?: string; error?: string } } })?.response?.data
  return data?.code === CODIGO ? data.error || 'No se pudo enviar desde el número de tu clínica.' : null
}

/** Envía un WhatsApp; si el número de la clínica no puede, pregunta si se manda
 *  desde el de CliniQ y reintenta con `usar_numero_cliniq`. Si el usuario no
 *  acepta, devuelve lo que diga `alNoEnviar` o, sin él, propaga el error
 *  original (su mensaje explica el motivo). */
export async function enviarConConfirmacion<T>(
  enviar: (usarNumeroCliniq: boolean) => Promise<T>,
  alNoEnviar?: (respuesta: Record<string, unknown>) => T,
): Promise<T> {
  try {
    return await enviar(false)
  } catch (err) {
    const mensaje = mensajeNumeroNoDisponible(err)
    if (!mensaje) throw err
    if (await useNumeroCliniqStore.getState().preguntar(mensaje)) return enviar(true)
    if (alNoEnviar) return alNoEnviar((err as { response: { data: Record<string, unknown> } }).response.data)
    throw err
  }
}

/** Para los links de firma: si no se envía, el backend igual devuelve el link
 *  para copiarlo. */
export const linkSinEnviar = (data: Record<string, unknown>) => ({
  enviado: false,
  signing_url: String(data.signing_url ?? ''),
  telefono: String(data.telefono ?? ''),
})

/** Cuerpo del POST: solo lleva la bandera cuando el usuario confirmó. */
export const cuerpoNumeroCliniq = (usar: boolean) => (usar ? { usar_numero_cliniq: true } : {})
