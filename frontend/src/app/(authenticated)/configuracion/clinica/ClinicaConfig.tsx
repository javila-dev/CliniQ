'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Clock, Check, Save, ImageIcon, Upload, Trash2, Loader2,
  ShieldCheck, CreditCard, PenLine, ScanFace, Workflow,
  Lock, Bell, Info, Link2, Copy, QrCode, Printer, ClipboardList,
  MapPin, HeartPulse, Sparkles, Timer,
  ChevronDown, ChevronUp, Camera,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { clinicasApi } from '@/lib/api/clinicas'
import { toast } from '@/hooks/use-toast'
import { aplicarErroresDeCampo, mensajeDeError } from '@/lib/errores'
import type { ConfiguracionFacial } from '@/types/clinicas'
import { PageHeader } from '@/components/shared/PageHeader'
import { FiltroProfesionalesPorProcedimiento } from '@/components/configuracion/FiltroProfesionalesPorProcedimiento'
import { FlujoRecepcion } from '@/components/configuracion/FlujoRecepcion'
import {
  avisarGuardado, BarraGuardado, EtiquetaAjuste, FilaAjuste, NotaAjuste, SeccionAjustes, SelectAjuste, VacioAjustes,
} from '@/components/configuracion/ajustes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useAuthStore } from '@/store/authStore'
import { hasPermission, PERM } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { resolveMediaUrl } from '@/lib/utils/media'
import type { WizardConfig } from '@/types/clinicas'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const WIZARD_STEPS: {
  key: keyof WizardConfig
  label: string
  description: string
  icon: React.ElementType
  toggleBloqueado?: boolean
  esAddon?: boolean
  addonKey?: 'facial_verificacion_habilitada' | 'whatsapp_habilitado'
  addonLockedCopy?: string
}[] = [
  {
    key: 'paso_checkin',
    label: 'Verificación de llegada',
    description: 'Confirma que el paciente llegó, con un código que recibe por WhatsApp o con una foto.',
    icon: ScanFace,
    esAddon: true,
    addonKey: 'whatsapp_habilitado',
    addonLockedCopy: 'Envía cotizaciones, firmas y recordatorios por WhatsApp, y verifica la llegada del paciente por código. Contáctanos para activarlo.',
  },
  {
    key: 'paso_verificacion_facial',
    label: 'Verificación de identidad facial',
    description: 'Compara la foto en vivo del paciente con su foto de control registrada.',
    icon: ShieldCheck,
    esAddon: true,
    addonKey: 'facial_verificacion_habilitada',
  },
  {
    key: 'paso_pago',
    label: 'Registro de pago',
    description: 'Registra el cobro de la sesión antes de iniciar la atención.',
    icon: CreditCard,
  },
  {
    key: 'paso_firma_asistencia',
    label: 'Firma de asistencia',
    description: 'Firma digital del registro de presencia al finalizar el ingreso.',
    icon: PenLine,
  },
]

const DEFAULT_WIZARD_CONFIG: WizardConfig = {
  paso_checkin: true,
  paso_verificacion_facial: false,
  foto_control_obligatoria: false,
  paso_pago: true,
  paso_firma_asistencia: true,
}

const INTERVAL_OPTIONS = [5, 10, 15, 20, 30, 45, 60]

const INTERVALO_RECORDATORIO_OPTIONS = [
  { value: 1,  label: '1 hora' },
  { value: 2,  label: '2 horas' },
  { value: 4,  label: '4 horas' },
  { value: 6,  label: '6 horas' },
  { value: 12, label: '12 horas' },
  { value: 24, label: '1 día' },
  { value: 48, label: '2 días' },
  { value: 72, label: '3 días' },
]

const schema = z.object({
  nombre: z.string().min(1, 'El nombre es obligatorio'),
  nit: z.string().trim().min(1, 'El NIT es obligatorio'),
  telefono: z.string().optional(),
})
type FormData = z.infer<typeof schema>

const OPCIONES_INTERVALO = INTERVAL_OPTIONS.map((v) => ({ value: String(v), label: 'Cada ' + v + ' min' }))
const OPCIONES_RECORDATORIO = INTERVALO_RECORDATORIO_OPTIONS.map((o) => ({ value: String(o.value), label: o.label + ' antes' }))

export type SeccionClinica = 'general' | 'agenda' | 'atencion' | 'pacientes' | 'biometria'

