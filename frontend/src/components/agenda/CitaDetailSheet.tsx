'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import {
  Stethoscope, Clock, MessageSquare,
  FileText, AlertCircle, Pencil, ClipboardList, ChevronDown, ChevronUp, UserCheck, FileSignature,
  ReceiptText, Bell, ShieldCheck, ShieldX, ExternalLink,
} from 'lucide-react'
import Link from 'next/link'
import { agendaApi } from '@/lib/api/agenda'
import { isProfesional, canIniciarAtencion } from '@/lib/permissions'
import { cotizacionesApi } from '@/lib/api/cotizaciones'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { CitaStatusBadge } from '@/components/shared/StatusBadge'
import { EditarCitaForm } from './EditarCitaForm'
import { ConfirmacionForm } from './ConfirmacionForm'
import { RegistrosConfirmacion } from './RegistrosConfirmacion'
import { ConsentimientoFirmaSheet } from '@/components/atenciones/ConsentimientoFirmaSheet'
import { IniciarPagoSheet } from '@/components/atenciones/IniciarPagoSheet'
import { LlegadaCheckinSheet } from './LlegadaCheckinSheet'
import { NuevaNotaForm } from '@/components/historia/NuevaNotaForm'
import { historiaClinicaApi } from '@/lib/api/historiaClinica'
import { formatDateTime, formatTime } from '@/lib/utils'
import { ESTADO_CITA_CONFIG, TRANSICIONES_ESTADO, CANAL_LABEL } from '@/lib/constants'
import type { EstadoCita, MedioConfirmacion } from '@/types/agenda'

interface CitaDetailSheetProps {
  citaId: string | null
  onClose: () => void
}

// Estados que requieren registrar el contacto antes de ejecutar

type AccionModal = { kind: 'estado'; estado: EstadoCita } | { kind: 'manual' }

const ACCION_LABEL: Record<string, string> = {
  confirmada: 'Paciente confirmó la cita',
  cancelada:  'Paciente canceló la cita',
  no_asistio: 'Paciente no se presentó',
  completada: 'Marcar como completada',
  manual:     'Paciente confirmó asistencia',
}

const ACCION_BTN_LABEL: Record<string, string> = {
  confirmada: 'Confirmar cita',
  cancelada:  'Cancelar cita',
  no_asistio: 'Marcar no asistió',
  completada: 'Marcar completada',
  manual:     'Confirmar asistencia',
}

function accionKey(a: AccionModal) {
  return a.kind === 'manual' ? 'manual' : a.estado
}

