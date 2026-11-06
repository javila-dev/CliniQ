'use client'

import { useState, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Upload, X, Plus } from 'lucide-react'
import { historiaClinicaApi } from '@/lib/api/historiaClinica'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import type { TipoFoto } from '@/types/historia'
import { mensajeDeError } from '@/lib/errores'

interface SubirFotosModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  notaId: string
  historiaId: string
}

interface Seleccionada {
  file: File
  url: string
}

// Mismo límite que el backend: se avisa antes de subir.
const MAX_BYTES = 15 * 1024 * 1024

export function SubirFotosModal({ open, onOpenChange, notaId, historiaId }: SubirFotosModalProps) {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [tipo, setTipo] = useState<TipoFoto>('antes')
  const [descripcion, setDescripcion] = useState('')
  const [fotos, setFotos] = useState<Seleccionada[]>([])
  const [subidas, setSubidas] = useState<number | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const subiendo = subidas !== null

  // Las vistas previas se liberan al quitar la foto o cerrar el modal.
  const fotosRef = useRef(fotos)
  fotosRef.current = fotos
  useEffect(() => () => fotosRef.current.forEach((f) => URL.revokeObjectURL(f.url)), [])

  const refrescar = () => {
    queryClient.invalidateQueries({ queryKey: ['historia', historiaId, 'notas'] })
    queryClient.invalidateQueries({ queryKey: ['galeria', historiaId] })
  }

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nuevas = Array.from(e.target.files ?? [])
    e.target.value = '' // permite volver a elegir el mismo archivo
    if (!nuevas.length) return
    setServerError(null)
    setFotos((prev) => [...prev, ...nuevas.map((file) => ({ file, url: URL.createObjectURL(file) }))])
  }

  const quitar = (url: string) => {
    URL.revokeObjectURL(url)
    setFotos((prev) => prev.filter((f) => f.url !== url))
  }

  const handleClose = () => {
    if (subiendo) return
    fotos.forEach((f) => URL.revokeObjectURL(f.url))
    setFotos([])
    setDescripcion('')
    setTipo('antes')
    setServerError(null)
    onOpenChange(false)
  }

  const handleSubmit = async () => {
    if (!fotos.length) return
    const grandes = fotos.filter((f) => f.file.size > MAX_BYTES)
    if (grandes.length) {
      setServerError(
        grandes.length === 1
          ? `«${grandes[0].file.name}» supera 15 MB. Quítala para continuar.`
          : `${grandes.length} fotos superan 15 MB. Quítalas para continuar.`,
      )
      return
    }
    setServerError(null)
    setSubidas(0)
    // Una por una: si alguna falla, las ya subidas salen de la lista y las demás
    // quedan para reintentar.
    let i = 0
    try {
      for (; i < fotos.length; i++) {
        const fd = new FormData()
        fd.append('nota', notaId)
        fd.append('tipo', tipo)
        fd.append('descripcion', descripcion)
        fd.append('archivo', fotos[i].file)
        await historiaClinicaApi.fotos.create(fd)
        setSubidas(i + 1)
      }
    } catch (err: unknown) {
      fotos.slice(0, i).forEach((f) => URL.revokeObjectURL(f.url))
      setFotos(fotos.slice(i))
      const prefijo = i > 0 ? `Se subieron ${i} de ${fotos.length}. ` : ''
      setServerError(prefijo + mensajeDeError(err, `No se pudo subir «${fotos[i].file.name}».`))
      setSubidas(null)
      if (i > 0) refrescar()
      return
    }
    setSubidas(null)
    refrescar()
    fotos.forEach((f) => URL.revokeObjectURL(f.url))
    setFotos([])
    setDescripcion('')
    setTipo('antes')
    onOpenChange(false)
  }

  const total = fotos.length

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Subir fotografías clínicas</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Tipo */}
          <div className="space-y-1.5">
            <Label>Tipo *</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoFoto)} disabled={subiendo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="antes">Antes</SelectItem>
                <SelectItem value="durante">Durante</SelectItem>
                <SelectItem value="despues">Después</SelectItem>
              </SelectContent>
            </Select>
            {total > 1 && (
              <p className="text-xs text-muted-foreground">Se aplica a las {total} fotos.</p>
            )}
          </div>

          {/* Descripción */}
          <div className="space-y-1.5">
            <Label htmlFor="descripcion">Descripción</Label>
            <Input
              id="descripcion"
              placeholder="Opcional..."
              value={descripcion}
              disabled={subiendo}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </div>

          {/* Archivos */}
          <div className="space-y-1.5">
            <Label>Imágenes *</Label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFiles}
            />
            {total > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {fotos.map((f, idx) => (
                  <div key={f.url} className="relative aspect-square overflow-hidden rounded-md border bg-muted/20">
                    <img src={f.url} alt={f.file.name} className="h-full w-full object-cover" />
                    {subiendo && idx < (subidas ?? 0) && (
                      <div className="absolute inset-0 bg-background/60" />
                    )}
                    {!subiendo && (
                      <button
                        type="button"
                        onClick={() => quitar(f.url)}
                        aria-label={`Quitar ${f.file.name}`}
                        className="absolute right-1 top-1 rounded-full bg-black/50 p-1 text-white"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
                {!subiendo && (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="flex aspect-square flex-col items-center justify-center rounded-md border-2 border-dashed border-input text-muted-foreground transition-colors hover:border-primary hover:bg-muted/20"
                  >
                    <Plus className="h-5 w-5" />
                    <span className="mt-1 text-xs">Agregar</span>
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex flex-col items-center justify-center w-full h-32 rounded-md border-2 border-dashed border-input hover:border-primary hover:bg-muted/20 transition-colors"
              >
                <Upload className="h-6 w-6 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Haz clic para seleccionar una o varias</p>
                <p className="text-xs text-muted-foreground">JPG, PNG, WEBP</p>
              </button>
            )}
          </div>

          {serverError && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
              <p className="text-sm text-destructive">{serverError}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={subiendo}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!total || subiendo}>
            {subiendo
              ? `Subiendo ${Math.min((subidas ?? 0) + 1, total)} de ${total}...`
              : total > 1 ? `Subir ${total} fotos` : 'Subir foto'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
