import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(iso: string): string {
  // Una fecha "solo día" (YYYY-MM-DD, típica de un DateField de Django) se
  // parsea como medianoche UTC y se corre al día anterior en zonas UTC-negativas.
  // Para esos casos construimos la fecha en horario local; los ISO con hora
  // mantienen el comportamiento normal.
  const soloDia = /^\d{4}-\d{2}-\d{2}$/.test(iso)
  const d = soloDia
    ? (([y, m, dd]) => new Date(y, m - 1, dd))(iso.split('-').map(Number))
    : new Date(iso)
  return d.toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDuracion(minutos: number): string {
  if (minutos < 60) return `${minutos} min`
  const dias = Math.floor(minutos / 1440)
  const horas = Math.floor((minutos % 1440) / 60)
  const mins = minutos % 60
  if (dias > 0) {
    const partes = [`${dias} día${dias > 1 ? 's' : ''}`, `${horas}h`]
    if (mins > 0) partes.push(`${mins} min`)
    return partes.join(' ')
  }
  return mins > 0 ? `${horas}h ${mins} min` : `${horas}h`
}

export function todayISO(): string {
  return new Date().toLocaleDateString('en-CA') // YYYY-MM-DD
}

/**
 * Formatea una fecha "solo día" (YYYY-MM-DD, o el prefijo de un ISO) SIN
 * corrimiento por zona horaria. `new Date("2026-08-27")` se interpreta como
 * medianoche UTC y en zonas UTC-negativas (Colombia UTC-5) se renderiza como
 * el día anterior. Este helper construye la fecha en horario local.
 */
export function formatFechaLocal(
  fecha: string | null | undefined,
  opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' },
): string {
  if (!fecha) return ''
  const [y, m, d] = fecha.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return ''
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', opts)
}

export function addDaysISO(iso: string, days: number): string {
  // Parsear como fecha local, no UTC: `new Date("2026-08-28")` es medianoche UTC
  // y en zonas UTC-negativas (Colombia UTC-5) cae en el día anterior, corriendo
  // toda la aritmética un día. El constructor con componentes normaliza overflow.
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d + days).toLocaleDateString('en-CA')
}
