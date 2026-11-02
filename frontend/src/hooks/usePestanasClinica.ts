'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { configuracionPestanasApi, type ConfiguracionPestanas } from '@/lib/api/clinicas'
import type { VistaAtencion } from '@/types/usuarios'

// Pestañas que la clínica muestra en la historia del paciente y en la pantalla
// del profesional durante una atención. Se guardan en la clínica
// (/configuracion/historia/), no en el navegador: lo que configura el
// administrador lo ven todos los usuarios.

export type TabHistoria =
  | 'datos-generales' | 'motivo-consulta' | 'antecedentes' | 'mediciones' | 'examenes'
  | 'plan-manejo' | 'ordenes' | 'fotos' | 'zonas'

export type TabAtencion =
  | 'datos-generales' | 'motivo-consulta' | 'antecedentes' | 'examenes' | 'plan-manejo'
  | 'ordenes' | 'fotos' | 'mediciones' | 'insumos' | 'zonas'

const HISTORIA_TABS: TabHistoria[] = [
  'datos-generales', 'motivo-consulta', 'antecedentes', 'mediciones', 'examenes', 'plan-manejo', 'ordenes', 'fotos', 'zonas',
]
const ATENCION_TABS: TabAtencion[] = [
  'datos-generales', 'motivo-consulta', 'antecedentes', 'examenes', 'plan-manejo', 'ordenes', 'fotos', 'mediciones', 'insumos', 'zonas',
]

const QUERY_KEY = ['configuracion', 'pestanas']

type Campo = 'tabs_activos' | 'atencion_tabs_activos'

function usePestanas<T extends string>(campo: Campo, todas: T[]) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: configuracionPestanasApi.get,
    staleTime: 5 * 60_000,
  })
  const mutation = useMutation({
    mutationFn: (activas: string[]) => configuracionPestanasApi.update({ [campo]: activas }),
    onMutate: async (activas) => {
      // Optimista: el switch responde al instante; si falla, se revierte.
      await qc.cancelQueries({ queryKey: QUERY_KEY })
      const anterior = qc.getQueryData<ConfiguracionPestanas>(QUERY_KEY)
      if (anterior) qc.setQueryData(QUERY_KEY, { ...anterior, [campo]: activas })
      return { anterior }
    },
    onError: (_err, _vars, ctx) => { if (ctx?.anterior) qc.setQueryData(QUERY_KEY, ctx.anterior) },
    onSuccess: (respuesta) => qc.setQueryData(QUERY_KEY, respuesta),
  })

  // Mientras carga (o sin configuración) todas se muestran, como el backend.
  const activas = data?.[campo]
  const tabsActivos = Object.fromEntries(
    todas.map((slug) => [slug, activas ? activas.includes(slug) : true]),
  ) as Record<T, boolean>

  // Parte de lo que hay en caché al momento de llamar (no del render), para que
  // "Deshacer" desde el aviso no pise cambios hechos después.
  const setTabActivo = (tab: T, activo: boolean, alGuardar?: () => void) => {
    const actuales = qc.getQueryData<ConfiguracionPestanas>(QUERY_KEY)?.[campo]
    const estaActiva = (slug: T) => (actuales ? actuales.includes(slug) : true)
    mutation.mutate(
      todas.filter((slug) => (slug === tab ? activo : estaActiva(slug))),
      { onSuccess: () => alGuardar?.() },
    )
  }

  return { tabsActivos, setTabActivo, isLoading, guardando: mutation.isPending, error: mutation.error }
}

/** Vista de la atención de la clínica (el nivel base: el rol y el usuario la pueden cambiar). */
export function useVistaAtencionClinica() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: configuracionPestanasApi.get,
    staleTime: 5 * 60_000,
  })
  const mutation = useMutation({
    mutationFn: (vista: VistaAtencion) => configuracionPestanasApi.update({ vista_atencion: vista }),
    onSuccess: (respuesta) => {
      qc.setQueryData(QUERY_KEY, respuesta)
      // La vista efectiva de cada usuario y del listado sale de este valor.
      qc.invalidateQueries({ queryKey: ['usuarios'] })
    },
  })
  return {
    vista: data?.vista_atencion ?? 'completa',
    cargando: isLoading,
    guardando: mutation.isPending,
    error: mutation.error,
    cambiar: (vista: VistaAtencion, alGuardar?: () => void) => mutation.mutate(vista, { onSuccess: () => alGuardar?.() }),
  }
}

export const useHistoriaConfig = () => usePestanas<TabHistoria>('tabs_activos', HISTORIA_TABS)
export const useAtencionConfig = () => usePestanas<TabAtencion>('atencion_tabs_activos', ATENCION_TABS)
