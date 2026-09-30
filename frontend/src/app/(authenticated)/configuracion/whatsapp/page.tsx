'use client'

import { PageHeader } from '@/components/shared/PageHeader'
import { WhatsappPropioConfig } from '@/components/configuracion/WhatsappPropioConfig'

export default function ConfiguracionWhatsappPage() {
  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader
        title="Número de envío"
        description="Envía los mensajes a tus pacientes desde el número de tu clínica, uno general o uno por sede."
      />
      <WhatsappPropioConfig />
    </div>
  )
}
