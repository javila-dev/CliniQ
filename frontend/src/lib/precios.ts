// Precio de un procedimiento o tratamiento según la sede. Misma regla que el
// backend (backend/apps/clinicas/precios.py): el precio propio de la sede o, si
// no tiene, el general.

import type { PrecioSede } from '@/types/clinicas'

type ConPrecios = { precios_sede?: PrecioSede[] | null }

/** Precio propio de la sede, o null si usa el general. */
export function precioPropioSede(item: ConPrecios | null | undefined, sedeId: string | null | undefined): number | null {
  if (!item || !sedeId) return null
  const propio = item.precios_sede?.find((p) => p.sede === sedeId)
  return propio ? Number(propio.precio) : null
}

/** Precio de lista en la sede: el propio o el general. */
export function precioEnSede(
  item: ConPrecios | null | undefined,
  general: string | number | null | undefined,
  sedeId: string | null | undefined,
): number | null {
  const propio = precioPropioSede(item, sedeId)
  if (propio !== null) return propio
  return general === null || general === undefined || general === '' ? null : Number(general)
}

/** Precio general de un procedimiento (precio_base, o el legado precio_referencia). */
export function precioGeneralProcedimiento(p: { precio_base?: string | null; precio_referencia?: string | null }): string | null {
  return p.precio_base ?? p.precio_referencia ?? null
}
