'use client'

import { useQuery } from '@tanstack/react-query'
import { Loader2, MessageSquare, Activity, Camera } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { cotizacionesApi } from '@/lib/api/cotizaciones'
import { TabMotivoConsulta } from '@/components/historia/TabMotivoConsulta'
import { TabFotos } from '@/components/historia/TabFotos'
import { TabMediciones } from '@/components/obesidad/TabMediciones'
import type { HistoriaClinica } from '@/types/historia'

interface Props {
  cotizacionId: string
  pacienteId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Mini-atención generada desde la cotización: motivo de consulta, seguimiento
 * (medidas) y fotos, sin depender de una cita agendada. Reutiliza los mismos
 * tabs que la atención completa — solo cambia qué nota clínica les pasamos.
 *
 * La nota se resuelve con `cotizacionesApi.notaClinica` (vive bajo
 * `cotizaciones.gestionar`), no con los endpoints generales de historia
 * clínica: así, quien puede gestionar la cotización puede dejar estos datos
 * aunque su rol no tenga permisos clínicos generales (`historia.ver`, etc.).
 */
export function DatosClinicosCotizacionModal({ cotizacionId, pacienteId, open, onOpenChange }: Props) {
  const { data: nota } = useQuery({
    queryKey: ['nota-cotizacion', cotizacionId],
    queryFn: () => cotizacionesApi.notaClinica(cotizacionId),
    enabled: open,
  })

  // Los tabs reutilizados solo necesitan el id de la historia (queries de
  // galería/fotos); no hace falta pedirla aparte con un endpoint que exige
  // `historia.ver`.
  const historia = nota ? ({ id: nota.historia } as HistoriaClinica) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[95vw] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Datos clínicos</DialogTitle>
        </DialogHeader>

        {!historia || !nota ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="motivo-consulta" className="min-w-0">
            <TabsList className="h-auto bg-muted rounded-full p-1 gap-1 w-max">
              <TabsTrigger
                value="motivo-consulta"
                className="rounded-full px-3.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors duration-200 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:font-semibold data-[state=active]:shadow-none"
              >
                <MessageSquare className="h-3.5 w-3.5 mr-1.5 -ml-0.5 inline-block align-[-2px]" />
                Motivo de consulta
              </TabsTrigger>
              <TabsTrigger
                value="seguimiento"
                className="rounded-full px-3.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors duration-200 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:font-semibold data-[state=active]:shadow-none"
              >
                <Activity className="h-3.5 w-3.5 mr-1.5 -ml-0.5 inline-block align-[-2px]" />
                Seguimiento
              </TabsTrigger>
              <TabsTrigger
                value="fotos"
                className="rounded-full px-3.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors duration-200 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:font-semibold data-[state=active]:shadow-none"
              >
                <Camera className="h-3.5 w-3.5 mr-1.5 -ml-0.5 inline-block align-[-2px]" />
                Fotos
              </TabsTrigger>
            </TabsList>

            {/* El card propio de TabMotivoConsulta queda redundante dentro del
               modal (ya está enmarcado por el Dialog) — se lo quitamos acá. */}
            <TabsContent
              value="motivo-consulta"
              className="pt-4 [&_.rounded-lg.border]:border-0 [&_.rounded-lg.border]:p-0 [&_.rounded-lg.border]:shadow-none [&_.rounded-lg.border]:max-w-none"
            >
              <TabMotivoConsulta historia={historia} notas={[nota]} notaId={nota.id} />
            </TabsContent>
            <TabsContent value="seguimiento" className="pt-4 min-w-0">
              <TabMediciones pacienteId={pacienteId} notaId={nota.id} />
            </TabsContent>
            <TabsContent value="fotos" className="pt-4">
              <TabFotos historia={historia} notas={[nota]} />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}
