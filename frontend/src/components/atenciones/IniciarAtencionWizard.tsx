'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, CheckCircle2, Maximize2, Minimize2, X, Loader2 } from 'lucide-react'
import * as VisuallyHidden from '@radix-ui/react-visually-hidden'
import { agendaApi } from '@/lib/api/agenda'
import { clinicasApi } from '@/lib/api/clinicas'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { LlegadaCheckinContent } from './LlegadaCheckinContent'
import { ConsentimientoFirmaContent } from './ConsentimientoFirmaContent'
import { PagoContent } from './PagoContent'
import { FirmaAsistenciaContent } from './FirmaAsistenciaContent'
import { VerificacionFacialContent } from './VerificacionFacialContent'

type WizardStep = 'llegada' | 'verificacion' | 'consentimiento' | 'pago' | 'firma'
type StepStatus = 'done' | 'skipped' | 'current' | 'pending'

// Orden canónico completo — se filtra en runtime según WizardConfig
const ALL_STEPS: WizardStep[] = ['llegada', 'verificacion', 'consentimiento', 'pago', 'firma']
const STEP_LABELS: Record<WizardStep, string> = {
  llegada: 'Llegada',
  verificacion: 'Identidad',
  consentimiento: 'Consentimiento',
  pago: 'Pago',
  firma: 'Firma',
}

interface Props {
  citaId: string | null
  onClose: () => void
}

