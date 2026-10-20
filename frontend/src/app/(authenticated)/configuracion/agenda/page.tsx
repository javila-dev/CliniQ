'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ClinicaConfig } from '../clinica/ClinicaConfig'

export default function AgendaConfigPage() {
  const router = useRouter()

  // Antes las dos secciones estaban apiladas aquí; los enlaces a #pacientes siguen funcionando.
  useEffect(() => {
    if (window.location.hash === '#pacientes') router.replace('/configuracion/registro-pacientes')
  }, [router])

  return (
    <ClinicaConfig
      secciones={['agenda']}
      title="Agenda y recordatorios"
      description="Frecuencia de turnos, profesionales por procedimiento y recordatorios."
      helpSlug="recordatorios-automaticos-de-citas"
    />
  )
}
