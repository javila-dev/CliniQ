'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Camera, Check, CheckCircle, ChevronDown, Loader2, PanelsTopLeft, X, XCircle } from 'lucide-react'
import { agendaApi } from '@/lib/api/agenda'
import { historiaClinicaApi } from '@/lib/api/historiaClinica'
import { guardarBorradoresDeNota, useBorradorNota } from '@/components/historia/useBorradorNota'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { LoadingState } from '@/components/shared/LoadingState'
import { toast } from '@/hooks/use-toast'
import { mensajeDeError } from '@/lib/errores'
import { cn } from '@/lib/utils'
import { hasPermission } from '@/lib/permissions'
import { useAuthStore } from '@/store/authStore'
import type { Cita } from '@/types/agenda'
import type { HistoriaClinica, NotaClinica, TipoFoto } from '@/types/historia'
import { HojaPaquete } from './HojaPaquete'
import { useZonasMarcadas, ZonasSencillas } from './ZonasSencillas'

// Vista sencilla de la atención (docs/plan-atencion-sencilla.md): la hoja del
// paquete y la sesión de hoy en una sola pantalla, sin pestañas, paneles ni
// scroll. Escribe lo mismo que la vista completa: la nota de la cita, sus
// zonas y fotos, y la cierra con completar_atencion.

// El contenedor de la app crece con su contenido, así que la pantalla se da a sí
// misma el alto que queda en la ventana: de ahí el "sin scroll" y que las filas
// de la hoja se repartan ese alto.
const MARGEN_INFERIOR = 24  // el padding inferior del <main> de AppShell

function useAltoDisponible() {
  const ref = useRef<HTMLDivElement>(null)
  const [alto, setAlto] = useState<number | null>(null)
  useLayoutEffect(() => {
    const medir = () => {
      const el = ref.current
      if (!el) return
      const arriba = el.getBoundingClientRect().top + window.scrollY
      setAlto(Math.max(480, window.innerHeight - arriba - MARGEN_INFERIOR))
    }
    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [])
  return { ref, alto }
}

function horaAhora() {
  return new Date().toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })
}

