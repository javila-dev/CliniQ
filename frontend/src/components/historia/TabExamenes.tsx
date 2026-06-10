'use client'

import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, FileText, ExternalLink, Loader2, ChevronDown, ChevronUp, X } from 'lucide-react'
import { resolveMediaUrl } from '@/lib/utils/media'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { historiaClinicaApi } from '@/lib/api/historiaClinica'
import { formatDate } from '@/lib/utils'
import type { HistoriaClinica } from '@/types/historia'

interface TabExamenesProps {
  historia: HistoriaClinica
  notaId?: string   // presente en modo atención
}

function getExtension(url: string): string {
  try {
    const path = new URL(url).pathname
    const ext = path.split('.').pop()?.toUpperCase() ?? ''
    return ['PDF', 'JPG', 'JPEG', 'PNG', 'WEBP'].includes(ext) ? ext : 'ARCHIVO'
  } catch {
    return 'ARCHIVO'
  }
}

export function TabExamenes({ historia, notaId }: TabExamenesProps) {
  const queryClient = useQueryClient()
  const [agregando, setAgregando] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [fecha, setFecha] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: resultadosRaw, isLoading } = useQuery({
    queryKey: ['resultados-examenes', historia.id],
    queryFn: () => historiaClinicaApi.resultadosExamenes.list(historia.id),
  })
  const resultados = resultadosRaw
    ? [...new Map(resultadosRaw.map((r) => [r.id, r])).values()]
    : resultadosRaw

  const { mutate: crear, isPending: creando } = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      fd.append('historia', historia.id)
      fd.append('titulo', titulo)
      fd.append('fecha', fecha)
      fd.append('descripcion', descripcion)
      if (archivo) fd.append('archivo', archivo)
      return historiaClinicaApi.resultadosExamenes.create(fd, notaId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resultados-examenes', historia.id] })
      setAgregando(false)
      setTitulo('')
      setFecha('')
      setDescripcion('')
      setArchivo(null)
      if (fileRef.current) fileRef.current.value = ''
    },
  })

  const { mutate: eliminar } = useMutation({
    mutationFn: (id: string) => historiaClinicaApi.resultadosExamenes.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['resultados-examenes', historia.id] }),
  })

  function toggleExpandido(id: string) {
    setExpandidos((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const puedeGuardar = titulo.trim() && fecha

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {resultados?.length
            ? `${resultados.length} resultado${resultados.length !== 1 ? 's' : ''} registrado${resultados.length !== 1 ? 's' : ''}`
            : 'Sin resultados registrados'}
        </p>
        {!agregando && (
          <Button size="sm" variant="outline" onClick={() => setAgregando(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Agregar resultado
          </Button>
        )}
      </div>

      {/* Formulario inline */}
      {agregando && (
        <div className="rounded-lg border border-dashed p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Nuevo resultado</p>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setAgregando(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Título *</Label>
              <Input placeholder="Hemograma completo, ecografía…" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Fecha del examen *</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Archivo (PDF o imagen)</Label>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,image/*"
                className="hidden"
                onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full h-9 text-xs"
                onClick={() => fileRef.current?.click()}
              >
                {archivo ? archivo.name : 'Seleccionar archivo'}
              </Button>
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Descripción / observaciones</Label>
              <Textarea rows={2} placeholder="Resultados relevantes, valores alterados…" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAgregando(false)}>Cancelar</Button>
            <Button size="sm" onClick={() => crear()} disabled={creando || !puedeGuardar}>
              {creando && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
              Guardar
            </Button>
          </div>
        </div>
      )}

      {/* Lista */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-2">
          {resultados?.map((r) => {
            const expandido = expandidos.has(r.id)
            return (
              <div key={r.id} className="rounded-lg border">
                <div
                  className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => toggleExpandido(r.id)}
                >
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.titulo}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(r.fecha)} · {r.created_by_nombre}</p>
                  </div>
                  {r.archivo_url && (
                    <span className="text-[10px] font-medium bg-muted px-1.5 py-0.5 rounded shrink-0">
                      {getExtension(r.archivo_url)}
                    </span>
                  )}
                  {expandido ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                </div>
                {expandido && (
                  <div className="px-3 pb-3 pt-0 space-y-2 border-t">
                    {r.descripcion && (
                      <p className="text-sm text-muted-foreground pt-2">{r.descripcion}</p>
                    )}
                    <div className="flex items-center gap-2 pt-1">
                      {r.archivo_url && (
                        <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                          <a href={resolveMediaUrl(r.archivo_url) ?? '#'} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3 w-3 mr-1.5" />
                            Ver archivo
                          </a>
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm('¿Eliminar este resultado?')) eliminar(r.id)
                        }}
                      >
                        <Trash2 className="h-3 w-3 mr-1.5" />
                        Eliminar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          {resultados?.length === 0 && !agregando && (
            <div className="rounded-lg border border-dashed py-10 text-center">
              <FileText className="h-7 w-7 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Sin resultados de exámenes registrados</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
