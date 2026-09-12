import type { DeudaInfo } from '@/types/agenda'

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

export function formatMontoDeuda(monto: string | number): string {
  const n = typeof monto === 'number' ? monto : parseFloat(monto)
  return Number.isFinite(n) ? COP.format(n) : ''
}

/** Frase para el aviso de mora en el wizard de inicio de atención. */
export function textoDeudaBloqueante(deuda: DeudaInfo): string {
  const n = Number(deuda.cuotas_vencidas) || 0
  const cuotas = n === 1 ? 'cuota vencida' : 'cuotas vencidas'
  return `El paciente tiene ${n} ${cuotas} en cartera por ${formatMontoDeuda(deuda.monto_total)}.`
}

/**
 * Extrae el mensaje del error PACIENTE_CON_DEUDA que devuelve
 * `POST /agenda/citas/{id}/cambiar_estado/` al intentar iniciar la atención.
 * Devuelve null si el error no es por mora.
 */
export function mensajeErrorDeuda(err: unknown): string | null {
  const data = (err as { response?: { data?: any } })?.response?.data
  if (data?.code !== 'PACIENTE_CON_DEUDA') return null
  const n = Number(data.detalle?.cuotas_vencidas) || 0
  const cuotas = n === 1 ? 'cuota vencida' : 'cuotas vencidas'
  return `El paciente tiene ${n} ${cuotas} en cartera. No se puede iniciar la atención hasta registrar el pago o aprobar una excepción desde Cartera.`
}
