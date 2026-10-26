'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, Check, CheckCircle2, Maximize2, Minimize2, Play, Settings2, X, Loader2 } from 'lucide-react'
import * as VisuallyHidden from '@radix-ui/react-visually-hidden'
import { agendaApi } from '@/lib/api/agenda'
import { clinicasApi } from '@/lib/api/clinicas'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { textoDeudaBloqueante } from '@/lib/deuda'
import { toast } from '@/hooks/use-toast'
import { mensajeDeError } from '@/lib/errores'
import { useAuthStore } from '@/store/authStore'
import { canIniciarAtencion, hasPermission, PERM } from '@/lib/permissions'
import {
  NOMBRE_CORTO_PASO, PASOS_RECEPCION, esCitaDeTratamiento, pasosActivos, progresoRecepcion, textoFaltan,
  type PasoRecepcion,
} from '@/lib/recepcion'
import { LlegadaCheckinContent } from './LlegadaCheckinContent'
import { ConsentimientoFirmaContent } from './ConsentimientoFirmaContent'
import { PagoContent } from './PagoContent'
import { FirmaAsistenciaContent } from './FirmaAsistenciaContent'
import { VerificacionFacialContent } from './VerificacionFacialContent'

type WizardStep = PasoRecepcion
type StepStatus = 'done' | 'skipped' | 'current' | 'pending'

interface Props {
  citaId: string | null
  onClose: () => void
  /**
   * Iniciar la atención al terminar, si quien prepara también atiende. Sin
   * esto, el botón solo abre la pantalla de la atención, que pide iniciarla.
   */
  onIniciarAtencion?: () => void
}

/**
 * "Preparar paciente": lo que hace recepción antes de atender (llegada,
 * identidad, consentimiento, pago y firma, según la configuración). Termina en
 * "Listo para atender": la cita pasa a en_curso solo cuando el profesional
 * inicia la atención.
 */