export function IniciarAtencionWizard({ citaId, onClose }: Props) {
  const queryClient = useQueryClient()
  const [maximized, setMaximized] = useState(false)
  const [firmandoConsentimiento, setFirmandoConsentimiento] = useState(false)
  const [pagoRegistrado, setPagoRegistrado] = useState(false)
  const [verificacionCompletada, setVerificacionCompletada] = useState(false)
  // null = seguir el paso activo automáticamente; un valor = usuario navegó a ese paso
  const [viewingStep, setViewingStep] = useState<WizardStep | null>(null)
  const [showSteps, setShowSteps] = useState(false)
  // Tras firmar, el frontend llama directamente a confirmar_firma_asistencia (eager).
  // El polling es el fallback: si esa llamada falla, esperamos a que llegue el webhook.
  // esperaLenta se activa a los 15s para mostrar un botón de verificación manual.
  const [esperandoConfirmacionFirma, setEsperandoConfirmacionFirma] = useState(false)
  const [esperaLenta, setEsperaLenta] = useState(false)

  const { data: wizardConfig } = useQuery({
    queryKey: ['wizard-config'],
    queryFn: () => clinicasApi.wizardConfig.get(),
  })

  // Pasos activos según configuración de la clínica. Consentimiento siempre obligatorio.
  const activeSteps = useMemo((): WizardStep[] => {
    if (!wizardConfig) return ALL_STEPS.filter((s) => s !== 'verificacion')
    return ALL_STEPS.filter((step) => {
      if (step === 'llegada')       return wizardConfig.paso_checkin
      if (step === 'verificacion')  return wizardConfig.paso_verificacion_facial
      if (step === 'pago')          return wizardConfig.paso_pago
      if (step === 'firma')         return wizardConfig.paso_firma_asistencia
      return true
    })
  }, [wizardConfig])

  const { data: cita, refetch: refetchCita } = useQuery({
    queryKey: ['citas', citaId],
    queryFn: () => agendaApi.citas.get(citaId!),
    enabled: Boolean(citaId),
    // El paciente puede estar firmando en su propio celular (link por WhatsApp):
    // consultamos el estado cada 4s hasta que llegue el aviso automático.
    refetchInterval: esperandoConfirmacionFirma ? 4000 : false,
    // Sin esto, react-query pausa el polling si el usuario cambia de pestaña mientras espera.
    refetchIntervalInBackground: true,
  })

  // Cuando la cita viene de una cotización, el cobro lo controla la cotización
  // (cartera/cuotas): el paso "Pago" no aplica, se muestra como "Tratamiento".
  const esCitaDeCotizacion = cita?.item_cotizacion_id != null
  const stepLabel = (step: WizardStep) =>
    esCitaDeCotizacion && step === 'pago' ? 'Tratamiento' : STEP_LABELS[step]

  useEffect(() => {
    if (!esperandoConfirmacionFirma) {
      setEsperaLenta(false)
      return
    }
    const timer = setTimeout(() => setEsperaLenta(true), 15_000)
    return () => clearTimeout(timer)
  }, [esperandoConfirmacionFirma])

  const { mutate: confirmarLlegada } = useMutation({
    mutationFn: () => agendaApi.citas.cambiarEstado(citaId!, { estado: 'en_espera' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['citas'] }),
  })

  const pendienteConsentimiento = cita?.consentimiento_info?.consentimientos?.find((c) => !c.vigente) ?? null

  const { currentStep, statusByStep, allDone } = useMemo(() => {
    const firstActive = activeSteps[0] ?? 'llegada'
    const fallback = {
      currentStep: firstActive as WizardStep,
      statusByStep: ALL_STEPS.reduce((acc, s) => ({ ...acc, [s]: 'pending' as StepStatus }), {} as Record<WizardStep, StepStatus>),
      allDone: false,
    }
    if (!cita) return fallback

    const consentimientoAplica = (cita.consentimiento_info?.consentimientos?.length ?? 0) > 0
    const doneMap: Record<WizardStep, boolean> = {
      llegada:        cita.estado !== 'confirmada',
      verificacion:   verificacionCompletada,
      consentimiento: !consentimientoAplica || Boolean(cita.consentimiento_info?.todos_firmados),
      pago:           cita.item_cotizacion_id != null || pagoRegistrado || cita.cobro_id != null || cita.estado === 'en_curso' || cita.estado === 'completada',
      firma:          cita.firma_asistencia_estado === 'firmada',
    }

    const current = activeSteps.find((s) => !doneMap[s]) ?? activeSteps[activeSteps.length - 1] ?? 'firma'
    const allDone = activeSteps.length > 0 && activeSteps.every((s) => doneMap[s])

    const statusByStep = activeSteps.reduce((acc, s) => {
      // Cuando allDone, todos se muestran como done (el último no queda en 'current')
      if (allDone || doneMap[s]) acc[s] = s === 'consentimiento' && !consentimientoAplica ? 'skipped' : 'done'
      else if (s === current) acc[s] = 'current'
      else acc[s] = 'pending'
      return acc
    }, {} as Record<WizardStep, StepStatus>)

    return { currentStep: current, statusByStep, allDone }
  }, [cita, activeSteps, pagoRegistrado, verificacionCompletada])

  // Cuando avanza el paso activo automáticamente, volver al modo automático
  useEffect(() => {
    setViewingStep(null)
  }, [currentStep])

  // Cuando todos los pasos activos están completos:
  // - Si paso_checkin estaba desactivado, la cita nunca pasó por en_espera — hacerlo ahora.
  // - Detener el polling de firma.
  useEffect(() => {
    if (!allDone) return
    setEsperandoConfirmacionFirma(false)
    if (wizardConfig && !wizardConfig.paso_checkin && cita?.estado === 'confirmada') {
      confirmarLlegada()
    }
  }, [allDone])

  // Si el paciente rechazó la firma desde su teléfono, dejamos de consultar:
  // el usuario tiene que reenviar o firmar en pantalla.
  useEffect(() => {
    if (cita?.firma_asistencia_estado === 'rechazada') setEsperandoConfirmacionFirma(false)
  }, [cita?.firma_asistencia_estado])

  const displayStep = viewingStep ?? currentStep
  const isViewingCompletedStep = viewingStep !== null && statusByStep[viewingStep] === 'done'

  function handleOpenChange(open: boolean) {
    if (!open) {
      setMaximized(false)
      onClose()
    }
  }

  if (!citaId) return null

  return (
    <Dialog open={Boolean(citaId)} onOpenChange={handleOpenChange}>
      <DialogContent
        hideClose
        trapFocus={false}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className={cn(
          'flex flex-col gap-0 p-0 transition-all duration-200',
          maximized
            ? '!fixed !inset-3 !left-3 !top-3 !translate-x-0 !translate-y-0 max-w-none !w-[calc(100vw-1.5rem)] !h-[calc(100vh-1.5rem)] rounded-xl'
            : 'max-w-3xl w-full h-[80vh]'
        )}
      >
        <VisuallyHidden.Root>
          <DialogTitle>Iniciar atención — {cita?.paciente_nombre ?? ''}</DialogTitle>
        </VisuallyHidden.Root>

        {/* Header */}
        <div className={cn(
          'flex items-center justify-between px-5 border-b shrink-0 transition-all duration-200',
          firmandoConsentimiento ? 'py-2' : 'py-3.5'
        )}>
          {!firmandoConsentimiento && (
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight">Iniciar atención</p>
              {cita && <p className="text-xs text-muted-foreground truncate mt-0.5">{cita.paciente_nombre}</p>}
            </div>
          )}
          {firmandoConsentimiento && (
            <p className="text-xs text-muted-foreground truncate">
              Firmando — {cita?.paciente_nombre ?? ''}
            </p>
          )}
          <div className="flex items-center gap-2 shrink-0 ml-3">
            {/* Indicador de pasos — hover revela el stepper sobre el body */}
            {!firmandoConsentimiento && (
              <div
                className="relative"
                onMouseEnter={() => setShowSteps(true)}
                onMouseLeave={() => setShowSteps(false)}
              >
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground px-2 py-1 rounded-md hover:bg-muted/60 transition-colors"
                >
                  {activeSteps.map((step, i) => (
                    <div
                      key={step}
                      className={cn(
                        'h-1.5 w-4 rounded-full transition-colors',
                        statusByStep[step] === 'done' || statusByStep[step] === 'skipped'
                          ? 'bg-green-500'
                          : step === displayStep
                          ? 'bg-primary'
                          : 'bg-muted-foreground/30'
                      )}
                    />
                  ))}
                </button>
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setMaximized((v) => !v)}
              title={maximized ? 'Restaurar tamaño' : 'Maximizar'}
            >
              {maximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => handleOpenChange(false)}
              title="Cerrar"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Body — posición relativa para que el overlay de pasos se superponga */}
        <div
          className="flex-1 overflow-y-auto px-5 py-4 min-h-0 relative"
          onMouseEnter={() => setShowSteps(false)}
        >
          {/* Overlay de pasos — aparece con blur al hover del indicador */}
          {showSteps && !firmandoConsentimiento && (
            <div
              className="absolute inset-0 z-10 flex flex-col items-center justify-center backdrop-blur-sm bg-background/60"
              onMouseEnter={() => setShowSteps(true)}
              onMouseLeave={() => setShowSteps(false)}
            >
              <div className="flex items-center gap-3 text-sm">
                {activeSteps.map((step, i) => {
                  const status = statusByStep[step]
                  const isViewing = step === displayStep
                  const isClickable = status === 'done' || status === 'skipped'
                  return (
                    <div key={step} className="flex items-center gap-3">
                      <button
                        type="button"
                        disabled={!isClickable}
                        onClick={() => {
                          if (isClickable) setViewingStep(step === viewingStep ? null : step)
                          setShowSteps(false)
                        }}
                        className={cn(
                          'flex items-center gap-2 rounded-lg px-3 py-2 transition-colors',
                          isClickable ? 'cursor-pointer hover:bg-muted/80' : 'cursor-default',
                          isViewing ? 'bg-muted/60 ring-1 ring-border' : ''
                        )}
                      >
                        <div className={cn(
                          'flex items-center justify-center h-6 w-6 rounded-full text-[10px] font-bold shrink-0',
                          status === 'done' || status === 'skipped' ? 'bg-green-100 text-green-700'
                            : status === 'current' ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground'
                        )}>
                          {status === 'done' || status === 'skipped' ? <Check className="h-3.5 w-3.5" /> : i + 1}
                        </div>
                        <span className={cn(
                          'font-medium',
                          status === 'current' || isViewing ? 'text-foreground' : 'text-muted-foreground',
                          status === 'skipped' && 'line-through opacity-60'
                        )}>
                          {stepLabel(step)}
                        </span>
                      </button>
                      {i < activeSteps.length - 1 && <div className="w-6 h-px bg-border" />}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {allDone && !viewingStep ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
              <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <div className="max-w-sm">
                <p className="text-lg font-semibold">Paciente listo</p>
                <p className="text-sm text-muted-foreground mt-1.5">
                  Todos los pasos fueron completados. El profesional puede iniciar la atención desde <span className="font-medium text-foreground">Mis atenciones</span>.
                </p>
              </div>
              <Button onClick={() => handleOpenChange(false)}>Cerrar</Button>
            </div>
          ) : !cita ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : isViewingCompletedStep ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
              <div className="h-14 w-14 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7 text-green-600" />
              </div>
              <div className="max-w-sm">
                <p className="text-base font-semibold">{stepLabel(displayStep)} completado</p>
                <p className="text-sm text-muted-foreground mt-1">Este paso ya fue completado correctamente.</p>
              </div>
              {!allDone && (
                <Button variant="outline" size="sm" onClick={() => setViewingStep(null)}>
                  Volver al paso actual
                </Button>
              )}
            </div>
          ) : displayStep === 'llegada' ? (
            <div className="w-1/2 mx-auto mt-6">
              <LlegadaCheckinContent
                cita={cita}
                onCheckinSuccess={() => confirmarLlegada()}
              />
            </div>
          ) : displayStep === 'verificacion' ? (
            <div className="w-[60%] mx-auto mt-6">
              <VerificacionFacialContent
                pacienteId={cita.paciente}
                citaId={citaId}
                onCompletado={() => setVerificacionCompletada(true)}
              />
            </div>
          ) : displayStep === 'consentimiento' && pendienteConsentimiento ? (
            <div className="h-full">
              <ConsentimientoFirmaContent
                pacienteId={cita.paciente}
                pacienteNombre={cita.paciente_nombre}
                token={pendienteConsentimiento.template_token}
                templateNombre={pendienteConsentimiento.template_nombre}
                consentimientoId={pendienteConsentimiento.consentimiento_id}
                vigenciaMeses={undefined}
                onInicioFirma={() => {
                  setFirmandoConsentimiento(true)
                  setMaximized(true)
                }}
                onFinFirma={() => {
                  setFirmandoConsentimiento(false)
                  setMaximized(false)
                }}
                onCompleted={() => {
                  queryClient.invalidateQueries({ queryKey: ['citas'] })
                }}
              />
            </div>
          ) : displayStep === 'pago' ? (
            <div className="w-[60%] mx-auto mt-6">
              <PagoContent
                cita={cita}
                onPagoRegistrado={() => {
                  setPagoRegistrado(true)
                  queryClient.invalidateQueries({ queryKey: ['citas'] })
                }}
                onCancel={() => handleOpenChange(false)}
              />
            </div>
          ) : displayStep === 'firma' ? (
            <FirmaAsistenciaContent
              citaId={citaId}
              initialSigningToken={cita?.firma_asistencia_signing_token}
              autoIniciar={cita?.firma_asistencia_estado === 'enviada'}
              onFirmada={() => {
                setEsperandoConfirmacionFirma(true)
                queryClient.invalidateQueries({ queryKey: ['citas'] })
              }}
              esperaLenta={esperaLenta}
              onVerificarAhora={() => refetchCita()}
              estadoActual={cita?.firma_asistencia_estado}
              onLinkEnviado={() => setEsperandoConfirmacionFirma(true)}
              onComprobarEnDocumenso={async () => {
                const actualizada = await agendaApi.citas.verificarFirmaAsistencia(citaId)
                queryClient.setQueryData(['citas', citaId], actualizada)
                return actualizada
              }}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
