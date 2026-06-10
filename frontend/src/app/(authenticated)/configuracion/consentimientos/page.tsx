'use client'

import { FileSignature } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'

export default function ConsentimientosConfigPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Consentimientos informados"
        description="Asocia plantillas de consentimiento a los servicios de la clínica."
        backHref="/configuracion"
      />

      <div className="rounded-xl border bg-white p-8 flex flex-col items-center text-center gap-3">
        <FileSignature className="h-8 w-8 text-muted-foreground/40" />
        <div>
          <p className="text-sm font-medium">Configuración movida a Servicios</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            Las plantillas de Documenso se asocian directamente en cada servicio.
            Ve a <span className="font-medium">Configuración → Servicios</span>, edita un servicio
            y activa &quot;Requiere consentimiento&quot; para seleccionar la plantilla.
          </p>
        </div>
      </div>
    </div>
  )
}