export function IniciarAtencionWizard({ citaId, onClose, onIniciarAtencion }: Props) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const { user } = useAuthStore()
  const puedeCambiarPasos = hasPermission(user, PERM.CLINICAS_EDITAR)
  const [maximized, setMaximized] = useState(false)
  const [firmandoConsentimiento, setFirmandoConsentimiento] = useState(false)
  const [pagoRegistrado, setPagoRegistrado] = useState(false)
  const [verificacionCompletada, setVerificacionCompletada] = useState(false)
  // null = seguir el paso activo automáticamente; un valor = usuario navegó a ese paso
  const [viewingStep, setViewingStep] = useState<WizardStep | null>(null)
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
  const activeSteps = useMemo(() => pasosActivos(wizardConfig), [wizardConfig])

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

  // Cuando la cita es una sesión de un tratamiento, el cobro lo controla la
  // cartera del tratamiento: el paso "Pago" no cobra, se muestra como "Tratamiento".
  const esDeTratamiento = cita ? esCitaDeTratamiento(cita) : false
  const stepLabel = (step: WizardStep) =>
    esDeTratamiento && step === 'pago' ? 'Tratamiento' : NOMBRE_CORTO_PASO[step]

  useEffect(() => {
    if (!esperandoConfirmacionFirma) {
      setEsperaLenta(false)
      return
    }
    const timer = setTimeout(() => setEsperaLenta(true), 15_000)
    return () => clearTimeout(timer)
  }, [esperandoConfirmacionFirma])

  const { mutate: confirmarLlegada, isPending: confirmandoLlegada } = useMutation({
    mutationFn: () => agendaApi.citas.cambiarEstado(citaId!, { estado: 'en_espera' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['citas'] }),
    onError: (err) => {
      queryClient.invalidateQueries({ queryKey: ['citas', citaId] })
      toast.error('No se registró la llegada', mensajeDeError(err, 'Cierra y vuelve a abrir el asistente.'))
    },
  })

  const pendienteConsentimiento = cita?.consentimiento_info?.consentimientos?.find((c) => !c.vigente) ?? null

  const { currentStep, statusByStep, allDone } = useMemo(() => {
    const firstActive = activeSteps[0] ?? 'llegada'
    const fallback = {
      currentStep: firstActive as WizardStep,
      statusByStep: PASOS_RECEPCION.reduce((acc, s) => ({ ...acc, [s]: 'pending' as StepStatus }), {} as Record<WizardStep, StepStatus>),
      allDone: false,
    }
    if (!cita) return fallback

    const { hechos: doneMap, consentimientoAplica } = progresoRecepcion(cita, wizardConfig, {
      pagoRegistrado, verificacionCompletada,
    })

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
  }, [cita, activeSteps, wizardConfig, pagoRegistrado, verificacionCompletada])

  // Cuando avanza el paso activo automáticamente, volver al modo automático
  useEffect(() => {
    setViewingStep(null)
  }, [currentStep])

  // Cuando todos los pasos activos están completos, se detiene el polling de firma.
  useEffect(() => {
    if (allDone) setEsperandoConfirmacionFirma(false)
  }, [allDone])

  // Si paso_checkin está desactivado, la cita nunca pasó por en_espera: se hace
  // al completar los pasos. Depende también del estado y de la configuración:
  // antes solo miraba allDone y, si la cita en caché aún decía "pendiente" (al
  // registrar "Llegó" sin confirmar) o la configuración llegaba tarde, no se
  // volvía a intentar y la cita no entraba nunca a la cola (AG-06).
  const llegadaEnviadaRef = useRef<string | null>(null)
  useEffect(() => {
    if (!allDone || !wizardConfig || wizardConfig.paso_checkin) return
    if (cita?.estado !== 'confirmada' || confirmandoLlegada) return
    if (llegadaEnviadaRef.current === cita.id) return
    llegadaEnviadaRef.current = cita.id
    confirmarLlegada(undefined, { onError: () => { llegadaEnviadaRef.current = null } })
  }, [allDone, wizardConfig, cita?.estado, cita?.id, confirmandoLlegada, confirmarLlegada])

  // Si el paciente rechazó la firma desde su teléfono, dejamos de consultar:
  // el usuario tiene que reenviar o firmar en pantalla.
  useEffect(() => {
    if (cita?.firma_asistencia_estado === 'rechazada') setEsperandoConfirmacionFirma(false)
  }, [cita?.firma_asistencia_estado])

  // Si quien prepara también atiende, sigue directo a la atención. La cita
  // tiene que haber llegado a "en espera" (sin el paso de llegada, eso pasa al
  // completar los demás pasos).
  const puedeIniciar = canIniciarAtencion(user) && cita?.estado === 'en_espera'
  const pasosPendientes = activeSteps.filter((s) => statusByStep[s] !== 'done' && statusByStep[s] !== 'skipped').length

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
          <DialogTitle>Preparar paciente — {cita?.paciente_nombre ?? ''}</DialogTitle>
        </VisuallyHidden.Root>

        {/* Header */}
        <div className={cn(
          'flex items-center justify-between px-5 border-b shrink-0 transition-all duration-200',
          firmandoConsentimiento ? 'py-2' : 'py-3.5'
        )}>
          {!firmandoConsentimiento && (
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight">Preparar paciente</p>
              {cita && <p className="text-xs text-muted-foreground truncate mt-0.5">{cita.paciente_nombre}</p>}
            </div>
          )}
          {firmandoConsentimiento && (
            <p className="text-xs text-muted-foreground truncate">
              Firmando — {cita?.paciente_nombre ?? ''}
            </p>
          )}
          <div className="flex items-center gap-2 shrink-0 ml-3">
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

        {/* Pasos — siempre a la vista, con su nombre: nada depende del hover. */}
        {!firmandoConsentimiento && cita && !cita.deuda_info && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-muted/20 px-5 py-2.5 shrink-0">
            <ol className="flex flex-wrap items-center gap-1.5 text-xs" aria-label="Pasos de recepción">
              {activeSteps.map((step, i) => {
                const status = statusByStep[step]
                const isViewing = step === displayStep && !allDone
                const hecho = status === 'done' || status === 'skipped'
                return (
                  <li key={step} className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={!hecho}
                      aria-current={status === 'current' ? 'step' : undefined}
                      onClick={() => setViewingStep(step === viewingStep ? null : step)}
                      className={cn(
                        'flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 transition-colors',
                        hecho ? 'cursor-pointer hover:bg-muted' : 'cursor-default',
                        isViewing && 'bg-white ring-1 ring-border',
                      )}
                    >
                      <span className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                        hecho ? 'bg-green-100 text-green-700'
                          : status === 'current' ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground',
                      )}>
                        {hecho ? <Check className="h-3 w-3" /> : i + 1}
                      </span>
                      <span className={cn(
                        'font-medium',
                        status === 'current' || isViewing ? 'text-foreground' : 'text-muted-foreground',
                        status === 'skipped' && 'line-through opacity-60',
                      )}>
                        {stepLabel(step)}
                      </span>
                    </button>
                    {i < activeSteps.length - 1 && <span className="h-px w-3 bg-border" aria-hidden />}
                  </li>
                )
              })}
            </ol>
            <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className={cn('font-medium', allDone ? 'text-green-700' : 'text-muted-foreground')}>
                {allDone ? 'Listo para atender' : textoFaltan(pasosPendientes)}
              </span>
              {puedeCambiarPasos && (
                <Link
                  href="/configuracion/recepcion"
                  onClick={() => handleOpenChange(false)}
                  className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline"
                >
                  <Settings2 className="h-3 w-3" />
                  Cambiar los pasos de recepción
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0 relative">
          {cita?.deuda_info ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
              <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="h-8 w-8 text-red-600" />
              </div>
              <div className="max-w-md">
                <p className="text-lg font-semibold text-red-700">Atención bloqueada por mora</p>
                <p className="text-sm text-muted-foreground mt-1.5">
                  {textoDeudaBloqueante(cita.deuda_info)} No se puede iniciar la atención hasta
                  registrar el pago o aprobar una excepción desde <span className="font-medium text-foreground">Cartera</span>.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    router.push(`/cartera?paciente=${cita.paciente}`)
                    handleOpenChange(false)
                  }}
                >
                  Ver cartera del paciente
                </Button>
                <Button variant="ghost" onClick={() => handleOpenChange(false)}>Cerrar</Button>
              </div>
            </div>
          ) : allDone && !viewingStep ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
              <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <div className="max-w-sm">
                <p className="text-lg font-semibold">Listo para atender</p>
                <p className="text-sm text-muted-foreground mt-1.5">
                  Recepción terminó de preparar al paciente. La atención la inicia el profesional desde{' '}
                  <span className="font-medium text-foreground">Mis atenciones</span>.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {puedeIniciar && (
                  <Button
                    onClick={() => {
                      handleOpenChange(false)
                      if (onIniciarAtencion) onIniciarAtencion()
                      else router.push(`/atenciones/${citaId}`)
                    }}
                  >
                    <Play className="h-3.5 w-3.5 mr-1.5" />
                    {onIniciarAtencion ? 'Iniciar atención' : 'Ir a la atención'}
                  </Button>
                )}
                <Button variant={puedeIniciar ? 'outline' : 'default'} onClick={() => handleOpenChange(false)}>Cerrar</Button>
              </div>
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
            <div className="min-h-full flex items-center justify-center">
              <div className="w-1/2">
                <LlegadaCheckinContent
                  cita={cita}
                  onCheckinSuccess={() => confirmarLlegada()}
                  facialActivo={activeSteps.includes('verificacion')}
                />
              </div>
            </div>
          ) : displayStep === 'verificacion' ? (
            <div className="min-h-full flex items-center justify-center">
              <div className="w-[60%]">
                <VerificacionFacialContent
                  pacienteId={cita.paciente}
                  citaId={citaId}
                  onCompletado={() => {
                    setVerificacionCompletada(true)
                    // La cola y el detalle leen el paso desde la cita.
                    queryClient.invalidateQueries({ queryKey: ['citas'] })
                  }}
                />
              </div>
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
                citaId={citaId}
                onInicioFirma={() => {
                  setFirmandoConsentimiento(true)
                  setMaximized(true)
                }}
                onFinFirma={() => {
                  setFirmandoConsentimiento(false)
                  setMaximized(false)
                }}
                // Link por WhatsApp: consultar la cita cada 4s hasta que el consentimiento quede firmado.
                onLinkEnviado={() => setEsperandoConfirmacionFirma(true)}
                onCompleted={() => {
                  queryClient.invalidateQueries({ queryKey: ['citas'] })
                }}
              />
            </div>
          ) : displayStep === 'pago' ? (
            <div className="min-h-full flex items-center justify-center">
              <div className="w-[60%]">
                <PagoContent
                  cita={cita}
                  onPagoRegistrado={() => {
                    setPagoRegistrado(true)
                    queryClient.invalidateQueries({ queryKey: ['citas'] })
                  }}
                  onCancel={() => handleOpenChange(false)}
                />
              </div>
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
