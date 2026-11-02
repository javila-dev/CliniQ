'use client'

import { PageHeader } from '@/components/shared/PageHeader'
import { PestanasClinicaAjustes } from '@/components/configuracion/PestanasClinicaAjustes'
import { VistaAtencionAjuste } from '@/components/configuracion/VistaAtencionAjuste'

export default function ConfiguracionAtencionPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        helpSlug="que-pestanas-mostrar-en-historia-y-atencion"
        title="Pantalla del profesional"
        description="Con qué vista atiende tu equipo y qué pestañas se muestran al atender y en la historia del paciente."
      />
      <VistaAtencionAjuste />
      <PestanasClinicaAjustes />
    </div>
  )
}