/** Título de cada sección cuando una página apila varias (Agenda y pacientes, Recepción). */
const TITULO_SECCION: Record<SeccionClinica, { titulo: string; descripcion: string }> = {
  general:   { titulo: 'Datos de la clínica',    descripcion: 'Logo, nombre, NIT y teléfono.' },
  agenda:    { titulo: 'Agenda y recordatorios', descripcion: 'Frecuencia de turnos, recordatorios y profesionales por procedimiento.' },
  atencion:  { titulo: 'Pasos de recepción',     descripcion: 'Pasos antes de atender: llegada por código, pago y firma de asistencia.' },
  pacientes: { titulo: 'Registro de pacientes',  descripcion: 'Formulario y link para que los pacientes se registren solos.' },
  biometria: { titulo: 'Biometría',              descripcion: 'Verificación facial del paciente, umbrales y check-in automático.' },
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

/** Ajustes que viven en el modelo de la clínica. Cada página de Configuración
 *  muestra solo sus secciones; varias se apilan con su título y un ancla
 *  (#agenda, #biometria…) para que el buscador lleve a la sección exacta. */
export function ClinicaConfig({
  secciones, title, description, helpSlug,
}: {
  secciones: SeccionClinica[]
  title: string
  description?: string
  helpSlug?: string
}) {
  const { user } = useAuthStore()
  const clinicaId = user?.clinica_id
  const qc = useQueryClient()
  const router = useRouter()
  const isAdmin = hasPermission(user, PERM.CLINICAS_EDITAR)

  const ver = (s: SeccionClinica) => secciones.includes(s)
  const apiladas = secciones.length > 1

  // El #ancla llega antes de que carguen los datos: se reintenta el scroll al montar.
  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (!id) return
    const t = setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }), 150)
    return () => clearTimeout(t)
  }, [])

  const tituloSeccion = (s: SeccionClinica) =>
    apiladas && ver(s) && (
      <div id={s} className="flex scroll-mt-6 flex-wrap items-baseline gap-x-2.5 gap-y-0.5 pt-4 first:pt-0">
        <h2 className="text-[15px] font-semibold text-foreground">{TITULO_SECCION[s].titulo}</h2>
        <p className="text-[12.5px] text-muted-foreground">{TITULO_SECCION[s].descripcion}</p>
      </div>
    )

  const { data: clinica, isLoading } = useQuery({
    queryKey: ['clinica', clinicaId],
    queryFn: () => clinicasApi.get(clinicaId!),
    enabled: !!clinicaId,
  })

  const { data: miClinica } = useQuery({
    queryKey: ['mi-clinica', clinicaId],
    queryFn: () => clinicasApi.miClinica(clinicaId),
    enabled: !!clinicaId,
  })

  const facialHabilitado = miClinica?.facial_verificacion_habilitada ?? false

  // ── Datos generales ──────────────────────────────────────────────────────
  const { register, handleSubmit, reset, setError, formState: { errors, isDirty: isFormDirty } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    if (clinica) reset({ nombre: clinica.nombre ?? '', nit: clinica.nit ?? '', telefono: clinica.telefono ?? '' })
  }, [clinica, reset])

  const updateMutation = useMutation({
    mutationFn: (data: FormData) => clinicasApi.update(clinicaId!, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinica', clinicaId] }),
    // NIT repetido u otro error del campo: se muestra junto al campo.
    onError: (err) => { aplicarErroresDeCampo(err, setError, ['nombre', 'nit', 'telefono']) },
  })

  const guardarDatos = handleSubmit((data) =>
    updateMutation.mutate(data, { onSuccess: () => { reset(data); avisarGuardado() } }),
  )

  // ── Logo ─────────────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [logoError, setLogoError] = useState<string | null>(null)

  const logoMutation = useMutation({
    mutationFn: (file: File) => clinicasApi.subirLogo(clinicaId!, file),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clinica', clinicaId] }); setLogoError(null) },
    onError: () => setLogoError('No se pudo subir el logo. Intenta de nuevo.'),
  })

  const eliminarLogoMutation = useMutation({
    mutationFn: () => clinicasApi.eliminarLogo(clinicaId!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinica', clinicaId] }),
  })

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setLogoError('El archivo supera los 2 MB permitidos.'); return }
    if (!['image/png', 'image/jpeg'].includes(file.type)) { setLogoError('Solo se permiten archivos PNG o JPG.'); return }
    setLogoError(null)
    logoMutation.mutate(file)
    e.target.value = ''
  }

  // ── Frecuencia de turnos (se guarda al elegirla) ─────────────────────────
  const [selectedInterval, setSelectedInterval] = useState<number>(15)
  useEffect(() => { if (clinica?.slot_interval_min) setSelectedInterval(clinica.slot_interval_min) }, [clinica])

  const intervalMutation = useMutation({
    mutationFn: (value: number) => clinicasApi.update(clinicaId!, { slot_interval_min: value }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinica', clinicaId] })
      qc.invalidateQueries({ queryKey: ['slot_interval', clinicaId] })
    },
    onError: () => {
      setSelectedInterval(clinica?.slot_interval_min ?? 15)
      toast.error('No se pudo guardar', 'Intenta de nuevo.')
    },
  })

  /** Guarda la frecuencia; con `deshacerA`, el aviso ofrece volver a ese valor. */
  function cambiarIntervalo(valor: number, deshacerA?: number) {
    setSelectedInterval(valor)
    intervalMutation.mutate(valor, {
      onSuccess: () => avisarGuardado(deshacerA !== undefined ? () => cambiarIntervalo(deshacerA) : undefined),
    })
  }

  // ── Recordatorios (se guardan al cambiarlos) ─────────────────────────────
  const { data: recordatorioConfig, isLoading: loadingRecordatorio, isError: errorRecordatorio, refetch: recargarRecordatorio } = useQuery({
    queryKey: ['recordatorio_config', clinicaId],
    queryFn: () => clinicasApi.recordatorioConfig.get(clinicaId!),
    enabled: !!clinicaId,
  })

  const [recordatoriosActivos, setRecordatoriosActivos] = useState(true)
  const [recordatorioIntervalo, setRecordatorioIntervalo] = useState(24)

  useEffect(() => {
    if (recordatorioConfig) {
      setRecordatoriosActivos(recordatorioConfig.recordatorios_automaticos)
      setRecordatorioIntervalo(recordatorioConfig.intervalo_recordatorio_horas)
    }
  }, [recordatorioConfig])

  const recordatorioMutation = useMutation({
    mutationFn: (datos: { recordatorios_automaticos: boolean; intervalo_recordatorio_horas: number }) =>
      clinicasApi.recordatorioConfig.update(clinicaId!, datos),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recordatorio_config', clinicaId] }),
    onError: () => {
      if (recordatorioConfig) {
        setRecordatoriosActivos(recordatorioConfig.recordatorios_automaticos)
        setRecordatorioIntervalo(recordatorioConfig.intervalo_recordatorio_horas)
      }
      toast.error('No se pudo guardar', 'Intenta de nuevo.')
    },
  })

  // Antes el interruptor solo cambiaba en pantalla hasta pulsar "Guardar", y
  // quien salía sin guardar creía haber apagado los recordatorios.
  function guardarRecordatorios(cambio: { activos?: boolean; horas?: number }, conDeshacer = true) {
    const antes = { activos: recordatoriosActivos, horas: recordatorioIntervalo }
    const despues = { ...antes, ...cambio }
    setRecordatoriosActivos(despues.activos)
    setRecordatorioIntervalo(despues.horas)
    recordatorioMutation.mutate(
      { recordatorios_automaticos: despues.activos, intervalo_recordatorio_horas: despues.horas },
      { onSuccess: () => avisarGuardado(conDeshacer ? () => guardarRecordatorios(antes, false) : undefined) },
    )
  }

  // ── Wizard ───────────────────────────────────────────────────────────────
  const { data: wizardConfig, isLoading: loadingWizard } = useQuery({
    queryKey: ['wizard-config'],
    queryFn: () => clinicasApi.wizardConfig.get(),
  })

  const wizardMutation = useMutation({
    mutationFn: (data: Partial<WizardConfig>) => clinicasApi.wizardConfig.update(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wizard-config'] }),
    onError: () => toast.error('No se pudo guardar', 'Intenta de nuevo.'),
  })

  const effectiveWizard: WizardConfig = wizardConfig ?? DEFAULT_WIZARD_CONFIG

  /** Prende o apaga un paso de recepción; el aviso permite volver atrás. */
  function cambiarPaso(clave: keyof WizardConfig, valor: boolean, conDeshacer = true) {
    wizardMutation.mutate({ [clave]: valor }, {
      onSuccess: () => avisarGuardado(conDeshacer ? () => cambiarPaso(clave, !valor, false) : undefined),
    })
  }
  const pasoFacialActivo = wizardConfig?.paso_verificacion_facial ?? false

  // ── Configuración facial ─────────────────────────────────────────────────
  const { data: facialConfig, isLoading: loadingFacial } = useQuery({
    queryKey: ['facial-config'],
    queryFn: () => clinicasApi.facialConfig.get(),
    enabled: pasoFacialActivo,
  })

  // La pestaña Verificación facial guarda junto la configuración facial y la
  // foto de control obligatoria (que vive en la configuración de recepción).
  const facialMutation = useMutation({
    mutationFn: async ({ data, foto }: { data: Partial<ConfiguracionFacial>; foto: boolean }) => {
      await clinicasApi.facialConfig.update(data)
      if (foto !== effectiveWizard.foto_control_obligatoria) {
        await clinicasApi.wizardConfig.update({ foto_control_obligatoria: foto })
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['facial-config'] })
      qc.invalidateQueries({ queryKey: ['wizard-config'] })
      avisarGuardado()
    },
    onError: () => toast.error('No se pudo guardar', 'Intenta de nuevo.'),
  })

  // ── Autoregistro ─────────────────────────────────────────────────────────
  const [tabPersonalReq, setTabPersonalReq] = useState(false)
  const [tabSaludReq, setTabSaludReq] = useState(false)

  const { data: registroConfig } = useQuery({
    queryKey: ['registro-publico-config', clinicaId],
    queryFn: () => clinicasApi.registroPublicoConfig.get(),
    enabled: !!clinicaId,
  })

  useEffect(() => {
    if (registroConfig) {
      setTabPersonalReq(registroConfig.tab_personal_requerido)
      setTabSaludReq(registroConfig.tab_salud_requerido)
    }
  }, [registroConfig])

  const tabsRegMutation = useMutation({
    mutationFn: (data: { tab_personal_requerido?: boolean; tab_salud_requerido?: boolean }) =>
      clinicasApi.registroPublicoConfig.update(data),
    onSuccess: (data) => qc.setQueryData(['registro-publico-config', clinicaId], data),
    onError: () => {
      // El cambio se mostró antes de guardar: volver al valor guardado.
      setTabPersonalReq(registroConfig?.tab_personal_requerido ?? false)
      setTabSaludReq(registroConfig?.tab_salud_requerido ?? false)
      toast.error('No se pudo guardar', 'Intenta de nuevo.')
    },
  })

  function cambiarRequerido(campo: 'personal' | 'salud', valor: boolean, conDeshacer = true) {
    if (campo === 'personal') setTabPersonalReq(valor)
    else setTabSaludReq(valor)
    tabsRegMutation.mutate(
      campo === 'personal' ? { tab_personal_requerido: valor } : { tab_salud_requerido: valor },
      { onSuccess: () => avisarGuardado(conDeshacer ? () => cambiarRequerido(campo, !valor, false) : undefined) },
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  if (!user) return null
  if (!clinicaId) {
    return (
      <div className="max-w-2xl">
        <PageHeader helpSlug={helpSlug} title={title} />
        <div className="rounded-xl border bg-white p-8 text-center text-sm text-gray-400">No tienes una clínica asignada.</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader helpSlug={helpSlug} title={title} description={description} />

      <div className="space-y-7">

          {/* ── TAB: General ── */}
          {tituloSeccion('general')}
          {ver('general') && (
            <>
              <SeccionAjustes titulo="Logo" descripcion="PNG o JPG de máximo 2 MB. Se ve mejor con fondo transparente.">
                <div className="flex items-center gap-4 px-4 py-3.5">
                  <div className="relative flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed bg-muted/40">
                    {logoMutation.isPending ? (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    ) : clinica?.logo_url ? (
                      <Image src={resolveMediaUrl(clinica.logo_url)!} alt={clinica.nombre ?? 'Logo'} fill className="object-contain p-1.5" unoptimized />
                    ) : (
                      <ImageIcon className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  {isAdmin && (
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm" disabled={logoMutation.isPending} onClick={() => fileInputRef.current?.click()}>
                          <Upload className="mr-1.5 h-3.5 w-3.5" />
                          {clinica?.logo_url ? 'Cambiar logo' : 'Subir logo'}
                        </Button>
                        {clinica?.logo_url && (
                          <Button
                            type="button" variant="ghost" size="sm"
                            disabled={eliminarLogoMutation.isPending}
                            className="text-destructive hover:bg-destructive/5 hover:text-destructive"
                            onClick={() => { if (confirm('¿Eliminar el logo de la clínica?')) eliminarLogoMutation.mutate() }}
                          >
                            {eliminarLogoMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
                            Eliminar
                          </Button>
                        )}
                      </div>
                      {logoError && <p className="text-[13px] text-destructive">{logoError}</p>}
                    </div>
                  )}
                </div>
                <input ref={fileInputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleFileChange} />
              </SeccionAjustes>

              <SeccionAjustes titulo="Datos de la clínica" descripcion="Nombre, NIT y teléfono de contacto.">
                {isLoading ? (
                  <FilasCargando filas={2} />
                ) : (
                  <form onSubmit={guardarDatos} className="grid gap-4 px-4 py-4 sm:grid-cols-2">
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="nombre" className="text-[13px] font-medium">Nombre de la clínica</Label>
                      <Input id="nombre" {...register('nombre')} disabled={!isAdmin} placeholder="Ej. Clínica Estética Bella" aria-describedby="nombre-ayuda" />
                      {errors.nombre
                        ? <p className="text-[13px] text-destructive">{errors.nombre.message}</p>
                        : <p id="nombre-ayuda" className="text-[13px] text-muted-foreground">Este será el nombre que se enviará en los mensajes de WhatsApp.</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="nit" className="text-[13px] font-medium">NIT</Label>
                      <Input id="nit" {...register('nit')} disabled={!isAdmin} placeholder="Ej. 901234567-8" />
                      {errors.nit && <p className="text-[13px] text-destructive">{errors.nit.message}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="telefono" className="text-[13px] font-medium">
                        Teléfono <span className="font-normal text-muted-foreground">(opcional)</span>
                      </Label>
                      <Input id="telefono" {...register('telefono')} disabled={!isAdmin} placeholder="Ej. 3001234567" />
                    </div>
                    {updateMutation.isError && !errors.nit && !errors.nombre && (
                      <p className="text-sm text-destructive sm:col-span-2">{mensajeDeError(updateMutation.error, 'No se pudo guardar. Intenta de nuevo.')}</p>
                    )}
                  </form>
                )}
              </SeccionAjustes>

              <BarraGuardado
                visible={isAdmin && isFormDirty}
                guardando={updateMutation.isPending}
                onGuardar={guardarDatos}
                onDescartar={() => reset()}
              />
            </>
          )}

          {/* ── TAB: Agenda ── */}
          {tituloSeccion('agenda')}
          {ver('agenda') && (
            <>
              <SeccionAjustes titulo="Turnos" descripcion="Cómo se ofrecen las horas al agendar una cita.">
                {isLoading ? <FilasCargando filas={2} /> : (
                  <>
                    <FilaAjuste
                      icono={Clock}
                      titulo="Frecuencia de turnos"
                      descripcion="Cada cuántos minutos se ofrecen horas disponibles."
                    >
                      <SelectAjuste
                        etiqueta="Frecuencia de turnos"
                        valor={String(selectedInterval)}
                        opciones={OPCIONES_INTERVALO}
                        onCambiar={(v) => cambiarIntervalo(Number(v), selectedInterval)}
                        deshabilitado={!isAdmin || intervalMutation.isPending}
                      />
                    </FilaAjuste>
                    <FiltroProfesionalesPorProcedimiento
                      clinicaId={clinicaId}
                      activo={clinica?.filtrar_profesionales_por_procedimiento ?? false}
                      puedeEditar={isAdmin}
                    />
                  </>
                )}
              </SeccionAjustes>

              <SeccionAjustes titulo="Recordatorios" descripcion="Mensajes de WhatsApp que le recuerdan la cita al paciente.">
                {loadingRecordatorio ? <FilasCargando filas={2} /> : errorRecordatorio ? (
                  <FilaAjuste titulo="No se pudo cargar la configuración de recordatorios.">
                    <Button type="button" variant="outline" size="sm" onClick={() => recargarRecordatorio()}>Reintentar</Button>
                  </FilaAjuste>
                ) : (
                  <>
                    <FilaAjuste
                      icono={Bell}
                      apagada={!recordatoriosActivos}
                      titulo="Recordatorios automáticos"
                      descripcion={recordatoriosActivos
                        ? 'Se envían solos por WhatsApp antes de cada cita.'
                        : 'Apagado: los pacientes no reciben recordatorios automáticos.'}
                    >
                      <Switch
                        checked={recordatoriosActivos}
                        onCheckedChange={(activos) => guardarRecordatorios({ activos })}
                        disabled={!isAdmin || recordatorioMutation.isPending}
                        aria-label="Recordatorios automáticos"
                      />
                    </FilaAjuste>
                    <FilaAjuste
                      icono={Timer}
                      apagada={!recordatoriosActivos}
                      titulo="Cuándo enviarlo"
                      descripcion="Tiempo antes de la cita."
                    >
                      <SelectAjuste
                        etiqueta="Cuándo enviar el recordatorio"
                        valor={String(recordatorioIntervalo)}
                        opciones={OPCIONES_RECORDATORIO}
                        onCambiar={(v) => guardarRecordatorios({ horas: Number(v) })}
                        deshabilitado={!isAdmin || !recordatoriosActivos || recordatorioMutation.isPending}
                      />
                    </FilaAjuste>
                    <NotaAjuste>
                      También puedes enviar un recordatorio a mano desde el detalle de la cita.{' '}
                      <Link href="/configuracion/whatsapp" className="font-medium text-primary underline-offset-2 hover:underline">
                        Ver número de envío
                      </Link>
                    </NotaAjuste>
                  </>
                )}
              </SeccionAjustes>
            </>
          )}

          {/* ── TAB: Atención ── */}
          {tituloSeccion('atencion')}
          {ver('atencion') && (
            <>
              <SeccionAjustes
                titulo="Pasos al llegar el paciente"
                descripcion="El recorrido del paciente desde que llega. Apaga un paso y el recorrido lo salta."
              >
                {loadingWizard ? <FilasCargando filas={4} /> : (
                  <FlujoRecepcion
                    deshabilitado={!isAdmin || wizardMutation.isPending}
                    onCambiar={(clave, valor) => cambiarPaso(clave as keyof WizardConfig, valor)}
                    pasos={WIZARD_STEPS.map((step) => {
                      const addonNoHabilitado = step.esAddon && !(step.addonKey && miClinica?.[step.addonKey])
                      return {
                        clave: step.key,
                        titulo: step.label,
                        icono: step.icon,
                        activo: effectiveWizard[step.key],
                        bloqueado: addonNoHabilitado ? 'plan' as const : step.toggleBloqueado ? 'fijo' as const : undefined,
                        extra: step.esAddon
                          ? <EtiquetaAjuste tono={addonNoHabilitado ? 'neutro' : 'addon'} icono={Sparkles}>Add-on</EtiquetaAjuste>
                          : undefined,
                        descripcion: addonNoHabilitado ? (
                          step.addonLockedCopy ?? 'Contáctanos para habilitar este módulo en tu plan.'
                        ) : step.key === 'paso_checkin' ? (
                          <>
                            {step.description} El código sale del número de CliniQ, aunque tengas{' '}
                            <Link href="/configuracion/whatsapp" className="font-medium text-primary hover:underline">número propio</Link>.
                          </>
                        ) : step.description,
                      }
                    })}
                  />
                )}
              </SeccionAjustes>

            </>
          )}

          {/* ── TAB: Pacientes ── */}
          {tituloSeccion('pacientes')}
          {ver('pacientes') && (
            miClinica?.registro_publico_token ? (
              <>
                <SeccionAjustes titulo="Formulario de registro" descripcion="Qué partes del formulario debe llenar el paciente sí o sí.">
                  {[
                    {
                      campo: 'personal' as const,
                      icono: MapPin,
                      titulo: 'Datos personales obligatorios',
                      descripcion: 'Dirección, ciudad, estado civil, ocupación y responsable.',
                      valor: tabPersonalReq,
                    },
                    {
                      campo: 'salud' as const,
                      icono: HeartPulse,
                      titulo: 'Salud y afiliación obligatorias',
                      descripcion: 'EPS, tipo de afiliado, régimen y grupo sanguíneo.',
                      valor: tabSaludReq,
                    },
                  ].map(({ campo, icono, titulo, descripcion, valor }) => (
                    <FilaAjuste key={campo} icono={icono} apagada={!valor} titulo={titulo} descripcion={descripcion}>
                      <Switch
                        checked={valor}
                        disabled={!isAdmin || tabsRegMutation.isPending}
                        onCheckedChange={(v) => cambiarRequerido(campo, v)}
                        aria-label={titulo}
                      />
                    </FilaAjuste>
                  ))}
                  <NotaAjuste>Si una parte es obligatoria y el paciente no la llena, el formulario no lo deja enviar.</NotaAjuste>
                </SeccionAjustes>

                <SeccionAjustes titulo="Link para registrarse" descripcion="Compártelo por WhatsApp o imprime el QR para la sala de espera.">
                  <div className="px-4 py-3.5">
                    <LinkAutoregistro token={miClinica.registro_publico_token!} nombreClinica={clinica?.nombre ?? ''} />
                  </div>
                </SeccionAjustes>
              </>
            ) : (
              <SeccionAjustes titulo="Formulario de registro">
                <FilaAjuste
                  icono={ClipboardList}
                  apagada
                  titulo="El registro por link no está habilitado"
                  descripcion="Esta clínica no tiene activo el formulario para que los pacientes se registren solos."
                />
              </SeccionAjustes>
            )
          )}

          {/* ── TAB: Biometría ── */}
          {tituloSeccion('biometria')}
          {ver('biometria') && (
            loadingWizard || !miClinica ? (
              <SeccionAjustes titulo="Nivel de coincidencia"><FilasCargando filas={3} /></SeccionAjustes>
            ) : !facialHabilitado ? (
              <AvisoBiometria
                titulo="La verificación facial es un add-on"
                texto="Compara la foto en vivo del paciente con su foto de control. Contáctanos para activarla en tu plan."
              />
            ) : !pasoFacialActivo ? (
              <AvisoBiometria
                titulo="La verificación facial está desactivada"
                texto="Actívala como un paso de Recepción para que se pida cuando llega el paciente. Después ajustarás aquí el nivel de coincidencia y el check-in automático."
                accion={{ label: 'Ir a Pasos de recepción', onClick: () => router.push('/configuracion/recepcion') }}
              />
            ) : (
              <TabBiometria
                config={facialConfig}
                fotoObligatoria={effectiveWizard.foto_control_obligatoria}
                isLoading={loadingFacial}
                isAdmin={isAdmin}
                isPending={facialMutation.isPending}
                onSave={(data, foto) => facialMutation.mutate({ data, foto })}
              />
            )
          )}

      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab Biometría
// ─────────────────────────────────────────────────────────────────────────────

/** Se muestra en lugar de los ajustes cuando aún no hay nada que ajustar: dice por qué y cómo activarlo. */
function AvisoBiometria({
  titulo, texto, accion,
}: {
  titulo: string
  texto: string
  accion?: { label: string; onClick: () => void }
}) {
  return (
    <SeccionAjustes titulo="Verificación facial">
      <VacioAjustes
        titulo={titulo}
        descripcion={texto}
        accion={accion && (
          <Button type="button" variant="outline" size="sm" onClick={accion.onClick}>{accion.label}</Button>
        )}
      />
    </SeccionAjustes>
  )
}

const DEFAULTS: ConfiguracionFacial = {
  umbral_alta: 0.85,
  umbral_media: 0.70,
  checkin_automatico: false,
  min_det_score: 0.80,
  min_blur_score: 60,
  min_brightness: 50,
  max_brightness: 230,
  max_yaw: 25,
  max_pitch: 20,
  max_roll: 25,
  min_face_area_pct: 8,
  min_resolution: 400,
  updated_at: '',
}

type CamposFacial = Omit<ConfiguracionFacial, 'updated_at' | 'checkin_automatico'>

const REQUISITOS_FOTO: {
  campo: keyof CamposFacial; titulo: string; descripcion: string
  min: number; max: number; paso: number; mostrar: (v: number) => string
}[] = [
  { campo: 'min_det_score', titulo: 'Certeza de que hay una cara', descripcion: 'Qué tan seguro debe estar el sistema de ver una cara.', min: 0.5, max: 0.99, paso: 0.01, mostrar: (v) => Math.round(v * 100) + '%' },
  { campo: 'min_blur_score', titulo: 'Nitidez', descripcion: 'Rechaza fotos movidas o borrosas. Más alto, más exigente.', min: 0, max: 150, paso: 5, mostrar: (v) => String(v) },
  { campo: 'min_brightness', titulo: 'Brillo mínimo', descripcion: 'Rechaza fotos muy oscuras.', min: 0, max: 150, paso: 5, mostrar: (v) => String(v) },
  { campo: 'max_brightness', titulo: 'Brillo máximo', descripcion: 'Rechaza fotos sobreexpuestas o con flash directo.', min: 150, max: 255, paso: 5, mostrar: (v) => String(v) },
  { campo: 'max_yaw', titulo: 'Giro de lado', descripcion: 'Cuánto puede girar la cabeza a izquierda o derecha.', min: 5, max: 60, paso: 5, mostrar: (v) => v + '°' },
  { campo: 'max_pitch', titulo: 'Inclinación arriba o abajo', descripcion: 'Cuánto puede levantar o agachar la cabeza.', min: 5, max: 60, paso: 5, mostrar: (v) => v + '°' },
  { campo: 'max_roll', titulo: 'Inclinación lateral', descripcion: 'Cuánto puede ladear la cabeza.', min: 5, max: 60, paso: 5, mostrar: (v) => v + '°' },
  { campo: 'min_face_area_pct', titulo: 'Tamaño de la cara', descripcion: 'Parte mínima de la foto que debe ocupar la cara.', min: 2, max: 40, paso: 1, mostrar: (v) => v + '%' },
  { campo: 'min_resolution', titulo: 'Resolución mínima', descripcion: 'Lado más corto de la foto, en píxeles.', min: 100, max: 1000, paso: 50, mostrar: (v) => v + ' px' },
]

function valoresFacial(c: ConfiguracionFacial): CamposFacial {
  const { updated_at: _u, checkin_automatico: _c, ...campos } = c
  return campos
}

function TabBiometria({
  config, fotoObligatoria, isLoading, isAdmin, isPending, onSave,
}: {
  config?: ConfiguracionFacial
  /** Foto de control obligatoria al registrar (vive en la configuración de recepción). */
  fotoObligatoria: boolean
  isLoading: boolean
  isAdmin: boolean
  isPending: boolean
  onSave: (data: Partial<ConfiguracionFacial>, fotoObligatoria: boolean) => void
}) {
  const guardados = valoresFacial(config ?? DEFAULTS)
  const [valores, setValores] = useState<CamposFacial>(guardados)
  const [foto, setFoto] = useState(fotoObligatoria)
  const [avanzado, setAvanzado] = useState(false)

  useEffect(() => { if (config) setValores(valoresFacial(config)) }, [config])
  useEffect(() => { setFoto(fotoObligatoria) }, [fotoObligatoria])

  const poner = (campo: keyof CamposFacial, valor: number | boolean) => setValores((v) => ({ ...v, [campo]: valor }))
  const hayCambios = !!config && (
    foto !== fotoObligatoria ||
    (Object.keys(valores) as (keyof CamposFacial)[]).some((k) => valores[k] !== guardados[k])
  )

  if (isLoading) {
    return <SeccionAjustes titulo="Foto de control"><FilasCargando filas={3} /></SeccionAjustes>
  }

  const altaPct = Math.round(valores.umbral_alta * 100)
  const mediaPct = Math.round(valores.umbral_media * 100)

  return (
    <>
      <SeccionAjustes titulo="Foto de control" descripcion="La foto con la que se compara al paciente cada vez que llega.">
        <FilaAjuste
          icono={Camera}
          apagada={!foto}
          titulo="Pedirla siempre al registrar un paciente"
          descripcion={foto
            ? 'Al crear un paciente nuevo hay que tomarle la foto; no se puede saltar.'
            : 'Apagado: se puede tomar después desde la ficha, o se pide en su primera llegada.'}
        >
          <Switch checked={foto} onCheckedChange={setFoto} disabled={!isAdmin} aria-label="Pedir la foto de control al registrar un paciente" />
        </FilaAjuste>
      </SeccionAjustes>

      <SeccionAjustes
        titulo="Nivel de coincidencia"
        descripcion="Qué tanto debe parecerse el paciente a su foto. Arrastra las dos marcas."
      >
        <div className="space-y-3 px-4 py-4">
          <RangoNiveles
            media={valores.umbral_media}
            alta={valores.umbral_alta}
            onMedia={(v) => poner('umbral_media', v)}
            onAlta={(v) => poner('umbral_alta', v)}
            deshabilitado={!isAdmin}
          />
          <ul className="grid gap-1.5 text-[13px] sm:grid-cols-3">
            <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-300" /><span><span className="font-medium tabular-nums">Menos de {mediaPct}%</span> · no se verifica</span></li>
            <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-300" /><span><span className="font-medium tabular-nums">{mediaPct}% a {altaPct - 1}%</span> · recepción confirma</span></li>
            <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400" /><span><span className="font-medium tabular-nums">{altaPct}% o más</span> · verificada</span></li>
          </ul>
        </div>
      </SeccionAjustes>

      <SeccionAjustes
        titulo="Requisitos de la foto de control"
        descripcion="Qué tan exigente es el sistema al aceptar una foto nueva."
        accion={
          <Button type="button" variant="ghost" size="sm" onClick={() => setAvanzado((v) => !v)} aria-expanded={avanzado}>
            {avanzado ? 'Ocultar' : 'Ver requisitos'}
            {avanzado ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />}
          </Button>
        }
      >
        {avanzado ? REQUISITOS_FOTO.map((r) => (
          <FilaAjuste key={r.campo} titulo={r.titulo} descripcion={r.descripcion}>
            <Deslizante etiqueta={r.titulo} valor={valores[r.campo] as number} min={r.min} max={r.max} paso={r.paso}
              mostrar={r.mostrar} onCambiar={(v) => poner(r.campo, v)} deshabilitado={!isAdmin} />
          </FilaAjuste>
        )) : (
          <FilaAjuste
            titulo="9 requisitos de calidad"
            descripcion="Nitidez, brillo, ángulo de la cabeza y tamaño de la cara. Los valores por defecto sirven para la mayoría de clínicas."
          />
        )}
      </SeccionAjustes>

      {isAdmin && (
        <BarraGuardado
          visible={hayCambios}
          guardando={isPending}
          onGuardar={() => onSave(valores, foto)}
          onDescartar={() => { setValores(guardados); setFoto(fotoObligatoria) }}
        />
      )}
    </>
  )
}

const RANGO_MIN = 0.5
const RANGO_MAX = 0.99
/** Distancia mínima entre las dos marcas, para que siempre haya franja de "confirmar". */
const SEPARACION = 0.05

/**
 * Las dos marcas (media y alta) sobre la misma barra de colores: el color de
 * cada franja empieza justo donde está la marca. La barra se recorta el radio
 * de la marca en cada lado, que es por donde viaja el centro de la marca nativa.
 */
function RangoNiveles({
  media, alta, onMedia, onAlta, deshabilitado,
}: {
  media: number; alta: number
  onMedia: (v: number) => void; onAlta: (v: number) => void
  deshabilitado: boolean
}) {
  const pos = (v: number) => ((v - RANGO_MIN) / (RANGO_MAX - RANGO_MIN)) * 100
  const marca = cn(
    'pointer-events-none absolute inset-0 h-full w-full appearance-none bg-transparent focus-visible:outline-none disabled:cursor-not-allowed',
    '[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-foreground/70 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_1px_4px_rgba(0,0,0,0.25)]',
    '[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:cursor-grab [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-foreground/70 [&::-moz-range-thumb]:bg-white',
    'focus-visible:[&::-webkit-slider-thumb]:ring-4 focus-visible:[&::-webkit-slider-thumb]:ring-primary/30',
  )
  return (
    <div>
      <div className="relative h-6">
        <div className="absolute inset-x-2.5 top-1/2 flex h-2.5 -translate-y-1/2 overflow-hidden rounded-full" aria-hidden>
          <div className="bg-red-300" style={{ width: pos(media) + '%' }} />
          <div className="bg-amber-300" style={{ width: (pos(alta) - pos(media)) + '%' }} />
          <div className="flex-1 bg-emerald-400" />
        </div>
        <input
          type="range" min={RANGO_MIN} max={RANGO_MAX} step={0.01} value={media}
          onChange={(e) => onMedia(Math.min(parseFloat(e.target.value), +(alta - SEPARACION).toFixed(2)))}
          disabled={deshabilitado}
          aria-label="Desde aquí recepción confirma"
          aria-valuetext={Math.round(media * 100) + '%'}
          className={marca}
        />
        <input
          type="range" min={RANGO_MIN} max={RANGO_MAX} step={0.01} value={alta}
          onChange={(e) => onAlta(Math.max(parseFloat(e.target.value), +(media + SEPARACION).toFixed(2)))}
          disabled={deshabilitado}
          aria-label="Desde aquí se da por verificada"
          aria-valuetext={Math.round(alta * 100) + '%'}
          className={marca}
        />
      </div>
      <div className="mt-1 flex justify-between px-0.5 text-xs tabular-nums text-muted-foreground" aria-hidden>
        <span>{Math.round(RANGO_MIN * 100)}%</span>
        <span>{Math.round(RANGO_MAX * 100)}%</span>
      </div>
    </div>
  )
}

/** Control deslizante con su valor a la derecha, para el lado derecho de una FilaAjuste. */
function Deslizante({
  etiqueta, valor, min, max, paso, mostrar, onCambiar, deshabilitado,
}: {
  etiqueta: string; valor: number; min: number; max: number; paso: number
  mostrar: (v: number) => string; onCambiar: (v: number) => void; deshabilitado: boolean
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range" min={min} max={max} step={paso} value={valor}
        onChange={(e) => onCambiar(parseFloat(e.target.value))}
        disabled={deshabilitado}
        aria-label={etiqueta}
        className="w-28 accent-primary disabled:cursor-not-allowed sm:w-44"
      />
      <span className="w-12 text-right text-sm font-medium tabular-nums">{mostrar(valor)}</span>
    </div>
  )
}

/** Filas grises mientras cargan los datos de una SeccionAjustes. */
function FilasCargando({ filas }: { filas: number }) {
  return (
    <>
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5">
          <div className="h-8 w-8 shrink-0 animate-pulse rounded-lg bg-muted" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-40 animate-pulse rounded bg-muted" />
            <div className="h-2.5 w-64 max-w-full animate-pulse rounded bg-muted" />
          </div>
          <div className="h-6 w-10 animate-pulse rounded-full bg-muted" />
        </div>
      ))}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared Section wrapper
// ─────────────────────────────────────────────────────────────────────────────

function Section({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string
  description?: string
  icon?: React.ElementType
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border bg-white p-6 space-y-5">
      <div>
        <div className={cn('flex items-center gap-2 text-sm font-semibold text-gray-800', Icon && 'text-gray-800')}>
          {Icon && <Icon className="h-4 w-4 text-gray-400" />}
          {title}
        </div>
        {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      </div>
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// LinkAutoregistro
// ─────────────────────────────────────────────────────────────────────────────

function LinkAutoregistro({ token, nombreClinica }: { token: string; nombreClinica: string }) {
  const [copiado, setCopiado] = useState(false)
  const [mostrarQr, setMostrarQr] = useState(false)
  const url = typeof window !== 'undefined' ? `${window.location.origin}/registro/${token}` : `/registro/${token}`

  function copiar() {
    navigator.clipboard.writeText(url).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2000) })
  }

  function imprimir() {
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <!DOCTYPE html><html lang="es"><head><meta charset="UTF-8" /><title>QR Autoregistro — ${nombreClinica}</title>
      <style>body{font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;gap:16px;text-align:center;}h1{font-size:22px;font-weight:700;margin:0;}p{font-size:14px;color:#555;margin:0;}img{width:220px;height:220px;}</style>
      </head><body onload="window.print()">
      <h1>${nombreClinica}</h1>
      <img src="${document.getElementById('qr-registro')?.querySelector('canvas') ? (document.getElementById('qr-registro')?.querySelector('canvas') as HTMLCanvasElement).toDataURL() : ''}" />
      <p>Escanea este código para registrarte como paciente</p>
      <p style="font-size:11px;color:#999;margin-top:8px;">${url}</p>
      </body></html>
    `)
    win.document.close()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 rounded-md border bg-gray-50 px-3 py-2">
          <p className="text-xs text-muted-foreground truncate font-mono">{url}</p>
        </div>
        <button type="button" onClick={copiar} className="shrink-0 flex items-center gap-1.5 rounded-md border bg-white px-3 py-2 text-xs font-medium hover:bg-gray-50 transition-colors">
          {copiado ? <><Check className="h-3.5 w-3.5 text-emerald-600" /><span className="text-emerald-600">Copiado</span></> : <><Copy className="h-3.5 w-3.5" />Copiar</>}
        </button>
        <button type="button" onClick={() => setMostrarQr(v => !v)} className="shrink-0 flex items-center gap-1.5 rounded-md border bg-white px-3 py-2 text-xs font-medium hover:bg-gray-50 transition-colors">
          <QrCode className="h-3.5 w-3.5" />QR
        </button>
      </div>
      {mostrarQr && <QrPanel url={url} nombreClinica={nombreClinica} onImprimir={imprimir} />}
    </div>
  )
}

function QrPanel({ url, nombreClinica, onImprimir }: { url: string; nombreClinica: string; onImprimir: () => void }) {
  const { QRCodeCanvas } = require('qrcode.react') as typeof import('qrcode.react')
  return (
    <div className="flex items-start gap-4 rounded-lg border bg-gray-50 p-4">
      <div id="qr-registro" className="shrink-0 rounded-md bg-white p-2 border">
        <QRCodeCanvas value={url} size={120} />
      </div>
      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-700">Código QR para recepción</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Imprime este QR y colócalo en la sala de espera. Los pacientes lo escanean con su celular para registrarse sin ayuda del recepcionista.
        </p>
        <button type="button" onClick={onImprimir} className="flex items-center gap-1.5 rounded-md border bg-white px-3 py-1.5 text-xs font-medium hover:bg-gray-50 transition-colors">
          <Printer className="h-3.5 w-3.5" />Imprimir QR
        </button>
      </div>
    </div>
  )
}
