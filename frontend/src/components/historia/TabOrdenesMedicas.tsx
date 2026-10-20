'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Send, Loader2, FileText, X, Info, AlertTriangle, CheckCircle2, Download, ChevronDown,
  MoreHorizontal, RotateCcw, BookmarkPlus, Settings2, Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { historiaClinicaApi } from '@/lib/api/historiaClinica'
import { formatDate } from '@/lib/utils'
import type { HistoriaClinica, OrdenMedica, PlantillaOrden } from '@/types/historia'
import { toast } from '@/hooks/use-toast'
import { mensajeDeError } from '@/lib/errores'
import { BuscadorPopover } from '@/components/ui/buscador-popover'
import { useAuthStore } from '@/store/authStore'
import { hasPermission, PERM } from '@/lib/permissions'

interface TabOrdenesMedicasProps {
  historia: HistoriaClinica
  notaId?: string   // presente en modo atención
  /** Cita de la atención: las plantillas sugeridas priorizan su procedimiento. */
  citaId?: string
}

/** Plantillas a la vista; el resto se busca. */
const SUGERIDAS = 5

export function TabOrdenesMedicas({ historia, notaId, citaId }: TabOrdenesMedicasProps) {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const gestionaPlantillas = hasPermission(user, PERM.CLINICAS_EDITAR)
  // Quien emite órdenes puede guardarlas como plantilla (las suyas, o compartidas).
  const puedeGuardarPlantilla = gestionaPlantillas || hasPermission(user, PERM.HISTORIA_NOTAS_CREAR)

  const [agregando, setAgregando] = useState(false)
  const [plantillaSeleccionada, setPlantillaSeleccionada] = useState<PlantillaOrden | null>(null)
  const [contenido, setContenido] = useState('')
  // Al usar de nuevo una orden se conserva su título (el del PDF), sin mostrarlo.
  const [tituloReuso, setTituloReuso] = useState('')
  const [guardarPlantilla, setGuardarPlantilla] = useState(false)
  const [nombrePlantilla, setNombrePlantilla] = useState('')
  const [compartirPlantilla, setCompartirPlantilla] = useState(false)
  const [guardarDesde, setGuardarDesde] = useState<OrdenMedica | null>(null)
  const [enviandoId, setEnviandoId] = useState<string | null>(null)
  const [enviado, setEnviado] = useState<string | null>(null)
  const [descargandoId, setDescargandoId] = useState<string | null>(null)
  const [anterioresAbiertas, setAnterioresAbiertas] = useState<Set<string>>(new Set())
  const formRef = useRef<HTMLDivElement>(null)

  function toggleAnterior(id: string) {
    setAnterioresAbiertas((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const { data: ordenes, isLoading } = useQuery({
    queryKey: ['ordenes-medicas', historia.id],
    queryFn: () => historiaClinicaApi.ordenesMedicas.list(historia.id),
  })

  const { data: plantillas } = useQuery({
    queryKey: ['plantillas-ordenes'],
    queryFn: () => historiaClinicaApi.plantillasOrdenes.list(),
    enabled: agregando,
  })
  const { data: sugeridas } = useQuery({
    queryKey: ['plantillas-ordenes', 'sugeridas', citaId ?? null],
    queryFn: () => historiaClinicaApi.plantillasOrdenes.sugeridas(citaId, SUGERIDAS),
    enabled: agregando,
  })
  // Las que puede usar: las compartidas y las suyas (el admin recibe todas en la lista).
  const disponibles = (plantillas ?? [])
    .filter((p) => p.compartida || p.es_mia)
    .sort((a, b) => Number(b.es_mia && !b.compartida) - Number(a.es_mia && !a.compartida) || a.nombre.localeCompare(b.nombre))
  const porProcedimiento = (sugeridas ?? []).some((p) => (p.usos_procedimiento ?? 0) > 0)

  function cerrarFormulario() {
    setAgregando(false)
    setPlantillaSeleccionada(null)
    setContenido('')
    setTituloReuso('')
    setGuardarPlantilla(false)
    setNombrePlantilla('')
    setCompartirPlantilla(false)
  }

  const { mutate: crear, isPending: creando } = useMutation({
    mutationFn: async () => {
      const orden = await historiaClinicaApi.ordenesMedicas.create({
        historia: historia.id,
        contenido,
        ...(notaId ? { nota: notaId } : {}),
        ...(plantillaSeleccionada ? { plantilla_origen: plantillaSeleccionada.id } : tituloReuso ? { titulo: tituloReuso } : {}),
      })
      let plantillaGuardada = false
      if (guardarPlantilla && nombrePlantilla.trim()) {
        try {
          await historiaClinicaApi.plantillasOrdenes.create({
            nombre: nombrePlantilla.trim(), contenido, permite_edicion_profesional: true, compartida: compartirPlantilla,
          })
          plantillaGuardada = true
        } catch (err) {
          toast.error('La orden se emitió, pero no se pudo guardar la plantilla', mensajeDeError(err))
        }
      }
      return { orden, plantillaGuardada }
    },
    onError: (err) => toast.error('No se pudo crear la orden', mensajeDeError(err)),
    onSuccess: ({ plantillaGuardada }) => {
      queryClient.invalidateQueries({ queryKey: ['ordenes-medicas', historia.id] })
      if (plantillaGuardada) {
        queryClient.invalidateQueries({ queryKey: ['plantillas-ordenes'] })
        toast.success('Orden emitida', 'También quedó guardada como plantilla.')
      }
      cerrarFormulario()
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
    onError: (err) => {
      setEnviandoId(null)
      toast.error('No se pudo enviar la orden', mensajeDeError(err))
    },
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
    } catch (err) {
      toast.error('No se pudo descargar el PDF', mensajeDeError(err))
    } finally {
      setDescargandoId(null)
    }
  }

  function seleccionarPlantilla(p: PlantillaOrden | null) {
    setPlantillaSeleccionada(p)
    setContenido(p?.contenido ?? '')
    setGuardarPlantilla(false)
  }

  /** Abre una orden nueva con el mismo texto de una emitida. */
  function usarDeNuevo(orden: OrdenMedica) {
    setPlantillaSeleccionada(null)
    setContenido(orden.contenido)
    setTituloReuso(orden.titulo || '')
    setGuardarPlantilla(false)
    setAgregando(true)
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const textareaDeshabilitado =
    plantillaSeleccionada !== null && !plantillaSeleccionada.permite_edicion_profesional

  const fueEditada =
    plantillaSeleccionada !== null &&
    plantillaSeleccionada.permite_edicion_profesional &&
    contenido !== plantillaSeleccionada.contenido

  // Guardar como plantilla tiene sentido si el texto no es el de una plantilla tal cual.
  const ofrecerGuardar = puedeGuardarPlantilla && (plantillaSeleccionada === null || fueEditada)

  // Más reciente primero. En modo atención, cada orden de una atención
  // anterior se muestra colapsada en su propio acordeón.
  const ordenesOrdenadas = [...(ordenes ?? [])].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  )
  const ordenesActuales = notaId
    ? ordenesOrdenadas.filter((o) => o.nota === notaId)
    : ordenesOrdenadas
  const ordenesAnteriores = notaId
    ? ordenesOrdenadas.filter((o) => o.nota !== notaId)
    : []

  function ordenMeta(orden: OrdenMedica) {
    const nombre = orden.titulo || orden.plantilla_nombre
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium">{formatDate(orden.created_at)}</span>
        <span className="text-xs text-muted-foreground">· {orden.profesional_nombre}</span>
        {nombre && <Badge variant="secondary" className="text-xs h-5">{nombre}</Badge>}
        {orden.fue_editada && (
          <Badge variant="outline" className="text-xs h-5 text-amber-700 border-amber-300">
            Editada
          </Badge>
        )}
      </div>
    )
  }

  function ordenAcciones(orden: OrdenMedica) {
    return (
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Más acciones de la orden">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => usarDeNuevo(orden)}>
              <RotateCcw className="h-3.5 w-3.5 mr-2" />
              Usar de nuevo
            </DropdownMenuItem>
            {puedeGuardarPlantilla && (
              <DropdownMenuItem onClick={() => setGuardarDesde(orden)}>
                <BookmarkPlus className="h-3.5 w-3.5 mr-2" />
                Guardar como plantilla
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    )
  }

  function ordenContenido(orden: OrdenMedica) {
    return (
      <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed bg-muted/30 rounded-md p-3">
        {orden.contenido}
      </pre>
    )
  }

  function renderOrden(orden: OrdenMedica) {
    return (
      <div key={orden.id} className="rounded-lg border p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          {ordenMeta(orden)}
          {ordenAcciones(orden)}
        </div>
        {ordenContenido(orden)}
      </div>
    )
  }

  function renderOrdenAnterior(orden: OrdenMedica) {
    const abierta = anterioresAbiertas.has(orden.id)
    return (
      <div key={orden.id} className="rounded-lg border">
        <button
          type="button"
          onClick={() => toggleAnterior(orden.id)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-muted/30 transition-colors rounded-lg"
        >
          {ordenMeta(orden)}
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${abierta ? 'rotate-180' : ''}`}
          />
        </button>
        {abierta && (
          <div className="border-t p-4 space-y-3">
            <div className="flex justify-end">{ordenAcciones(orden)}</div>
            {ordenContenido(orden)}
          </div>
        )}
      </div>
    )
  }

  function chipPlantilla(p: PlantillaOrden) {
    return (
      <button
        key={p.id}
        type="button"
        onClick={() => seleccionarPlantilla(p)}
        title={p.contenido.slice(0, 160)}
        className="max-w-[14rem] truncate rounded-full border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
      >
        {p.nombre}
      </button>
    )
  }

  return (
    <div className="space-y-4 max-w-2xl">
      {(gestionaPlantillas || !agregando) && (
        <div className="flex items-center justify-end gap-1.5">
          {gestionaPlantillas && (
            <Button asChild size="sm" variant="ghost" className="text-muted-foreground">
              <Link href="/configuracion/plantillas-ordenes">
                <Settings2 className="h-3.5 w-3.5 mr-1.5" />
                Administrar plantillas
              </Link>
            </Button>
          )}
          {!agregando && (
            <Button size="sm" variant="outline" onClick={() => setAgregando(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Nueva orden
            </Button>
          )}
        </div>
      )}

      {/* Formulario */}
      {agregando && (
        <div ref={formRef} className="scroll-mt-4 rounded-lg border border-dashed p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Nueva orden médica</p>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={cerrarFormulario} aria-label="Cerrar">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Plantilla: elegida, o sugeridas + buscador. Sin elegir, la orden empieza en blanco. */}
          {plantillaSeleccionada ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Plantilla</span>
              <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary py-1 pl-3 pr-1 text-xs font-medium text-primary-foreground">
                <span className="truncate">{plantillaSeleccionada.nombre}</span>
                <button
                  type="button"
                  onClick={() => seleccionarPlantilla(null)}
                  className="rounded-full p-0.5 hover:bg-white/20"
                  aria-label="Quitar la plantilla"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            </div>
          ) : disponibles.length > 0 || (sugeridas?.length ?? 0) > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="text-xs text-muted-foreground"
                title={porProcedimiento ? 'Primero las más usadas en este procedimiento, luego las que más usas' : 'Las que más usas y las más usadas en la clínica'}
              >
                Sugeridas
              </span>
              {(sugeridas ?? []).map(chipPlantilla)}
              <div className="w-44">
                <BuscadorPopover
                  etiqueta={null}
                  placeholder={disponibles.length > (sugeridas?.length ?? 0) ? `Buscar entre ${disponibles.length}` : 'Buscar plantilla'}
                  icono={Search}
                  opciones={disponibles.map((p) => ({
                    id: p.id,
                    label: p.nombre,
                    sublabel: p.contenido.split('\n').find((linea) => linea.trim()) ?? '',
                    hint: p.es_mia && !p.compartida ? 'Mía' : undefined,
                  }))}
                  cargando={!plantillas}
                  onSelect={(id) => seleccionarPlantilla(disponibles.find((p) => p.id === id) ?? null)}
                  ancho="w-[24rem] max-w-[calc(100vw-2rem)]"
                />
              </div>
            </div>
          ) : null}

          {/* Aviso si plantilla no editable */}
          {textareaDeshabilitado && (
            <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
              <Info className="h-3.5 w-3.5 text-amber-700 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">Esta plantilla no puede modificarse. Se usará el texto tal como está.</p>
            </div>
          )}

          {/* Aviso si fue editada */}
          {fueEditada && (
            <div className="flex items-start gap-2 rounded-md bg-blue-50 border border-blue-200 px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 text-blue-700 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-800">Modificaste el texto de la plantilla. Quedará registrado en el historial de acciones.</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="orden-contenido" className="text-xs">Contenido de la orden *</Label>
            <Textarea
              id="orden-contenido"
              rows={7}
              placeholder="Escribe la orden médica o elige una plantilla arriba…"
              value={contenido}
              onChange={(e) => !textareaDeshabilitado && setContenido(e.target.value)}
              disabled={textareaDeshabilitado}
              className={textareaDeshabilitado ? 'bg-muted cursor-not-allowed' : ''}
            />
          </div>

          {/* Guardar como plantilla, en la misma línea que las acciones; su nombre, debajo. */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              {ofrecerGuardar ? (
                <Checkbox
                  id="guardar-plantilla"
                  label="Guardar también como plantilla"
                  checked={guardarPlantilla}
                  onChange={(e) => setGuardarPlantilla(e.target.checked)}
                />
              ) : <span />}
              <div className="ml-auto flex gap-2">
                <Button variant="ghost" size="sm" onClick={cerrarFormulario}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={() => crear()}
                  disabled={creando || !contenido.trim() || (guardarPlantilla && !nombrePlantilla.trim())}
                >
                  {creando && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                  Crear orden
                </Button>
              </div>
            </div>
            {ofrecerGuardar && guardarPlantilla && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pl-6">
                <Input
                  value={nombrePlantilla}
                  onChange={(e) => setNombrePlantilla(e.target.value)}
                  placeholder="Nombre de la plantilla"
                  aria-label="Nombre de la plantilla"
                  className="h-8 w-56"
                />
                <span title={compartirPlantilla ? 'Todos los profesionales la verán' : 'Quedará en tus plantillas: solo tú la verás'}>
                  <Checkbox
                    id="compartir-plantilla"
                    label="Compartir con la clínica"
                    checked={compartirPlantilla}
                    onChange={(e) => setCompartirPlantilla(e.target.checked)}
                  />
                </span>
              </div>
            )}
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
          {ordenesActuales.map(renderOrden)}

          {notaId && ordenesActuales.length === 0 && ordenesAnteriores.length > 0 && !agregando && (
            <p className="text-sm text-muted-foreground py-1">Sin órdenes en esta atención.</p>
          )}

          {ordenesAnteriores.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground px-0.5">
                Órdenes de atenciones anteriores ({ordenesAnteriores.length})
              </p>
              {ordenesAnteriores.map(renderOrdenAnterior)}
            </div>
          )}

          {ordenes?.length === 0 && !agregando && (
            <div className="rounded-lg border border-dashed py-10 text-center">
              <FileText className="h-7 w-7 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Sin órdenes médicas emitidas</p>
            </div>
          )}
        </div>
      )}

      <GuardarComoPlantillaDialog orden={guardarDesde} onCerrar={() => setGuardarDesde(null)} />
    </div>
  )
}

/** Guarda el texto de una orden ya emitida como plantilla. */
function GuardarComoPlantillaDialog({ orden, onCerrar }: { orden: OrdenMedica | null; onCerrar: () => void }) {
  const queryClient = useQueryClient()
  const [nombre, setNombre] = useState('')
  const [compartir, setCompartir] = useState(false)
  const [abiertaPara, setAbiertaPara] = useState<string | null>(null)

  // Al abrir para otra orden, se sugiere su título.
  if (orden && abiertaPara !== orden.id) {
    setAbiertaPara(orden.id)
    setNombre(orden.titulo || orden.plantilla_nombre || '')
    setCompartir(false)
  }

  const { mutate, isPending } = useMutation({
    mutationFn: () => historiaClinicaApi.ordenesMedicas.guardarComoPlantilla(orden!.id, { nombre: nombre.trim(), compartida: compartir }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plantillas-ordenes'] })
      toast.success('Plantilla guardada', compartir ? 'Ya la ven todos los profesionales.' : 'Está en «Mis plantillas».')
      onCerrar()
    },
    onError: (err) => toast.error('No se pudo guardar la plantilla', mensajeDeError(err)),
  })

  return (
    <Dialog open={orden !== null} onOpenChange={(abierto) => { if (!abierto && !isPending) onCerrar() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Guardar como plantilla</DialogTitle>
          <DialogDescription>
            Se guarda el texto de esta orden para emitirlo con otros pacientes. Sus datos ya salen en el encabezado del PDF.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="plantilla-desde-orden">Nombre de la plantilla</Label>
            <Input id="plantilla-desde-orden" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Perfil lipídico" />
          </div>
          <Checkbox
            id="compartir-desde-orden"
            label="Compartir con toda la clínica"
            checked={compartir}
            onChange={(e) => setCompartir(e.target.checked)}
          />
          <p className="text-xs text-muted-foreground">
            {compartir ? 'Todos los profesionales la verán al emitir una orden.' : 'Quedará en «Mis plantillas»: solo tú la verás.'}
          </p>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onCerrar} disabled={isPending}>Cancelar</Button>
          <Button onClick={() => mutate()} disabled={isPending || !nombre.trim()}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Guardar plantilla
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
