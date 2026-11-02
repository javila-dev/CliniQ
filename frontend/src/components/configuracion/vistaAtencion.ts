import type { VistaAtencion } from '@/types/usuarios'

// Textos de la vista de la atención, iguales en Pantalla del profesional, roles
// y usuarios. Se elige por niveles: clínica → rol → usuario, y cada uno manda
// sobre el anterior (docs/plan-atencion-sencilla.md).

export const NOMBRE_VISTA: Record<VistaAtencion, string> = {
  completa: 'Completa',
  sencilla: 'Sencilla',
}

export const DESCRIPCION_VISTA: Record<VistaAtencion, string> = {
  completa: 'Historia clínica con pestañas: motivo, antecedentes, exámenes, órdenes, fotos y zonas.',
  sencilla: 'La hoja del paquete en una sola pantalla: qué se hizo, dónde, y listo.',
}

/** Valor de la lista para "usar la del nivel anterior" (en la API es null). */
export const HEREDAR = 'heredar'

/** Opciones para un rol o un usuario: la primera hereda y dice qué vista resulta. */
export function opcionesVista(heredada: VistaAtencion, deDonde: 'de la clínica' | 'de su rol') {
  return [
    { value: HEREDAR, label: `La ${deDonde} (${NOMBRE_VISTA[heredada].toLowerCase()})` },
    { value: 'sencilla', label: NOMBRE_VISTA.sencilla },
    { value: 'completa', label: NOMBRE_VISTA.completa },
  ]
}

export const aValorLista = (vista: VistaAtencion | null | undefined) => vista ?? HEREDAR
export const deValorLista = (valor: string): VistaAtencion | null => (valor === HEREDAR ? null : (valor as VistaAtencion))
