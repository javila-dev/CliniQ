'use client'

import { useQuery } from '@tanstack/react-query'
import { FileText, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { historiaClinicaApi } from '@/lib/api/historiaClinica'
import { NotaClinicaCard } from '@/components/historia/NotaClinicaCard'
import { Button } from '@/components/ui/button'
import { LoadingState } from '@/components/shared/LoadingState'
import type { HistoriaClinica } from '@/types/historia'

interface HistorialPanelProps {
  historia?: HistoriaClinica
  pacienteId: string
  standalone?: boolean
}

export function HistorialPanel({ historia, pacienteId, standalone }: HistorialPanelProps) {
  const { data: notas, isLoading } = useQuery({
    queryKey: ['historia', historia?.id, 'notas'],
    queryFn: () => historiaClinicaApi.historias.notas(historia!.id),
    enabled: Boolean(historia?.id),
  })

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Historial previo
        </p>
        {notas && notas.length > 0 && (
          <span className="text-xs text-muted-foreground">{notas.length} notas</span>
        )}
      </div>

      {isLoading && <LoadingState rows={3} />}

      {!isLoading && (!notas || notas.length === 0) && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <FileText className="h-7 w-7 text-muted-foreground/25 mb-2" />
          <p className="text-xs text-muted-foreground">Sin notas anteriores</p>
          <p className="text-xs text-muted-foreground">Primera visita del paciente</p>
        </div>
      )}

      {notas && notas.length > 0 && (
        <div className="space-y-2">
          {notas.map((nota) => (
            <NotaClinicaCard key={nota.id} nota={nota} defaultOpen={false} compact />
          ))}
        </div>
      )}

      {historia && !standalone && (
        <Button variant="ghost" size="sm" className="w-full text-xs" asChild>
          <Link href={`/pacientes/${pacienteId}/historia`} target="_blank">
            <ExternalLink className="h-3 w-3 mr-1.5" />
            Ver historial completo
          </Link>
        </Button>
      )}
    </div>
  )
}
