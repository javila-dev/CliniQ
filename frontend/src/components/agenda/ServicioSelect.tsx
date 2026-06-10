'use client'

import { useQuery } from '@tanstack/react-query'
import { clinicasApi } from '@/lib/api/clinicas'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface ServicioSelectProps {
  value: string
  onValueChange: (value: string) => void
  clinicaId?: string
  placeholder?: string
  disabled?: boolean
}

export function ServicioSelect({
  value,
  onValueChange,
  clinicaId,
  placeholder = 'Seleccionar servicio',
  disabled,
}: ServicioSelectProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['servicios', 'activos', clinicaId],
    queryFn: () => clinicasApi.servicios.activos(clinicaId),
    enabled: !!clinicaId,
  })

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled || isLoading || !clinicaId}>
      <SelectTrigger>
        <SelectValue placeholder={!clinicaId ? 'Selecciona una sede primero' : isLoading ? 'Cargando...' : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {data?.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            <div className="flex flex-col">
              <span>{s.nombre}</span>
              {s.duracion_min && (
                <span className="text-xs text-muted-foreground">{s.duracion_min} min</span>
              )}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
