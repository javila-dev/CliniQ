'use client'

import { useQuery } from '@tanstack/react-query'
import { clinicasApi } from '@/lib/api/clinicas'
import { useAuthStore } from '@/store/authStore'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface SedeSelectProps {
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
}

export function SedeSelect({ value, onValueChange, placeholder = 'Seleccionar sede', disabled }: SedeSelectProps) {
  const user = useAuthStore((s) => s.user)
  const { data, isLoading } = useQuery({
    queryKey: ['sedes'],
    queryFn: () => clinicasApi.sedes.list({ activa: true }),
  })

  const sedes = data?.results ?? []
  const sedesVisibles = user?.sede_id
    ? sedes.filter((s) => s.id === user.sede_id)
    : sedes

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled || isLoading}>
      <SelectTrigger>
        <SelectValue placeholder={isLoading ? 'Cargando...' : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {sedesVisibles.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.nombre} — {s.ciudad}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
