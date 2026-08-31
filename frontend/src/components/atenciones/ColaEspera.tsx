'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { protocolosApi } from '@/lib/api/protocolos'
import { clinicasApi } from '@/lib/api/clinicas'
import { AlertTriangle, Clock, Play, ShieldX, ShieldCheck, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { CitaStatusBadge } from '@/components/shared/StatusBadge'
import { agendaApi } from '@/lib/api/agenda'
import { useAuthStore } from '@/store/authStore'
import { canIniciarAtencion } from '@/lib/permissions'
import { formatTime } from '@/lib/utils'
import type { Cita } from '@/types/agenda'

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
  const puedeIniciarAtencion = canIniciarAtencion(user)

  const { data: wizardConfig } = useQuery({
    queryKey: ['wizard-config'],
    queryFn: () => clinicasApi.wizardConfig.get(),
  })

  const [bloqueoPorActiva, setBloqueoPorActiva] = useState<Cita | null>(null)
  const [iniciandoCitaId, setIniciandoCitaId] = useState<string | null>(null)

  function isWizardDone(cita: Cita): boolean {
    const consentimientoAplica = (cita.consentimiento_info?.consentimientos?.length ?? 0) > 0
    const doneMap = {
      llegada:        cita.estado !== 'confirmada',
      consentimiento: !consentimientoAplica || Boolean(cita.consentimiento_info?.todos_firmados),
      pago:           cita.item_cotizacion_id != null || cita.cobro_id != null || cita.estado === 'en_curso' || cita.estado === 'completada',
      firma:          cita.firma_asistencia_estado === 'firmada',
    }
    const activeSteps = (['llegada', 'consentimiento', 'pago', 'firma'] as const).filter((step) => {
      if (!wizardConfig) return true
      if (step === 'llegada') return wizardConfig.paso_checkin
      if (step === 'pago')    return wizardConfig.paso_pago
      if (step === 'firma')   return wizardConfig.paso_firma_asistencia
      return true
    })
    return activeSteps.length > 0 && activeSteps.every((s) => doneMap[s])
  }

  async function handleIniciar(cita: Cita) {
    if (citaActiva) {
      setBloqueoPorActiva(cita)
      return
    }
    setIniciandoCitaId(cita.id)
    try {
      if (cita.estado === 'en_espera') {
        await agendaApi.citas.cambiarEstado(cita.id, { estado: 'en_curso' })
      }
      router.push(`/atenciones/${cita.id}`)
    } catch {
      setIniciandoCitaId(null)
    }
  }

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

  // H30 workaround: cuando la primera cita en espera tiene sesión pre-vinculada,
  // consultamos sus consentimientos específicos en lugar de confiar solo en consentimiento_info
  const siguienteCitaEnEspera = !citaActiva ? citas.find((c) => c.estado === 'en_espera') : undefined
  const siguienteSesionId = siguienteCitaEnEspera?.sesion_ejecutada_id ?? null

  const { data: sesionConsentData } = useQuery({
    queryKey: ['sesion-consents-cola', siguienteSesionId],
    queryFn: () => protocolosApi.sesionesEjecutadas.getConsentimientos(siguienteSesionId!),
    enabled: Boolean(siguienteSesionId),
  })

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
            const esElSiguiente = idx === 0
            const enEspera = cita.estado === 'en_espera'
            // Si la cita tiene sesión pre-vinculada (H30) y tenemos datos de esa sesión,
            // usamos puede_ejecutar como fuente de verdad; si no, usamos consentimiento_info
            const usaSesionConsent = Boolean(cita.sesion_ejecutada_id && cita.id === siguienteCitaEnEspera?.id && sesionConsentData)
            const todosFirmadosOverride = usaSesionConsent ? sesionConsentData!.puede_ejecutar : undefined
            const puedeContinuar = enEspera && esElSiguiente
            const listaPara = puedeIniciarAtencion && isWizardDone(cita)
            const iniciando = iniciandoCitaId === cita.id

            return (
              <div
                key={cita.id}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                  esElSiguiente
                    ? 'bg-rose-50 border border-rose-200/70'
                    : 'bg-muted/30 border border-transparent'
                }`}
              >
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
                  <p className="text-xs text-muted-foreground truncate">{cita.servicio_nombre}</p>
                </div>

                {puedeContinuar && puedeIniciarAtencion ? (
                  <Button
                    size="sm"
                    className="shrink-0 h-7 text-xs"
                    disabled={iniciando || !listaPara}
                    title={!listaPara ? 'Recepción debe completar los pasos previos' : undefined}
                    onClick={() => handleIniciar(cita)}
                  >
                    {iniciando
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <><Play className="h-3 w-3 mr-1" />Iniciar</>
                    }
                  </Button>
                ) : (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <CitaStatusBadge estado={cita.estado} />
                    {esElSiguiente && cita.estado === 'confirmada' && (
                      <Badge variant="outline" className="text-[10px] border-amber-200 text-amber-600">Sin llegar</Badge>
                    )}
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
    </>
  )
}
