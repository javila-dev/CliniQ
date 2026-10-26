'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { protocolosApi } from '@/lib/api/protocolos'
import { clinicasApi } from '@/lib/api/clinicas'
import { AlertTriangle, Clock, Play, ShieldX, ShieldCheck, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { agendaApi } from '@/lib/api/agenda'
import { useAuthStore } from '@/store/authStore'
import { canIniciarAtencion, hasPermission, PERM } from '@/lib/permissions'
import { formatTime } from '@/lib/utils'
import { mensajeErrorDeuda } from '@/lib/deuda'
import { toast } from '@/hooks/use-toast'
import { mensajeDeError } from '@/lib/errores'
import type { Cita } from '@/types/agenda'
import { estadoOperativo, listaDePasos, progresoRecepcion } from '@/lib/recepcion'
import { EnlaceCambiarPasos, EtiquetaEstadoOperativo } from './EstadoPreparacion'
import {
  FirmaProfesionalModal,
  citaRequiereFirmaProfesional,
  esErrorFirmaProfesional,
} from '@/components/atenciones/FirmaProfesionalModal'

interface ColaEsperaProps {
  citas: Cita[]
  citaActiva?: Cita
}

function ConsentimientoBadge({ cita, todosFirmadosOverride }: { cita: Cita; todosFirmadosOverride?: boolean }) {
  const info = cita.consentimiento_info
  if (!info || info.consentimientos.length === 0) return null
  const todosOk = todosFirmadosOverride ?? info.todos_firmados
  return todosOk
    ? <span title="Consentimientos al día"><ShieldCheck className="h-3.5 w-3.5 text-green-500 shrink-0" /></span>
    : <span title="Consentimiento(s) pendiente(s)"><ShieldX className="h-3.5 w-3.5 text-amber-500 shrink-0" /></span>
}

export function ColaEspera({ citas, citaActiva }: ColaEsperaProps) {
  const { user } = useAuthStore()
  const router = useRouter()
  const queryClient = useQueryClient()
  const puedeIniciarAtencion = canIniciarAtencion(user)

  const { data: wizardConfig } = useQuery({
    queryKey: ['wizard-config'],
    queryFn: () => clinicasApi.wizardConfig.get(),
  })

  const [bloqueoPorActiva, setBloqueoPorActiva] = useState<Cita | null>(null)
  const [iniciandoCitaId, setIniciandoCitaId] = useState<string | null>(null)

  const puedeCambiarPasos = hasPermission(user, PERM.CLINICAS_EDITAR)

  // Pasos de recepción de cada cita: los mismos que exige el backend para iniciar.
  function progresoDe(cita: Cita) {
    return progresoRecepcion(cita, wizardConfig)
  }

  const [firmaProfesionalCita, setFirmaProfesionalCita] = useState<Cita | null>(null)

  async function iniciar(cita: Cita) {
    setIniciandoCitaId(cita.id)
    try {
      if (cita.estado === 'en_espera') {
        await agendaApi.citas.cambiarEstado(cita.id, { estado: 'en_curso' })
        // Sin esto la atención abre con la cita guardada en caché, todavía "en espera".
        await queryClient.invalidateQueries({ queryKey: ['citas'] })
      }
      router.push(`/atenciones/${cita.id}`)
    } catch (err) {
      setIniciandoCitaId(null)
      // El paciente ya firmó y falta la firma del profesional (mismo documento).
      if (esErrorFirmaProfesional(err)) {
        setFirmaProfesionalCita(cita)
        return
      }
      // La cita pudo cambiar en otra pantalla: se vuelve a cargar la cola.
      queryClient.invalidateQueries({ queryKey: ['citas'] })
      const deuda = mensajeErrorDeuda(err)
      if (deuda) {
        toast.error('Atención bloqueada por mora', deuda)
        return
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (err as any)?.response?.data ?? {}
      if (data.code === 'CONSENTIMIENTO_REQUERIDO') {
        toast.error('Consentimientos pendientes', `Falta firmar: ${(data.pendientes ?? []).join(', ')}`)
      } else if (data.code === 'PASOS_RECEPCION_PENDIENTES') {
        toast.error('Falta preparar al paciente', `Falta: ${(data.pendientes ?? []).join(', ')}. Lo completa recepción.`)
      } else {
        // Antes los demás errores no mostraban nada y el botón solo se apagaba (AG-08).
        toast.error('No se pudo iniciar la atención', mensajeDeError(err, 'Revisa el estado de la cita.'))
      }
    }
  }

  function handleIniciar(cita: Cita) {
    if (citaActiva) {
      setBloqueoPorActiva(cita)
      return
    }
    if (cita.estado === 'en_espera' && citaRequiereFirmaProfesional(cita)) {
      setFirmaProfesionalCita(cita)
      return
    }
    iniciar(cita)
  }

  // Antes de cualquier return: un hook después del "cola vacía" rompía la
  // pantalla al llegar el primer paciente (cambia el número de hooks).
  // H30 workaround: cuando la primera cita en espera tiene sesión pre-vinculada,
  // consultamos sus consentimientos específicos en lugar de confiar solo en consentimiento_info
  const siguienteCitaEnEspera = !citaActiva ? citas.find((c) => c.estado === 'en_espera') : undefined
  const siguienteSesionId = siguienteCitaEnEspera?.sesion_ejecutada_id ?? null

  const { data: sesionConsentData } = useQuery({
    queryKey: ['sesion-consents-cola', siguienteSesionId, siguienteCitaEnEspera?.id],
    queryFn: () => protocolosApi.sesionesEjecutadas.getConsentimientos(siguienteSesionId!, siguienteCitaEnEspera?.id),
    enabled: Boolean(siguienteSesionId),
  })

  if (!citas.length) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Cola de espera</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No hay más pacientes en la agenda de hoy
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Cola de espera</CardTitle>
            <Badge variant="secondary" className="tabular-nums">{citas.length}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {citas.map((cita, idx) => {
            // "El siguiente" es el primero que ya llegó (en espera), no la fila 0:
            // si el de las 9:00 no ha llegado, el de las 9:30 se puede atender (AG-04).
            const esElSiguiente = siguienteCitaEnEspera ? cita.id === siguienteCitaEnEspera.id : idx === 0
            const enEspera = cita.estado === 'en_espera'
            // Si la cita tiene sesión pre-vinculada (H30) y tenemos datos de esa sesión,
            // usamos puede_ejecutar como fuente de verdad; si no, usamos consentimiento_info
            const usaSesionConsent = Boolean(cita.sesion_ejecutada_id && cita.id === siguienteCitaEnEspera?.id && sesionConsentData)
            const todosFirmadosOverride = usaSesionConsent ? sesionConsentData!.puede_ejecutar : undefined
            const puedeContinuar = enEspera && esElSiguiente
            const progreso = progresoDe(cita)
            const listaPara = puedeIniciarAtencion && progreso.listo
            // El bloqueo se explica en la fila, no en un tooltip.
            const bloqueada = puedeContinuar && puedeIniciarAtencion && !progreso.listo
            const iniciando = iniciandoCitaId === cita.id

            return (
              <div
                key={cita.id}
                className={`rounded-lg px-3 py-2.5 transition-colors ${
                  esElSiguiente
                    ? 'bg-rose-50 border border-rose-200/70'
                    : 'bg-muted/30 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold shrink-0 ${
                    esElSiguiente ? 'bg-rose-100 text-rose-600' : 'bg-muted text-muted-foreground'
                  }`}>
                    {idx + 1}
                  </div>

                  <div className="flex items-center gap-1 text-muted-foreground shrink-0 w-12">
                    <Clock className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">{formatTime(cita.fecha_inicio)}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className={`text-sm font-medium truncate ${esElSiguiente ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {cita.paciente_nombre}
                      </p>
                      <ConsentimientoBadge cita={cita} todosFirmadosOverride={todosFirmadosOverride} />
                    </div>
                    <p className="text-xs text-muted-foreground truncate uppercase">{cita.servicio_nombre}</p>
                  </div>

                  {puedeContinuar && puedeIniciarAtencion ? (
                    <Button
                      size="sm"
                      className="shrink-0 h-7 text-xs"
                      disabled={iniciando || !listaPara}
                      onClick={() => handleIniciar(cita)}
                    >
                      {iniciando
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <><Play className="h-3 w-3 mr-1" />Iniciar</>
                      }
                    </Button>
                  ) : (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <EtiquetaEstadoOperativo estado={estadoOperativo(cita, progreso)} />
                    </div>
                  )}
                </div>

                {/* Por qué no se puede iniciar, en la fila y no en un tooltip. */}
                {bloqueada && (
                  <div className="mt-2 border-t border-rose-200/70 pt-2 text-xs leading-snug">
                    <p className="text-amber-700">
                      Falta {listaDePasos(progreso.faltan)}. Lo completa recepción con Preparar paciente.
                    </p>
                    {puedeCambiarPasos && <EnlaceCambiarPasos className="mt-1" />}
                  </div>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Dialog: atención activa sin cerrar */}
      <Dialog open={!!bloqueoPorActiva} onOpenChange={(open) => !open && setBloqueoPorActiva(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Atención activa sin cerrar
            </DialogTitle>
            <DialogDescription className="pt-1">
              Tienes una atención en curso con{' '}
              <span className="font-medium text-foreground">{citaActiva?.paciente_nombre}</span>.
              Debes completarla antes de iniciar una nueva.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setBloqueoPorActiva(null)}>Cancelar</Button>
            <Button asChild onClick={() => setBloqueoPorActiva(null)}>
              <Link href={`/atenciones/${citaActiva?.id}`}>Ir a la atención activa</Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FirmaProfesionalModal
        citaId={firmaProfesionalCita?.id ?? null}
        pacienteNombre={firmaProfesionalCita?.paciente_nombre}
        onClose={() => setFirmaProfesionalCita(null)}
        onFirmado={() => {
          const cita = firmaProfesionalCita
          setFirmaProfesionalCita(null)
          if (cita) iniciar(cita)
        }}
      />
    </>
  )
}
