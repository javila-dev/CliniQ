'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'

import { adminApi } from '@/lib/api/admin'
import { toast } from '@/hooks/use-toast'
import { mensajeDeError } from '@/lib/errores'
import { formatDate, formatDateTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import type {
  AdminTenant, AsignacionAtencion, CambioTratamientoRequest, SoportePaciente, SoporteVentaTratamiento,
} from '@/types/admin'

import {
  Avisos, BuscarClinica, BuscarPaciente, CampoMotivo, CorreccionesRecientes, EncabezadoHerramienta, MOTIVO_MINIMO,
  Opcion, Paso, pesos, resumenPaciente,
} from '../_componentes'
import { AsignarAtenciones, ProtocoloResultante, sesionesTexto } from '../_paquete'

function resumenVenta(v: SoporteVentaTratamiento): string {
  return `${v.descripcion} · ${pesos.format(Number(v.valor))}`
}

function ElegirVenta({
  clinicaId, pacienteId, onSelect,
}: { clinicaId: string; pacienteId: string; onSelect: (v: SoporteVentaTratamiento) => void }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['soporte-ventas-tratamiento', clinicaId, pacienteId],
    queryFn: () => adminApi.soporte.ventasTratamiento(clinicaId, pacienteId),
  })
  if (isLoading) return <LoadingState />
  if (isError) return <ErrorState onRetry={refetch} />
  if (!data?.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Este paciente no tiene tratamientos vendidos en una cotización aceptada. Si llegó por la puesta en marcha, usa «Corregir paquete migrado».
      </p>
    )
  }
  return (
    <div className="space-y-1">
      {data.map((v) => {
        const detalle = (
          <>
            <div className="flex flex-wrap items-center gap-x-2">
              <span className="font-medium">{v.descripcion}</span>
              <span>· {sesionesTexto(v.total)} · {pesos.format(Number(v.valor))}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {v.aceptada_en ? `Aceptada el ${formatDate(v.aceptada_en)}` : 'Aceptada'}
              {' · '}
              {v.atenciones.length ? `${sesionesTexto(v.atenciones.length)} hechas o agendadas` : 'Sin citas todavía'}
            </p>
          </>
        )
        if (v.bloqueo_tratamiento) {
          return (
            <div key={v.item_id} className="rounded-md border px-3 py-2 text-sm opacity-70">
              {detalle}
              <p className="mt-1 text-xs text-destructive">{v.bloqueo_tratamiento}</p>
            </div>
          )
        }
        return (
          <Opcion key={v.item_id} seleccionada={false} onSelect={() => onSelect(v)}>
            {detalle}
          </Opcion>
        )
      })}
    </div>
  )
}

