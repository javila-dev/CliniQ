import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { WheelEvent } from 'react'

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

/** Día local (YYYY-MM-DD) de una fecha. `toISOString()` da el día en UTC:
 *  después de las 19:00 en Colombia ya es el día siguiente. */
export function fechaLocalISO(d: Date): string {
  return d.toLocaleDateString('en-CA')
}

/**
 * Texto legible de un HTML guardado (p. ej. el contenido de una plantilla):
 * conserva los saltos de párrafo y no ejecuta nada. Antes el paciente veía las
 * etiquetas crudas (`<p>`, `<strong>`).
 */
export function htmlATexto(html: string | null | undefined): string {
  if (!html) return ''
  if (!/<[a-z!/]/i.test(html)) return html
  const conSaltos = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
  const doc = new DOMParser().parseFromString(conSaltos, 'text/html')
  return (doc.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Edad del paciente. Usa `edad` de la API: quien no ve datos sensibles recibe
 * la fecha de nacimiento en null (antes salía "—"). Si solo hay fecha, se lee
 * como día local: `new Date('YYYY-MM-DD')` es UTC y adelantaba el cumpleaños.
 */
export function edadPaciente(p: { edad?: number | null; fecha_nacimiento?: string | null } | null | undefined): number | null {
  if (!p) return null
  if (typeof p.edad === 'number') return p.edad
  if (!p.fecha_nacimiento) return null
  const [y, m, d] = p.fecha_nacimiento.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  const hoy = new Date()
  let edad = hoy.getFullYear() - y
  if (hoy.getMonth() + 1 < m || (hoy.getMonth() + 1 === m && hoy.getDate() < d)) edad--
  return edad
}

/** Fecha y hora local para un `<input type="datetime-local">` (YYYY-MM-DDTHH:mm). */
export function fechaHoraLocalInput(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${fechaLocalISO(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Formatea una fecha "solo día" (YYYY-MM-DD, o el prefijo de un ISO) SIN
 * corrimiento por zona horaria. `new Date("2026-08-27")` se interpreta como
 * medianoche UTC y en zonas UTC-negativas (Colombia UTC-5) se renderiza como
 * el día anterior. Este helper construye la fecha en horario local.
 */
function aFechaLocal(fecha: string): Date | null {
  // "YYYY-MM-DD" (DateField) se arma en hora local; un ISO con hora se usa tal cual.
  if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    const [y, m, d] = fecha.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  const d = new Date(fecha)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Fecha en formato dd/mm/aaaa (el de las tablas). */
export function formatFechaDMY(fecha: string | null | undefined): string {
  const d = fecha ? aFechaLocal(fecha) : null
  if (!d) return '—'
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

/** "hoy", "ayer", "hace 3 días", "en 5 días": distancia en días calendario a hoy. */
export function diasRelativos(fecha: string | null | undefined): string {
  const d = fecha ? aFechaLocal(fecha) : null
  if (!d) return ''
  const hoy = new Date()
  const a = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  const b = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  const dias = Math.round((a - b) / 86_400_000)
  if (dias === 0) return 'hoy'
  if (dias === 1) return 'ayer'
  if (dias === -1) return 'mañana'
  return dias > 0 ? `hace ${dias} días` : `en ${-dias} días`
}

export function formatFechaLocal(
  fecha: string | null | undefined,
  opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' },
): string {
  if (!fecha) return ''
  const [y, m, d] = fecha.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return ''
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', opts)
}

/**
 * Radix Dialog bloquea el scroll nativo con la rueda del mouse en cualquier
 * contenedor con su propio `overflow-y-auto` anidado dentro del Dialog (solo
 * deja scrollear el propio Dialog.Content). Este handler reenvía el delta a
 * mano para que esas listas internas sigan siendo scrolleables sin tener que
 * agrandar el modal entero. Usar como `onWheel={scrollWheelFallback}`.
 */
export function scrollWheelFallback(e: WheelEvent<HTMLElement>) {
  e.currentTarget.scrollTop += e.deltaY
}

/**
 * Muchos usuarios escriben su nombre en mayúsculas sostenidas al registrarse.
 * Para mostrarlo de forma legible en listados (sin tocar el dato guardado)
 * lo pasamos a Título: primera letra de cada palabra en mayúscula.
 */
export function toTitleCase(texto: string): string {
  return texto
    .toLowerCase()
    .split(' ')
    .map((palabra) => (palabra ? palabra[0].toUpperCase() + palabra.slice(1) : palabra))
    .join(' ')
}

export function addDaysISO(iso: string, days: number): string {
  // Parsear como fecha local, no UTC: `new Date("2026-08-28")` es medianoche UTC
  // y en zonas UTC-negativas (Colombia UTC-5) cae en el día anterior, corriendo
  // toda la aritmética un día. El constructor con componentes normaliza overflow.
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d + days).toLocaleDateString('en-CA')
}
