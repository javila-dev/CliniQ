'use client'

import { ClinicaConfig } from '../clinica/ClinicaConfig'

export default function RegistroPacientesConfigPage() {
  return (
    <ClinicaConfig
      secciones={['pacientes']}
      title="Registro de pacientes"
      description="Formulario y link para que los pacientes se registren solos."
      helpSlug="recordatorios-automaticos-de-citas"
    />
  )
}
