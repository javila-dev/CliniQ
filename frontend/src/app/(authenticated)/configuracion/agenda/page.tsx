'use client'

import { ClinicaConfig } from '../clinica/ClinicaConfig'

export default function AgendaPacientesConfigPage() {
  return (
    <ClinicaConfig
      secciones={['agenda', 'pacientes']}
      title="Agenda y pacientes"
      description="Turnos, recordatorios y el formulario para que los pacientes se registren solos."
      helpSlug="recordatorios-automaticos-de-citas"
    />
  )
}
