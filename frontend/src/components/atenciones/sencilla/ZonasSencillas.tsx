'use client'

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { History, Loader2, MapPin, Plus, X } from 'lucide-react'
import { historiaClinicaApi } from '@/lib/api/historiaClinica'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { mensajeDeError } from '@/lib/errores'
import { cn, formatFechaLocal } from '@/lib/utils'
import type { AnotacionZona, DiagramaConAnotaciones } from '@/types/historia'

// Zonas de la vista sencilla: un badge por cada diagrama de la clínica (agrupados
// como en Configuración) y, debajo, una vista previa de las zonas de esta
// atención. Tocar un badge o una vista previa abre el dibujo grande en un modal,
// y ahí se marca: tocar el dibujo pone una marca y su × la quita, sin el popover
// de tipo y parámetros de la vista completa. Cada zona de la vista previa tiene su
// × para quitarla. Usa la misma API y la
// misma caché que la pestaña Zonas, así que lo marcado aquí se ve igual en la
// vista completa.

const RADIO = 0.07  // el mismo default del backend

/** Nombres de los diagramas con marcas: el "dónde" que muestra la hoja. */
export function useZonasMarcadas(notaId: string | null) {
  const { data } = useQuery({
    queryKey: ['nota-zonas', notaId],
    queryFn: () => historiaClinicaApi.zonas.get(notaId!),
    enabled: Boolean(notaId),
    staleTime: 30_000,
  })
  if (!data) return []
  const conMarcas = new Set(data.anotaciones.map((a) => a.diagrama))
  return data.diagramas.filter((d) => conMarcas.has(d.id)).map((d) => d.nombre)
}

