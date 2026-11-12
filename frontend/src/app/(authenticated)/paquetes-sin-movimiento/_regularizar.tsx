'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Undo2 } from 'lucide-react'

import { reportesApi } from '@/lib/api/reportes'
import { mensajeDeError } from '@/lib/errores'
import { cn, formatFechaDMY } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import type {
  EstadoRegularizacion, ModoRegistro, PaqueteSinMovimiento, SesionARegistrar, SesionRegistradaDespues,
} from '@/types/reportes'

type Fila = Omit<SesionARegistrar, 'sesion_id'>

const FILA_VACIA: Fila = { fecha: '', profesional_id: '', modo: 'sesion', nota: '', nota_clinica: '' }

function Modo({ valor, onCambiar, puedeNota }: { valor: ModoRegistro; onCambiar: (m: ModoRegistro) => void; puedeNota: boolean }) {
  const opciones: { valor: ModoRegistro; texto: string }[] = [
    { valor: 'sesion', texto: 'Solo la sesión' },
    { valor: 'nota_clinica', texto: 'Con nota clínica' },
  ]
  return (
    <div className="inline-flex rounded-lg bg-gray-100 p-0.5" role="radiogroup" aria-label="Qué registrar">
      {opciones.map((o) => {
        const deshabilitada = o.valor === 'nota_clinica' && !puedeNota
        return (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={valor === o.valor}
            disabled={deshabilitada}
            title={deshabilitada ? 'Necesitas permiso para escribir notas clínicas' : undefined}
            onClick={() => onCambiar(o.valor)}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              valor === o.valor ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900',
              deshabilitada && 'cursor-not-allowed opacity-50 hover:text-gray-600',
            )}
          >
            {o.texto}
          </button>
        )
      })}
    </div>
  )
}

