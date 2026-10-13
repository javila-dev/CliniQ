'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { CotizacionForm } from '@/components/cotizaciones/CotizacionForm'
import { LoadingState } from '@/components/shared/LoadingState'
import { pacientesApi } from '@/lib/api/pacientes'

/** `?paciente=` (desde la ficha del paciente) llega con el paciente ya elegido. */
function NuevaCotizacion() {
  const pacienteId = useSearchParams().get('paciente')
  const { data: paciente, isLoading } = useQuery({
    queryKey: ['pacientes', pacienteId],
    queryFn: () => pacientesApi.get(pacienteId!),
    enabled: Boolean(pacienteId),
  })

  // El formulario toma el paciente inicial al montarse: se espera a tenerlo.
  if (pacienteId && isLoading) return <LoadingState />

  return (
    <CotizacionForm
      pacienteInicial={paciente ? {
        id: paciente.id, nombre_completo: paciente.nombre_completo, numero_documento: paciente.numero_documento,
        tipo_documento: paciente.tipo_documento, telefono: paciente.telefono,
        canal_confirmacion: paciente.canal_confirmacion,
      } : null}
    />
  )
}

export default function NuevaCotizacionPage() {
  return <Suspense><NuevaCotizacion /></Suspense>
}
