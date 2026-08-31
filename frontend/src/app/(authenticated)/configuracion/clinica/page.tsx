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
  MapPin, HeartPulse, Sparkles, Building2, CalendarClock, UserPlus,
  ChevronDown, ChevronUp, Camera,
} from 'lucide-react'
import Image from 'next/image'
import { clinicasApi } from '@/lib/api/clinicas'
import type { ConfiguracionFacial } from '@/types/clinicas'
import { PageHeader } from '@/components/shared/PageHeader'
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
}[] = [
  {
    key: 'paso_checkin',
    label: 'Verificación de llegada',
    description: 'Confirma la presencia del paciente vía código OTP por WhatsApp o foto.',
    icon: ScanFace,
  },
  {
    key: 'paso_verificacion_facial',
    label: 'Verificación de identidad facial',
    description: 'Compara la foto en vivo del paciente con su foto de control registrada.',
    icon: ShieldCheck,
    esAddon: true,
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
  nit: z.string().optional(),
  telefono: z.string().optional(),
})
type FormData = z.infer<typeof schema>

type Tab = 'general' | 'agenda' | 'atencion' | 'pacientes' | 'biometria'

const BASE_TABS: { id: Tab; label: string; icon: React.ElementType; description: string; addonOnly?: boolean }[] = [
  { id: 'general',   label: 'General',   icon: Building2,     description: 'Identidad y logo' },
  { id: 'agenda',    label: 'Agenda',    icon: CalendarClock, description: 'Turnos y recordatorios' },
  { id: 'atencion',  label: 'Atención',  icon: Workflow,      description: 'Flujo de inicio' },
  { id: 'pacientes', label: 'Pacientes', icon: UserPlus,      description: 'Autoregistro' },
  { id: 'biometria', label: 'Biometría', icon: ShieldCheck,   description: 'Verificación facial', addonOnly: true },
]

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ClinicaConfigPage() {
  const { user } = useAuthStore()
  const clinicaId = user?.clinica_id
  const qc = useQueryClient()
  const isAdmin = hasPermission(user, PERM.CLINICAS_EDITAR)

  const [activeTab, setActiveTab] = useState<Tab>('general')

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
  const { register, handleSubmit, reset, formState: { errors, isDirty: isFormDirty } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    if (clinica) reset({ nombre: clinica.nombre ?? '', nit: clinica.nit ?? '', telefono: clinica.telefono ?? '' })
  }, [clinica, reset])

  const updateMutation = useMutation({
    mutationFn: (data: FormData) => clinicasApi.update(clinicaId!, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinica', clinicaId] }),
  })

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
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setLogoError('Solo se permiten archivos PNG, JPG o WebP.'); return }
    setLogoError(null)
    logoMutation.mutate(file)
    e.target.value = ''
  }

  // ── Frecuencia de turnos ─────────────────────────────────────────────────
  const [selectedInterval, setSelectedInterval] = useState<number>(15)
  useEffect(() => { if (clinica?.slot_interval_min) setSelectedInterval(clinica.slot_interval_min) }, [clinica])

  const intervalMutation = useMutation({
    mutationFn: (value: number) => clinicasApi.update(clinicaId!, { slot_interval_min: value }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinica', clinicaId] })
      qc.invalidateQueries({ queryKey: ['slot_interval', clinicaId] })
    },
  })
  const isIntervalDirty = clinica?.slot_interval_min !== selectedInterval

  // ── Recordatorios ────────────────────────────────────────────────────────
  const { data: recordatorioConfig, isLoading: loadingRecordatorio } = useQuery({
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

  const isRecordatorioDirty =
    recordatorioConfig?.recordatorios_automaticos !== recordatoriosActivos ||
    recordatorioConfig?.intervalo_recordatorio_horas !== recordatorioIntervalo

  const recordatorioMutation = useMutation({
    mutationFn: () => clinicasApi.recordatorioConfig.update(clinicaId!, {
      recordatorios_automaticos: recordatoriosActivos,
      intervalo_recordatorio_horas: recordatorioIntervalo,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recordatorio_config', clinicaId] }),
  })

  // ── Wizard ───────────────────────────────────────────────────────────────
  const { data: wizardConfig, isLoading: loadingWizard } = useQuery({
    queryKey: ['wizard-config'],
    queryFn: () => clinicasApi.wizardConfig.get(),
  })

  const wizardMutation = useMutation({
    mutationFn: (data: Partial<WizardConfig>) => clinicasApi.wizardConfig.update(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wizard-config'] }),
  })

  const effectiveWizard: WizardConfig = wizardConfig ?? DEFAULT_WIZARD_CONFIG
  const pasoFacialActivo = wizardConfig?.paso_verificacion_facial ?? false
  const TABS = BASE_TABS.filter(t => !t.addonOnly || pasoFacialActivo)

  // ── Configuración facial ─────────────────────────────────────────────────
  const { data: facialConfig, isLoading: loadingFacial } = useQuery({
    queryKey: ['facial-config'],
    queryFn: () => clinicasApi.facialConfig.get(),
    enabled: pasoFacialActivo,
  })

  const facialMutation = useMutation({
    mutationFn: (data: Partial<ConfiguracionFacial>) => clinicasApi.facialConfig.update(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['facial-config'] }),
  })

  // ── Autoregistro ─────────────────────────────────────────────────────────
  const [tabPersonalReq, setTabPersonalReq] = useState(false)
  const [tabSaludReq, setTabSaludReq] = useState(false)

  useEffect(() => {
    if (miClinica) {
      setTabPersonalReq(miClinica.tab_personal_requerido ?? false)
      setTabSaludReq(miClinica.tab_salud_requerido ?? false)
    }
  }, [miClinica])

  const tabsRegMutation = useMutation({
    mutationFn: (data: { tab_personal_requerido?: boolean; tab_salud_requerido?: boolean }) =>
      clinicasApi.miClinicaUpdate(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mi-clinica', clinicaId] }),
  })

  // ─────────────────────────────────────────────────────────────────────────
  if (!user) return null
  if (!clinicaId) {
    return (
      <div className="max-w-2xl">
        <PageHeader title="Configuración" />
        <div className="rounded-xl border bg-white p-8 text-center text-sm text-gray-400">No tienes una clínica asignada.</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Configuración de la clínica" backHref="/configuracion" />

      <div className="flex gap-6 items-start">

        {/* ── Sidebar de tabs ── */}
        <nav className="w-52 shrink-0 rounded-xl border bg-white p-2 space-y-0.5">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all',
                  active
                    ? 'bg-rose-50 text-rose-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                )}
              >
                <div className={cn(
                  'h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-colors',
                  active ? 'bg-rose-100 text-rose-600' : 'bg-gray-100 text-gray-400',
                )}>
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className={cn('text-sm font-semibold leading-tight', active ? 'text-rose-700' : 'text-gray-800')}>
                    {tab.label}
                  </p>
                  <p className={cn('text-[11px] leading-tight mt-0.5', active ? 'text-rose-500' : 'text-gray-400')}>
                    {tab.description}
                  </p>
                </div>
              </button>
            )
          })}
        </nav>

        {/* ── Contenido del tab activo ── */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* ── TAB: General ── */}
          {activeTab === 'general' && (
            <>
              {/* Logo */}
              <Section title="Logo de la clínica">
                <div className="flex items-center gap-6">
                  <div className="h-24 w-40 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0 relative">
                    {logoMutation.isPending ? (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    ) : clinica?.logo_url ? (
                      <Image src={resolveMediaUrl(clinica.logo_url)!} alt={clinica.nombre ?? 'Logo'} fill className="object-contain p-2" unoptimized />
                    ) : (
                      <ImageIcon className="h-8 w-8 text-gray-300" />
                    )}
                  </div>
                  {isAdmin && (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" size="sm" disabled={logoMutation.isPending} onClick={() => fileInputRef.current?.click()}>
                          <Upload className="h-3.5 w-3.5 mr-1.5" />
                          {clinica?.logo_url ? 'Cambiar logo' : 'Subir logo'}
                        </Button>
                        {clinica?.logo_url && (
                          <Button
                            type="button" variant="ghost" size="sm"
                            disabled={eliminarLogoMutation.isPending}
                            className="text-destructive hover:text-destructive hover:bg-destructive/5"
                            onClick={() => { if (confirm('¿Eliminar el logo de la clínica?')) eliminarLogoMutation.mutate() }}
                          >
                            {eliminarLogoMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 mr-1.5" />}
                            Eliminar
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">PNG, JPG o WebP · máx. 2 MB · fondo transparente recomendado</p>
                      {logoError && <p className="text-xs text-destructive">{logoError}</p>}
                    </div>
                  )}
                </div>
                <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleFileChange} />
              </Section>

              {/* Datos */}
              <Section title="Datos de la clínica">
                <form onSubmit={handleSubmit((data) => updateMutation.mutate(data))} className="space-y-4">
                  {isLoading ? (
                    <div className="space-y-4">
                      {[1, 2, 3].map(i => (
                        <div key={i} className="space-y-1.5">
                          <div className="h-3 w-20 rounded bg-gray-100 animate-pulse" />
                          <div className="h-9 w-full rounded-lg bg-gray-100 animate-pulse" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      <div className="space-y-1.5">
                        <Label htmlFor="nombre" className="text-xs text-gray-500">Nombre de la clínica</Label>
                        <Input id="nombre" {...register('nombre')} disabled={!isAdmin} placeholder="Ej. Clínica Estética Bella" />
                        {errors.nombre && <p className="text-xs text-red-500">{errors.nombre.message}</p>}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label htmlFor="nit" className="text-xs text-gray-500">NIT</Label>
                          <Input id="nit" {...register('nit')} disabled={!isAdmin} placeholder="Ej. 901234567-8" />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="telefono" className="text-xs text-gray-500">Teléfono</Label>
                          <Input id="telefono" {...register('telefono')} disabled={!isAdmin} placeholder="Ej. 3001234567" />
                        </div>
                      </div>
                    </>
                  )}
                  {updateMutation.isError && <p className="text-sm text-red-500">Error al guardar. Intenta de nuevo.</p>}
                  {isAdmin && (
                    <div className="flex items-center gap-3 pt-2 border-t">
                      <Button type="submit" disabled={!isFormDirty || updateMutation.isPending} className="gap-1.5">
                        {updateMutation.isPending ? 'Guardando…' : <><Save className="h-4 w-4" /> Guardar cambios</>}
                      </Button>
                      {updateMutation.isSuccess && !isFormDirty && (
                        <span className="text-sm text-emerald-600 font-medium">Guardado correctamente</span>
                      )}
                    </div>
                  )}
                </form>
              </Section>
            </>
          )}

          {/* ── TAB: Agenda ── */}
          {activeTab === 'agenda' && (
            <>
              {/* Frecuencia de turnos */}
              <Section
                title="Frecuencia de turnos"
                description="Define cada cuántos minutos se ofrecen opciones de cita al consultar disponibilidad."
              >
                {isLoading ? (
                  <div className="flex gap-2 flex-wrap">
                    {INTERVAL_OPTIONS.map(v => <div key={v} className="h-10 w-16 rounded-lg bg-gray-100 animate-pulse" />)}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <Label className="text-xs text-gray-400 mb-3 block">Minutos entre turnos</Label>
                      <div className="flex gap-2 flex-wrap">
                        {INTERVAL_OPTIONS.map(v => (
                          <button
                            key={v}
                            type="button"
                            disabled={!isAdmin}
                            onClick={() => setSelectedInterval(v)}
                            className={cn(
                              'h-10 w-16 rounded-lg border text-sm font-medium transition-all',
                              selectedInterval === v
                                ? 'border-rose-500 bg-rose-50 text-rose-700'
                                : 'border-gray-200 bg-white text-gray-600 hover:border-rose-300 hover:text-rose-600',
                              !isAdmin && 'opacity-50 cursor-not-allowed',
                            )}
                          >
                            {v} min
                          </button>
                        ))}
                      </div>
                    </div>
                    {intervalMutation.isError && <p className="text-sm text-red-500">Error al guardar. Intenta de nuevo.</p>}
                    {isAdmin && (
                      <div className="flex items-center gap-3 pt-2 border-t">
                        <Button type="button" onClick={() => intervalMutation.mutate(selectedInterval)} disabled={!isIntervalDirty || intervalMutation.isPending} className="gap-1.5">
                          {intervalMutation.isPending ? 'Guardando…' : <><Check className="h-4 w-4" /> Guardar</>}
                        </Button>
                        {intervalMutation.isSuccess && !isIntervalDirty && (
                          <span className="text-sm text-emerald-600 font-medium">Guardado correctamente</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </Section>

              {/* Recordatorios */}
              <Section
                title="Recordatorios automáticos"
                description="Configura cuándo se envían recordatorios a tus pacientes antes de su cita."
                icon={Bell}
              >
                {loadingRecordatorio ? (
                  <div className="space-y-3">
                    <div className="h-5 w-64 rounded bg-gray-100 animate-pulse" />
                    <div className="h-4 w-80 rounded bg-gray-100 animate-pulse" />
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div className="flex items-start gap-4">
                      <Switch checked={recordatoriosActivos} onCheckedChange={setRecordatoriosActivos} disabled={!isAdmin} />
                      <div>
                        <p className="text-sm font-medium text-gray-700">
                          {recordatoriosActivos ? 'Recordatorios activados' : 'Recordatorios desactivados'}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-400">
                          {recordatoriosActivos
                            ? 'El sistema enviará recordatorios automáticos al teléfono del paciente.'
                            : 'Los pacientes no recibirán recordatorios automáticos.'}
                        </p>
                      </div>
                    </div>

                    <div className={cn('space-y-3 transition-opacity', !recordatoriosActivos && 'opacity-40 pointer-events-none')}>
                      <p className="text-xs font-medium text-gray-500">Tiempo de anticipación</p>
                      <div className="flex gap-2 flex-wrap">
                        {INTERVALO_RECORDATORIO_OPTIONS.map(o => (
                          <button
                            key={o.value}
                            type="button"
                            disabled={!isAdmin}
                            onClick={() => setRecordatorioIntervalo(o.value)}
                            className={cn(
                              'h-9 px-3 rounded-lg border text-xs font-medium transition-all',
                              recordatorioIntervalo === o.value
                                ? 'border-rose-500 bg-rose-50 text-rose-700'
                                : 'border-gray-200 bg-white text-gray-600 hover:border-rose-300 hover:text-rose-600',
                              !isAdmin && 'opacity-50 cursor-not-allowed',
                            )}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5 rounded-lg border border-blue-100 bg-blue-50 p-3">
                      <Info className="h-3.5 w-3.5 text-blue-400 mt-0.5 shrink-0" />
                      <p className="text-xs text-blue-600">
                        También puedes enviar recordatorios manualmente desde el detalle de cualquier cita.
                      </p>
                    </div>

                    {isAdmin && (
                      <div className="flex items-center gap-3 pt-2 border-t">
                        <Button type="button" onClick={() => recordatorioMutation.mutate()} disabled={!isRecordatorioDirty || recordatorioMutation.isPending} className="gap-1.5">
                          {recordatorioMutation.isPending ? 'Guardando…' : <><Check className="h-4 w-4" /> Guardar</>}
                        </Button>
                        {recordatorioMutation.isSuccess && !isRecordatorioDirty && <span className="text-sm text-emerald-600 font-medium">Guardado</span>}
                        {recordatorioMutation.isError && <span className="text-sm text-red-500">Error al guardar</span>}
                      </div>
                    )}
                  </div>
                )}
              </Section>
            </>
          )}

          {/* ── TAB: Atención ── */}
          {activeTab === 'atencion' && (
            <Section
              title="Flujo de inicio de atención"
              description="Define qué pasos debe completar recepción antes de iniciar cada atención. El orden es fijo."
              icon={Workflow}
            >
              {loadingWizard ? (
                <div className="rounded-lg border divide-y overflow-hidden">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="flex items-center gap-4 px-4 py-3.5">
                      <div className="h-8 w-8 rounded-lg bg-gray-100 animate-pulse shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 w-32 rounded bg-gray-100 animate-pulse" />
                        <div className="h-2.5 w-56 rounded bg-gray-100 animate-pulse" />
                      </div>
                      <div className="h-6 w-10 rounded-full bg-gray-100 animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border divide-y overflow-hidden">
                  {WIZARD_STEPS.map((step, idx) => {
                    const Icon = step.icon
                    const enabled = effectiveWizard[step.key]
                    const bloqueado = step.toggleBloqueado
                    const addonNoHabilitado = step.esAddon && !miClinica?.facial_verificacion_habilitada
                    return (
                      <div
                        key={step.key}
                        className={cn(
                          'flex items-center gap-4 px-4 py-4 transition-colors',
                          addonNoHabilitado ? 'bg-gray-50/40' : !enabled && 'bg-gray-50/60',
                        )}
                      >
                        {/* Step number + icon */}
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-xs font-semibold text-gray-300 w-4 text-right">{idx + 1}</span>
                          <div className={cn(
                            'h-8 w-8 rounded-lg flex items-center justify-center transition-colors',
                            addonNoHabilitado ? 'bg-gray-100 text-gray-300'
                              : enabled ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-400',
                          )}>
                            <Icon className="h-4 w-4" />
                          </div>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className={cn(
                              'text-sm font-medium leading-tight',
                              addonNoHabilitado ? 'text-gray-400' : !enabled ? 'text-gray-400' : 'text-gray-900',
                            )}>
                              {step.label}
                            </p>
                            {step.esAddon && (
                              <span className={cn(
                                'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                                miClinica?.facial_verificacion_habilitada ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-400',
                              )}>
                                <Sparkles className="h-2.5 w-2.5" />Add-on
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{step.description}</p>
                          {addonNoHabilitado && (
                            <p className="text-[11px] text-gray-400 mt-0.5">Contáctanos para habilitar este módulo en tu plan.</p>
                          )}
                        </div>

                        {bloqueado ? (
                          <div className="flex items-center gap-1.5 text-muted-foreground/50" title="No se puede desactivar aún">
                            <Lock className="h-3 w-3" /><Switch checked disabled />
                          </div>
                        ) : addonNoHabilitado ? (
                          <div className="flex items-center gap-1.5 text-muted-foreground/40" title="Módulo no habilitado en tu plan">
                            <Lock className="h-3 w-3" /><Switch checked={false} disabled />
                          </div>
                        ) : (
                          <Switch
                            checked={enabled}
                            disabled={!isAdmin || wizardMutation.isPending}
                            onCheckedChange={(val) => wizardMutation.mutate({ [step.key]: val })}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {!loadingWizard && effectiveWizard.paso_verificacion_facial && miClinica?.facial_verificacion_habilitada && (
                <div className="mt-4 rounded-lg border bg-white">
                  <div className={cn(
                    'flex items-center gap-4 px-4 py-4 transition-colors',
                    !effectiveWizard.foto_control_obligatoria && 'bg-gray-50/60',
                  )}>
                    <div className={cn(
                      'h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-colors',
                      effectiveWizard.foto_control_obligatoria ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-400',
                    )}>
                      <Camera className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        'text-sm font-medium leading-tight',
                        effectiveWizard.foto_control_obligatoria ? 'text-gray-900' : 'text-gray-400',
                      )}>
                        Foto de control obligatoria al registrar paciente
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                        {effectiveWizard.foto_control_obligatoria
                          ? 'Recepción debe tomar la foto de control antes de terminar el registro. No se puede omitir.'
                          : 'Recepción puede omitir la foto y tomarla más tarde desde la ficha del paciente.'}
                      </p>
                    </div>
                    <Switch
                      checked={effectiveWizard.foto_control_obligatoria}
                      disabled={!isAdmin || wizardMutation.isPending}
                      onCheckedChange={(val) => wizardMutation.mutate({ foto_control_obligatoria: val })}
                    />
                  </div>
                </div>
              )}
            </Section>
          )}

          {/* ── TAB: Pacientes ── */}
          {activeTab === 'pacientes' && (
            <>
              {/* Formulario de autoregistro */}
              {miClinica?.registro_publico_token ? (
                <>
                  <Section
                    title="Formulario de autoregistro"
                    description="Define qué secciones del formulario son obligatorias para los pacientes."
                    icon={ClipboardList}
                  >
                    <div className="rounded-lg border divide-y overflow-hidden">
                      {[
                        {
                          key: 'personal' as const,
                          icon: MapPin,
                          label: 'Datos personales',
                          description: 'Dirección, ciudad, estado civil, ocupación, responsable.',
                          value: tabPersonalReq,
                          onChange: (v: boolean) => { setTabPersonalReq(v); tabsRegMutation.mutate({ tab_personal_requerido: v }) },
                        },
                        {
                          key: 'salud' as const,
                          icon: HeartPulse,
                          label: 'Salud y afiliación',
                          description: 'EPS, tipo de afiliado, régimen, grupo sanguíneo.',
                          value: tabSaludReq,
                          onChange: (v: boolean) => { setTabSaludReq(v); tabsRegMutation.mutate({ tab_salud_requerido: v }) },
                        },
                      ].map(({ key, icon: Icon, label, description, value, onChange }) => (
                        <div key={key} className={cn('flex items-center gap-4 px-4 py-4 transition-colors', !value && 'bg-gray-50/60')}>
                          <div className={cn(
                            'h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-colors',
                            value ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-400',
                          )}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={cn('text-sm font-medium leading-tight', !value ? 'text-gray-400' : 'text-gray-900')}>{label}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{description}</p>
                          </div>
                          <Switch checked={value} disabled={!isAdmin || tabsRegMutation.isPending} onCheckedChange={onChange} />
                        </div>
                      ))}
                    </div>
                    <div className="flex items-start gap-2.5 rounded-lg border border-blue-100 bg-blue-50 p-3">
                      <Info className="h-3.5 w-3.5 text-blue-400 mt-0.5 shrink-0" />
                      <p className="text-xs text-blue-600">
                        Si una sección está activa y el paciente no la llena, el formulario le pedirá completarla antes de enviar.
                      </p>
                    </div>
                  </Section>

                  {/* Link de autoregistro */}
                  <Section title="Link de autoregistro" description="Comparte este link para que los pacientes se registren por su cuenta." icon={Link2}>
                    <LinkAutoregistro token={miClinica.registro_publico_token!} nombreClinica={clinica?.nombre ?? ''} />
                  </Section>
                </>
              ) : (
                <div className="rounded-xl border bg-gray-50 p-8 text-center space-y-1">
                  <p className="text-sm font-medium text-gray-500">Autoregistro no configurado</p>
                  <p className="text-xs text-gray-400">Esta clínica no tiene habilitado el formulario de autoregistro público.</p>
                </div>
              )}
            </>
          )}

          {/* ── TAB: Biometría ── */}
          {activeTab === 'biometria' && (
            <TabBiometria
              config={facialConfig}
              isLoading={loadingFacial}
              isAdmin={isAdmin}
              isPending={facialMutation.isPending}
              isSuccess={facialMutation.isSuccess}
              isError={facialMutation.isError}
              onSave={(data) => facialMutation.mutate(data)}
            />
          )}

        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab Biometría
// ─────────────────────────────────────────────────────────────────────────────

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
  updated_at: '',
}

function TabBiometria({
  config, isLoading, isAdmin, isPending, isSuccess, isError, onSave,
}: {
  config?: ConfiguracionFacial
  isLoading: boolean
  isAdmin: boolean
  isPending: boolean
  isSuccess: boolean
  isError: boolean
  onSave: (data: Partial<ConfiguracionFacial>) => void
}) {
  const src = config ?? DEFAULTS
  const [umbralAlta,  setUmbralAlta]  = useState(src.umbral_alta)
  const [umbralMedia, setUmbralMedia] = useState(src.umbral_media)
  const [checkinAuto, setCheckinAuto] = useState(src.checkin_automatico)
  const [avanzado, setAvanzado] = useState(false)
  // calidad avanzada
  const [minDet,    setMinDet]    = useState(src.min_det_score)
  const [minBlur,   setMinBlur]   = useState(src.min_blur_score)
  const [minBright, setMinBright] = useState(src.min_brightness)
  const [maxBright, setMaxBright] = useState(src.max_brightness)
  const [maxYaw,    setMaxYaw]    = useState(src.max_yaw)
  const [maxPitch,  setMaxPitch]  = useState(src.max_pitch)
  const [maxRoll,   setMaxRoll]   = useState(src.max_roll)
  const [minArea,   setMinArea]   = useState(src.min_face_area_pct)

  useEffect(() => {
    if (config) {
      setUmbralAlta(config.umbral_alta)
      setUmbralMedia(config.umbral_media)
      setCheckinAuto(config.checkin_automatico)
      setMinDet(config.min_det_score)
      setMinBlur(config.min_blur_score)
      setMinBright(config.min_brightness)
      setMaxBright(config.max_brightness)
      setMaxYaw(config.max_yaw)
      setMaxPitch(config.max_pitch)
      setMaxRoll(config.max_roll)
      setMinArea(config.min_face_area_pct)
    }
  }, [config])

  const umbralError = umbralMedia >= umbralAlta
    ? 'El umbral "Media" debe ser menor al umbral "Alta".'
    : null

  const isDirty = config && (
    config.umbral_alta !== umbralAlta ||
    config.umbral_media !== umbralMedia ||
    config.checkin_automatico !== checkinAuto ||
    config.min_det_score !== minDet ||
    config.min_blur_score !== minBlur ||
    config.min_brightness !== minBright ||
    config.max_brightness !== maxBright ||
    config.max_yaw !== maxYaw ||
    config.max_pitch !== maxPitch ||
    config.max_roll !== maxRoll ||
    config.min_face_area_pct !== minArea
  )

  function handleSave() {
    if (umbralError) return
    onSave({
      umbral_alta: umbralAlta,
      umbral_media: umbralMedia,
      checkin_automatico: checkinAuto,
      min_det_score: minDet,
      min_blur_score: minBlur,
      min_brightness: minBright,
      max_brightness: maxBright,
      max_yaw: maxYaw,
      max_pitch: maxPitch,
      max_roll: maxRoll,
      min_face_area_pct: minArea,
    })
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border bg-white p-6 space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-10 w-full rounded-lg bg-gray-100 animate-pulse" />)}
      </div>
    )
  }

  const altaPct  = Math.round(umbralAlta * 100)
  const mediaPct = Math.round(umbralMedia * 100)

  return (
    <div className="space-y-5">
      {/* Umbrales de confianza */}
      <Section title="Umbrales de confianza" icon={ShieldCheck} description="Define el puntaje mínimo de similitud facial para cada nivel de verificación.">
        <div className="space-y-5">
          {/* Preview visual de zonas */}
          <div className="relative h-8 rounded-full overflow-hidden border flex">
            <div className="bg-red-100 flex items-center justify-center text-[10px] font-semibold text-red-500" style={{ width: `${mediaPct}%` }}>
              {mediaPct > 12 ? 'Baja' : ''}
            </div>
            <div className="bg-amber-100 flex items-center justify-center text-[10px] font-semibold text-amber-600" style={{ width: `${altaPct - mediaPct}%` }}>
              {altaPct - mediaPct > 12 ? 'Media' : ''}
            </div>
            <div className="bg-green-100 flex items-center justify-center text-[10px] font-semibold text-green-600 flex-1">
              Alta
            </div>
          </div>
          <div className="grid grid-cols-2 gap-5">
            <UmbralInput
              label="Confianza alta (≥)"
              description="Por encima de este valor la identidad se considera verificada."
              value={umbralAlta}
              onChange={setUmbralAlta}
              disabled={!isAdmin}
              color="green"
            />
            <UmbralInput
              label="Confianza media (≥)"
              description="Entre este valor y el de alta, la recepcionista debe confirmar manualmente."
              value={umbralMedia}
              onChange={setUmbralMedia}
              disabled={!isAdmin}
              color="amber"
            />
          </div>
          {umbralError && (
            <p className="text-xs text-red-500">{umbralError}</p>
          )}
        </div>
      </Section>

      {/* Check-in automático */}
      <Section title="Check-in automático" description="Si la confianza es alta, el paso se completa sin que recepción presione 'Continuar'.">
        <div className="flex items-center gap-4">
          <Switch checked={checkinAuto} onCheckedChange={setCheckinAuto} disabled={!isAdmin} />
          <p className="text-sm text-gray-600">
            {checkinAuto ? 'Activado — el paso avanza automáticamente con confianza alta.' : 'Desactivado — recepción confirma siempre manualmente.'}
          </p>
        </div>
      </Section>

      {/* Calidad de foto — sección colapsable */}
      <div className="rounded-xl border bg-white overflow-hidden">
        <button
          type="button"
          onClick={() => setAvanzado(v => !v)}
          className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors text-left"
        >
          <div>
            <p className="text-sm font-semibold text-gray-800">Requisitos de la foto de control</p>
            <p className="text-xs text-gray-400 mt-0.5">Qué tan exigente es el sistema al aceptar una foto nueva.</p>
          </div>
          {avanzado ? <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />}
        </button>

        {avanzado && (
          <div className="px-6 pb-6 border-t pt-5 space-y-5">
            <div className="space-y-4">
              <CalidadBarra label="Certeza de que hay una cara" hint="Qué tan seguro debe estar el sistema de haber detectado una cara en la foto." value={minDet} onChange={setMinDet} min={0.5} max={0.99} step={0.01} display={v => `${Math.round(v * 100)}%`} disabled={!isAdmin} />
              <CalidadBarra label="Nitidez de la imagen" hint="Rechaza fotos movidas o borrosas. Más alto = más exigente." value={minBlur} onChange={setMinBlur} min={0} max={150} step={5} display={v => `${v}`} disabled={!isAdmin} />
              <CalidadBarra label="Brillo mínimo" hint="Rechaza fotos muy oscuras." value={minBright} onChange={setMinBright} min={0} max={150} step={5} display={v => `${v}`} disabled={!isAdmin} />
              <CalidadBarra label="Brillo máximo" hint="Rechaza fotos sobreexpuestas o con flash directo." value={maxBright} onChange={setMaxBright} min={150} max={255} step={5} display={v => `${v}`} disabled={!isAdmin} />
              <CalidadBarra label="Giro de lado permitido" hint="Cuánto puede estar girada la cabeza hacia la izquierda o derecha. Menos grados = más de frente." value={maxYaw} onChange={setMaxYaw} min={5} max={60} step={5} display={v => `${v}°`} disabled={!isAdmin} />
              <CalidadBarra label="Inclinación arriba/abajo permitida" hint="Cuánto puede estar levantada o agachada la cabeza." value={maxPitch} onChange={setMaxPitch} min={5} max={60} step={5} display={v => `${v}°`} disabled={!isAdmin} />
              <CalidadBarra label="Inclinación lateral permitida" hint="Cuánto puede estar inclinada la cabeza de lado, como ladeándola." value={maxRoll} onChange={setMaxRoll} min={5} max={60} step={5} display={v => `${v}°`} disabled={!isAdmin} />
              <CalidadBarra label="Tamaño mínimo de la cara en la foto" hint="La cara debe ocupar al menos este porcentaje de la imagen. Más alto = el paciente debe acercarse más a la cámara." value={minArea} onChange={setMinArea} min={2} max={40} step={1} display={v => `${v}%`} disabled={!isAdmin} />
            </div>
          </div>
        )}
      </div>

      {/* Guardar */}
      {isAdmin && (
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={!isDirty || isPending || !!umbralError} className="gap-1.5">
            {isPending ? 'Guardando…' : <><Check className="h-4 w-4" /> Guardar</>}
          </Button>
          {isSuccess && !isDirty && <span className="text-sm text-emerald-600 font-medium">Guardado correctamente</span>}
          {isError && <span className="text-sm text-red-500">Error al guardar. Intenta de nuevo.</span>}
        </div>
      )}
    </div>
  )
}

function UmbralInput({
  label, description, value, onChange, disabled, color,
}: {
  label: string; description: string; value: number; onChange: (v: number) => void; disabled: boolean; color: 'green' | 'amber'
}) {
  const pct = Math.round(value * 100)
  const colorClass = color === 'green' ? 'text-green-600 border-green-300 bg-green-50' : 'text-amber-600 border-amber-300 bg-amber-50'
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-gray-500">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={0.5} max={0.99} step={0.01}
          value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          disabled={disabled}
          className="flex-1"
        />
        <span className={cn('text-sm font-semibold tabular-nums rounded-md border px-2 py-0.5 min-w-[3.5rem] text-center', colorClass)}>
          {pct}%
        </span>
      </div>
      <p className="text-[11px] text-gray-400 leading-snug">{description}</p>
    </div>
  )
}

function CalidadBarra({
  label, hint, value, onChange, min, max, step, display, disabled,
}: {
  label: string; hint: string; value: number; onChange: (v: number) => void
  min: number; max: number; step: number; display: (v: number) => string; disabled: boolean
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-gray-700">{label}</p>
        <span className="text-sm font-semibold text-rose-600 tabular-nums min-w-[3rem] text-right">{display(value)}</span>
      </div>
      <div className="relative">
        {/* Barra visual */}
        <div className="h-2 rounded-full bg-gray-100 overflow-hidden pointer-events-none">
          <div className="h-full bg-rose-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        {/* Slider encima, transparente */}
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          disabled={disabled}
          className="absolute inset-0 w-full opacity-0 h-2 cursor-pointer disabled:cursor-not-allowed"
        />
      </div>
      <p className="text-[11px] text-gray-400 leading-snug">{hint}</p>
    </div>
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
