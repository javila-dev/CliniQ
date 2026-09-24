import { todayISO } from '@/lib/utils'
import type { Cartera, CuotaCartera } from '@/types/cartera'

export function formatCOP(value: string | number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(Number(value))
}

export function saldoCuota(cuota: CuotaCartera): number {
  return Number(cuota.saldo_pendiente ?? cuota.valor_esperado)
}

export type EstadoCuotaUI = 'pagada' | 'vencida' | 'pendiente' | 'parcial'

export function estadoCuota(cuota: CuotaCartera): EstadoCuotaUI {
  if (saldoCuota(cuota) <= 0) return 'pagada'
  // Comparación por fecha "solo día" para no marcar como vencida una cuota
  // que vence hoy (new Date("YYYY-MM-DD") es medianoche UTC).
  const atrasada = Boolean(cuota.fecha_esperada && cuota.fecha_esperada.slice(0, 10) < todayISO())
  if (atrasada) return 'vencida'
  if (Number(cuota.valor_pagado ?? 0) > 0) return 'parcial'
  return 'pendiente'
}

export type EstadoCarteraUI = 'saldada' | 'mora' | 'al_dia'

export function estadoCartera(cartera: Cartera): EstadoCarteraUI {
  if (Number(cartera.saldo_pendiente) <= 0) return 'saldada'
  if (cartera.en_mora) return 'mora'
  return 'al_dia'
}
