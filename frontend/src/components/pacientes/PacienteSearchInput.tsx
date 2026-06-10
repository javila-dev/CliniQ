'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Loader2, X, UserPlus } from 'lucide-react'
import { pacientesApi } from '@/lib/api/pacientes'
import { useDebounce } from '@/hooks/useDebounce'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { BusquedaPaciente } from '@/types/pacientes'

interface PacienteSearchInputProps {
  onSelect: (paciente: BusquedaPaciente) => void
  selected?: BusquedaPaciente | null
  onClear?: () => void
  onCreateNew?: (nombre?: string) => void
  placeholder?: string
  className?: string
}

export function PacienteSearchInput({
  onSelect,
  selected,
  onClear,
  onCreateNew,
  placeholder = 'Buscar paciente por nombre o documento...',
  className,
}: PacienteSearchInputProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const debouncedQuery = useDebounce(query, 350)

  const { data: results, isFetching } = useQuery({
    queryKey: ['pacientes', 'buscar', debouncedQuery],
    queryFn: () => pacientesApi.buscar(debouncedQuery),
    enabled: debouncedQuery.length >= 3,
  })

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  if (selected) {
    return (
      <div className={cn('flex items-center gap-2 rounded-md border border-input bg-muted/40 px-3 py-2', className)}>
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{selected.nombre_completo}</p>
          <p className="text-xs text-muted-foreground">
            {selected.tipo_documento} {selected.numero_documento} · {selected.telefono}
          </p>
        </div>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    )
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="pl-9 pr-9"
        />
        {isFetching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {open && (query.length >= 1 || !!onCreateNew) && (
        <div className="absolute top-full mt-1 w-full z-50 rounded-md border bg-white shadow-md overflow-hidden">
          {debouncedQuery.length >= 3 && (
            <>
              {isFetching && (
                <p className="px-3 py-3 text-sm text-muted-foreground text-center">Buscando...</p>
              )}
              {!isFetching && results?.length === 0 && (
                <p className="px-3 py-3 text-sm text-muted-foreground text-center">Sin resultados</p>
              )}
              {!isFetching && !!results?.length && (
                <ul>
                  {results.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2.5 hover:bg-accent transition-colors"
                        onClick={() => {
                          onSelect(p)
                          setQuery('')
                          setOpen(false)
                        }}
                      >
                        <p className="text-sm font-medium">{p.nombre_completo}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.tipo_documento} {p.numero_documento} · {p.telefono}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {onCreateNew && (
            <button
              type="button"
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-primary font-medium hover:bg-primary/5 border-t transition-colors"
              onClick={() => {
                onCreateNew(query)
                setOpen(false)
              }}
            >
              <UserPlus className="h-4 w-4 shrink-0" />
              Crear nuevo paciente{query.length >= 2 ? ` "${query}"` : ''}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
