'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronDown, Search } from 'lucide-react'
import { colaboradoresApi } from '@/lib/api/colaboradores'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { cn, toTitleCase, scrollWheelFallback } from '@/lib/utils'

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
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['profesionales', sedeId],
    queryFn: () => colaboradoresApi.profesionales(sedeId),
  })

  const seleccionado = data?.find((p) => p.id === value)

  const filtrados = useMemo(() => {
    const opciones = data ?? []
    const q = query.trim().toLowerCase()
    if (!q) return opciones
    return opciones.filter((p) => p.nombre_completo.toLowerCase().includes(q))
  }, [data, query])

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQuery('') }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled || isLoading}
          className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className={cn('truncate', !seleccionado && 'text-muted-foreground')}>
            {isLoading ? 'Cargando...' : seleccionado ? toTitleCase(seleccionado.nombre_completo) : placeholder}
          </span>
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0 overflow-hidden">
        <div className="relative border-b p-2">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar profesional..."
            className="h-8 pl-7 text-sm"
          />
        </div>
        <div className="max-h-60 overflow-y-auto py-1" onWheel={scrollWheelFallback}>
          {filtrados.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground text-center">Sin resultados</p>
          ) : (
            filtrados.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => { onValueChange(p.id); setOpen(false); setQuery('') }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent transition-colors"
              >
                <Check className={cn('h-3.5 w-3.5 shrink-0', p.id === value ? 'opacity-100' : 'opacity-0')} />
                <span className="truncate">{toTitleCase(p.nombre_completo)}</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
