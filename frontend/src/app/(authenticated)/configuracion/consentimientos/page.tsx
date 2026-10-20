'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { FileSignature, MapPin, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import { configuracionApi, type PlantillaConsentimiento } from '@/lib/api/configuracion'
import { PageHeader } from '@/components/shared/PageHeader'
import {
  EtiquetaAjuste, FilaAjuste, SeccionAjustes, VacioAjustes,
} from '@/components/configuracion/ajustes'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { mensajeDeError } from '@/lib/errores'
import { toast } from '@/hooks/use-toast'
import { useAuthStore } from '@/store/authStore'
import { hasPermission, PERM } from '@/lib/permissions'

/** Qué le falta a la plantilla para usarse, o quién la firma si ya está lista. */
function estadoPlantilla(p: PlantillaConsentimiento) {
  if (!p.tiene_pdf) return { etiqueta: 'Sin PDF', lista: false, texto: 'Falta subir el PDF del consentimiento.' }
  if (!p.tiene_campos) return { etiqueta: 'Sin campos', lista: false, texto: 'Falta ubicar en el PDF dónde va cada campo.' }
  if (p.incompleta) {
    return {
      etiqueta: 'Incompleta', lista: false,
      texto: 'Faltan los campos del profesional. Mientras tanto se firma solo con el paciente.',
    }
  }
  return {
    etiqueta: null, lista: true,
    texto: p.requiere_firma_profesional ? 'Firman el paciente y el profesional.' : 'Firma solo el paciente.',
  }
}

function FilaPlantilla({
  plantilla,
  onDelete,
  puedeGestionar,
}: {
  plantilla: PlantillaConsentimiento
  onDelete: (id: string) => void
  puedeGestionar: boolean
}) {
  const nombre = plantilla.nombre || plantilla.label
  const estado = estadoPlantilla(plantilla)
  const rutaCampos = `/configuracion/consentimientos/${plantilla.id}/campos`

  return (
    <FilaAjuste
      icono={FileSignature}
      apagada={!estado.lista}
      titulo={nombre}
      extra={estado.etiqueta ? <EtiquetaAjuste tono="aviso">{estado.etiqueta}</EtiquetaAjuste> : undefined}
      descripcion={estado.texto}
    >
      {puedeGestionar && (
        <>
          {/* Si faltan campos, ubicarlos es lo siguiente: queda a la vista. */}
          {plantilla.tiene_pdf && !estado.lista && (
            <Button size="sm" variant="outline" asChild>
              <Link href={rutaCampos}>
                <MapPin className="mr-1.5 h-3.5 w-3.5" />
                Ubicar campos
              </Link>
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Acciones de ${nombre}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {plantilla.tiene_pdf && (
                <>
                  <DropdownMenuItem asChild>
                    <Link href={rutaCampos}>
                      <MapPin className="mr-2 h-3.5 w-3.5" />
                      {plantilla.tiene_campos ? 'Editar campos' : 'Mapear campos'}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={() => onDelete(plantilla.id)} className="text-red-600 focus:text-red-600">
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </FilaAjuste>
  )
}

export default function ConsentimientosConfigPage() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  // Con solo "ver plantillas" no aparecen Nueva, Mapear ni Eliminar (fallaban).
  const puedeGestionar = hasPermission(user, PERM.CONSENTIMIENTOS_GESTIONAR)

  const { data: plantillas = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['plantillas-consentimiento'],
    queryFn: configuracionApi.plantillasConsentimiento.list,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => configuracionApi.plantillasConsentimiento.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plantillas-consentimiento'] })
      toast.success('Plantilla eliminada')
    },
    onError: (err) => toast.error('No se pudo eliminar la plantilla', mensajeDeError(err)),
  })

  const handleDelete = (id: string) => {
    if (window.confirm('¿Eliminar esta plantilla? Los procedimientos que la usen dejarán de tenerla asociada.')) {
      deleteMutation.mutate(id)
    }
  }

  const botonNueva = (texto: string) => puedeGestionar ? (
    <Button size="sm" asChild>
      <Link href="/configuracion/consentimientos/nuevo">
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        {texto}
      </Link>
    </Button>
  ) : undefined

  return (
    <div className="space-y-6">
      <PageHeader
        helpSlug="consentimientos-informados-como-funcionan"
        title="Plantillas de consentimiento"
        description="Sube tus PDFs de consentimiento, mapea los campos y asócialos a procedimientos."
      />

      <div className="space-y-7">
        <SeccionAjustes
          titulo="Plantillas"
          descripcion="PDF con los campos de firma ubicados."
          accion={plantillas.length > 0 ? botonNueva('Nueva plantilla') : undefined}
        >
          {isLoading ? <FilasCargando filas={3} /> : isError ? (
            <FilaAjuste titulo="No se pudieron cargar las plantillas.">
              <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>Reintentar</Button>
            </FilaAjuste>
          ) : plantillas.length === 0 ? (
            <VacioAjustes
              titulo="Sin plantillas todavía"
              descripcion="Sube el PDF del consentimiento y luego ubica dónde va cada campo (firma, nombre, fecha…)."
              accion={botonNueva('Crear primera plantilla')}
            />
          ) : (
            plantillas.map((p) => (
              <FilaPlantilla key={p.id} plantilla={p} onDelete={handleDelete} puedeGestionar={puedeGestionar} />
            ))
          )}
        </SeccionAjustes>
      </div>
    </div>
  )
}

/** Filas grises mientras cargan los datos (igual que en ClinicaConfig). */
function FilasCargando({ filas }: { filas: number }) {
  return (
    <>
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5">
          <div className="h-8 w-8 shrink-0 animate-pulse rounded-lg bg-muted" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-40 animate-pulse rounded bg-muted" />
            <div className="h-2.5 w-64 max-w-full animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </>
  )
}