export function ZonasSencillas({ notaId }: { notaId: string | null }) {
  const qc = useQueryClient()
  const qKey = ['nota-zonas', notaId]
  const [abierto, setAbierto] = useState<string | null>(null)
  const [quitando, setQuitando] = useState<DiagramaConAnotaciones | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: qKey,
    queryFn: () => historiaClinicaApi.zonas.get(notaId!),
    enabled: Boolean(notaId),
    staleTime: 30_000,
  })
  const { data: opciones } = useQuery({
    queryKey: ['nota-zonas-opciones', notaId],
    queryFn: () => historiaClinicaApi.zonas.opciones(notaId!),
    enabled: Boolean(notaId),
    staleTime: 5 * 60_000,
  })

  const agregarMut = useMutation({
    mutationFn: (ids: string[]) => historiaClinicaApi.zonas.agregar(notaId!, ids),
    onSuccess: (zonas) => qc.setQueryData(qKey, zonas),
    onError: (err) => toast.error('No se pudieron agregar las zonas', mensajeDeError(err)),
  })
  // Quitar una zona borra antes sus marcas (el backend solo quita zonas sin marcas).
  const quitarMut = useMutation({
    mutationFn: async (diagramaId: string) => {
      for (const marca of data?.anotaciones.filter((a) => a.diagrama === diagramaId) ?? []) {
        await historiaClinicaApi.zonas.delete(marca.id)
      }
      return historiaClinicaApi.zonas.quitar(notaId!, diagramaId)
    },
    onSuccess: (zonas) => { qc.setQueryData(qKey, zonas); setQuitando(null) },
    onError: (err) => {
      qc.invalidateQueries({ queryKey: qKey })
      toast.error('No se pudo quitar la zona', mensajeDeError(err))
    },
  })

  if (!notaId || isLoading) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-dashed">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const diagramas = data?.diagramas ?? []
  const presentes = new Set(diagramas.map((d) => d.id))
  const marcasDe = (id: string) => data!.anotaciones.filter((a) => a.diagrama === id)
  const anterior = opciones?.anterior
  const faltanDeAnterior = anterior?.diagramas.filter((id) => !presentes.has(id)) ?? []

  // Badges en el orden de los grupos de Configuración (sin sus títulos); lo que no
  // está en un grupo va al final.
  const porId = new Map([...(opciones?.diagramas ?? []), ...diagramas].map((d) => [d.id, d]))
  const vistos = new Set<string>()
  const grupos = (opciones?.grupos ?? []).map((g) => ({
    nombre: g.nombre,
    diagramas: g.diagramas.filter((id) => porId.has(id) && !vistos.has(id) && vistos.add(id)).map((id) => porId.get(id)!),
  })).filter((g) => g.diagramas.length > 0)
  const sueltos = [...porId.values()].filter((d) => !vistos.has(d.id))
  if (sueltos.length) grupos.push({ nombre: grupos.length ? 'Otras' : '', diagramas: sueltos })

  // Tocar un badge abre su dibujo; si la zona no estaba en la atención, se agrega antes.
  function abrir(d: DiagramaConAnotaciones) {
    if (presentes.has(d.id)) setAbierto(d.id)
    else agregarMut.mutate([d.id], { onSuccess: () => setAbierto(d.id) })
  }
  const diagramaAbierto = abierto ? porId.get(abierto) : undefined

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {faltanDeAnterior.length > 0 && anterior && (
          <button
            type="button"
            disabled={agregarMut.isPending}
            onClick={() => agregarMut.mutate(faltanDeAnterior)}
            className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
          >
            <History className="h-3 w-3" />
            Como el {formatFechaLocal(anterior.fecha, { day: 'numeric', month: 'short' })}
          </button>
        )}
        {grupos.map((g) => (
          <span key={g.nombre || 'todas'} className="contents">
            {g.diagramas.map((d) => {
              const presente = presentes.has(d.id)
              const marcas = presente ? marcasDe(d.id).length : 0
              return (
                <button
                  key={d.id}
                  type="button"
                  disabled={agregarMut.isPending}
                  onClick={() => abrir(d)}
                  title={presente ? `Ver o cambiar las marcas de ${d.nombre}` : `Marcar en ${d.nombre}`}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-50',
                    presente
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-dashed text-muted-foreground hover:border-primary hover:text-primary',
                  )}
                >
                  {!presente && <Plus className="h-3 w-3" />}
                  {d.nombre}
                  {presente && <span className="rounded-full bg-white/25 px-1 tabular-nums">{marcas}</span>}
                </button>
              )
            })}
          </span>
        ))}
      </div>

      {diagramas.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-8 text-center">
          <MapPin className="h-7 w-7 text-muted-foreground/30" />
          <p className="px-4 text-sm text-muted-foreground">Toca arriba la zona que trabajaste para marcarla en su dibujo.</p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2">
          {diagramas.map((d) => {
            const marcas = marcasDe(d.id)
            const conDetalle = marcas.some(tieneDetalle)
            return (
              <div key={d.id} className="relative">
                <button
                  type="button"
                  onClick={() => setAbierto(d.id)}
                  title={`Ver o cambiar las marcas de ${d.nombre}`}
                  className="flex w-full flex-col gap-1 rounded-lg border bg-white p-1.5 text-left transition-colors hover:border-primary"
                >
                  <span className="flex items-center gap-1 pr-5 text-xs font-medium text-muted-foreground">
                    <span className="truncate">{d.nombre}</span>
                    <span
                      title={`${marcas.length} ${marcas.length === 1 ? 'marca' : 'marcas'}`}
                      className={cn(
                        'shrink-0 rounded-full px-1.5 tabular-nums',
                        marcas.length ? 'bg-primary/10 text-primary' : 'bg-muted',
                      )}
                    >
                      {marcas.length}
                    </span>
                  </span>
                  <div className="h-28">
                    <Diagrama notaId={notaId} diagrama={d} marcas={marcas} soloLectura />
                  </div>
                </button>
                {!conDetalle && (
                  <button
                    type="button"
                    onClick={() => (marcas.length ? setQuitando(d) : quitarMut.mutate(d.id))}
                    disabled={quitarMut.isPending}
                    aria-label={`Quitar ${d.nombre}`}
                    title={`Quitar ${d.nombre}`}
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-foreground/80 text-white transition-colors hover:bg-destructive disabled:opacity-50"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Dialog open={Boolean(diagramaAbierto)} onOpenChange={(v) => { if (!v) setAbierto(null) }}>
        <DialogContent className="flex max-h-[92vh] max-w-3xl flex-col gap-3">
          {diagramaAbierto && (
            <>
              <DialogHeader>
                <DialogTitle>{diagramaAbierto.nombre}</DialogTitle>
                <DialogDescription>
                  Toca el dibujo en cada punto donde aplicaste el tratamiento. Para quitar una marca, toca su ×.
                </DialogDescription>
              </DialogHeader>
              <div className="h-[62vh] min-h-0">
                <Diagrama notaId={notaId} diagrama={diagramaAbierto} marcas={marcasDe(diagramaAbierto.id)} />
              </div>
              <DialogFooter className="items-center gap-2 sm:justify-between">
                <span className="text-sm text-muted-foreground">
                  {marcasDe(diagramaAbierto.id).length} {marcasDe(diagramaAbierto.id).length === 1 ? 'marca' : 'marcas'}
                </span>
                <Button onClick={() => setAbierto(null)}>Listo</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(quitando)}
        onOpenChange={(v) => { if (!v) setQuitando(null) }}
        title={`Quitar ${quitando?.nombre ?? 'la zona'}`}
        description={quitando ? `Se borran sus ${marcasDe(quitando.id).length} marcas de esta atención.` : undefined}
        confirmLabel="Quitar"
        variant="destructive"
        loading={quitarMut.isPending}
        onConfirm={() => quitando && quitarMut.mutate(quitando.id)}
      />
    </div>
  )
}

/** Una marca con tipo, parámetros o texto viene de la vista completa: aquí no se
 *  borra, para no perder ese detalle por accidente. */
function tieneDetalle(m: AnotacionZona) {
  return Boolean(m.tipo_aplicacion || m.texto || Object.keys(m.parametros ?? {}).length)
}

function Diagrama({
  notaId, diagrama, marcas, soloLectura = false,
}: {
  notaId: string
  diagrama: DiagramaConAnotaciones
  marcas: AnotacionZona[]
  /** Vista previa: se ve el dibujo con sus marcas, pero no se marca ahí. */
  soloLectura?: boolean
}) {
  const qc = useQueryClient()
  const qKey = ['nota-zonas', notaId]
  const marcoRef = useRef<HTMLDivElement>(null)
  const [marco, setMarco] = useState({ ancho: 0, alto: 0 })
  const [proporcion, setProporcion] = useState(1)  // ancho / alto de la imagen

  // La imagen se ajusta al espacio disponible sin deformarse; las marcas se
  // ubican sobre la caja que realmente ocupa.
  useEffect(() => {
    const el = marcoRef.current
    if (!el) return
    const observer = new ResizeObserver(([e]) => setMarco({ ancho: e.contentRect.width, alto: e.contentRect.height }))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const ancho = Math.min(marco.ancho, marco.alto * proporcion)
  const alto = proporcion ? ancho / proporcion : 0

  const crear = useMutation({
    mutationFn: (pos: { x: number; y: number }) => historiaClinicaApi.zonas.create({
      nota: notaId, diagrama: diagrama.id, ...pos, radio: RADIO, texto: '', tipo_aplicacion: '', parametros: {},
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qKey }),
    onError: (err) => toast.error('No se pudo marcar la zona', mensajeDeError(err)),
  })
  const borrar = useMutation({
    mutationFn: (id: string) => historiaClinicaApi.zonas.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qKey }),
    onError: (err) => toast.error('No se pudo quitar la marca', mensajeDeError(err)),
  })

  function marcar(e: React.MouseEvent<HTMLDivElement>) {
    if (soloLectura) return
    const rect = e.currentTarget.getBoundingClientRect()
    crear.mutate({
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    })
  }

  return (
    <div ref={marcoRef} className="flex h-full min-h-0 items-center justify-center">
      <div
        className={cn('relative select-none', !soloLectura && 'cursor-crosshair')}
        style={{ width: ancho, height: alto }}
        onClick={marcar}
      >
        {diagrama.imagen_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={diagrama.imagen_url}
            alt={soloLectura ? `${diagrama.nombre} (vista previa)` : diagrama.nombre}
            draggable={false}
            className="pointer-events-none h-full w-full"
            onLoad={(e) => {
              const img = e.currentTarget
              if (img.naturalWidth && img.naturalHeight) setProporcion(img.naturalWidth / img.naturalHeight)
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted">
            <MapPin className="h-8 w-8 text-muted-foreground/30" />
          </div>
        )}
        {marcas.map((m) => {
          const estilo = {
            left: `${m.x * 100}%`,
            top: `${m.y * 100}%`,
            width: m.radio * 2 * ancho,
            height: m.radio * 2 * ancho,
            transform: 'translate(-50%, -50%)',
          }
          return (
            <span key={m.id} className="pointer-events-none absolute rounded-full border-2 border-primary bg-primary/25" style={estilo}>
              {!soloLectura && !tieneDetalle(m) && (
                <button
                  type="button"
                  aria-label="Quitar marca"
                  title="Quitar marca"
                  onClick={(e) => { e.stopPropagation(); borrar.mutate(m.id) }}
                  className="pointer-events-auto absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-foreground/85 text-white shadow transition-colors hover:bg-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          )
        })}
      </div>
    </div>
  )
}
