'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'

import { adminApi } from '@/lib/api/admin'
import { toast } from '@/hooks/use-toast'
import { mensajeDeError } from '@/lib/errores'
import { formatDateTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import type {
  AccionCobroEliminacion, AdminTenant, EstadoCitaEliminacion, SoporteAtencion, SoportePaciente,
} from '@/types/admin'

import {
  Avisos, BuscarClinica, BuscarPaciente, CampoMotivo, CorreccionesRecientes, ElegirAtencion,
  EncabezadoHerramienta, MOTIVO_MINIMO, Opcion, Paso, describirContenido, pesos, resumenAtencion, resumenPaciente,
} from '../_componentes'

const OPCIONES_CITA: { value: EstadoCitaEliminacion; label: string; detalle: string }[] = [
  { value: 'cancelada', label: 'Cancelada', detalle: 'La atención no debió existir: se abrió por error o era una prueba.' },
  { value: 'no_asistio', label: 'No asistió', detalle: 'El paciente no vino; queda en su historial de asistencia.' },
  { value: 'pendiente', label: 'Agendada de nuevo', detalle: 'El paciente sí viene: la cita vuelve a quedar por atender.' },
]

const OPCIONES_COBRO: { value: AccionCobroEliminacion; label: string; detalle: string }[] = [
  { value: 'mantener', label: 'Dejarlo en la cita', detalle: 'Sigue cobrado a esta cita.' },
  { value: 'desligar', label: 'Dejarlo como pago del paciente', detalle: 'Se conserva, pero sin la cita.' },
  { value: 'anular', label: 'Anularlo', detalle: 'Se reversan sus pagos. No se puede deshacer.' },
]

function OpcionesEliminacion({
  clinicaId, atencionId, onListo,
}: { clinicaId: string; atencionId: string; onListo: () => void }) {
  const queryClient = useQueryClient()
  const { data: previa, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['soporte-eliminacion-previa', clinicaId, atencionId],
    queryFn: () => adminApi.soporte.previsualizarEliminacion({ clinica: clinicaId, cita: atencionId }),
  })
  const [estadoCita, setEstadoCita] = useState<EstadoCitaEliminacion | null>(null)
  const [accionCobro, setAccionCobro] = useState<AccionCobroEliminacion | null>(null)
  const [revisado, setRevisado] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [confirmando, setConfirmando] = useState(false)

  const eliminar = useMutation({
    mutationFn: () => adminApi.soporte.eliminar({
      clinica: clinicaId,
      cita: atencionId,
      estado_cita: estadoCita!,
      accion_cobro: previa?.cobro ? accionCobro : null,
      motivo: motivo.trim(),
    }),
    onSuccess: () => {
      toast.success('Atención eliminada', 'Se quitó de la historia y quedó registrada la corrección.')
      queryClient.invalidateQueries({ queryKey: ['soporte-atenciones'] })
      queryClient.invalidateQueries({ queryKey: ['soporte-correcciones', clinicaId] })
      onListo()
    },
    onError: (err) => {
      setConfirmando(false)
      toast.error('No se pudo eliminar la atención', mensajeDeError(err))
    },
  })

  if (isLoading) return <LoadingState />
  if (isError || !previa) return <ErrorState message={mensajeDeError(error)} onRetry={refetch} />

  const cupo = previa.paquete && estadoCita
    ? (estadoCita === 'pendiente' ? previa.paquete.pendiente : previa.paquete.cancelada)
    : null
  const listo = !!estadoCita
    && (!previa.cobro || !!accionCobro)
    && (previa.avisos.length === 0 || revisado)
    && motivo.trim().length >= MOTIVO_MINIMO

  return (
    <div className="space-y-5">
      <div className="rounded-md bg-muted/40 p-3 text-sm">
        <p className="font-medium">{previa.paciente.nombre}</p>
        <p className="mt-1 text-muted-foreground">
          {formatDateTime(previa.cita.fecha_inicio)} · {previa.cita.servicio_nombre} · {previa.cita.profesional_nombre ?? 'Sin profesional'}
        </p>
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-muted-foreground">
          <li>Se borra de la historia: {describirContenido(previa.contenido)}. Queda una copia en el registro de la corrección.</li>
          {previa.contenido.insumos > 0 && <li>Los insumos registrados vuelven al stock.</li>}
          {previa.sesiones.length > 0 && (
            <li>
              {previa.sesiones.map((s) => `${s.nombre} #${s.numero}`).join(', ')} vuelve a quedar pendiente.
            </li>
          )}
        </ul>
      </div>

      <div className="space-y-2">
        <Label>¿Cómo queda la cita?</Label>
        {OPCIONES_CITA.map((o) => (
          <Opcion key={o.value} seleccionada={estadoCita === o.value} onSelect={() => setEstadoCita(o.value)}>
            <span className="font-medium">{o.label}</span>
            <span className="ml-2 text-xs text-muted-foreground">{o.detalle}</span>
          </Opcion>
        ))}
        {cupo && (
          <p className="text-xs text-muted-foreground">
            Paquete «{cupo.descripcion}»: {cupo.restantes_antes} {cupo.restantes_antes === 1 ? 'sesión libre' : 'sesiones libres'}
            {cupo.restantes_despues !== cupo.restantes_antes
              ? ` → ${cupo.restantes_despues} al eliminar.`
              : '; la cita sigue ocupando su sesión hasta que se atienda.'}
          </p>
        )}
      </div>

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
          {previa.cobro.cuenta_para_el_plan && accionCobro === 'anular' && (
            <p className="text-xs text-muted-foreground">
              Este pago es un abono al plan del paquete: al anularlo, el plan vuelve a tener ese saldo pendiente.
            </p>
          )}
        </div>
      )}

      <Avisos avisos={previa.avisos} revisado={revisado} onRevisado={setRevisado} />
      <CampoMotivo value={motivo} onChange={setMotivo} />

      <div className="flex justify-end">
        <Button variant="destructive" disabled={!listo || eliminar.isPending} onClick={() => setConfirmando(true)}>
          Eliminar atención
        </Button>
      </div>

      <ConfirmDialog
        open={confirmando}
        onOpenChange={setConfirmando}
        title="¿Eliminar la atención?"
        description={`Se borra la atención del ${formatDateTime(previa.cita.fecha_inicio)} de ${previa.paciente.nombre}. No se puede deshacer desde la aplicación; queda una copia en el registro con tu usuario y el motivo.`}
        confirmLabel="Sí, eliminar"
        variant="destructive"
        loading={eliminar.isPending}
        onConfirm={() => eliminar.mutate()}
      />
    </div>
  )
}

