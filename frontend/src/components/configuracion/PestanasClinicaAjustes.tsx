'use client'

import {
  Activity, Camera, ClipboardList, FileText, FlaskConical, IdCard, Info, ListChecks, MessageSquare,
  Package, PersonStanding,
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useAtencionConfig, useHistoriaConfig, type TabAtencion, type TabHistoria } from '@/hooks/usePestanasClinica'
import { avisarGuardado, EtiquetaAjuste, SeccionAjustes } from './ajustes'

/*
 * Pestañas de la atención y de la historia clínica en una sola tabla: cada
 * pestaña es una fila y cada pantalla una columna. Antes eran dos pantallas
 * con la misma lista repetida, y cada una pasaba de la altura de la ventana.
 * El orden y los íconos son los que se ven al atender y en la historia.
 */
const PESTANAS = [
  { valor: 'datos-generales', icono: IdCard, titulo: 'Datos generales', descripcion: 'Identificación y datos complementarios del paciente.', obligatoria: true },
  { valor: 'motivo-consulta', icono: MessageSquare, titulo: 'Motivo de consulta', descripcion: 'Anamnesis, diagnóstico y evolución.' },
  { valor: 'antecedentes', icono: ClipboardList, titulo: 'Antecedentes', descripcion: 'Personales, ginecoobstétricos y familiares.' },
  { valor: 'mediciones', icono: Activity, titulo: 'Seguimiento', descripcion: 'Signos vitales y medidas de cada control.' },
  { valor: 'examenes', icono: FlaskConical, titulo: 'Exámenes', descripcion: 'Laboratorios, imágenes y otros resultados.' },
  { valor: 'plan-manejo', icono: ListChecks, titulo: 'Plan de manejo', descripcion: 'Tratamiento indicado y su seguimiento.' },
  { valor: 'ordenes', icono: FileText, titulo: 'Órdenes médicas', descripcion: 'Órdenes generadas desde las plantillas.' },
  { valor: 'fotos', icono: Camera, titulo: 'Fotos', descripcion: 'Antes, durante y después de cada procedimiento.' },
  { valor: 'insumos', icono: Package, titulo: 'Insumos', descripcion: 'Lo gastado en la atención; se descuenta del inventario. Solo existe al atender.' },
  { valor: 'zonas', icono: PersonStanding, titulo: 'Zonas', descripcion: 'Zonas del cuerpo tratadas en cada visita. Solo existe en la historia.' },
] as const

const EN_ATENCION: readonly string[] = [
  'datos-generales', 'motivo-consulta', 'antecedentes', 'mediciones', 'examenes',
  'plan-manejo', 'ordenes', 'fotos', 'insumos',
] satisfies readonly TabAtencion[]
const EN_HISTORIA: readonly string[] = [
  'datos-generales', 'motivo-consulta', 'antecedentes', 'mediciones', 'examenes',
  'plan-manejo', 'ordenes', 'fotos', 'zonas',
] satisfies readonly TabHistoria[]

const COLUMNAS = 'grid grid-cols-[minmax(0,1fr)_3.75rem_3.75rem] items-center gap-x-2 sm:grid-cols-[minmax(0,1fr)_7.5rem_7.5rem]'

export function PestanasClinicaAjustes() {
  const atencion = useAtencionConfig()
  const historia = useHistoriaConfig()

  function cambiarAtencion(tab: TabAtencion, activo: boolean, conDeshacer = true) {
    atencion.setTabActivo(tab, activo, () =>
      avisarGuardado(conDeshacer ? () => cambiarAtencion(tab, !activo, false) : undefined))
  }
  function cambiarHistoria(tab: TabHistoria, activo: boolean, conDeshacer = true) {
    historia.setTabActivo(tab, activo, () =>
      avisarGuardado(conDeshacer ? () => cambiarHistoria(tab, !activo, false) : undefined))
  }

  const cargando = atencion.isLoading || historia.isLoading
  const error = atencion.error || historia.error

  return (
    <div className="space-y-3">
      <SeccionAjustes
        titulo="Pestañas"
        descripcion="Apaga una pestaña para ocultarla al atender, en la historia del paciente o en las dos."
      >
        <div className={`${COLUMNAS} bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground`}>
          <span>Pestaña</span>
          <span className="text-center"><span className="sm:hidden">Atender</span><span className="hidden sm:inline">Al atender</span></span>
          <span className="text-center"><span className="sm:hidden">Historia</span><span className="hidden sm:inline">En la historia</span></span>
        </div>

        {PESTANAS.map((p) => {
          const obligatoria = 'obligatoria' in p && p.obligatoria
          const Icono = p.icono
          return (
            <div key={p.valor} className={`${COLUMNAS} px-4 py-2`}>
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icono className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 text-sm font-medium leading-tight sm:truncate">{p.titulo}</span>
                <Popover>
                  <PopoverTrigger
                    className="shrink-0 rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Qué es ${p.titulo}`}
                  >
                    <Info className="h-3.5 w-3.5" />
                  </PopoverTrigger>
                  <PopoverContent side="top" className="w-64 text-[13px] text-muted-foreground">{p.descripcion}</PopoverContent>
                </Popover>
                {obligatoria && <span className="hidden sm:inline"><EtiquetaAjuste>Obligatoria</EtiquetaAjuste></span>}
              </div>
              <Celda
                aplica={EN_ATENCION.includes(p.valor)}
                activa={obligatoria || (atencion.tabsActivos[p.valor as TabAtencion] ?? true)}
                bloqueada={obligatoria || cargando || atencion.guardando}
                onCambiar={(v) => cambiarAtencion(p.valor as TabAtencion, v)}
                etiqueta={`${p.titulo} al atender`}
              />
              <Celda
                aplica={EN_HISTORIA.includes(p.valor)}
                activa={obligatoria || (historia.tabsActivos[p.valor as TabHistoria] ?? true)}
                bloqueada={obligatoria || cargando || historia.guardando}
                onCambiar={(v) => cambiarHistoria(p.valor as TabHistoria, v)}
                etiqueta={`${p.titulo} en la historia`}
              />
            </div>
          )
        })}
      </SeccionAjustes>
      {Boolean(error) && <p className="text-sm text-destructive">No se pudo guardar el cambio. Intenta de nuevo.</p>}
    </div>
  )
}

function Celda({
  aplica, activa, bloqueada, onCambiar, etiqueta,
}: {
  aplica: boolean
  activa: boolean
  bloqueada: boolean
  onCambiar: (v: boolean) => void
  etiqueta: string
}) {
  if (!aplica) {
    return <span className="text-center text-sm text-muted-foreground" title="No existe en esta pantalla">—</span>
  }
  return (
    <span className="flex justify-center">
      <Switch checked={activa} disabled={bloqueada} onCheckedChange={onCambiar} aria-label={etiqueta} />
    </span>
  )
}
