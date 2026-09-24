'use client'

import { ClinicaConfig } from '../clinica/ClinicaConfig'

export default function BiometriaConfigPage() {
  return (
    <ClinicaConfig
      secciones={['biometria']}
      title="Biometría"
      description="Verificación facial del paciente, umbrales y check-in automático."
      helpSlug="asistente-de-inicio-de-atencion"
    />
  )
}
