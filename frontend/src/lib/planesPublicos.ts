import type { PlanPublico } from '@/lib/api/clinicas'

/**
 * Planes públicos leídos desde el servidor (sin JS en el navegador), para que
 * los precios queden en el HTML que leen buscadores y agentes de IA.
 * Si el backend no responde devuelve null y el landing los pide desde el navegador.
 */
export async function obtenerPlanesPublicos(): Promise<PlanPublico[] | null> {
  const base = process.env.BACKEND_URL
  if (!base) return null
  try {
    const res = await fetch(`${base}/api/v1/registro-clinica/planes/`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    return (await res.json()) as PlanPublico[]
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
