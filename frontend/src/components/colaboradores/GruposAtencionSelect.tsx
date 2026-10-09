'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronsUpDown, Loader2, Plus, Search, X } from 'lucide-react'
import { colaboradoresApi } from '@/lib/api/colaboradores'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn, scrollWheelFallback } from '@/lib/utils'
import type { GrupoAtencion } from '@/types/colaboradores'

export const GRUPOS_ATENCION_KEY = ['grupos-atencion'] as const

export function useGruposAtencion(enabled = true) {
  return useQuery({
    queryKey: GRUPOS_ATENCION_KEY,
    queryFn: () => colaboradoresApi.grupos.list(),
    enabled,
    staleTime: 60 * 1000,
  })
}

const miembrosTexto = (n: number) => (n === 1 ? '1 miembro' : `${n} miembros`)

interface Props {
  value: string[]
  onChange: (ids: string[]) => void
  /**
   * - `usuario`: se elige a qué grupos pertenece; se puede crear un grupo al vuelo.
   * - `procedimiento`: se eligen los grupos que lo realizan; un grupo sin
   *   miembros disponibles no se puede elegir (salvo que ya estuviera asignado).
   */
  modo: 'usuario' | 'procedimiento'
  /** Grupos que ya estaban asignados al abrir: se conservan aunque estén vacíos. */
  asignadosAlAbrir?: string[]
  permitirCrear?: boolean
}

export function GruposAtencionSelect({ value, onChange, modo, asignadosAlAbrir = [], permitirCrear = false }: Props) {
  const qc = useQueryClient()
  const { data: grupos = [], isLoading } = useGruposAtencion()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')

  const crear = useMutation({
    mutationFn: (nombre: string) => colaboradoresApi.grupos.create({ nombre }),
    onSuccess: (grupo) => {
      qc.setQueryData<GrupoAtencion[]>(GRUPOS_ATENCION_KEY, (prev) =>
        [...(prev ?? []), grupo].sort((a, b) => a.nombre.localeCompare(b.nombre)),
      )
      onChange([...value, grupo.id])
      setQ('')
    },
  })

  const termino = q.trim()
  const filtrados = termino
    ? grupos.filter((g) => g.nombre.toLowerCase().includes(termino.toLowerCase()))
    : grupos
  const existeExacto = grupos.some((g) => g.nombre.toLowerCase() === termino.toLowerCase())
  const seleccionados = grupos.filter((g) => value.includes(g.id))

  const bloqueado = (g: GrupoAtencion) =>
    modo === 'procedimiento' && g.miembros_disponibles === 0 && !value.includes(g.id) && !asignadosAlAbrir.includes(g.id)

  const toggle = (g: GrupoAtencion) => {
    if (bloqueado(g)) return
    onChange(value.includes(g.id) ? value.filter((id) => id !== g.id) : [...value, g.id])
  }

  const errorCrear = (crear.error as any)?.response?.data?.nombre?.[0]
    ?? (crear.error ? 'No se pudo crear el grupo.' : null)

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setQ(''); crear.reset() } }}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" role="combobox" className="w-full justify-between font-normal">
            <span className={cn(!seleccionados.length && 'text-muted-foreground')}>
              {seleccionados.length
                ? `${seleccionados.length} grupo${seleccionados.length > 1 ? 's' : ''}`
                : 'Seleccionar grupos…'}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
          <div className="flex items-center border-b px-3">
            <Search className="h-4 w-4 shrink-0 opacity-50" />
            <input
              autoFocus
              value={q}
              onChange={(e) => { setQ(e.target.value); crear.reset() }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && permitirCrear && termino && !existeExacto) {
                  e.preventDefault()
                  crear.mutate(termino)
                }
              }}
              placeholder={permitirCrear ? 'Buscar o crear grupo…' : 'Buscar grupo…'}
              className="flex h-9 w-full bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-60 overflow-y-auto p-1" onWheel={scrollWheelFallback}>
            {isLoading ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">Cargando…</p>
            ) : grupos.length === 0 && !termino ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                {permitirCrear ? 'Aún no hay grupos. Escribe un nombre para crear el primero.' : (
                  <>
                    Aún no hay grupos de atención.{' '}
                    <a href="/configuracion/grupos-atencion" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                      Crear grupos
                    </a>
                  </>
                )}
              </p>
            ) : filtrados.length === 0 && !permitirCrear ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">Sin resultados</p>
            ) : filtrados.map((g) => {
              const marcado = value.includes(g.id)
              const deshabilitado = bloqueado(g)
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => toggle(g)}
                  disabled={deshabilitado}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm',
                    deshabilitado ? 'cursor-not-allowed opacity-50' : 'hover:bg-accent',
                    marcado && 'font-medium',
                  )}
                >
                  <Check className={cn('h-4 w-4 shrink-0', marcado ? 'text-primary opacity-100' : 'opacity-0')} />
                  <span className="min-w-0 flex-1 truncate">{g.nombre}</span>
                  <span className={cn('shrink-0 text-xs', g.miembros_disponibles === 0 ? 'text-amber-600' : 'text-muted-foreground')}>
                    {g.miembros_disponibles === 0 ? 'sin miembros' : miembrosTexto(g.miembros_disponibles)}
                  </span>
                </button>
              )
            })}
            {permitirCrear && termino && !existeExacto && (
              <button
                type="button"
                onClick={() => crear.mutate(termino)}
                disabled={crear.isPending}
                className="mt-1 flex w-full items-center gap-2 rounded-sm border-t px-2 py-2 text-left text-sm text-primary hover:bg-accent"
              >
                {crear.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Crear grupo «{termino}»
              </button>
            )}
            {errorCrear && <p className="px-2 py-1.5 text-xs text-destructive">{errorCrear}</p>}
          </div>
        </PopoverContent>
      </Popover>

      {seleccionados.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {seleccionados.map((g) => (
            <Badge key={g.id} variant="secondary" className="gap-1 pr-1">
              {g.nombre}
              <button
                type="button"
                onClick={() => toggle(g)}
                className="rounded-sm hover:bg-muted-foreground/20"
                aria-label={`Quitar ${g.nombre}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
