'use client'

import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, FileText, ExternalLink, Loader2, ChevronDown, ChevronUp, X, Paperclip } from 'lucide-react'
import { resolveMediaUrl } from '@/lib/utils/media'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { historiaClinicaApi } from '@/lib/api/historiaClinica'
import { formatDate, formatDateTime } from '@/lib/utils'
import { hasPermission, PERM } from '@/lib/permissions'
import { useAuthStore } from '@/store/authStore'
import type { HistoriaClinica, ResultadoExamen } from '@/types/historia'
import { toast } from '@/hooks/use-toast'
import { mensajeDeError } from '@/lib/errores'

interface TabExamenesProps {
  historia: HistoriaClinica
  notaId?: string   // presente en modo atención
}

// Mismos límites que el backend (validar_archivo_examen).
const MAX_BYTES = 15 * 1024 * 1024
const MAX_POR_ENVIO = 10
const TIPOS = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

function getExtension(nombre: string): string {
  const ext = nombre.split('.').pop()?.toUpperCase() ?? ''
  return ['PDF', 'JPG', 'JPEG', 'PNG', 'WEBP', 'HEIC'].includes(ext) ? ext : 'ARCHIVO'
}

/** Deja solo los archivos válidos y avisa de los que no. */
function filtrarArchivos(lista: FileList | null): File[] {
  const validos: File[] = []
  for (const archivo of Array.from(lista ?? [])) {
    if (!TIPOS.includes(archivo.type)) {
      toast.error('Archivo no permitido', `${archivo.name}: solo PDF o imágenes JPG, PNG, WebP o HEIC.`)
    } else if (archivo.size > MAX_BYTES) {
      toast.error('Archivo muy pesado', `${archivo.name}: no puede superar 15 MB.`)
    } else {
      validos.push(archivo)
    }
  }
  return validos
}

function origen(r: ResultadoExamen): string {
  return r.nota
    ? `En la atención del ${r.nota_fecha ? formatDate(r.nota_fecha) : '—'}`
    : 'Cargado desde la historia'
}

