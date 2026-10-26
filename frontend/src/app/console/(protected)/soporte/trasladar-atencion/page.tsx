'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react'

import { adminApi } from '@/lib/api/admin'
import { toast } from '@/hooks/use-toast'
import { mensajeDeError } from '@/lib/errores'
import { formatDateTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import type { AccionCobroTraslado, AdminTenant, SoporteAtencion, SoportePaciente } from '@/types/admin'

import {
  Avisos, BuscarClinica, BuscarPaciente, CampoMotivo, CorreccionesRecientes, ElegirAtencion,
  EncabezadoHerramienta, MOTIVO_MINIMO, Opcion, Paso, describirContenido, pesos, resumenAtencion, resumenPaciente,
} from '../_componentes'

const OPCIONES_COBRO: { value: AccionCobroTraslado; label: string; detalle: string }[] = [
  { value: 'mover', label: 'Pasarlo al paciente correcto', detalle: 'Lo pagó quien realmente se atendió.' },
  { value: 'desligar', label: 'Dejarlo en el paciente original', detalle: 'Se queda como pago suyo, sin la cita.' },
  { value: 'anular', label: 'Anularlo', detalle: 'Se reversan sus pagos. No se puede deshacer.' },
]

function OpcionesTraslado({
  clinicaId, atencionId, destinoId, onListo,
}: { clinicaId: string; atencionId: string; destinoId: string; onListo: () => void }) {
  const queryClient = useQueryClient()
  const { data: previa, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['soporte-traslado-previa', clinicaId, atencionId, destinoId],
    queryFn: () => adminApi.soporte.previsualizarTraslado({ clinica: clinicaId, cita: atencionId, paciente_destino: destinoId }),
  })
  const [paqueteId, setPaqueteId] = useState<string | null>(null)
  const [sesionId, setSesionId] = useState<string | null>(null)
  const [accionCobro, setAccionCobro] = useState<AccionCobroTraslado | null>(null)
  const [revisado, setRevisado] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [confirmando, setConfirmando] = useState(false)

  // Sugerencia inicial: el paquete de B con la misma sesión que se le descontó a A.
  useEffect(() => {
    if (!previa) return
    const sugerido = previa.paquetes_destino.find((p) => p.sesiones.some((s) => s.misma_sesion)) ?? previa.paquetes_destino[0]
    elegirPaquete(sugerido?.id ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previa])

  function elegirPaquete(id: string | null) {
    setPaqueteId(id)
    const paquete = previa?.paquetes_destino.find((p) => p.id === id)
    const sesion = paquete?.sesiones.find((s) => s.misma_sesion) ?? paquete?.sesiones[0]
    setSesionId(sesion?.id ?? null)
  }

  const trasladar = useMutation({
    mutationFn: () => adminApi.soporte.trasladar({
      clinica: clinicaId,
      cita: atencionId,
      paciente_destino: destinoId,
      item_destino: paqueteId,
      sesion_destino: sesionId,
      accion_cobro: previa?.cobro ? accionCobro : null,
      motivo: motivo.trim(),
    }),
    onSuccess: () => {
      toast.success('Atención trasladada', `Ahora está en la historia de ${previa?.destino.nombre}.`)
      queryClient.invalidateQueries({ queryKey: ['soporte-atenciones'] })
      queryClient.invalidateQueries({ queryKey: ['soporte-correcciones', clinicaId] })
      onListo()
    },
    onError: (err) => {
      setConfirmando(false)
      toast.error('No se pudo trasladar la atención', mensajeDeError(err))
    },
  })

  if (isLoading) return <LoadingState />
  if (isError || !previa) return <ErrorState message={mensajeDeError(error)} onRetry={refetch} />

  const paquete = previa.paquetes_destino.find((p) => p.id === paqueteId)
  const sesion = paquete?.sesiones.find((s) => s.id === sesionId)
  const listo = (!previa.cobro || !!accionCobro)
    && (!paquete || paquete.sesiones.length === 0 || !!sesionId)
    && (previa.avisos.length === 0 || revisado)
    && motivo.trim().length >= MOTIVO_MINIMO

  return (
    <div className="space-y-5">
      <div className="rounded-md bg-muted/40 p-3 text-sm">
        <p className="flex flex-wrap items-center gap-1.5 font-medium">
          {previa.origen.nombre} <ArrowRight className="h-3.5 w-3.5" /> {previa.destino.nombre}
        </p>
        <p className="mt-1 text-muted-foreground">
          {formatDateTime(previa.cita.fecha_inicio)} · {previa.cita.servicio_nombre} · {previa.cita.profesional_nombre ?? 'Sin profesional'}
        </p>
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-muted-foreground">
          <li>Pasan a {previa.destino.nombre}: {describirContenido(previa.contenido)}.</li>
          {previa.sesiones_origen.length > 0 && (
            <li>
              {previa.origen.nombre} recupera {previa.sesiones_origen.map((s) => `${s.nombre} #${s.numero}`).join(', ')}
              {previa.paquete_origen && ` de su paquete «${previa.paquete_origen}»`}: vuelve a quedar pendiente.
            </li>
          )}
        </ul>
      </div>

      <div className="space-y-2">
        <Label>¿En qué paquete de {previa.destino.nombre} cuenta esta atención?</Label>
        {previa.paquetes_destino.map((p) => (
          <Opcion key={p.id} seleccionada={paqueteId === p.id} onSelect={() => elegirPaquete(p.id)}>
            <span className="font-medium">{p.descripcion}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {p.sesiones_restantes} {p.sesiones_restantes === 1 ? 'sesión libre' : 'sesiones libres'}
            </span>
          </Opcion>
        ))}
        <Opcion seleccionada={paqueteId === null} onSelect={() => elegirPaquete(null)}>
          <span className="font-medium">Sin paquete</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {previa.paquetes_destino.length ? 'No se le descuenta ninguna sesión.' : `${previa.destino.nombre} no tiene un paquete de este tratamiento con sesiones libres.`}
          </span>
        </Opcion>
      </div>

      {paquete && paquete.sesiones.length > 0 && (
        <div className="space-y-2">
          <Label>Sesión que se le descuenta</Label>
          {paquete.sesiones.map((s) => (
            <Opcion key={s.id} seleccionada={sesionId === s.id} onSelect={() => setSesionId(s.id)}>
              <span className="font-medium">{s.nombre} #{s.numero}</span>
              {s.misma_sesion && <Badge variant="outline" className="ml-2">La misma que se descontó</Badge>}
            </Opcion>
          ))}
          {sesion?.consentimientos_faltantes && sesion.consentimientos_faltantes.length > 0 && (
            <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {previa.destino.nombre} no tiene firmado: {sesion.consentimientos_faltantes.join(', ')}. La sesión queda
              marcada como completada sin consentimiento, con el motivo del traslado.
            </p>
          )}
        </div>
      )}

      {previa.cobro && (
        <div className="space-y-2">
          <Label>
            La cita tiene un cobro de {pesos.format(Number(previa.cobro.total))}
            {Number(previa.cobro.pagado) > 0 && ` (pagado ${pesos.format(Number(previa.cobro.pagado))})`}. ¿Qué hacemos?
          </Label>
          {OPCIONES_COBRO.map((o) => (
            <Opcion key={o.value} seleccionada={accionCobro === o.value} onSelect={() => setAccionCobro(o.value)}>
              <span className="font-medium">{o.label}</span>
              <span className="ml-2 text-xs text-muted-foreground">{o.detalle}</span>
            </Opcion>
          ))}
          {previa.cobro.cuenta_para_el_plan && accionCobro === 'mover' && (
            <p className="text-xs text-muted-foreground">
              Este pago cuenta para el plan de {previa.origen.nombre}: deja de contar ahí
              {paquete ? ' y pasa al plan elegido.' : ' y queda sin plan.'}
            </p>
          )}
        </div>
      )}

      <Avisos avisos={previa.avisos} revisado={revisado} onRevisado={setRevisado} />
      <CampoMotivo value={motivo} onChange={setMotivo} />

      <div className="flex justify-end">
        <Button disabled={!listo || trasladar.isPending} onClick={() => setConfirmando(true)}>
          Trasladar atención
        </Button>
      </div>

      <ConfirmDialog
        open={confirmando}
        onOpenChange={setConfirmando}
        title="¿Trasladar la atención?"
        description={`La atención del ${formatDateTime(previa.cita.fecha_inicio)} pasa de ${previa.origen.nombre} a ${previa.destino.nombre}. Queda registrado con tu usuario y el motivo.`}
        confirmLabel="Sí, trasladar"
        loading={trasladar.isPending}
        onConfirm={() => trasladar.mutate()}
      />
    </div>
  )
}

export default function TrasladarAtencionPage() {
  const [clinica, setClinica] = useState<AdminTenant | null>(null)
  const [origen, setOrigen] = useState<SoportePaciente | null>(null)
  const [atencion, setAtencion] = useState<SoporteAtencion | null>(null)
  const [destino, setDestino] = useState<SoportePaciente | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)

  function reiniciarDesde(paso: 1 | 2 | 3 | 4) {
    if (paso <= 1) setClinica(null)
    if (paso <= 2) setOrigen(null)
    if (paso <= 3) setAtencion(null)
    setDestino(null)
    setHecho(null)
  }

  return (
    <div className="max-w-3xl space-y-4">
      <EncabezadoHerramienta
        titulo="Trasladar atención"
        descripcion="Para cuando un profesional documentó la atención en el paciente equivocado: la pasa, con todo su contenido, a la historia del paciente que realmente se atendió."
      />

      {hecho && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-800 dark:bg-emerald-950/30">
          <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> {hecho}</p>
          <Button size="sm" variant="outline" onClick={() => reiniciarDesde(2)}>Hacer otro</Button>
        </div>
      )}

      <Paso numero={1} titulo="Clínica" resumen={clinica?.nombre} onCambiar={() => reiniciarDesde(1)}>
        <BuscarClinica onSelect={setClinica} />
      </Paso>

      {clinica && !hecho && (
        <>
          <Paso
            numero={2}
            titulo="Paciente donde quedó la atención por error"
            resumen={origen && resumenPaciente(origen)}
            onCambiar={() => reiniciarDesde(2)}
          >
            <BuscarPaciente clinicaId={clinica.id} onSelect={setOrigen} />
          </Paso>

          {origen && (
            <Paso numero={3} titulo="Atención equivocada" resumen={atencion && resumenAtencion(atencion)} onCambiar={() => reiniciarDesde(3)}>
              <ElegirAtencion clinicaId={clinica.id} pacienteId={origen.id} onSelect={setAtencion} />
            </Paso>
          )}

          {atencion && (
            <Paso
              numero={4}
              titulo="Paciente que realmente se atendió"
              resumen={destino && resumenPaciente(destino)}
              onCambiar={() => reiniciarDesde(4)}
            >
              <BuscarPaciente clinicaId={clinica.id} excluir={origen?.id} onSelect={setDestino} />
            </Paso>
          )}

          {atencion && destino && (
            <Paso numero={5} titulo="Opciones y confirmación">
              <OpcionesTraslado
                clinicaId={clinica.id}
                atencionId={atencion.id}
                destinoId={destino.id}
                onListo={() => setHecho(`La atención quedó en la historia de ${destino.nombre}.`)}
              />
            </Paso>
          )}
        </>
      )}

      {clinica && <CorreccionesRecientes clinicaId={clinica.id} tipo="trasladar_atencion" />}
    </div>
  )
}
