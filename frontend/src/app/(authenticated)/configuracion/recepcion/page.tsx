'use client'

import { ClinicaConfig } from '../clinica/ClinicaConfig'

export default function RecepcionConfigPage() {
  return (
    <ClinicaConfig
      secciones={['atencion']}
      title="Pasos de recepción"
      description="Lo que recepción hace cuando llega el paciente, antes de que el profesional lo atienda."
      helpSlug="asistente-de-inicio-de-atencion"
    />
  )
}
