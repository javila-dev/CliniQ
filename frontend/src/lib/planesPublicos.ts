import { unstable_cache } from 'next/cache'
import type { PlanPublico } from '@/lib/api/clinicas'

// La imagen se compila sin backend a la vista: si el landing se prerenderiza en
// `next build` queda congelado sin planes. Por eso la página se arma en cada
// request y lo que se cachea es la respuesta de la API, y solo si fue exitosa
// (unstable_cache no guarda una función que lanzó error).
const leerPlanes = unstable_cache(
  async (): Promise<PlanPublico[]> => {
    const res = await fetch(`${process.env.BACKEND_URL}/api/v1/registro-clinica/planes/`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) throw new Error(`planes públicos: HTTP ${res.status}`)
    return (await res.json()) as PlanPublico[]
  },
  ['planes-publicos'],
  { revalidate: 600 },
)

/**
 * Planes públicos leídos desde el servidor (sin JS en el navegador), para que
 * los precios queden en el HTML que leen buscadores y agentes de IA.
 * Si el backend no responde devuelve null y el landing los pide desde el navegador.
 */
export async function obtenerPlanesPublicos(): Promise<PlanPublico[] | null> {
  if (!process.env.BACKEND_URL) return null
  try {
    return await leerPlanes()
  } catch {
    return null
  }
}

/** Texto corto de lo que incluye un plan, igual que en la tarjeta de precios. */
export function resumenPlan(plan: PlanPublico): string[] {
  return [
    plan.max_usuarios > 0 ? `Hasta ${plan.max_usuarios} ${plan.max_usuarios === 1 ? 'usuario' : 'usuarios'}` : 'Usuarios ilimitados',
    plan.max_sedes > 0 ? `Hasta ${plan.max_sedes} ${plan.max_sedes === 1 ? 'sede' : 'sedes'}` : 'Sedes ilimitadas',
    ...(plan.facial_verificacion_habilitada ? ['Verificación facial'] : []),
    ...(plan.whatsapp_habilitado ? ['WhatsApp integrado'] : []),
  ]
}
