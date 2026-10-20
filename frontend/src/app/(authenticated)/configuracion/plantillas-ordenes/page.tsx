'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, MoreHorizontal, Pencil, Plus, Power, PowerOff } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PageHeader } from '@/components/shared/PageHeader'
import { PlantillaOrdenSheet } from '@/components/configuracion/PlantillaOrdenSheet'
import {
  avisarGuardado, EtiquetaAjuste, FilaAjuste, SeccionAjustes, VacioAjustes,
} from '@/components/configuracion/ajustes'
import { historiaClinicaApi } from '@/lib/api/historiaClinica'
import { mensajeDeError } from '@/lib/errores'
import type { PlantillaOrden } from '@/types/historia'

export default function PlantillasOrdenesPage() {
  const queryClient = useQueryClient()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [seleccionada, setSeleccionada] = useState<PlantillaOrden | null>(null)
  const [mostrarInactivas, setMostrarInactivas] = useState(false)

  const { data: plantillas = [], isLoading } = useQuery({
    queryKey: ['plantillas-ordenes'],
    queryFn: () => historiaClinicaApi.plantillasOrdenes.listAll(),
  })

  // Activar o desactivar se guarda al tocarlo y se puede deshacer desde el aviso.
  const cambiarEstado = useMutation({
    mutationFn: async ({ id, activa }: { id: string; activa: boolean; conDeshacer?: boolean }): Promise<void> => {
      if (activa) await historiaClinicaApi.plantillasOrdenes.patch(id, { activa: true })
      else await historiaClinicaApi.plantillasOrdenes.delete(id)
    },
    onSuccess: (_, { id, activa, conDeshacer = true }) => {
      queryClient.invalidateQueries({ queryKey: ['plantillas-ordenes'] })
      avisarGuardado(
        conDeshacer ? () => cambiarEstado.mutate({ id, activa: !activa, conDeshacer: false }) : undefined,
        activa ? 'Plantilla activada' : 'Plantilla desactivada',
      )
    },
  })

  const inactivas = plantillas.filter((p) => !p.activa).length
  const visibles = mostrarInactivas ? plantillas : plantillas.filter((p) => p.activa)

  function abrirEdicion(p: PlantillaOrden) {
    setSeleccionada(p)
    setSheetOpen(true)
  }

  function abrirNueva() {
    setSeleccionada(null)
    setSheetOpen(true)
  }

  const botonNueva = (
    <Button size="sm" onClick={abrirNueva}>
      <Plus className="mr-1.5 h-4 w-4" />Nueva plantilla
    </Button>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        helpSlug="ordenes-medicas-y-examenes"
        title="Plantillas de órdenes"
        description="Las compartidas las ven todos los profesionales; las personales, solo quien las creó. Los profesionales también guardan sus órdenes como plantilla al atender."
      />

      <div className="space-y-7">
        <SeccionAjustes
          titulo="Plantillas"
          descripcion="Se eligen al generar una orden médica en la atención."
          accion={botonNueva}
        >
          {isLoading ? (
            <FilasCargando filas={3} />
          ) : visibles.length === 0 ? (
            <VacioAjustes
              titulo={inactivas > 0 && !mostrarInactivas ? 'No hay plantillas activas' : 'Aún no hay plantillas'}
              descripcion="Crea una para que el profesional no tenga que escribir cada orden desde cero."
              accion={botonNueva}
            />
          ) : (
            visibles.map((p) => (
              <FilaAjuste
                key={p.id}
                icono={FileText}
                apagada={!p.activa}
                titulo={p.nombre}
                descripcion={<span className="block truncate">{p.contenido}</span>}
                extra={(!p.activa || !p.compartida) ? (
                  <>
                    {!p.activa && <EtiquetaAjuste>Inactiva</EtiquetaAjuste>}
                    {!p.compartida && (
                      <EtiquetaAjuste tono="aviso">
                        {p.created_by_nombre ? 'Personal de ' + p.created_by_nombre : 'Personal'}
                      </EtiquetaAjuste>
                    )}
                  </>
                ) : undefined}
              >
                {p.permite_edicion_profesional && (
                  <span className="hidden sm:inline-flex">
                    <EtiquetaAjuste tono="marca">Editable al usarla</EtiquetaAjuste>
                  </span>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"
                      aria-label={`Opciones de ${p.nombre}`}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => abrirEdicion(p)}>
                      <Pencil className="mr-2 h-3.5 w-3.5" />Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={cambiarEstado.isPending}
                      onClick={() => cambiarEstado.mutate({ id: p.id, activa: !p.activa })}
                    >
                      {p.activa
                        ? <><PowerOff className="mr-2 h-3.5 w-3.5" />Desactivar</>
                        : <><Power className="mr-2 h-3.5 w-3.5" />Activar</>}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </FilaAjuste>
            ))
          )}
          {!isLoading && (inactivas > 0 || mostrarInactivas) && (
            <div className="px-4 py-2.5">
              <button
                type="button"
                className="text-[13px] font-medium text-primary underline-offset-2 hover:underline"
                onClick={() => setMostrarInactivas((v) => !v)}
              >
                {mostrarInactivas ? 'Ocultar inactivas' : `Mostrar inactivas (${inactivas})`}
              </button>
            </div>
          )}
        </SeccionAjustes>

        {cambiarEstado.isError && (
          <p className="-mt-4 text-sm text-destructive">
            {mensajeDeError(cambiarEstado.error, 'No se pudo guardar el cambio. Intenta de nuevo.')}
          </p>
        )}
      </div>

      <PlantillaOrdenSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        plantilla={seleccionada}
      />
    </div>
  )
}

/** Filas grises mientras carga la lista. */
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
          <div className="h-8 w-8 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </>
  )
}