function Registrada({
  s, onDeshacer, deshaciendo,
}: {
  s: SesionRegistradaDespues
  onDeshacer: (motivo: string) => void
  deshaciendo: boolean
}) {
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  return (
    <li className="rounded-lg border border-gray-200 px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 leading-tight">
          <p className="text-sm font-medium text-gray-900">
            Sesión {s.posicion} de {s.de} · {s.nombre}
          </p>
          <p className="mt-0.5 text-xs text-gray-600">
            {s.fecha ? formatFechaDMY(s.fecha) : 'Sin fecha'} · {s.profesional_nombre ?? 'Sin profesional'}
            {s.con_nota_clinica && ' · con nota clínica'}
          </p>
          <p className="mt-0.5 text-[11px] text-gray-500">
            Registrada por {s.registrada_por ?? '—'} el {formatFechaDMY(s.registrada_en)}
          </p>
        </div>
        {!abierto && (
          <Button variant="ghost" size="sm" className="h-7 shrink-0 gap-1 px-2 text-xs" onClick={() => setAbierto(true)}>
            <Undo2 className="h-3.5 w-3.5" />
            Deshacer
          </Button>
        )}
      </div>
      {abierto && (
        <div className="mt-2 space-y-2">
          <Input
            autoFocus
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="¿Por qué se deshace? (p. ej. la sesión no se hizo)"
            className="h-8 text-sm"
            maxLength={300}
          />
          {s.con_nota_clinica && (
            <p className="text-[11px] text-gray-500">
              La nota clínica no se borra: en la historia queda otra evolución que anula el registro.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setAbierto(false); setMotivo('') }}>
              Cancelar
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="h-7 text-xs"
              disabled={!motivo.trim() || deshaciendo}
              onClick={() => onDeshacer(motivo.trim())}
            >
              {deshaciendo && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Deshacer registro
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}

function Formulario({ estado, onListo }: { estado: EstadoRegularizacion; onListo: () => void }) {
  const queryClient = useQueryClient()
  const [filas, setFilas] = useState<Record<string, Fila>>({})
  const [error, setError] = useState<string | null>(null)
  const elegidas = estado.pendientes.filter((p) => filas[p.id])
  const limite = Math.min(estado.sin_agendar, estado.pendientes.length)
  const lleno = elegidas.length >= limite

  useEffect(() => {
    setFilas({})
    setError(null)
  }, [estado.item_id])

  function refrescar(nuevo: EstadoRegularizacion) {
    queryClient.setQueryData(['reportes', 'regularizar', estado.item_id], nuevo)
    queryClient.invalidateQueries({ queryKey: ['reportes', 'paquetes-sin-movimiento'] })
  }

  const registrar = useMutation({
    mutationFn: () => reportesApi.registrarSesionesPorFuera(
      estado.item_id,
      elegidas.map((p) => {
        const f = filas[p.id]
        return {
          sesion_id: p.id,
          fecha: f.fecha,
          profesional_id: f.profesional_id,
          modo: f.modo,
          ...(f.modo === 'sesion' ? { nota: f.nota?.trim() } : { nota_clinica: f.nota_clinica?.trim() }),
        }
      }),
    ),
    onSuccess: (nuevo) => {
      const n = elegidas.length
      refrescar(nuevo)
      setFilas({})
      setError(null)
      toast({ title: n === 1 ? '1 sesión registrada' : `${n} sesiones registradas`, description: 'Quedaron como hechas por fuera de la app.' })
      if (!nuevo.pendientes.length || !nuevo.sin_agendar) onListo()
    },
    onError: (err) => setError(mensajeDeError(err)),
  })

  const deshacer = useMutation({
    mutationFn: ({ sesion, motivo }: { sesion: string; motivo: string }) =>
      reportesApi.deshacerSesionRegistrada(estado.item_id, sesion, motivo),
    onSuccess: (nuevo) => {
      refrescar(nuevo)
      toast({ title: 'Registro deshecho', description: 'La sesión volvió a quedar pendiente.' })
    },
    onError: (err) => toast({ title: 'No se pudo deshacer', description: mensajeDeError(err), variant: 'destructive' }),
  })

  function alternar(id: string) {
    setError(null)
    setFilas((prev) => {
      if (prev[id]) {
        const { [id]: _, ...resto } = prev
        return resto
      }
      // Lo más común: el mismo profesional y modo que la sesión anterior.
      const anterior = Object.values(prev).at(-1)
      return { ...prev, [id]: { ...FILA_VACIA, profesional_id: anterior?.profesional_id ?? '', modo: anterior?.modo ?? 'sesion' } }
    })
  }

  function cambiar(id: string, cambios: Partial<Fila>) {
    setError(null)
    setFilas((prev) => ({ ...prev, [id]: { ...prev[id], ...cambios } }))
  }

  const incompletas = elegidas.some((p) => {
    const f = filas[p.id]
    return !f.fecha || !f.profesional_id || (f.modo === 'nota_clinica' && !f.nota_clinica?.trim())
  })

  return (
    <>
      <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
        <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-xs leading-relaxed text-gray-600">
          Marca las sesiones que se atendieron sin la app. Quedan como <strong className="font-medium text-gray-800">registradas después</strong>,
          con tu nombre. No crean citas ni cuentan para comisiones, insumos ni ingresos. La fecha va entre
          el {formatFechaDMY(estado.fecha_minima)} ({estado.origen === 'importado' ? 'carga' : 'venta'}) y hoy.
        </div>

        {!estado.pendientes.length ? (
          <p className="text-sm text-gray-600">Este paquete no tiene sesiones pendientes sin cita.</p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-900">Sesiones pendientes</h3>
              <span className="text-xs tabular-nums text-gray-500">{elegidas.length} de {limite}</span>
            </div>
            {estado.sin_agendar < estado.pendientes.length && (
              <p className="text-xs text-amber-700">
                {estado.sin_agendar
                  ? `Solo ${estado.sin_agendar} ${estado.sin_agendar === 1 ? 'está' : 'están'} sin agendar: las demás ya tienen una cita.`
                  : 'Todas las sesiones que faltan ya tienen una cita. Si una no va, cancélala primero.'}
              </p>
            )}
            <ul className="space-y-2">
              {estado.pendientes.map((p) => {
                const f = filas[p.id]
                const bloqueada = !f && lleno
                return (
                  <li key={p.id} className={cn('rounded-lg border px-3 py-2.5', f ? 'border-primary/40 bg-primary/[0.03]' : 'border-gray-200')}>
                    <Checkbox
                      id={`sesion-${p.id}`}
                      checked={!!f}
                      disabled={bloqueada}
                      onChange={() => alternar(p.id)}
                      label={`Sesión ${p.posicion} de ${p.de} · ${p.nombre}`}
                    />
                    {f && (
                      <div className="mt-3 space-y-3 pl-6">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <label htmlFor={`fecha-${p.id}`} className="text-xs font-medium text-muted-foreground">Fecha en que se hizo</label>
                            <Input
                              id={`fecha-${p.id}`}
                              type="date"
                              className="h-9"
                              min={estado.fecha_minima}
                              max={estado.hoy}
                              value={f.fecha}
                              onChange={(e) => cambiar(p.id, { fecha: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Profesional que atendió</label>
                            <Select value={f.profesional_id} onValueChange={(v) => cambiar(p.id, { profesional_id: v })}>
                              <SelectTrigger className="h-9" aria-label="Profesional que atendió"><SelectValue placeholder="Elegir" /></SelectTrigger>
                              <SelectContent>
                                {estado.profesionales.map((u) => (
                                  <SelectItem key={u.id} value={u.id}>{u.nombre}{!u.activo && ' (inactivo)'}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <Modo
                          valor={f.modo}
                          puedeNota={estado.puede_nota_clinica}
                          onCambiar={(modo) => cambiar(p.id, { modo })}
                        />
                        {f.modo === 'sesion' ? (
                          <Input
                            aria-label="Nota corta"
                            value={f.nota}
                            onChange={(e) => cambiar(p.id, { nota: e.target.value })}
                            placeholder="Nota corta (opcional), p. ej. «no se sabe quién atendió»"
                            className="h-9 text-sm"
                            maxLength={500}
                          />
                        ) : (
                          <div className="space-y-1">
                            <Textarea
                              aria-label="Nota clínica"
                              value={f.nota_clinica}
                              onChange={(e) => cambiar(p.id, { nota_clinica: e.target.value })}
                              placeholder="Lo que se hizo y cómo respondió el paciente"
                              rows={3}
                              maxLength={5000}
                            />
                            <p className="text-[11px] text-gray-500">
                              Se guarda como una evolución en la historia, firmada por ti, con la fecha y el profesional que atendió.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {estado.registradas.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">Registradas después</h3>
            <ul className="space-y-2">
              {estado.registradas.map((s) => (
                <Registrada
                  key={s.id}
                  s={s}
                  deshaciendo={deshacer.isPending && deshacer.variables?.sesion === s.id}
                  onDeshacer={(motivo) => deshacer.mutate({ sesion: s.id, motivo })}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
      <SheetFooter className="items-center">
        {error && <p className="mr-auto text-xs text-destructive" role="alert">{error}</p>}
        <Button
          disabled={!elegidas.length || incompletas || registrar.isPending}
          onClick={() => registrar.mutate()}
        >
          {registrar.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          {elegidas.length
            ? (elegidas.length === 1 ? 'Registrar 1 sesión' : `Registrar ${elegidas.length} sesiones`)
            : 'Registrar sesiones'}
        </Button>
      </SheetFooter>
    </>
  )
}

/** Registrar las sesiones de un paquete que se hicieron por fuera de la app. */
export function RegularizarPaquete({ paquete, onClose }: { paquete: PaqueteSinMovimiento | null; onClose: () => void }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['reportes', 'regularizar', paquete?.item_id],
    queryFn: () => reportesApi.regularizacionPaquete(paquete!.item_id),
    enabled: !!paquete,
  })

  return (
    <Sheet open={!!paquete} onOpenChange={(abierto) => !abierto && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-xl">
        <SheetHeader className="pr-12">
          <SheetTitle>Registrar sesiones hechas por fuera</SheetTitle>
          <SheetDescription>
            {paquete ? `${paquete.paciente_nombre} · ${paquete.tratamiento}` : ''}
          </SheetDescription>
        </SheetHeader>
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-gray-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Cargando sesiones…
          </div>
        ) : isError || !data ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-gray-600">
            No pudimos cargar el paquete.
            <Button variant="outline" size="sm" onClick={() => refetch()}>Reintentar</Button>
          </div>
        ) : (
          <Formulario estado={data} onListo={onClose} />
        )}
      </SheetContent>
    </Sheet>
  )
}