export default function EliminarAtencionPage() {
  const [clinica, setClinica] = useState<AdminTenant | null>(null)
  const [paciente, setPaciente] = useState<SoportePaciente | null>(null)
  const [atencion, setAtencion] = useState<SoporteAtencion | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)

  function reiniciarDesde(paso: 1 | 2 | 3) {
    if (paso <= 1) setClinica(null)
    if (paso <= 2) setPaciente(null)
    setAtencion(null)
    setHecho(null)
  }

  return (
    <div className="max-w-3xl space-y-4">
      <EncabezadoHerramienta
        titulo="Eliminar atención"
        descripcion="Para una atención que no debió existir: se abrió por error, se documentó dos veces o era una prueba. Quita lo clínico, devuelve insumos y la sesión del paquete, y decide qué pasa con la cita y el cobro."
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
            <Paso numero={3} titulo="Atención a eliminar" resumen={atencion && resumenAtencion(atencion)} onCambiar={() => reiniciarDesde(3)}>
              <ElegirAtencion clinicaId={clinica.id} pacienteId={paciente.id} onSelect={setAtencion} />
            </Paso>
          )}

          {atencion && (
            <Paso numero={4} titulo="Opciones y confirmación">
              <OpcionesEliminacion
                clinicaId={clinica.id}
                atencionId={atencion.id}
                onListo={() => setHecho(`La atención de ${paciente?.nombre} se eliminó.`)}
              />
            </Paso>
          )}
        </>
      )}

      {clinica && <CorreccionesRecientes clinicaId={clinica.id} tipo="eliminar_atencion" />}
    </div>
  )
}
