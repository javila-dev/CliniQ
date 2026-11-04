'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight, Check, CheckCircle2 } from 'lucide-react'

import { adminApi } from '@/lib/api/admin'
import { toast } from '@/hooks/use-toast'
import { mensajeDeError } from '@/lib/errores'
import { cn, formatDate, formatDateTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import type {
  AdminTenant, AsignacionAtencion, CorreccionMigradoPrevisualizacion, CorreccionMigradoRequest, SoporteAtencionPaquete,
  SoporteCargaMigrada, SoportePaciente, SoporteTratamientoCatalogo, TratamientoMigradoRequest,
} from '@/types/admin'

import {
  BuscarClinica, BuscarPaciente, CampoMotivo, CorreccionesRecientes, EncabezadoHerramienta, MOTIVO_MINIMO, Opcion,
  Paso, resumenPaciente,
} from '../_componentes'

const sesionesTexto = (n: number) => `${n} ${n === 1 ? 'sesión' : 'sesiones'}`

const ESTADO_ATENCION: Record<string, string> = {
  completada: 'Hecha',
  en_curso: 'En curso',
}

function estadoAtencion(estado: string): string {
  return ESTADO_ATENCION[estado] ?? 'Agendada'
}

function describirAtencion(a: SoporteAtencionPaquete): string {
  return `${formatDateTime(a.fecha_inicio)} · ${a.servicio_nombre} · ${a.profesional_nombre ?? 'Sin profesional'}`
}

function resumenCarga(c: SoporteCargaMigrada): string {
  return `${c.descripcion} · ${c.previas} de ${c.total} hechas antes de CliniQ`
}

function ElegirCarga({
  clinicaId, pacienteId, onSelect,
}: { clinicaId: string; pacienteId: string; onSelect: (c: SoporteCargaMigrada) => void }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['soporte-cargas-migradas', clinicaId, pacienteId],
    queryFn: () => adminApi.soporte.cargasMigradas(clinicaId, pacienteId),
  })
  if (isLoading) return <LoadingState />
  if (isError) return <ErrorState onRetry={refetch} />
  if (!data?.length) {
    return <p className="text-sm text-muted-foreground">Este paciente no tiene paquetes cargados en la puesta en marcha.</p>
  }
  return (
    <div className="space-y-1">
      {data.map((c) => {
        const detalle = (
          <>
            <div className="flex flex-wrap items-center gap-x-2">
              <span className="font-medium">{c.descripcion}</span>
              <span>· {c.previas} de {c.total} hechas antes de CliniQ</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Cargado el {formatDate(c.cargado_en)}{c.cargado_por && ` por ${c.cargado_por}`}
              {c.nota && ` · ${c.nota}`}
            </p>
          </>
        )
        // Con atenciones en la app ya no se corrigen las previas, pero sí el tratamiento.
        if (c.bloqueo && c.bloqueo_tratamiento) {
          return (
            <div key={c.item_id} className="rounded-md border px-3 py-2 text-sm opacity-70">
              {detalle}
              <p className="mt-1 text-xs text-destructive">{c.bloqueo_tratamiento}</p>
            </div>
          )
        }
        return (
          <Opcion key={c.item_id} seleccionada={false} onSelect={() => onSelect(c)}>
            {detalle}
            {c.bloqueo && (
              <p className="mt-1 text-xs text-muted-foreground">
                {sesionesTexto(c.atenciones.length)} en la app: solo se puede cambiar el tratamiento.
              </p>
            )}
          </Opcion>
        )
      })}
    </div>
  )
}

/** El tratamiento nuevo mientras se edita: del catálogo o libre. */
interface TratamientoNuevo {
  tipo: 'tratamiento' | 'libre'
  tratamiento: string
  descripcion: string
  numSesiones: string
}