function CambiarTratamiento({
  clinicaId, venta, onListo,
}: { clinicaId: string; venta: SoporteVentaTratamiento; onListo: (texto: string) => void }) {
  const queryClient = useQueryClient()
  const [tratamientoId, setTratamientoId] = useState('')
  const [asignadas, setAsignadas] = useState<Record<string, string>>({})
  const [revisado, setRevisado] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [confirmando, setConfirmando] = useState(false)

  const tratamientos = useQuery({
    queryKey: ['soporte-tratamientos-migracion', clinicaId],
    queryFn: () => adminApi.soporte.tratamientosMigracion(clinicaId),
  })
  const opciones = (tratamientos.data ?? []).filter((t) => t.id !== venta.tratamiento_id)
  const nuevo = opciones.find((t) => t.id === tratamientoId)
  const noAlcanza = !!nuevo && nuevo.sesiones.length < venta.atenciones.length

  const asignaciones: AsignacionAtencion[] = venta.atenciones
    .filter((a) => asignadas[a.cita_id])
    .map((a) => ({ cita: a.cita_id, sesion: asignadas[a.cita_id] }))
  const completo = !!nuevo && !noAlcanza && asignaciones.length === venta.atenciones.length
  const datos: CambioTratamientoRequest = { clinica: clinicaId, item: venta.item_id, tratamiento: tratamientoId, asignaciones }

  const vistaPrevia = useQuery({
    queryKey: ['soporte-cambio-tratamiento-previa', datos],
    queryFn: () => adminApi.soporte.previsualizarCambioTratamiento(datos),
    enabled: completo,
    retry: false,
  })
  const listo = completo && !!vistaPrevia.data
    && (!venta.avisos.length || revisado)
    && motivo.trim().length >= MOTIVO_MINIMO

  const cambiar = useMutation({
    mutationFn: () => adminApi.soporte.cambiarTratamiento({ ...datos, motivo: motivo.trim() }),
    onSuccess: () => {
      toast.success('Tratamiento cambiado', 'La venta quedó con el tratamiento correcto y se registró la corrección.')
      queryClient.invalidateQueries({ queryKey: ['soporte-ventas-tratamiento'] })
      queryClient.invalidateQueries({ queryKey: ['soporte-correcciones', clinicaId] })
      onListo(`«${venta.descripcion}» pasó a «${vistaPrevia.data?.descripcion ?? nuevo?.nombre}».`)
    },
    onError: (err) => {
      setConfirmando(false)
      toast.error('No se pudo cambiar el tratamiento', mensajeDeError(err))
    },
  })

  const movidas = vistaPrevia.data?.atenciones_movidas ?? []
  const cambianServicio = movidas.filter((m) => m.servicio_despues)
  const descripcionConfirmacion = `«${venta.descripcion}» pasa a ser «${vistaPrevia.data?.descripcion}».`
    + (movidas.length
      ? ` ${movidas.map((m) => `Cita del ${formatDateTime(m.fecha)}: ${m.de ?? 'sin sesión'} → ${m.a}`).join('. ')}.`
      : '')
    + ` El valor de la venta (${pesos.format(Number(venta.valor))}) no cambia. Queda registrado con tu usuario y el motivo.`

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label>Tratamiento vendido</Label>
        <p className="text-sm">
          <span className={nuevo ? 'text-muted-foreground line-through' : undefined}>{venta.descripcion}</span>
          <span className="text-muted-foreground"> · {sesionesTexto(venta.total)} · {pesos.format(Number(venta.valor))}</span>
        </p>
      </div>

      <div className="space-y-2">
        <Label>Tratamiento correcto</Label>
        {tratamientos.isLoading ? <LoadingState /> : tratamientos.isError ? <ErrorState onRetry={tratamientos.refetch} /> : (
          <Select
            value={tratamientoId}
            onValueChange={(v) => { setTratamientoId(v); setAsignadas({}) }}
          >
            <SelectTrigger><SelectValue placeholder="Elige el tratamiento del catálogo" /></SelectTrigger>
            <SelectContent>
              {opciones.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.nombre} · {sesionesTexto(t.total_sesiones)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {noAlcanza && (
          <p className="text-xs text-destructive">
            «{nuevo.nombre}» tiene {sesionesTexto(nuevo.sesiones.length)} y la venta ya tiene {sesionesTexto(venta.atenciones.length)} hechas
            o agendadas: no alcanza para todas. Cancela primero las citas que sobran.
          </p>
        )}
      </div>

      {nuevo && !noAlcanza && venta.atenciones.length > 0 && (
        <AsignarAtenciones atenciones={venta.atenciones} tratamiento={nuevo} asignadas={asignadas} onChange={setAsignadas} />
      )}

      {completo && (
        vistaPrevia.isLoading ? <LoadingState /> : vistaPrevia.isError ? (
          <p className="text-sm text-destructive">{mensajeDeError(vistaPrevia.error)}</p>
        ) : vistaPrevia.data && (
          <div className="space-y-3">
            <ProtocoloResultante vista={vistaPrevia.data} conPrevias={false} />
            <div className="rounded-md bg-muted/40 p-3 text-sm">
              <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
                <li>Sesiones del paquete: {venta.total} → {vistaPrevia.data.total}.</li>
                <li>
                  El valor de la venta ({pesos.format(Number(venta.valor))}), los pagos, la cartera y las comisiones no cambian.
                  Si hay diferencia de precio, la clínica la cotiza aparte.
                </li>
                {cambianServicio.map((m) => (
                  <li key={m.cita}>
                    La cita del {formatDateTime(m.fecha)} queda agendada como {m.servicio_despues} (antes {m.servicio_antes}).
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )
      )}

      {nuevo && <Avisos avisos={venta.avisos} revisado={revisado} onRevisado={setRevisado} />}

      <CampoMotivo value={motivo} onChange={setMotivo} />

      <div className="flex justify-end">
        <Button disabled={!listo || cambiar.isPending} onClick={() => setConfirmando(true)}>
          Cambiar tratamiento
        </Button>
      </div>

      <ConfirmDialog
        open={confirmando}
        onOpenChange={setConfirmando}
        title="¿Cambiar el tratamiento de la venta?"
        description={descripcionConfirmacion}
        confirmLabel="Sí, cambiar"
        loading={cambiar.isPending}
        onConfirm={() => cambiar.mutate()}
      />
    </div>
  )
}

export default function CambiarTratamientoPage() {
  const [clinica, setClinica] = useState<AdminTenant | null>(null)
  const [paciente, setPaciente] = useState<SoportePaciente | null>(null)
  const [venta, setVenta] = useState<SoporteVentaTratamiento | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)

  function reiniciarDesde(paso: 1 | 2 | 3) {
    if (paso <= 1) setClinica(null)
    if (paso <= 2) setPaciente(null)
    setVenta(null)
    setHecho(null)
  }

  return (
    <div className="max-w-3xl space-y-4">
      <EncabezadoHerramienta
        titulo="Cambiar tratamiento de una venta"
        descripcion="Se cotizó otro tratamiento, la cotización ya se aceptó y el paciente tiene citas hechas o agendadas. La venta pasa al tratamiento correcto y eliges a qué sesión pasa cada cita; el valor vendido no cambia."
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
            <Paso numero={3} titulo="Venta" resumen={venta && resumenVenta(venta)} onCambiar={() => reiniciarDesde(3)}>
              <ElegirVenta clinicaId={clinica.id} pacienteId={paciente.id} onSelect={setVenta} />
            </Paso>
          )}

          {venta && (
            <Paso numero={4} titulo="Tratamiento correcto y confirmación">
              <CambiarTratamiento
                key={venta.item_id}
                clinicaId={clinica.id}
                venta={venta}
                onListo={(texto) => setHecho(`${texto} Paciente: ${paciente?.nombre}.`)}
              />
            </Paso>
          )}
        </>
      )}

      {clinica && <CorreccionesRecientes clinicaId={clinica.id} tipo="cambiar_tratamiento" />}
    </div>
  )
}
