'use client'

import { PageHeader } from '@/components/shared/PageHeader'
import { PestanasClinicaAjustes } from '@/components/configuracion/PestanasClinicaAjustes'

export default function ConfiguracionAtencionPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        helpSlug="que-pestanas-mostrar-en-historia-y-atencion"
        title="Pestañas de la atención"
        description="Qué pestañas ve el profesional al atender y cuáles se muestran en la historia del paciente."
      />
      <PestanasClinicaAjustes />
    </div>
  )
}
