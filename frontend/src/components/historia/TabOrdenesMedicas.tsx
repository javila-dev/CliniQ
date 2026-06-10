'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Send, Loader2, FileText, X, Info, AlertTriangle, CheckCircle2, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { historiaClinicaApi } from '@/lib/api/historiaClinica'
import { formatDate } from '@/lib/utils'
import type { HistoriaClinica, PlantillaOrden } from '@/types/historia'

interface TabOrdenesMedicasProps {
  historia: HistoriaClinica
  notaId?: string   // presente en modo atención
}

export function TabOrdenesMedicas({ historia, notaId }: TabOrdenesMedicasProps) {
  const queryClient = useQueryClient()
  const [agregando, setAgregando] = useState(false)
  const [plantillaSeleccionada, setPlantillaSeleccionada] = useState<PlantillaOrden | null>(null)
  const [contenido, setContenido] = useState('')
  const [enviandoId, setEnviandoId] = useState<string | null>(null)
  const [enviado, setEnviado] = useState<string | null>(null)
  const [descargandoId, setDescargandoId] = useState<string | null>(null)

  const { data: ordenes, isLoading } = useQuery({
    queryKey: ['ordenes-medicas', historia.id],
    queryFn: () => historiaClinicaApi.ordenesMedicas.list(historia.id),
  })

  const { data: plantillas } = useQuery({
    queryKey: ['plantillas-ordenes'],
    queryFn: () => historiaClinicaApi.plantillasOrdenes.list(),
    enabled: agregando,
  })

  const { mutate: crear, isPending: creando } = useMutation({
    mutationFn: () =>
      historiaClinicaApi.ordenesMedicas.create({
        historia: historia.id,
        contenido,
        ...(notaId ? { nota: notaId } : {}),
        ...(plantillaSeleccionada ? { plantilla_origen: plantillaSeleccionada.id } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ordenes-medicas', historia.id] })
      setAgregando(false)
      setPlantillaSeleccionada(null)
      setContenido('')
    },
  })

  const { mutate: enviarWhatsapp } = useMutation({
    mutationFn: (id: string) => historiaClinicaApi.ordenesMedicas.enviarWhatsapp(id),
    onMutate: (id) => setEnviandoId(id),
    onSuccess: (_, id) => {
      setEnviandoId(null)
      setEnviado(id)
      setTimeout(() => setEnviado(null), 3000)
    },
    onError: () => setEnviandoId(null),
  })

  async function descargarPdf(id: string, fecha: string) {
    setDescargandoId(id)
    try {
      const blob = await historiaClinicaApi.ordenesMedicas.descargarPdf(id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `orden-medica-${fecha}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setDescargandoId(null)
    }
  }

  function seleccionarPlantilla(p: PlantillaOrden | null) {
    setPlantillaSeleccionada(p)
    setContenido(p?.contenido ?? '')
  }

  const textareaDeshabilitado =
    plantillaSeleccionada !== null && !plantillaSeleccionada.permite_edicion_profesional

  const fueEditada =
    plantillaSeleccionada !== null &&
    plantillaSeleccionada.permite_edicion_profesional &&
    contenido !== plantillaSeleccionada.contenido

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {ordenes?.length
            ? `${ordenes.length} orden${ordenes.length !== 1 ? 'es' : ''} emitida${ordenes.length !== 1 ? 's' : ''}`
            : 'Sin órdenes emitidas'}
        </p>
        {!agregando && (
          <Button size="sm" variant="outline" onClick={() => setAgregando(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Nueva orden
          </Button>
        )}
      </div>

      {/* Formulario */}
      {agregando && (
        <div className="rounded-lg border border-dashed p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Nueva orden médica</p>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => { setAgregando(false); seleccionarPlantilla(null) }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Selector de plantilla */}
          <div className="space-y-1.5">
            <Label className="text-xs">Plantilla (opcional)</Label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => seleccionarPlantilla(null)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  plantillaSeleccionada === null
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:border-foreground/40'
                }`}
              >
                Sin plantilla
              </button>
              {plantillas?.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => seleccionarPlantilla(p)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    plantillaSeleccionada?.id === p.id
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:border-foreground/40'
                  }`}
                >
                  {p.nombre}
                </button>
              ))}
            </div>
          </div>

          {/* Aviso si plantilla no editable */}
          {textareaDeshabilitado && (
            <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
              <Info className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">Esta plantilla no puede modificarse. Se usará el texto tal como está.</p>
            </div>
          )}

          {/* Aviso si fue editada */}
          {fueEditada && (
            <div className="flex items-start gap-2 rounded-md bg-blue-50 border border-blue-200 px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700">Modificaste el texto de la plantilla. Quedará registrado en el historial de acciones.</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Contenido de la orden *</Label>
            <Textarea
              rows={7}
              placeholder="Escribir la orden médica o seleccionar una plantilla arriba…"
              value={contenido}
              onChange={(e) => !textareaDeshabilitado && setContenido(e.target.value)}
              disabled={textareaDeshabilitado}
              className={textareaDeshabilitado ? 'bg-muted cursor-not-allowed' : ''}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setAgregando(false); seleccionarPlantilla(null) }}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => crear()} disabled={creando || !contenido.trim()}>
              {creando && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
              Crear orden
            </Button>
          </div>
        </div>
      )}

      {/* Lista de órdenes */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-3">
          {ordenes?.map((orden) => (
            <div key={orden.id} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium">{formatDate(orden.created_at)}</span>
                    <span className="text-xs text-muted-foreground">· {orden.profesional_nombre}</span>
                    {orden.plantilla_nombre && (
                      <Badge variant="secondary" className="text-[10px] h-4">
                        {orden.plantilla_nombre}
                      </Badge>
                    )}
                    {orden.fue_editada && (
                      <Badge variant="outline" className="text-[10px] h-4 text-amber-600 border-amber-300">
                        Editada
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={descargandoId === orden.id}
                    onClick={() => descargarPdf(orden.id, formatDate(orden.created_at))}
                  >
                    {descargandoId === orden.id
                      ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                      : <Download className="h-3 w-3 mr-1.5" />}
                    PDF
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={enviandoId === orden.id}
                    onClick={() => enviarWhatsapp(orden.id)}
                  >
                    {enviandoId === orden.id ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                    ) : enviado === orden.id ? (
                      <CheckCircle2 className="h-3 w-3 mr-1.5 text-green-600" />
                    ) : (
                      <Send className="h-3 w-3 mr-1.5" />
                    )}
                    {enviado === orden.id ? 'Enviado' : 'WhatsApp'}
                  </Button>
                </div>
              </div>
              <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed bg-muted/30 rounded-md p-3">
                {orden.contenido}
              </pre>
            </div>
          ))}

          {ordenes?.length === 0 && !agregando && (
            <div className="rounded-lg border border-dashed py-10 text-center">
              <FileText className="h-7 w-7 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Sin órdenes médicas emitidas</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
