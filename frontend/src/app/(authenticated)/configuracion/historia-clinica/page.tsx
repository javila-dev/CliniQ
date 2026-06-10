'use client'

import { FileText } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Switch } from '@/components/ui/switch'
import { useHistoriaConfig, type TabHistoria } from '@/store/historiaConfigStore'
import { Button } from '@/components/ui/button'

interface TabConfig {
  value: TabHistoria
  label: string
  description: string
  obligatorio?: boolean
}

const TABS_CONFIG: TabConfig[] = [
  {
    value: 'datos-generales',
    label: 'Datos Generales',
    description: 'Identificación del paciente, datos complementarios y signos vitales.',
    obligatorio: true,
  },
  {
    value: 'motivo-consulta',
    label: 'Motivo de Consulta',
    description: 'Notas clínicas, anamnesis, diagnóstico y evolución del paciente.',
  },
  {
    value: 'antecedentes',
    label: 'Antecedentes',
    description: 'Antecedentes personales, ginecoobstétricos y familiares.',
  },
  {
    value: 'examenes',
    label: 'Exámenes',
    description: 'Resultados de laboratorio, imágenes diagnósticas y otros exámenes.',
  },
  {
    value: 'plan-manejo',
    label: 'Plan de Manejo',
    description: 'Plan de tratamiento y seguimiento del paciente.',
  },
  {
    value: 'ordenes',
    label: 'Órdenes Médicas',
    description: 'Órdenes médicas generadas a partir de plantillas.',
  },
  {
    value: 'fotos',
    label: 'Fotos',
    description: 'Galería fotográfica antes, durante y después de los procedimientos.',
  },
]

export default function ConfiguracionHistoriaClinicaPage() {
  const { tabsActivos, setTabActivo } = useHistoriaConfig()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Historia Clínica"
        description="Configura qué pestañas se muestran en la historia clínica de cada paciente."
        backHref="/configuracion"
      />

      <div className="rounded-lg border divide-y">
        {TABS_CONFIG.map(({ value, label, description, obligatorio }) => {
          const activo = tabsActivos[value] ?? true
          return (
            <div key={value} className="flex items-start justify-between gap-4 px-5 py-4">
              <div className="flex items-start gap-3">
                <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{label}</p>
                    {obligatorio && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        Obligatorio
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                </div>
              </div>
              <Switch
                checked={obligatorio ? true : activo}
                disabled={obligatorio}
                onCheckedChange={(checked) => {
                  if (!obligatorio) setTabActivo(value, checked)
                }}
              />
            </div>
          )
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Los cambios se aplican inmediatamente a todas las historias clínicas de la clínica.
        La pestaña <strong>Datos Generales</strong> siempre está activa y no puede desactivarse.
      </p>
    </div>
  )
}
