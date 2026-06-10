'use client'

import { useQuery } from '@tanstack/react-query'
import { colaboradoresApi } from '@/lib/api/colaboradores'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface ProfesionalSelectProps {
  value: string
  onValueChange: (value: string) => void
  sedeId?: string
  placeholder?: string
  disabled?: boolean
}

export function ProfesionalSelect({
  value,
  onValueChange,
  sedeId,
  placeholder = 'Seleccionar profesional',
  disabled,
}: ProfesionalSelectProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['profesionales', sedeId],
    queryFn: () => colaboradoresApi.profesionales(sedeId),
  })

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled || isLoading}>
      <SelectTrigger>
        <SelectValue placeholder={isLoading ? 'Cargando...' : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {data?.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.nombre_completo}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