export function TabExamenes({ historia, notaId }: TabExamenesProps) {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const puedeCargar = hasPermission(user, PERM.HISTORIA_EXAMENES_CARGAR)
  const [agregando, setAgregando] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [fecha, setFecha] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [archivos, setArchivos] = useState<File[]>([])
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const fileRef = useRef<HTMLInputElement>(null)
  // Un solo input para "Agregar archivo" en cualquier resultado de la lista.
  const agregarRef = useRef<HTMLInputElement>(null)
  const [destinoArchivos, setDestinoArchivos] = useState<string | null>(null)

  const queryKey = ['resultados-examenes', historia.id]
  const { data: resultadosRaw, isLoading, isError, error, refetch } = useQuery({
    queryKey,
    queryFn: () => historiaClinicaApi.resultadosExamenes.list(historia.id),
  })
  const resultados = resultadosRaw
    ? [...new Map(resultadosRaw.map((r) => [r.id, r])).values()]
    : resultadosRaw

  function limpiarFormulario() {
    setAgregando(false)
    setTitulo('')
    setFecha('')
    setDescripcion('')
    setArchivos([])
    if (fileRef.current) fileRef.current.value = ''
  }

  const { mutate: crear, isPending: creando } = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      fd.append('historia', historia.id)
      fd.append('titulo', titulo)
      fd.append('fecha', fecha)
      fd.append('descripcion', descripcion)
      archivos.forEach((a) => fd.append('adjuntos', a))
      return historiaClinicaApi.resultadosExamenes.create(fd, notaId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      limpiarFormulario()
    },
    onError: (err) => toast.error('No se pudo guardar el examen', mensajeDeError(err)),
  })

  const { mutate: eliminar } = useMutation({
    mutationFn: (id: string) => historiaClinicaApi.resultadosExamenes.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (err) => toast.error('No se pudo eliminar el examen', mensajeDeError(err)),
  })

  const { mutate: agregarArchivos, isPending: subiendo } = useMutation({
    mutationFn: ({ id, nuevos }: { id: string; nuevos: File[] }) =>
      historiaClinicaApi.resultadosExamenes.agregarArchivos(id, nuevos),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (err) => toast.error('No se pudieron agregar los archivos', mensajeDeError(err)),
    onSettled: () => setDestinoArchivos(null),
  })

  const { mutate: quitarArchivo } = useMutation({
    mutationFn: ({ id, archivoId }: { id: string; archivoId: string }) =>
      historiaClinicaApi.resultadosExamenes.quitarArchivo(id, archivoId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (err) => toast.error('No se pudo quitar el archivo', mensajeDeError(err)),
  })

  function toggleExpandido(id: string) {
    setExpandidos((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function sumarArchivos(lista: FileList | null) {
    const nuevos = filtrarArchivos(lista)
    setArchivos((prev) => {
      const todos = [...prev, ...nuevos]
      if (todos.length > MAX_POR_ENVIO) toast.error('Demasiados archivos', `Máximo ${MAX_POR_ENVIO} por envío.`)
      return todos.slice(0, MAX_POR_ENVIO)
    })
    if (fileRef.current) fileRef.current.value = ''
  }

  function elegirArchivosPara(id: string) {
    setDestinoArchivos(id)
    agregarRef.current?.click()
  }

  const puedeGuardar = titulo.trim() && fecha

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            {resultados?.length
              ? `${resultados.length} resultado${resultados.length !== 1 ? 's' : ''} registrado${resultados.length !== 1 ? 's' : ''}`
              : 'Sin resultados registrados'}
          </p>
          {!notaId && puedeCargar && (
            <p className="text-xs text-muted-foreground">
              Carga aquí los resultados que el paciente envía después de la atención.
            </p>
          )}
        </div>
        {!agregando && puedeCargar && (
          <Button size="sm" variant="outline" onClick={() => setAgregando(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Agregar resultado
          </Button>
        )}
      </div>

      <input
        ref={agregarRef}
        type="file"
        accept=".pdf,image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const nuevos = filtrarArchivos(e.target.files).slice(0, MAX_POR_ENVIO)
          e.target.value = ''
          if (destinoArchivos && nuevos.length) agregarArchivos({ id: destinoArchivos, nuevos })
          else setDestinoArchivos(null)
        }}
      />

      {/* Formulario inline */}
      {agregando && (
        <div className="rounded-lg border border-dashed p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Nuevo resultado</p>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={limpiarFormulario}>
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
              <Label className="text-xs">Archivos (PDF o imagen, hasta 15 MB)</Label>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,image/*"
                multiple
                className="hidden"
                onChange={(e) => sumarArchivos(e.target.files)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full h-9 text-xs"
                onClick={() => fileRef.current?.click()}
              >
                <Paperclip className="h-3.5 w-3.5 mr-1.5" />
                {archivos.length ? 'Agregar más archivos' : 'Seleccionar archivos'}
              </Button>
            </div>
            {archivos.length > 0 && (
              <ul className="col-span-2 space-y-1">
                {archivos.map((a, i) => (
                  <li key={`${a.name}-${i}`} className="flex items-center gap-2 rounded border px-2 py-1 text-xs">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="flex-1 truncate">{a.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      aria-label={`Quitar ${a.name}`}
                      onClick={() => setArchivos((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Descripción / observaciones</Label>
              <Textarea rows={2} placeholder="Resultados relevantes, valores alterados…" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={limpiarFormulario}>Cancelar</Button>
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
            // Los de una atención solo se completan desde esa atención.
            const puedeAgregarArchivos = puedeCargar && (!r.nota || r.nota === notaId)
            return (
              <div key={r.id} className="rounded-lg border">
                <div
                  className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => toggleExpandido(r.id)}
                >
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.titulo}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(r.fecha)} · {origen(r)}</p>
                  </div>
                  {r.archivos.length > 0 && (
                    <span className="text-[10px] font-medium bg-muted px-1.5 py-0.5 rounded shrink-0">
                      {r.archivos.length === 1 ? getExtension(r.archivos[0].nombre) : `${r.archivos.length} archivos`}
                    </span>
                  )}
                  {expandido ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                </div>
                {expandido && (
                  <div className="px-3 pb-3 pt-0 space-y-2 border-t">
                    {r.descripcion && (
                      <p className="text-sm text-muted-foreground pt-2">{r.descripcion}</p>
                    )}
                    <p className="text-xs text-muted-foreground pt-2">
                      Cargado por {r.created_by_nombre ?? 'usuario eliminado'} el {formatDateTime(r.created_at)}
                    </p>
                    {r.archivos.length > 0 && (
                      <ul className="space-y-1">
                        {r.archivos.map((a) => (
                          <li key={a.id} className="flex items-center gap-2 rounded border px-2 py-1.5">
                            <span className="text-[10px] font-medium bg-muted px-1.5 py-0.5 rounded shrink-0">
                              {getExtension(a.nombre)}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs truncate">{a.nombre || 'Archivo'}</p>
                              {a.subido_por && a.subido_por !== r.created_by && (
                                <p className="text-[11px] text-muted-foreground">
                                  Subido por {a.subido_por_nombre} el {formatDateTime(a.created_at)}
                                </p>
                              )}
                            </div>
                            {a.url && (
                              <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                                <a href={resolveMediaUrl(a.url) ?? '#'} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="h-3 w-3 mr-1.5" />
                                  Ver
                                </a>
                              </Button>
                            )}
                            {a.puede_quitar && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                aria-label={`Quitar ${a.nombre}`}
                                onClick={() => {
                                  if (confirm(`¿Quitar el archivo "${a.nombre}"?`)) quitarArchivo({ id: r.id, archivoId: a.id })
                                }}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="flex items-center gap-2 pt-1">
                      {puedeAgregarArchivos && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={subiendo}
                          onClick={() => elegirArchivosPara(r.id)}
                        >
                          {subiendo && destinoArchivos === r.id
                            ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                            : <Paperclip className="h-3 w-3 mr-1.5" />}
                          Agregar archivo
                        </Button>
                      )}
                      {r.puede_modificar && (
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
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          {/* Antes un error se veía como "Sin resultados" (AT-17). */}
          {isError && !resultadosRaw && (
            <div className="rounded-lg border border-dashed py-10 text-center">
            <p className="text-sm text-muted-foreground">{mensajeDeError(error, 'No se pudieron cargar los exámenes.')}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>Reintentar</Button>
          </div>
          )}
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