function CambiarTratamiento({
  tratamientos, valor, onChange,
}: { tratamientos: SoporteTratamientoCatalogo[] | undefined; valor: TratamientoNuevo; onChange: (v: TratamientoNuevo) => void }) {
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex gap-2">
        <Button size="sm" variant={valor.tipo === 'tratamiento' ? 'default' : 'outline'} onClick={() => onChange({ ...valor, tipo: 'tratamiento' })}>
          Del catálogo
        </Button>
        <Button size="sm" variant={valor.tipo === 'libre' ? 'default' : 'outline'} onClick={() => onChange({ ...valor, tipo: 'libre' })}>
          Libre
        </Button>
      </div>
      {valor.tipo === 'tratamiento' ? (
        !tratamientos ? <LoadingState /> : (
          <Select value={valor.tratamiento} onValueChange={(v) => onChange({ ...valor, tratamiento: v })}>
            <SelectTrigger><SelectValue placeholder="Elige el tratamiento" /></SelectTrigger>
            <SelectContent>
              {tratamientos.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.nombre} · {sesionesTexto(t.total_sesiones)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      ) : (
        <div className="flex gap-2">
          <Input
            placeholder="Descripción del tratamiento"
            value={valor.descripcion}
            onChange={(e) => onChange({ ...valor, descripcion: e.target.value })}
          />
          <Input
            type="number"
            min={1}
            placeholder="Sesiones"
            value={valor.numSesiones}
            onChange={(e) => onChange({ ...valor, numSesiones: e.target.value })}
            className="w-28"
          />
        </div>
      )}
    </div>
  )
}

/** Soporte elige a mano a qué sesión exacta del tratamiento nuevo pasa cada atención. */
function AsignarAtenciones({
  atenciones, tratamiento, asignadas, onChange,
}: {
  atenciones: SoporteAtencionPaquete[]
  tratamiento: SoporteTratamientoCatalogo
  asignadas: Record<string, string>
  onChange: (v: Record<string, string>) => void
}) {
  const total = tratamiento.sesiones.length
  return (
    <div className="space-y-2">
      <Label>¿A qué sesión de «{tratamiento.nombre}» pasa cada atención?</Label>
      {atenciones.map((a) => {
        const usadas = new Set(Object.entries(asignadas).filter(([cita]) => cita !== a.cita_id).map(([, clave]) => clave))
        return (
          <div key={a.cita_id} className="space-y-2 rounded-md border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{describirAtencion(a)}</span>
              <Badge variant="secondary">{estadoAtencion(a.estado)}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">
                Hoy: {a.sesion ? `${a.sesion.nombre} #${a.sesion.numero}` : 'sin sesión del protocolo'}
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-[16rem] flex-1">
                <Select value={asignadas[a.cita_id] ?? ''} onValueChange={(v) => onChange({ ...asignadas, [a.cita_id]: v })}>
                  <SelectTrigger><SelectValue placeholder="Elige la sesión" /></SelectTrigger>
                  <SelectContent>
                    {tratamiento.sesiones.map((r, i) => (
                      <SelectItem key={r.clave} value={r.clave} disabled={usadas.has(r.clave)}>
                        Sesión {i + 1} de {total} · {r.nombre} #{r.numero}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** El protocolo tal como queda: la corrección se hace completa en el servidor y se descarta. */
function ProtocoloResultante({ vista }: { vista: CorreccionMigradoPrevisualizacion }) {
  return (
    <div className="space-y-2">
      <Label>Así queda «{vista.descripcion}»</Label>
      <div className="divide-y rounded-lg border text-sm">
        {vista.protocolo.map((s) => (
          <div key={s.id} className={cn('flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2', s.origen === 'atencion' && 'bg-primary/5')}>
            <span className="w-28 shrink-0 font-medium">{s.nombre} #{s.numero}</span>
            <div className="min-w-0 flex-1">
              {s.origen === 'previa' && <span className="text-muted-foreground">Hecha antes de CliniQ</span>}
              {s.origen === 'pendiente' && <span className="text-muted-foreground">Pendiente</span>}
              {s.origen === 'atencion' && s.atencion && (
                <>
                  <span>
                    {estadoAtencion(s.atencion.estado)}: {describirAtencion(s.atencion)}
                  </span>
                  {!!s.consentimientos_faltantes?.length && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Esta sesión pide {s.consentimientos_faltantes.join(', ')} y la atención no lo tiene.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
        {!vista.protocolo.length && (
          <p className="px-3 py-2 text-muted-foreground">Sin protocolo por sesiones: el paquete cuenta {sesionesTexto(vista.total)}.</p>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {sesionesTexto(vista.previas)} antes de CliniQ · {vista.restantes} libres para agendar.
      </p>
    </div>
  )
}

function CorregirPaquete({
  clinicaId, carga, onListo,
}: { clinicaId: string; carga: SoporteCargaMigrada; onListo: (texto: string) => void }) {
  const queryClient = useQueryClient()
  const conAtenciones = carga.atenciones.length > 0
  const [sesiones, setSesiones] = useState(carga.previas)
  // Con sesiones hechas en la app solo queda cambiar el tratamiento: se abre de una vez.
  const [nuevo, setNuevo] = useState<TratamientoNuevo | null>(
    carga.bloqueo ? { tipo: 'tratamiento', tratamiento: '', descripcion: '', numSesiones: '' } : null,
  )
  const [asignadas, setAsignadas] = useState<Record<string, string>>({})
  const [motivo, setMotivo] = useState('')
  const [confirmando, setConfirmando] = useState(false)

  const { data: tratamientos } = useQuery({
    queryKey: ['soporte-tratamientos-migracion', clinicaId],
    queryFn: () => adminApi.soporte.tratamientosMigracion(clinicaId),
    enabled: !!nuevo,
  })
  const delCatalogo = nuevo?.tipo === 'tratamiento' ? tratamientos?.find((t) => t.id === nuevo.tratamiento) : undefined
  const pedido: TratamientoMigradoRequest | null = !nuevo
    ? null
    : nuevo.tipo === 'tratamiento'
      ? (delCatalogo ? { tipo: 'tratamiento', tratamiento: delCatalogo.id } : null)
      : (nuevo.descripcion.trim() && Number(nuevo.numSesiones) >= 1
        ? { tipo: 'libre', descripcion: nuevo.descripcion.trim(), num_sesiones_total: Number(nuevo.numSesiones) }
        : null)
  const libreConAtenciones = nuevo?.tipo === 'libre' && conAtenciones

  // Con otro tratamiento el paquete se rehace: el total es el del nuevo, y las
  // atenciones de la app ocupan las sesiones que se les eligen.
  const total = !nuevo ? carga.total : (delCatalogo?.total_sesiones ?? (pedido?.tipo === 'libre' ? pedido.num_sesiones_total : 0))
  const maximo = !nuevo ? carga.maximo : Math.max(carga.con_cita, total - carga.atenciones.length)
  const fijar = (n: number) => setSesiones(Math.max(carga.minimo, Math.min(maximo, n)))
  const fueraDeRango = sesiones > maximo
  const asignaciones: AsignacionAtencion[] = carga.atenciones
    .filter((a) => asignadas[a.cita_id])
    .map((a) => ({ cita: a.cita_id, sesion: asignadas[a.cita_id] }))
  const todasAsignadas = !nuevo || asignaciones.length === carga.atenciones.length
  // Las del protocolo que quedan hechas: las previas sin cita, desde la primera.
  const sinCita = sesiones - carga.con_cita
  const cambia = !!pedido || sesiones !== carga.previas
  const datos: CorreccionMigradoRequest = {
    clinica: clinicaId, item: carga.item_id, sesiones, tratamiento: pedido, asignaciones,
  }
  const completo = cambia && (!nuevo || !!pedido) && !libreConAtenciones && todasAsignadas && !fueraDeRango

  const vistaPrevia = useQuery({
    queryKey: ['soporte-correccion-migrado-previa', datos],
    queryFn: () => adminApi.soporte.previsualizarCorreccionMigrado(datos),
    enabled: !!pedido && completo,
    retry: false,
  })
  const listo = completo && (!pedido || !!vistaPrevia.data) && motivo.trim().length >= MOTIVO_MINIMO

  const corregir = useMutation({
    mutationFn: () => adminApi.soporte.corregirSesionesPrevias({ ...datos, motivo: motivo.trim() }),
    onSuccess: () => {
      toast.success('Paquete corregido', 'Quedó con los datos correctos y se registró la corrección.')
      queryClient.invalidateQueries({ queryKey: ['soporte-cargas-migradas'] })
      queryClient.invalidateQueries({ queryKey: ['soporte-correcciones', clinicaId] })
      onListo(`«${vistaPrevia.data?.descripcion ?? carga.descripcion}» quedó con ${sesionesTexto(sesiones)} previas.`)
    },
    onError: (err) => {
      setConfirmando(false)
      toast.error('No se pudo corregir el paquete', mensajeDeError(err))
    },
  })

  const movidas = vistaPrevia.data?.atenciones_movidas ?? []
  const descripcionConfirmacion = pedido
    ? `«${carga.descripcion}» pasa a ser «${vistaPrevia.data?.descripcion}» con ${sesionesTexto(sesiones)} hechas antes de CliniQ.`
      + (movidas.length
        ? ` ${movidas.map((m) => `Atención del ${formatDateTime(m.fecha)}: ${m.de ?? 'sin sesión'} → ${m.a}`).join('. ')}.`
        : '')
      + ' Queda registrado con tu usuario y el motivo.'
    : `«${carga.descripcion}» pasa de ${sesionesTexto(carga.previas)} hechas antes de CliniQ a ${sesionesTexto(sesiones)}. Queda registrado con tu usuario y el motivo.`

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Label>Tratamiento</Label>
          {nuevo ? (
            !carga.bloqueo && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setNuevo(null); setAsignadas({}); setSesiones(carga.previas) }}>
                Dejar el actual
              </Button>
            )
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              disabled={!!carga.bloqueo_tratamiento}
              onClick={() => setNuevo({ tipo: 'tratamiento', tratamiento: '', descripcion: '', numSesiones: '' })}
            >
              Cambiar tratamiento
            </Button>
          )}
        </div>
        <p className="text-sm">
          <span className={cn(nuevo && 'text-muted-foreground line-through')}>{carga.descripcion}</span>
          <span className="text-muted-foreground"> · {sesionesTexto(carga.total)}</span>
        </p>
        {carga.bloqueo && <p className="text-xs text-muted-foreground">{carga.bloqueo} Solo se puede cambiar el tratamiento.</p>}
        {!nuevo && carga.bloqueo_tratamiento && <p className="text-xs text-muted-foreground">{carga.bloqueo_tratamiento}</p>}
        {nuevo && (
          <CambiarTratamiento
            tratamientos={tratamientos}
            valor={nuevo}
            onChange={(v) => {
              if (v.tratamiento !== nuevo.tratamiento || v.tipo !== nuevo.tipo) setAsignadas({})
              setNuevo(v)
            }}
          />
        )}
        {libreConAtenciones && (
          <p className="text-xs text-destructive">
            El paquete ya tiene atenciones en la app: elige un tratamiento del catálogo para indicar a qué sesión pasa cada una.
          </p>
        )}
      </div>

      {nuevo && delCatalogo && conAtenciones && (
        <AsignarAtenciones
          atenciones={carga.atenciones}
          tratamiento={delCatalogo}
          asignadas={asignadas}
          onChange={setAsignadas}
        />
      )}

      {(!nuevo || (pedido && !libreConAtenciones)) && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <Label>Sesiones hechas antes de CliniQ</Label>
            <span className="text-muted-foreground">{sesiones} de {total}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Input
              type="number"
              min={carga.minimo}
              max={maximo}
              value={sesiones}
              onChange={(e) => fijar(Number(e.target.value) || 0)}
              className="h-8 w-20"
            />
            <span className="text-muted-foreground">
              entre {carga.minimo} y {maximo}
              {nuevo && conAtenciones && ` (${sesionesTexto(carga.atenciones.length)} en la app ocupan el resto)`}
            </span>
          </div>
          {fueraDeRango && (
            <p className="text-xs text-destructive">El tratamiento nuevo no alcanza para {sesionesTexto(sesiones)} previas: bájalas.</p>
          )}
          {carga.con_cita > 0 && (
            <p className="text-xs text-muted-foreground">
              {sesionesTexto(carga.con_cita)} se cargaron con cita y profesional: cuentan siempre y no se cambian.
            </p>
          )}
          {!nuevo && conAtenciones && (
            <p className="text-xs text-muted-foreground">
              {carga.atenciones.length === 1 ? 'Hay 1 cita agendada' : `Hay ${carga.atenciones.length} citas agendadas`} en
              la app con este paquete: siguen igual y ocupan su sesión, por eso el máximo es {carga.maximo}.
            </p>
          )}
        </div>
      )}

      {/* Mismo tratamiento: se ve qué sesión del protocolo cambia. */}
      {!nuevo && carga.sesiones.length > 0 && (
        <div className="max-h-72 divide-y overflow-y-auto rounded-lg border">
          {carga.sesiones.map((s, i) => {
            const hecha = i < sinCita
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => fijar(carga.con_cita + (sinCita === i + 1 ? i : i + 1))}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-muted/40"
              >
                <span
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                    hecha ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                  )}
                >
                  {hecha && <Check className="h-3 w-3" />}
                </span>
                <span className={cn(!hecha && 'text-muted-foreground')}>{s.nombre} #{s.numero}</span>
                {hecha !== s.previa && (
                  <span className="ml-auto text-xs text-muted-foreground">{hecha ? 'pasa a hecha' : 'vuelve a pendiente'}</span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {!nuevo && cambia && !fueraDeRango && (
        <div className="rounded-md bg-muted/40 p-3 text-sm">
          <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
            <li>Sesiones hechas antes de CliniQ: {carga.previas} → {sesiones}.</li>
            <li>Libres para agendar: {carga.restantes} → {carga.restantes - (sesiones - carga.previas)}.</li>
            {sesiones >= total && <li>El tratamiento queda completo.</li>}
          </ul>
        </div>
      )}

      {pedido && completo && (
        vistaPrevia.isLoading ? <LoadingState /> : vistaPrevia.isError ? (
          <p className="text-sm text-destructive">{mensajeDeError(vistaPrevia.error)}</p>
        ) : vistaPrevia.data && (
          <div className="space-y-2">
            <ProtocoloResultante vista={vistaPrevia.data} />
            <p className="text-xs text-muted-foreground">
              Cambia de «{carga.descripcion}» a «{vistaPrevia.data.descripcion}». El precio, los pagos y la cartera no cambian.
            </p>
          </div>
        )
      )}

      <CampoMotivo value={motivo} onChange={setMotivo} />

      <div className="flex justify-end">
        <Button disabled={!listo || corregir.isPending} onClick={() => setConfirmando(true)}>
          Corregir paquete
        </Button>
      </div>

      <ConfirmDialog
        open={confirmando}
        onOpenChange={setConfirmando}
        title="¿Corregir el paquete migrado?"
        description={descripcionConfirmacion}
        confirmLabel="Sí, corregir"
        loading={corregir.isPending}
        onConfirm={() => corregir.mutate()}
      />
    </div>
  )
}

export default function SesionesPreviasPage() {
  const [clinica, setClinica] = useState<AdminTenant | null>(null)
  const [paciente, setPaciente] = useState<SoportePaciente | null>(null)
  const [carga, setCarga] = useState<SoporteCargaMigrada | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)

  function reiniciarDesde(paso: 1 | 2 | 3) {
    if (paso <= 1) setClinica(null)
    if (paso <= 2) setPaciente(null)
    setCarga(null)
    setHecho(null)
  }

  return (
    <div className="max-w-3xl space-y-4">
      <EncabezadoHerramienta
        titulo="Corregir paquete migrado"
        descripcion="Para un paciente que llegó por la puesta en marcha con otro tratamiento o con mal marcado el número de sesiones que ya había hecho. Las sesiones previas se corrigen mientras no haya hecho ninguna en la app; el tratamiento se puede cambiar después, eligiendo a qué sesión pasa cada atención."
      />

      {hecho && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-800 dark:bg-emerald-950/30">
          <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> {hecho}</p>
          <Button size="sm" variant="outline" onClick={() => reiniciarDesde(2)}>Hacer otra</Button>
        </div>
      )}

      <Paso numero={1} titulo="Clínica" resumen={clinica?.nombre} onCambiar={() => reiniciarDesde(1)}>
        <BuscarClinica onSelect={setClinica} />
      </Paso>

      {clinica && !hecho && (
        <>
          <Paso numero={2} titulo="Paciente" resumen={paciente && resumenPaciente(paciente)} onCambiar={() => reiniciarDesde(2)}>
            <BuscarPaciente clinicaId={clinica.id} onSelect={setPaciente} />
          </Paso>

          {paciente && (
            <Paso numero={3} titulo="Paquete migrado" resumen={carga && resumenCarga(carga)} onCambiar={() => reiniciarDesde(3)}>
              <ElegirCarga clinicaId={clinica.id} pacienteId={paciente.id} onSelect={setCarga} />
            </Paso>
          )}

          {carga && (
            <Paso numero={4} titulo="Tratamiento, sesiones y confirmación">
              <CorregirPaquete
                clinicaId={clinica.id}
                carga={carga}
                onListo={(texto) => setHecho(`${texto} Paciente: ${paciente?.nombre}.`)}
              />
            </Paso>
          )}
        </>
      )}

      {clinica && <CorreccionesRecientes clinicaId={clinica.id} tipo="corregir_sesiones_previas" />}
    </div>
  )
}
