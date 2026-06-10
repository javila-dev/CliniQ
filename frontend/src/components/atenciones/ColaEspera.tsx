'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { protocolosApi } from '@/lib/api/protocolos'
import { AlertTriangle, Clock, Play, FileSignature, ShieldX, ShieldCheck, ReceiptText } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { CitaStatusBadge } from '@/components/shared/StatusBadge'
import { ConsentimientoFirmaSheet } from './ConsentimientoFirmaSheet'
import { IniciarPagoSheet } from './IniciarPagoSheet'
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

function primerConsentimientoPendiente(cita: Cita) {
  return cita.consentimiento_info?.consentimientos?.find((c) => !c.vigente) ?? null
}

export function ColaEspera({ citas, citaActiva }: ColaEsperaProps) {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const puedeIniciarAtencion = canIniciarAtencion(user)

  const [bloqueoPorActiva, setBloqueoPorActiva] = useState<Cita | null>(null)
  const [firmaOpen, setFirmaOpen] = useState(false)
  const [citaParaFirma, setCitaParaFirma] = useState<Cita | null>(null)
  const [citaParaPago, setCitaParaPago] = useState<Cita | null>(null)

  function handleIniciar(cita: Cita) {
    if (puedeIniciarAtencion && citaActiva) {
      setBloqueoPorActiva(cita)
      return
    }
    setCitaParaPago(cita)
  }

  function handleFirmar(cita: Cita) {
    setCitaParaFirma(cita)
    setFirmaOpen(true)
  }

  function handleFirmaCompleted() {
    setFirmaOpen(false)
    setCitaParaFirma(null)
    // No auto-iniciamos: ConsentimientoFirmaSheet ya invalida ['citas'] en onSuccess.
    // La UI re-evalúa: si quedan más pendientes muestra "Firmar", si no muestra "Iniciar".
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

  const pendiente = citaParaFirma ? primerConsentimientoPendiente(citaParaFirma) : null
  const consentimientoToken = pendiente?.template_token ?? null
  const consentimientoNombre = pendiente?.template_nombre ?? null

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
            const consentimientoPendiente = enEspera && (
              usaSesionConsent
                ? !sesionConsentData!.puede_ejecutar
                : ((cita.consentimiento_info?.consentimientos?.length ?? 0) > 0 && !cita.consentimiento_info?.todos_firmados)
            )
            const todosFirmadosOverride = usaSesionConsent ? sesionConsentData!.puede_ejecutar : undefined
            const puedeIniciar = enEspera && !consentimientoPendiente && esElSiguiente

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

                {puedeIniciar ? (
                  <Button size="sm" className="shrink-0 h-7 text-xs" onClick={() => handleIniciar(cita)}>
                    {puedeIniciarAtencion
                      ? <><Play className="h-3 w-3 mr-1" />Iniciar</>
                      : <><ReceiptText className="h-3 w-3 mr-1" />Cobro</>
                    }
                  </Button>
                ) : consentimientoPendiente && esElSiguiente ? (
                  <Button size="sm" variant="outline" className="shrink-0 h-7 text-xs border-amber-300 text-amber-700" onClick={() => handleFirmar(cita)}>
                    <FileSignature className="h-3 w-3 mr-1" />
                    Firmar
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

      {/* Sheet: firma de consentimiento */}
      {citaParaFirma && consentimientoToken && consentimientoNombre && (
        <ConsentimientoFirmaSheet
          open={firmaOpen}
          onOpenChange={(open) => { setFirmaOpen(open); if (!open) setCitaParaFirma(null) }}
          pacienteId={citaParaFirma.paciente}
          pacienteNombre={citaParaFirma.paciente_nombre}
          token={consentimientoToken}
          templateNombre={consentimientoNombre}
          consentimientoId={pendiente?.consentimiento_id}
          vigenciaMeses={undefined}
          onCompleted={handleFirmaCompleted}
        />
      )}

      {/* Dialog: registro de pago / iniciar atención */}
      {citaParaPago && (
        <IniciarPagoSheet
          open={!!citaParaPago}
          onOpenChange={(open) => { if (!open) setCitaParaPago(null) }}
          cita={citaParaPago}
          soloRegistrar={!puedeIniciarAtencion}
        />
      )}
    </>
  )
}
