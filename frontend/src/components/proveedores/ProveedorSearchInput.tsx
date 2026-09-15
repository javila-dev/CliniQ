'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { Search, Truck, X, Plus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { Proveedor } from '@/types/proveedores'

interface ProveedorSearchInputProps {
  proveedores: Proveedor[]
  selected?: Proveedor | null
  onSelect: (proveedor: Proveedor) => void
  onClear?: () => void
  onCreateNew?: () => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function ProveedorSearchInput({
  proveedores,
  selected,
  onSelect,
  onClear,
  onCreateNew,
  placeholder = 'Buscar proveedor por nombre o NIT...',
  disabled,
  className,
}: ProveedorSearchInputProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const resultados = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return proveedores
    return proveedores.filter(
      (p) => p.nombre.toLowerCase().includes(q) || p.nit.toLowerCase().includes(q)
    )
  }, [proveedores, query])

  if (selected) {
    return (
      <div className={cn('flex items-center gap-2 rounded-md border border-input bg-muted/40 px-3 py-2', className)}>
        <Truck className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{selected.nombre}</p>
          <p className="text-xs text-muted-foreground">NIT: {selected.nit}</p>
        </div>
        {onClear && !disabled && (
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
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="pl-9"
        />
      </div>

      {open && !disabled && (
        <div className="absolute top-full mt-1 w-full z-50 rounded-md border bg-white shadow-md overflow-hidden">
          {resultados.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground text-center">Sin resultados</p>
          ) : (
            <ul className="max-h-60 overflow-y-auto">
              {resultados.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2.5 hover:bg-accent transition-colors"
                    onClick={() => { onSelect(p); setQuery(''); setOpen(false) }}
                  >
                    <p className="text-sm font-medium">{p.nombre}</p>
                    <p className="text-xs text-muted-foreground">NIT: {p.nit}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {onCreateNew && (
            <button
              type="button"
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-primary font-medium hover:bg-primary/5 border-t transition-colors"
              onClick={() => { onCreateNew(); setOpen(false) }}
            >
              <Plus className="h-4 w-4 shrink-0" />
              Crear nuevo proveedor
            </button>
          )}
        </div>
      )}
    </div>
  )
}
