'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import {
  FileSignature, Plus, Trash2, MapPin, CheckCircle2,
  AlertCircle, Loader2,
} from 'lucide-react'
import { configuracionApi, type PlantillaConsentimiento } from '@/lib/api/configuracion'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function PlantillaCard({
  plantilla,
  onDelete,
}: {
  plantilla: PlantillaConsentimiento
  onDelete: (id: string) => void
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-start gap-4 hover:shadow-md transition-all duration-200">
      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        <FileSignature className="h-5 w-5 text-primary" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate">{plantilla.nombre || plantilla.label}</p>
        <div className="flex items-center gap-3 mt-1.5">
          <span className={cn(
            'flex items-center gap-1 text-xs',
            plantilla.tiene_pdf ? 'text-emerald-600' : 'text-amber-600',
          )}>
            {plantilla.tiene_pdf
              ? <><CheckCircle2 className="h-3.5 w-3.5" /> PDF subido</>
              : <><AlertCircle className="h-3.5 w-3.5" /> Sin PDF</>}
          </span>
          <span className={cn(
            'flex items-center gap-1 text-xs',
            plantilla.tiene_campos ? 'text-emerald-600' : 'text-amber-600',
          )}>
            {plantilla.tiene_campos
              ? <><CheckCircle2 className="h-3.5 w-3.5" /> Campos mapeados</>
              : <><AlertCircle className="h-3.5 w-3.5" /> Sin campos</>}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {plantilla.tiene_pdf && (
          <Button size="sm" variant="outline" asChild>
            <Link href={`/configuracion/consentimientos/${plantilla.id}/campos`}>
              <MapPin className="h-3.5 w-3.5 mr-1.5" />
              {plantilla.tiene_campos ? 'Editar campos' : 'Mapear campos'}
            </Link>
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          onClick={() => onDelete(plantilla.id)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

export default function ConsentimientosConfigPage() {
  const qc = useQueryClient()

  const { data: plantillas = [], isLoading } = useQuery({
    queryKey: ['plantillas-consentimiento'],
    queryFn: configuracionApi.plantillasConsentimiento.list,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => configuracionApi.plantillasConsentimiento.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plantillas-consentimiento'] })
    },
  })

  const handleDelete = (id: string) => {
    if (window.confirm('¿Eliminar esta plantilla? Los procedimientos que la usen dejarán de tenerla asociada.')) {
      deleteMutation.mutate(id)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plantillas de consentimiento"
        description="Sube tus PDFs de consentimiento, mapea los campos y asócialos a procedimientos."
        backHref="/configuracion"
        action={
          <Button asChild>
            <Link href="/configuracion/consentimientos/nuevo">
              <Plus className="h-4 w-4 mr-2" />
              Nueva plantilla
            </Link>
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : plantillas.length === 0 ? (
        <div className="rounded-xl border bg-white p-12 flex flex-col items-center text-center gap-3">
          <FileSignature className="h-10 w-10 text-muted-foreground/30" />
          <div>
            <p className="text-sm font-medium">Sin plantillas todavía</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              Sube el PDF del consentimiento y luego mapea dónde va cada campo (firma, nombre, fecha…).
            </p>
          </div>
          <Button className="mt-2" asChild>
            <Link href="/configuracion/consentimientos/nuevo">
              <Plus className="h-4 w-4 mr-2" /> Crear primera plantilla
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {plantillas.map(p => (
            <PlantillaCard key={p.id} plantilla={p} onDelete={handleDelete} />
          ))}
        </div>
      )}

    </div>
  )
}
