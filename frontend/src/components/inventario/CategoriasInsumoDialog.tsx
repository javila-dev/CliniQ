'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Pencil, Plus, X } from 'lucide-react'
import { inventarioApi } from '@/lib/api/inventario'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import { mensajeDeError } from '@/lib/errores'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { CategoriaInsumo, CategoriaInsumoRequest } from '@/types/inventario'

function normalizar(nombre: string) {
  return nombre.trim().toLocaleLowerCase('es-CO')
}

/** Alta, renombre y activación de las categorías de insumo de la clínica. */
export function CategoriasInsumoDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [nombreEditado, setNombreEditado] = useState('')

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['categorias-insumo'],
    queryFn: () => inventarioApi.listCategorias({ page_size: 200 }),
    enabled: open,
  })
  const categorias = data?.results ?? []

  function invalidar() {
    qc.invalidateQueries({ queryKey: ['categorias-insumo'] })
    // El nombre de la categoría viaja en cada insumo (categoria_nombre).
    qc.invalidateQueries({ queryKey: ['insumos'] })
    qc.invalidateQueries({ queryKey: ['insumo'] })
  }

  // La base de datos no deja repetir el nombre dentro de la clínica; se avisa
  // antes de enviar para no depender del error del servidor.
  function nombreRepetido(nombre: string, exceptoId?: string) {
    return categorias.some((c) => c.id !== exceptoId && normalizar(c.nombre) === normalizar(nombre))
  }

  const crearMut = useMutation({
    mutationFn: (nombre: string) => inventarioApi.createCategoria({ nombre }),
    onSuccess: () => {
      invalidar()
      setNuevoNombre('')
    },
    onError: (err) => toast.error('No se pudo crear la categoría', mensajeDeError(err)),
  })

  const actualizarMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: CategoriaInsumoRequest }) =>
      inventarioApi.updateCategoria(id, data),
    onSuccess: () => {
      invalidar()
      setEditandoId(null)
    },
    onError: (err) => toast.error('No se pudo actualizar la categoría', mensajeDeError(err)),
  })

  function crear() {
    const nombre = nuevoNombre.trim()
    if (!nombre) return
    if (nombreRepetido(nombre)) {
      toast.error('Ya existe una categoría con ese nombre')
      return
    }
    crearMut.mutate(nombre)
  }

  function guardarNombre(categoria: CategoriaInsumo) {
    const nombre = nombreEditado.trim()
    if (!nombre || nombre === categoria.nombre) {
      setEditandoId(null)
      return
    }
    if (nombreRepetido(nombre, categoria.id)) {
      toast.error('Ya existe una categoría con ese nombre')
      return
    }
    actualizarMut.mutate({ id: categoria.id, data: { nombre } })
  }

  function cerrar() {
    setNuevoNombre('')
    setEditandoId(null)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) cerrar() }}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Categorías de insumos</DialogTitle>
          <DialogDescription>
            Una categoría inactiva deja de ofrecerse al crear o editar insumos; los insumos que ya la tienen la conservan.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => { e.preventDefault(); crear() }}
          className="flex gap-2"
        >
          <Input
            placeholder="Nueva categoría"
            value={nuevoNombre}
            maxLength={100}
            onChange={(e) => setNuevoNombre(e.target.value)}
          />
          <Button type="submit" disabled={!nuevoNombre.trim() || crearMut.isPending}>
            <Plus className="h-4 w-4 mr-1.5" />
            {crearMut.isPending ? 'Agregando…' : 'Agregar'}
          </Button>
        </form>

        {isLoading ? (
          <LoadingState rows={3} />
        ) : isError ? (
          <ErrorState message={mensajeDeError(error, 'No se pudieron cargar las categorías.')} onRetry={() => refetch()} />
        ) : categorias.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Todavía no hay categorías.</p>
        ) : (
          <div className="rounded-lg border divide-y">
            {categorias.map((c) => (
              <div key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                {editandoId === c.id ? (
                  <form
                    onSubmit={(e) => { e.preventDefault(); guardarNombre(c) }}
                    className="flex flex-1 items-center gap-1.5"
                  >
                    <Input
                      autoFocus
                      value={nombreEditado}
                      maxLength={100}
                      onChange={(e) => setNombreEditado(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setEditandoId(null) } }}
                      className="h-8"
                    />
                    <Button type="submit" size="sm" variant="ghost" className="h-8 w-8 p-0" disabled={actualizarMut.isPending} aria-label="Guardar nombre">
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setEditandoId(null)} aria-label="Cancelar">
                      <X className="h-4 w-4" />
                    </Button>
                  </form>
                ) : (
                  <>
                    <span className={cn('flex-1 truncate', !c.activo && 'text-muted-foreground')}>{c.nombre}</span>
                    {!c.activo && (
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-gray-100 text-gray-700 ring-1 ring-gray-200">
                        Inactiva
                      </span>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={() => { setEditandoId(c.id); setNombreEditado(c.nombre) }}
                      aria-label={`Renombrar ${c.nombre}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className={cn('h-8 text-xs', c.activo ? 'text-red-600 hover:text-red-600' : 'text-green-600 hover:text-green-600')}
                      disabled={actualizarMut.isPending}
                      onClick={() => actualizarMut.mutate({ id: c.id, data: { activo: !c.activo } })}
                    >
                      {c.activo ? 'Desactivar' : 'Activar'}
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