export function AtencionSencilla({
  cita, historia, notas, notaId, onAbrirCompleta, onDescartar, onTerminada, navegando,
}: {
  cita: Cita
  historia: HistoriaClinica
  notas: NotaClinica[]
  notaId: string | null
  onAbrirCompleta: () => void
  onDescartar: () => void
  /** La página vuelve a la lista: esta vista se desmonta al cerrarse la cita. */
  onTerminada: () => void
  navegando: boolean
}) {
  const { ref: raizRef, alto } = useAltoDisponible()

  const { data: tarjeta, isLoading, isError, refetch } = useQuery({
    queryKey: ['citas', cita.id, 'tarjeta'],
    queryFn: () => agendaApi.citas.tarjeta(cita.id),
  })
  const actual = tarjeta?.filas.find((f) => f.es_actual) ?? null
  // Solo una sesión de paquete pendiente recibe qué procedimientos se hicieron.
  const marcables = actual?.sesion_id && actual.estado === 'pendiente'
    ? actual.procedimientos.filter((p) => p.id)
    : []

  const [seleccion, setSeleccion] = useState<string[]>([])
  useEffect(() => {
    setSeleccion(marcables.map((p) => p.id!))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actual?.sesion_id])

  const zonas = useZonasMarcadas(notaId)
  const [hora, setHora] = useState(horaAhora)
  useEffect(() => {
    const t = setInterval(() => setHora(horaAhora()), 30_000)
    return () => clearInterval(t)
  }, [])

  const nota = notas.find((n) => n.id === notaId)
  const borrador = useBorradorNota(notaId ?? undefined, 'motivo_consulta', nota?.motivo_consulta ?? '', historia.id)

  const terminar = useMutation({
    mutationFn: async () => {
      if (notaId) await guardarBorradoresDeNota(notaId)
      return agendaApi.citas.completarAtencion(cita.id, {
        nota: notaId ?? undefined,
        ...(marcables.length ? { procedimientos_ejecutados: seleccion } : {}),
      })
    },
    onSuccess: onTerminada,
    onError: (err: any) => {
      if (err?.response?.data?.code === 'CONSENTIMIENTOS_FALTANTES') {
        toast.error('Consentimientos faltantes', 'La sesión tiene consentimientos vencidos o sin firmar. Fírmalos antes de terminar.')
      } else {
        toast.error('No se pudo terminar la sesión', mensajeDeError(err, 'Intenta de nuevo.'))
      }
    },
  })

  const [paso, setPaso] = useState<1 | 2 | 3>(1)
  const procedimientosHoy = marcables.length
    ? marcables.filter((p) => seleccion.includes(p.id!)).map((p) => p.nombre).join(' + ')
    : actual?.procedimientos.map((p) => p.nombre).join(' + ') || cita.servicio_nombre
  const fotosHoy = nota?.fotos ?? []
  const fotosAntes = fotosHoy.filter((f) => f.tipo !== 'despues').length

  const [confirmando, setConfirmando] = useState(false)
  const faltaQueSeHizo = marcables.length > 0 && seleccion.length === 0
  const ocupado = terminar.isPending || navegando

  const encabezado = tarjeta?.paquete
    ? `Sesión ${tarjeta.numero_actual} de ${tarjeta.total} · ${tarjeta.paquete.nombre}`
    : cita.servicio_nombre

  return (
    <div ref={raizRef} className="flex min-h-0 flex-col overflow-hidden" style={{ height: alto ?? undefined }}>
      {/* Encabezado: una línea */}
      <div className="flex min-w-0 items-center justify-between gap-3 border-b bg-background px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="sm" asChild className="shrink-0">
            <Link href="/atenciones" aria-label="Volver a atenciones">
              <ArrowLeft className="h-4 w-4 xl:mr-1" /><span className="hidden xl:inline">Atenciones</span>
            </Link>
          </Button>
          <div className="h-4 w-px shrink-0 bg-border" />
          <p className="min-w-0 truncate text-sm">
            <span className="font-semibold">{cita.paciente_nombre}</span>
            <span className="text-muted-foreground"> · {encabezado}</span>
          </p>
          <Badge variant="secondary" className="shrink-0 border-rose-200 bg-rose-50 text-xs text-rose-700">En atención</Badge>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={onAbrirCompleta}>
            <PanelsTopLeft className="mr-1.5 h-4 w-4" />Vista completa
          </Button>
          <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={onDescartar}>
            <XCircle className="mr-1.5 h-4 w-4" />Descartar
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="p-6"><LoadingState rows={6} /></div>
      ) : isError || !tarjeta ? (
        <div className="p-6 text-sm text-muted-foreground">
          No se pudo cargar la hoja de esta atención.{' '}
          <button type="button" className="font-medium text-primary hover:underline" onClick={() => refetch()}>Reintentar</button>
          {' '}o{' '}
          <button type="button" className="font-medium text-primary hover:underline" onClick={onAbrirCompleta}>abrir la vista completa</button>.
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-3 bg-muted/20 p-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <HojaPaquete
            tarjeta={tarjeta}
            hoy={{
              procedimientos: marcables.length ? seleccion : (actual?.procedimientos.map((p) => p.id ?? '') ?? []),
              zonas,
              horaActual: hora,
            }}
          />

          {/* La sesión de hoy: tres pasos numerados en acordeón, uno abierto a la vez.
              Los cerrados muestran su resumen, así nada queda escondido; el
              abierto toma el alto que queda y, si no le alcanza, se desplaza. */}
          <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-white">
            <p className="shrink-0 border-b px-3 py-2.5 text-sm font-semibold">
              Hoy{tarjeta.paquete && tarjeta.numero_actual ? ` · sesión ${tarjeta.numero_actual} de ${tarjeta.total}` : ''}
            </p>

            <Paso
              numero={1}
              titulo="¿Qué hiciste hoy?"
              abierto={paso === 1}
              onAbrir={() => setPaso(1)}
              hecho={Boolean(borrador.texto.trim())}
              resumen={[procedimientosHoy, borrador.texto.trim()].filter(Boolean).join(' · ')}
              onSiguiente={() => setPaso(2)}
              enLinea={
                <>
                  {marcables.length > 0 ? marcables.map((p) => {
                    const marcado = seleccion.includes(p.id!)
                    return (
                      <label
                        key={p.id}
                        title={p.nombre}
                        className="flex min-w-0 max-w-full cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 text-[13px] transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                      >
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 shrink-0 accent-primary"
                          checked={marcado}
                          onChange={() => setSeleccion((s) => (marcado ? s.filter((x) => x !== p.id) : [...s, p.id!]))}
                        />
                        <span className="truncate">{p.nombre}</span>
                      </label>
                    )
                  }) : (
                    <span
                      title={procedimientosHoy}
                      className="flex min-w-0 max-w-full items-center gap-1 rounded-lg border border-primary bg-primary/5 px-2 py-1 text-[13px]"
                    >
                      <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="truncate">{procedimientosHoy}</span>
                    </span>
                  )}
                </>
              }
            >
              <div>
                <Textarea
                  rows={4}
                  value={borrador.texto}
                  onChange={(e) => borrador.setTexto(e.target.value)}
                  placeholder="Cuenta qué hiciste y cómo le fue a la paciente. Por ejemplo: toleró bien, sin enrojecimiento."
                  disabled={!notaId}
                  aria-label="Qué hiciste hoy"
                  className="min-h-[6.5rem] resize-y"
                />
              </div>
            </Paso>

            <Paso
              numero={2}
              titulo="¿Dónde lo hiciste?"
              abierto={paso === 2}
              onAbrir={() => setPaso(2)}
              hecho={zonas.length > 0}
              resumen={zonas.length ? zonas.join(', ') : 'Sin zonas marcadas'}
              onSiguiente={() => setPaso(3)}
            >
              <ZonasSencillas notaId={notaId} />
            </Paso>

            <Paso
              numero={3}
              titulo="Fotos"
              abierto={paso === 3}
              onAbrir={() => setPaso(3)}
              hecho={fotosHoy.length > 0}
              resumen={fotosHoy.length ? `${fotosAntes} antes · ${fotosHoy.length - fotosAntes} después` : 'Opcional'}
            >
              <FotosSencillas historiaId={historia.id} notaId={notaId} fotos={fotosHoy} />
            </Paso>

            <div className="mt-auto shrink-0 space-y-1 border-t p-3">
              <Button className="w-full" onClick={() => setConfirmando(true)} disabled={!notaId || faltaQueSeHizo || ocupado}>
                {ocupado ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-1.5 h-4 w-4" />}
                {ocupado ? 'Terminando…' : 'Terminar sesión'}
              </Button>
              {faltaQueSeHizo && (
                <p className="text-center text-xs text-amber-700">Marca al menos un procedimiento en el paso 1.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Antes de cerrar: lo que queda registrado y que después ya no se cambia. */}
      <Dialog open={confirmando} onOpenChange={(v) => { if (!terminar.isPending) setConfirmando(v) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Terminar la sesión?</DialogTitle>
            <DialogDescription>
              {tarjeta?.paquete && tarjeta.numero_actual
                ? `La sesión ${tarjeta.numero_actual} de ${tarjeta.total} queda registrada así:`
                : 'La sesión queda registrada así:'}
            </DialogDescription>
          </DialogHeader>
          <dl className="space-y-2 rounded-lg border bg-muted/30 px-3 py-2.5 text-sm">
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 text-muted-foreground">Qué se hizo</dt>
              <dd className="min-w-0">{procedimientosHoy}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 text-muted-foreground">Nota</dt>
              <dd className={cn('min-w-0 line-clamp-3', !borrador.texto.trim() && 'text-muted-foreground')}>
                {borrador.texto.trim() || 'Sin nota'}
              </dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 text-muted-foreground">Dónde</dt>
              <dd className={cn('min-w-0', !zonas.length && 'text-muted-foreground')}>{zonas.length ? zonas.join(', ') : 'Sin zonas marcadas'}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 text-muted-foreground">Fotos</dt>
              <dd className={cn('min-w-0', !fotosHoy.length && 'text-muted-foreground')}>
                {fotosHoy.length ? `${fotosAntes} antes · ${fotosHoy.length - fotosAntes} después` : 'Sin fotos'}
              </dd>
            </div>
          </dl>
          <p className="text-sm text-muted-foreground">
            La cita se cierra y lo anotado ya no se puede cambiar, ni se pueden quitar las fotos.
          </p>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmando(false)} disabled={terminar.isPending}>
              Seguir anotando
            </Button>
            <Button className="flex-1" onClick={() => terminar.mutate()} disabled={ocupado}>
              {ocupado ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-1.5 h-4 w-4" />}
              {ocupado ? 'Terminando…' : 'Sí, terminar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Un paso del acordeón: número, título y, cerrado, el resumen de lo que tiene. */
function Paso({
  numero, titulo, abierto, onAbrir, hecho, resumen, onSiguiente, enLinea, children,
}: {
  numero: number
  titulo: string
  abierto: boolean
  onAbrir: () => void
  hecho: boolean
  resumen: string
  onSiguiente?: () => void
  /** Va en la línea del título cuando el paso está abierto (p. ej. los procedimientos). */
  enLinea?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className={cn('flex flex-col border-b', abierto ? 'min-h-0 flex-1' : 'shrink-0')}>
      <div className={cn('flex w-full flex-wrap items-center gap-2.5 px-3 py-2.5', !abierto && 'cursor-pointer hover:bg-muted/40')} onClick={abierto ? undefined : onAbrir}>
        <button type="button" onClick={onAbrir} aria-expanded={abierto} className="flex shrink-0 items-center gap-2.5 text-left">
          <span
            className={cn(
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums',
              abierto ? 'bg-primary text-primary-foreground' : hecho ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
            )}
          >
            {hecho && !abierto ? <Check className="h-3.5 w-3.5" /> : numero}
          </span>
          <span className="text-sm font-semibold">{titulo}</span>
        </button>
        {abierto
          // Sin al menos 10rem al lado del título, baja a su propia línea en vez
          // de recortar el nombre del procedimiento hasta no leerse.
          ? enLinea && <div className="flex min-w-[10rem] flex-1 flex-wrap items-center justify-end gap-1.5">{enLinea}</div>
          : <span className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground">{resumen}</span>}
        <ChevronDown
          aria-hidden
          className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', !enLinea || !abierto ? 'ml-auto' : '', abierto && 'rotate-180')}
        />
      </div>
      {abierto && (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-2">
          {children}
          {onSiguiente && (
            <div className="mt-3 flex justify-end">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onSiguiente}
                className="border-primary text-primary hover:bg-primary/5 hover:text-primary"
              >
                Siguiente
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

const NOMBRE_TIPO: Record<'antes' | 'despues', string> = { antes: 'antes', despues: 'después' }

/** Fotos de hoy en dos grupos, antes y después, cada una con su botón para
 *  quitarla. La cámara abre la cámara o el selector del equipo. */
function FotosSencillas({ historiaId, notaId, fotos }: {
  historiaId: string
  notaId: string | null
  fotos: NotaClinica['fotos']
}) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [tipo, setTipo] = useState<TipoFoto>('antes')
  const [quitando, setQuitando] = useState<NotaClinica['fotos'][number] | null>(null)
  // Con la atención abierta, quien sube fotos también puede quitarlas (el backend
  // aplica la misma regla).
  const { user } = useAuthStore()
  const puedeQuitar = hasPermission(user, 'historia.fotos.subir') || hasPermission(user, 'historia.fotos.eliminar')

  const refrescar = () => {
    queryClient.invalidateQueries({ queryKey: ['historia', historiaId, 'notas'] })
    queryClient.invalidateQueries({ queryKey: ['galeria', historiaId] })
  }
  const subir = useMutation({
    mutationFn: async ({ archivos, tipo }: { archivos: File[]; tipo: TipoFoto }) => {
      for (const archivo of archivos) {
        const fd = new FormData()
        fd.append('nota', notaId!)
        fd.append('tipo', tipo)
        fd.append('descripcion', '')
        fd.append('archivo', archivo)
        await historiaClinicaApi.fotos.create(fd)
      }
    },
    onSuccess: refrescar,
    onError: (err) => toast.error('No se pudo subir la foto', mensajeDeError(err)),
  })
  const quitar = useMutation({
    mutationFn: (id: string) => historiaClinicaApi.fotos.delete(id),
    onSuccess: () => { setQuitando(null); refrescar() },
    onError: (err) => toast.error('No se pudo quitar la foto', mensajeDeError(err)),
  })

  function abrir(t: TipoFoto) {
    setTipo(t)
    inputRef.current?.click()
  }

  return (
    <div className="grid shrink-0 grid-cols-2 gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const archivos = Array.from(e.target.files ?? [])
          e.target.value = ''
          if (archivos.length) subir.mutate({ archivos, tipo })
        }}
      />
      {(['antes', 'despues'] as const).map((t) => {
        // Las de "durante" (cargadas desde la vista completa) van con las de antes.
        const delTipo = fotos.filter((f) => (t === 'antes' ? f.tipo !== 'despues' : f.tipo === 'despues'))
        const subiendoEste = subir.isPending && subir.variables?.tipo === t
        return (
          <div key={t} className="flex min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5">
            <span className="w-12 shrink-0 text-xs font-medium leading-tight text-muted-foreground">Foto {NOMBRE_TIPO[t]}</span>
            <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden pt-1">
              {delTipo.map((f) => (
                <div key={f.id} className="relative h-10 w-10 shrink-0">
                  <a href={f.url_firmada} target="_blank" rel="noreferrer" title={`Ver foto ${NOMBRE_TIPO[t]}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.url_firmada} alt={`Foto ${NOMBRE_TIPO[t]}`} className="h-10 w-10 rounded-md object-cover" />
                  </a>
                  {puedeQuitar && <button
                    type="button"
                    onClick={() => setQuitando(f)}
                    aria-label="Quitar foto"
                    title="Quitar foto"
                    className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-foreground/80 text-white hover:bg-destructive"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>}
                </div>
              ))}
              <button
                type="button"
                onClick={() => abrir(t)}
                disabled={!notaId || subir.isPending}
                aria-label={`Agregar foto ${NOMBRE_TIPO[t]}`}
                title={`Agregar foto ${NOMBRE_TIPO[t]}`}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-dashed text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
              >
                {subiendoEste ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              </button>
            </div>
          </div>
        )
      })}
      <ConfirmDialog
        open={Boolean(quitando)}
        onOpenChange={(v) => { if (!v) setQuitando(null) }}
        title="Quitar foto"
        description="La foto se borra de esta atención."
        confirmLabel="Quitar"
        variant="destructive"
        loading={quitar.isPending}
        onConfirm={() => quitando && quitar.mutate(quitando.id)}
      />
    </div>
  )
}
