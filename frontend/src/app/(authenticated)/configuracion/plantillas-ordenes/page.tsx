'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, FileText, CheckCircle2, XCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/shared/PageHeader'
import { LoadingState } from '@/components/shared/LoadingState'
import { PlantillaOrdenSheet } from '@/components/configuracion/PlantillaOrdenSheet'
import { historiaClinicaApi } from '@/lib/api/historiaClinica'
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

  const { mutate: desactivar } = useMutation({
    mutationFn: (id: string) => historiaClinicaApi.plantillasOrdenes.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['plantillas-ordenes'] }),
  })

  const visibles = mostrarInactivas ? plantillas : plantillas.filter((p) => p.activa)

  function abrirEdicion(p: PlantillaOrden) {
    setSeleccionada(p)
    setSheetOpen(true)
  }

  function abrirNueva() {
    setSeleccionada(null)
    setSheetOpen(true)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plantillas de órdenes"
        description="Crea y gestiona las plantillas que los profesionales usarán para generar órdenes médicas."
        backHref="/configuracion"
        action={
          <Button size="sm" onClick={abrirNueva}>
            <Plus className="h-4 w-4 mr-1.5" />Nueva plantilla
          </Button>
        }
      />

      {isLoading ? (
        <LoadingState rows={4} />
      ) : visibles.length === 0 ? (
        <div className="rounded-xl border bg-white p-10 text-center space-y-3">
          <FileText className="h-8 w-8 text-muted-foreground/40 mx-auto" />
          <p className="text-sm text-muted-foreground">
            {mostrarInactivas ? 'No hay plantillas registradas.' : 'No hay plantillas activas.'}
          </p>
          <Button size="sm" onClick={abrirNueva}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />Crear primera plantilla
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border bg-white divide-y overflow-hidden">
          {/* Encabezado tabla */}
          <div className="hidden md:grid grid-cols-[1fr_80px_100px_80px] gap-4 px-5 py-2.5 bg-gray-50 text-xs font-medium text-muted-foreground">
            <span>Nombre</span>
            <span className="text-center">Editable</span>
            <span className="text-center">Estado</span>
            <span />
          </div>

          {visibles.map((p) => (
            <div key={p.id} className="grid grid-cols-1 md:grid-cols-[1fr_80px_100px_80px] gap-3 items-center px-5 py-4">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{p.nombre}</p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{p.contenido}</p>
              </div>

              <div className="flex justify-start md:justify-center">
                {p.permite_edicion_profesional ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" />Sí
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <XCircle className="h-3.5 w-3.5" />No
                  </span>
                )}
              </div>

              <div className="flex justify-start md:justify-center">
                <Badge variant={p.activa ? 'success' : 'secondary'}>
                  {p.activa ? 'Activa' : 'Inactiva'}
                </Badge>
              </div>

              <div className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  title="Editar"
                  onClick={() => abrirEdicion(p)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                {p.activa && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/5"
                    title="Desactivar"
                    onClick={() => {
                      if (confirm(`¿Desactivar la plantilla "${p.nombre}"?`)) desactivar(p.id)
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Toggle inactivas */}
      <button
        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
        onClick={() => setMostrarInactivas((v) => !v)}
      >
        {mostrarInactivas ? 'Ocultar inactivas' : 'Mostrar plantillas inactivas'}
      </button>

      <PlantillaOrdenSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        plantilla={seleccionada}
      />
    </div>
  )
}
