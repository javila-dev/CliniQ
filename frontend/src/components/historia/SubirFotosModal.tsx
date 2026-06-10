'use client'

import { useState, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, X, Image } from 'lucide-react'
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

interface SubirFotosModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  notaId: string
  historiaId: string
}

export function SubirFotosModal({ open, onOpenChange, notaId, historiaId }: SubirFotosModalProps) {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [tipo, setTipo] = useState<TipoFoto>('antes')
  const [descripcion, setDescripcion] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)

  const { mutateAsync, isPending } = useMutation({
    mutationFn: (formData: FormData) => historiaClinicaApi.fotos.create(formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['historia', historiaId, 'notas'] })
      queryClient.invalidateQueries({ queryKey: ['galeria', historiaId] })
      handleClose()
    },
  })

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    const url = URL.createObjectURL(f)
    setPreview(url)
  }

  const handleClose = () => {
    setFile(null)
    setPreview(null)
    setDescripcion('')
    setTipo('antes')
    setServerError(null)
    onOpenChange(false)
  }

  const handleSubmit = async () => {
    if (!file) return
    setServerError(null)
    try {
      const fd = new FormData()
      fd.append('nota', notaId)
      fd.append('tipo', tipo)
      fd.append('descripcion', descripcion)
      fd.append('archivo', file)
      await mutateAsync(fd)
    } catch (err: any) {
      setServerError(err?.response?.data?.error ?? 'Error al subir la foto')
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Subir fotografía clínica</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Tipo */}
          <div className="space-y-1.5">
            <Label>Tipo *</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoFoto)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="antes">Antes</SelectItem>
                <SelectItem value="durante">Durante</SelectItem>
                <SelectItem value="despues">Después</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Descripción */}
          <div className="space-y-1.5">
            <Label htmlFor="descripcion">Descripción</Label>
            <Input
              id="descripcion"
              placeholder="Opcional..."
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </div>

          {/* Archivo */}
          <div className="space-y-1.5">
            <Label>Imagen *</Label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFile}
            />
            {preview ? (
              <div className="relative rounded-md overflow-hidden border">
                <img src={preview} alt="Preview" className="w-full max-h-48 object-contain bg-muted/20" />
                <button
                  type="button"
                  onClick={() => { setFile(null); setPreview(null) }}
                  className="absolute top-2 right-2 bg-black/50 rounded-full p-1 text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex flex-col items-center justify-center w-full h-32 rounded-md border-2 border-dashed border-input hover:border-primary hover:bg-muted/20 transition-colors"
              >
                <Upload className="h-6 w-6 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Haz clic para seleccionar</p>
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
          <Button variant="outline" onClick={handleClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!file || isPending}>
            {isPending ? 'Subiendo...' : 'Subir foto'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