export function CitaDetailSheet({ citaId, onClose }: CitaDetailSheetProps) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const { user } = useAuthStore()
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedAccion, setSelectedAccion] = useState<AccionModal | null>(null)
  const [motivo, setMotivo] = useState('')
  const [editando, setEditando] = useState(false)
  const [registrandoNota, setRegistrandoNota] = useState(false)
  const [showRegistros, setShowRegistros] = useState(false)
  const [firmaOpen, setFirmaOpen] = useState(false)
  const [checkinOpen, setCheckinOpen] = useState(false)
  const [pagoOpen, setPagoOpen] = useState(false)

  const { data: cita, isLoading } = useQuery({
    queryKey: ['citas', citaId],
    queryFn: () => agendaApi.citas.get(citaId!),
    enabled: Boolean(citaId),
  })

  const { mutate: cambiarEstado, isPending: cambiando } = useMutation({
    mutationFn: ({ estado, motivo_cancelacion, medio, nota }: {
      estado: EstadoCita
      motivo_cancelacion?: string
      medio?: MedioConfirmacion | ''
      nota?: string
    }) => agendaApi.citas.cambiarEstado(citaId!, { estado, motivo_cancelacion, medio, nota }),
    onSuccess: (cita) => {
      queryClient.invalidateQueries({ queryKey: ['citas'] })
      queryClient.invalidateQueries({ queryKey: ['slots'] })
      queryClient.invalidateQueries({ queryKey: ['registros-confirmacion', citaId] })
      setModalOpen(false)
      setMotivo('')
      if (cita.estado === 'en_espera') {
        const info = cita.consentimiento_info
        if ((info?.consentimientos?.length ?? 0) > 0 && !info?.todos_firmados) setFirmaOpen(true)
        return
      }
      if (cita.estado === 'en_curso' && user?.es_profesional) {
        onClose()
        router.push(`/atenciones/${cita.id}`)
      }
    },
  })

  const [recordatorioOk, setRecordatorioOk] = useState(false)
  const [recordatorioError, setRecordatorioError] = useState<string | null>(null)

  const { mutate: enviarRecordatorio, isPending: enviandoRecordatorio } = useMutation({
    mutationFn: () => agendaApi.citas.enviarRecordatorioInmediato(citaId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['citas', citaId] })
      setRecordatorioOk(true)
      setRecordatorioError(null)
      setTimeout(() => setRecordatorioOk(false), 3000)
    },
    onError: (err: any) => {
      const status = err?.response?.status
      if (status === 502) {
        setRecordatorioError('No se pudo contactar el servicio de mensajería.')
      } else {
        setRecordatorioError(err?.response?.data?.error ?? 'Error al enviar el recordatorio.')
      }
      setTimeout(() => setRecordatorioError(null), 4000)
    },
  })

  const { mutate: confirmarManual, isPending: confirmando } = useMutation({
    mutationFn: (data: { medio?: string; nota?: string }) =>
      agendaApi.citas.confirmarManual(citaId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['citas'] })
      queryClient.invalidateQueries({ queryKey: ['registros-confirmacion', citaId] })
      setModalOpen(false)
    },
  })

  const handleOpenModal = (accionesModal: AccionModal[]) => {
    setSelectedAccion(accionesModal[0] ?? null)
    setMotivo('')
    setModalOpen(true)
  }

  const handleConfirmarModal = (medio: MedioConfirmacion | '', nota: string) => {
    if (!selectedAccion) return
    if (selectedAccion.kind === 'manual') {
      confirmarManual({ medio, nota })
    } else {
      cambiarEstado({
        estado: selectedAccion.estado,
        motivo_cancelacion: selectedAccion.estado === 'cancelada' ? motivo : undefined,
        medio,
        nota,
      })
    }
  }

  const handleCloseModal = () => {
    setModalOpen(false)
    setMotivo('')
  }

  const isPasada = cita ? new Date(cita.fecha_inicio) < new Date() : false

  const { data: historiaData } = useQuery({
    queryKey: ['historias', cita?.paciente],
    queryFn: () => historiaClinicaApi.historias.list({ paciente: cita!.paciente }),
    enabled: registrandoNota && Boolean(cita?.paciente),
  })
  const historia = historiaData?.results[0]

  const { data: sesionesData } = useQuery({
    queryKey: ['cotizacion-sesiones', cita?.cotizacion_resumen?.cotizacion_id],
    queryFn: () => cotizacionesApi.sesiones(cita!.cotizacion_resumen!.cotizacion_id),
    enabled: Boolean(cita?.cotizacion_resumen?.cotizacion_id),
  })
  const itemSesiones = sesionesData?.items.find((i) => i.item_id === cita?.item_cotizacion_id)

  const transiciones: EstadoCita[] = (() => {
    if (!cita) return []
    const base = TRANSICIONES_ESTADO[cita.estado] ?? []
    if (!isPasada) return base
    if (cita.estado === 'pendiente') return ['confirmada', 'no_asistio', 'cancelada']
    return base
  })()

  const handleClose = () => {
    onClose()
    setModalOpen(false)
    setMotivo('')
    setEditando(false)
    setRegistrandoNota(false)
    setShowRegistros(false)
  }

  return (
    <>
    <Sheet open={Boolean(citaId) && !firmaOpen && !checkinOpen && !pagoOpen} onOpenChange={(open) => { if (!open && !firmaOpen && !checkinOpen && !pagoOpen) handleClose() }}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <div className="flex items-start justify-between">
            <div>
              <SheetTitle>Detalle de cita</SheetTitle>
              {cita && <SheetDescription>{formatDateTime(cita.fecha_inicio)}</SheetDescription>}
            </div>
            <div className="flex gap-2">
              {cita?.estado === 'pendiente' && !editando && !isProfesional(user) && (
                <Button size="sm" variant="outline" onClick={() => setEditando(true)}>
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Editar
                </Button>
              )}
              {['en_curso', 'completada'].includes(cita?.estado ?? '') && !registrandoNota && (
                <Button size="sm" variant="outline" onClick={() => setRegistrandoNota(true)}>
                  <ClipboardList className="h-3.5 w-3.5 mr-1.5" />
                  Registrar nota
                </Button>
              )}
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !cita ? null : editando ? (
            <EditarCitaForm
              cita={cita}
              onCancel={() => setEditando(false)}
              onSuccess={() => setEditando(false)}
            />
          ) : registrandoNota ? (
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Nueva nota clínica — {cita.paciente_nombre}
              </p>
              {!historia ? (
                <p className="text-sm text-muted-foreground">Cargando historia clínica...</p>
              ) : (
                <NuevaNotaForm
                  historiaId={historia.id}
                  cita={cita}
                  onSuccess={() => setRegistrandoNota(false)}
                  onCancel={() => setRegistrandoNota(false)}
                />
              )}
            </div>
          ) : (
            <>
              {/* Card principal — toda la info clave sin scroll */}
              <div className="rounded-lg border bg-card divide-y">

                {/* Fila: estado + confirmación */}
                <div className="flex items-center justify-between px-4 py-2.5">
                  <CitaStatusBadge estado={cita.estado} />
                  {cita.estado_confirmacion === 'confirmado' && (
                    <Badge variant="success" className="text-xs">Confirmado</Badge>
                  )}
                </div>

                {/* Paciente + profesional */}
                <div className="px-4 py-3 space-y-1">
                  <Link
                    href={`/pacientes/${cita.paciente}`}
                    className="text-base font-semibold text-primary hover:underline leading-tight block"
                  >
                    {cita.paciente_nombre}
                  </Link>
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <Stethoscope className="h-3.5 w-3.5 shrink-0" />
                    {cita.profesional_nombre}
                  </p>
                </div>

                {/* Servicio + Sede (2 col) */}
                <div className="grid grid-cols-2 divide-x">
                  <div className="px-4 py-3">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">Servicio</p>
                    <p className="text-sm font-medium leading-snug">{cita.servicio_nombre || '—'}</p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">Sede</p>
                    <p className="text-sm font-medium">{cita.sede_nombre}</p>
                  </div>
                </div>

                {/* Horario + Canal (2 col) */}
                <div className="grid grid-cols-2 divide-x">
                  <div className="px-4 py-3">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">Horario</p>
                    <p className="text-sm font-medium tabular-nums">
                      {formatTime(cita.fecha_inicio)} – {formatTime(cita.fecha_fin)}
                    </p>
                    {(cita.fecha_inicio_real || cita.fecha_fin_real) && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Real: {cita.fecha_inicio_real ? formatTime(cita.fecha_inicio_real) : '—'}
                        {' – '}
                        {cita.fecha_fin_real ? formatTime(cita.fecha_fin_real) : 'en curso'}
                      </p>
                    )}
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">Canal</p>
                    <p className="text-sm font-medium">{CANAL_LABEL[cita.canal_origen] ?? cita.canal_origen}</p>
                  </div>
                </div>
              </div>

              {/* Notas internas */}
              {cita.notas_internas && (
                <div className="rounded-md bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground text-xs mb-1">Notas internas</p>
                  {cita.notas_internas}
                </div>
              )}

              {/* Motivo cancelación */}
              {cita.motivo_cancelacion && (
                <div className="rounded-md bg-destructive/5 border border-destructive/20 px-4 py-3">
                  <p className="font-medium text-destructive text-xs mb-1">Motivo de cancelación</p>
                  <p className="text-sm text-destructive/80">{cita.motivo_cancelacion}</p>
                </div>
              )}

              {/* Cotización vinculada */}
              {cita.cotizacion_resumen && (
                <div className="rounded-md border bg-muted/30 px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <ReceiptText className="h-3.5 w-3.5" />
                      Cotización vinculada
                    </p>
                    <Link
                      href={`/cotizaciones/${cita.cotizacion_resumen.cotizacion_id}`}
                      className="text-xs text-primary hover:underline"
                    >
                      Ver cotización
                    </Link>
                  </div>
                  <p className="text-sm font-medium">
                    {itemSesiones?.descripcion ?? cita.cotizacion_resumen.descripcion}
                  </p>
                  {itemSesiones && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{itemSesiones.num_citas - itemSesiones.citas_restantes} de {itemSesiones.num_citas} sesiones</span>
                        <span>{itemSesiones.citas_restantes} restantes</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${itemSesiones.num_citas > 0 ? Math.round(((itemSesiones.num_citas - itemSesiones.citas_restantes) / itemSesiones.num_citas) * 100) : 0}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {itemSesiones.citas_completadas} completadas · {itemSesiones.citas_agendadas} agendadas
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Consentimientos — chips compactos */}
              {(cita.consentimiento_info?.consentimientos?.length ?? 0) > 0 && (
                <div className="rounded-lg border px-4 py-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <FileSignature className="h-3.5 w-3.5" />
                    Consentimientos
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {cita.consentimiento_info!.consentimientos.map((c) => (
                      <span
                        key={c.template_token}
                        className={`inline-flex items-center gap-1 text-[11px] rounded-full px-2.5 py-0.5 border font-medium ${
                          c.vigente
                            ? 'border-green-200 bg-green-50 text-green-700'
                            : 'border-amber-200 bg-amber-50 text-amber-700'
                        }`}
                      >
                        {c.vigente
                          ? <ShieldCheck className="h-3 w-3 shrink-0" />
                          : <ShieldX className="h-3 w-3 shrink-0" />
                        }
                        <span className="truncate max-w-[130px]">{c.template_nombre}</span>
                        {c.vigente && c.archivo_url && (
                          <a
                            href={c.archivo_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="opacity-60 hover:opacity-100 transition-opacity ml-0.5"
                          >
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              {/* Acciones + recordatorio — todos inline */}
              {(() => {
                const accionesModal: AccionModal[] = [
                  ...(cita.estado === 'confirmada' && !isPasada
                    ? [{ kind: 'manual' as const }]
                    : []),
                  ...transiciones
                    .filter((e) => e !== 'en_espera' && e !== 'en_curso')
                    .map((estado) => ({ kind: 'estado' as const, estado })),
                ]
                const tieneEnEspera = transiciones.includes('en_espera')
                const tieneEnCurso = transiciones.includes('en_curso')
                const consentimientoPendiente = tieneEnCurso
                  && (cita.consentimiento_info?.consentimientos?.length ?? 0) > 0
                  && !cita.consentimiento_info?.todos_firmados
                const tieneRecordatorio = !['cancelada', 'completada', 'no_asistio'].includes(cita.estado)
                if (!tieneEnEspera && !tieneEnCurso && accionesModal.length === 0 && !tieneRecordatorio) return null
                return (
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap gap-2">
                      {tieneEnEspera && (
                        <Button size="sm" onClick={() => setCheckinOpen(true)}>
                          <UserCheck className="h-3.5 w-3.5 mr-1.5" />
                          Registrar llegada
                        </Button>
                      )}
                      {tieneEnCurso && consentimientoPendiente && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-amber-300 text-amber-700 hover:bg-amber-50"
                          disabled={cambiando}
                          onClick={() => setFirmaOpen(true)}
                        >
                          <FileSignature className="h-3.5 w-3.5 mr-1.5" />
                          Firmar consentimiento
                        </Button>
                      )}
                      {tieneEnCurso && !consentimientoPendiente && (
                        <Button size="sm" onClick={() => setPagoOpen(true)}>
                          Iniciar atención
                        </Button>
                      )}
                      {accionesModal.length > 0 && (
                        <Button size="sm" variant="outline" onClick={() => handleOpenModal(accionesModal)}>
                          {ACCION_BTN_LABEL[accionKey(accionesModal[0])] ?? 'Registrar contacto'}
                        </Button>
                      )}
                      {tieneRecordatorio && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={enviandoRecordatorio}
                          onClick={() => enviarRecordatorio()}
                        >
                          <Bell className="h-3.5 w-3.5 mr-1.5" />
                          {enviandoRecordatorio ? 'Enviando…' : 'Recordatorio'}
                        </Button>
                      )}
                    </div>
                    {recordatorioOk && (
                      <p className="text-xs text-emerald-600 font-medium">Recordatorio enviado</p>
                    )}
                    {recordatorioError && (
                      <p className="text-xs text-destructive">{recordatorioError}</p>
                    )}
                  </div>
                )
              })()}

              <Separator />

              {/* Historial de contacto */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setShowRegistros((v) => !v)}
                  className="flex items-center justify-between w-full text-left"
                >
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Historial de contacto
                  </p>
                  {showRegistros
                    ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                    : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  }
                </button>
                {showRegistros && <RegistrosConfirmacion citaId={cita.id} />}
              </div>

              <Separator />

              {/* Link a historia */}
              <Button variant="outline" size="sm" className="w-full" asChild>
                <Link href={`/pacientes/${cita.paciente}/historia`}>
                  <FileText className="h-4 w-4 mr-2" />
                  Ver historia clínica
                </Link>
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>

    {/* Sheet de firma de consentimiento — primer consentimiento pendiente */}
    {(() => {
      const pendiente = cita?.consentimiento_info?.consentimientos?.find((c) => !c.vigente)
      if (!pendiente) return null
      return (
        <ConsentimientoFirmaSheet
          open={firmaOpen}
          onOpenChange={setFirmaOpen}
          pacienteId={cita!.paciente}
          pacienteNombre={cita!.paciente_nombre}
          token={pendiente.template_token}
          templateNombre={pendiente.template_nombre}
          consentimientoId={pendiente.consentimiento_id}
          vigenciaMeses={undefined}
          onCompleted={() => {
            setFirmaOpen(false)
            queryClient.invalidateQueries({ queryKey: ['citas'] })
          }}
        />
      )
    })()}

    {cita && (
      <LlegadaCheckinSheet
        open={checkinOpen}
        onOpenChange={setCheckinOpen}
        cita={cita}
        onCheckinSuccess={() => {
          setCheckinOpen(false)
          cambiarEstado({ estado: 'en_espera' })
        }}
      />
    )}

    {cita && (
      <IniciarPagoSheet
        open={pagoOpen}
        onOpenChange={(open) => { setPagoOpen(open); if (!open) onClose() }}
        cita={cita}
        soloRegistrar={!canIniciarAtencion(user)}
      />
    )}

    {/* Modal de registro de contacto */}
    <Dialog open={modalOpen} onOpenChange={(open) => { if (!open) handleCloseModal() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Registrar contacto</DialogTitle>
        </DialogHeader>

        {(() => {
          if (!cita) return null
          const accionesModal: AccionModal[] = [
            ...transiciones
              .filter((e) => e !== 'en_espera' && e !== 'en_curso')
              .map((estado) => ({ kind: 'estado' as const, estado })),
            ...(cita.estado === 'confirmada' && !isPasada
              ? [{ kind: 'manual' as const }]
              : []),
          ]
          return (
            <div className="space-y-4">
              {accionesModal.length > 1 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">¿Qué ocurrió?</Label>
                  <div className="flex flex-col gap-1.5">
                    {accionesModal.map((a) => {
                      const key = accionKey(a)
                      const active = selectedAccion && accionKey(selectedAccion) === key
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => { setSelectedAccion(a); setMotivo('') }}
                          className={`text-left text-sm px-3 py-2 rounded-md border transition-colors ${
                            active
                              ? 'border-primary bg-primary/5 text-primary font-medium'
                              : 'border-input bg-background hover:bg-muted'
                          }`}
                        >
                          {ACCION_LABEL[key] ?? key}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {selectedAccion?.kind === 'estado' && selectedAccion.estado === 'cancelada' && (
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Motivo de cancelación
                    <span className="text-destructive ml-1">*</span>
                  </Label>
                  <Textarea
                    rows={2}
                    placeholder="Describe el motivo…"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    className="text-sm resize-none"
                  />
                  {!motivo.trim() && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Requerido para cancelar
                    </p>
                  )}
                </div>
              )}

              <ConfirmacionForm
                estado={selectedAccion?.kind === 'estado' ? selectedAccion.estado : 'confirmada'}
                isPending={cambiando || confirmando}
                onConfirmar={handleConfirmarModal}
                onCancelar={handleCloseModal}
                confirmLabel={selectedAccion ? (ACCION_BTN_LABEL[accionKey(selectedAccion)] ?? 'Guardar') : 'Guardar'}
                cancelLabel="Cerrar"
              />
            </div>
          )
        })()}
      </DialogContent>
    </Dialog>
    </>
  )
}

