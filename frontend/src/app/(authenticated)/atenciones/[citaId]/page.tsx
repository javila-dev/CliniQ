'use client'

import { use, useState, useRef, useEffect, useTransition } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle, Clock, ChevronLeft, ChevronRight, XCircle, Loader2, AlertTriangle, Stethoscope } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { agendaApi } from '@/lib/api/agenda'
import { protocolosApi } from '@/lib/api/protocolos'
import { pacientesApi } from '@/lib/api/pacientes'
import { historiaClinicaApi } from '@/lib/api/historiaClinica'
import { clinicasApi } from '@/lib/api/clinicas'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { LoadingState } from '@/components/shared/LoadingState'
import { PanelPaciente } from '@/components/atenciones/PanelPaciente'
import { TabDatosGenerales } from '@/components/historia/TabDatosGenerales'
import { TabMotivoConsulta } from '@/components/historia/TabMotivoConsulta'
import { TabAntecedentes } from '@/components/historia/TabAntecedentes'
import { TabExamenes } from '@/components/historia/TabExamenes'
import { TabPlanManejo } from '@/components/historia/TabPlanManejo'
import { TabOrdenesMedicas } from '@/components/historia/TabOrdenesMedicas'
import { TabFotos } from '@/components/historia/TabFotos'
import { TabMediciones } from '@/components/obesidad/TabMediciones'
import { TabLaboratorios } from '@/components/obesidad/TabLaboratorios'
import { TabFarmacologico } from '@/components/obesidad/TabFarmacologico'
import { TabZonas } from '@/components/historia/TabZonas'
import { IniciarAtencionWizard } from '@/components/atenciones/IniciarAtencionWizard'
import { useAtencionConfig } from '@/store/atencionConfigStore'
import { useNotaEnProgreso } from '@/store/notaEnProgresoStore'
import { useAuthStore } from '@/store/authStore'
import { canIniciarAtencion } from '@/lib/permissions'
import { toast } from '@/hooks/use-toast'
import { formatTime, formatDuracion } from '@/lib/utils'

interface Props {
  params: Promise<{ citaId: string }>
}

const ATENCION_TAB_CARD_SCOPE =
  '[&_.rounded-lg.border]:bg-white [&_.rounded-lg.border]:shadow-sm [&_.rounded-lg.border]:transition-all [&_.rounded-lg.border]:duration-200 [&_.rounded-lg.border]:ease-out [&_.rounded-lg.border:hover]:-translate-y-0.5 [&_.rounded-lg.border:hover]:shadow-md [&_.aspect-square.rounded-md]:border [&_.aspect-square.rounded-md]:bg-white [&_.aspect-square.rounded-md]:shadow-sm [&_.aspect-square.rounded-md]:transition-all [&_.aspect-square.rounded-md]:duration-200 [&_.aspect-square.rounded-md]:ease-out [&_.aspect-square.rounded-md:hover]:-translate-y-0.5 [&_.aspect-square.rounded-md:hover]:shadow-md'

function getPacienteId(cita: { paciente?: unknown } | null | undefined): string | undefined {
  if (typeof cita?.paciente === 'string') return cita.paciente
  if (cita?.paciente && typeof cita.paciente === 'object' && 'id' in cita.paciente) {
    const id = (cita.paciente as { id?: unknown }).id
    return typeof id === 'string' ? id : undefined
  }
  return undefined
}

export default function AtencionCitaPage({ params }: Props) {
  const { citaId } = use(params)
  const router = useRouter()
  const [isNavigating, startTransition] = useTransition()
  const queryClient = useQueryClient()
  const { tabsActivos } = useAtencionConfig()
  const { notaId, setNota, clear: clearNota } = useNotaEnProgreso()
  const { user } = useAuthStore()

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: miClinica } = useQuery({
    queryKey: ['mi-clinica', user?.clinica_id],
    queryFn: () => clinicasApi.miClinica(user?.clinica_id),
    enabled: Boolean(user?.clinica_id),
    staleTime: 5 * 60_000,
  })

  const moduloObesidad = miClinica?.modulo_obesidad_habilitado ?? false

  const { data: cita, isLoading: loadingCita } = useQuery({
    queryKey: ['citas', citaId],
    queryFn: () => agendaApi.citas.get(citaId),
  })

  const pacienteId = getPacienteId(cita)

  const { data: paciente, isLoading: loadingPaciente } = useQuery({
    queryKey: ['pacientes', pacienteId],
    queryFn: () => pacientesApi.get(pacienteId!),
    enabled: Boolean(pacienteId),
  })

  const servicioId = cita?.servicio ?? null

  const { data: gruposProcedimiento = [] } = useQuery({
    queryKey: ['procedimiento-grupos', servicioId],
    queryFn: () => clinicasApi.procedimientos.grupos.list(servicioId!),
    enabled: Boolean(servicioId),
    staleTime: 5 * 60_000,
  })

  const tieneZonas = gruposProcedimiento.length > 0 || Boolean(cita?.sesion_tratamiento?.tiene_zonas)

  const { data: historiaData } = useQuery({
    queryKey: ['historias', pacienteId],
    queryFn: () => historiaClinicaApi.historias.list({ paciente: pacienteId! }),
    enabled: Boolean(pacienteId),
  })
  const historia = historiaData?.results[0]

  const { data: antecedentes } = useQuery({
    queryKey: ['antecedentes', pacienteId],
    queryFn: () => historiaClinicaApi.antecedentes.get(pacienteId!),
    enabled: Boolean(pacienteId),
  })

  const { data: notas } = useQuery({
    queryKey: ['historia', historia?.id, 'notas'],
    queryFn: () => historiaClinicaApi.historias.notas(historia!.id),
    enabled: Boolean(historia?.id),
  })

  // ── Crear borrador de nota al entrar a la atención ─────────────────────────

  // La pantalla clínica solo aplica cuando la atención está realmente en curso.
  // Para cualquier otro estado se muestra un gate (ver más abajo) y no se crea
  // borrador de nota.
  const enCurso = cita?.estado === 'en_curso'
  const isReady = !loadingCita && !loadingPaciente && Boolean(cita) && Boolean(historia) && enCurso

  useEffect(() => {
    if (!isReady || !historia || !cita) return
    if (notaId) return   // ya existe borrador para esta sesión
    historiaClinicaApi.notas.createBorrador(historia.id, cita.id)
      .then((nota) => setNota(nota.id, cita.id))
      .catch(() => {/* H26 pendiente — no bloquear la pantalla */})
  }, [isReady, historia?.id, cita?.id])

  // Limpiar store al desmontar
  useEffect(() => () => clearNota(), [])

  // ── Sesión de tratamiento vinculada a esta cita ───────────────────────────

  const sesionCtx = cita?.sesion_tratamiento ?? null
  const [procsSel, setProcsSel] = useState<string[]>([])
  const [showSesionProcs, setShowSesionProcs] = useState(false)

  useEffect(() => {
    if (sesionCtx) setProcsSel(sesionCtx.procedimientos.map((p) => p.id))
  }, [sesionCtx?.sesion_id])

  function toggleProc(id: string) {
    setProcsSel((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  // ── Completar atención ─────────────────────────────────────────────────────

  const { mutate: completar, isPending: completando } = useMutation({
    mutationFn: async () => {
      // Si la cita es una sesión de tratamiento pendiente, marcarla completada
      // con los procedimientos que efectivamente se realizaron.
      if (sesionCtx && sesionCtx.estado === 'pendiente') {
        await protocolosApi.sesionesEjecutadas.marcarCompletada(sesionCtx.sesion_id, {
          procedimientos_ejecutados: procsSel,
          cita: citaId,
        })
      }
      // H26: completar la nota antes de cambiar estado de cita
      if (notaId) {
        await historiaClinicaApi.notas.completar(notaId).catch(() => {/* H26 pendiente */})
      }
      return agendaApi.citas.cambiarEstado(citaId, { estado: 'completada' })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['citas'] })
      clearNota()
      startTransition(() => router.push('/atenciones'))
    },
    onError: (err: any) => {
      const data = err?.response?.data ?? {}
      if (data.code === 'CONSENTIMIENTOS_FALTANTES') {
        toast.error('Consentimientos faltantes', 'La sesión tiene consentimientos vencidos o sin firmar. Fírmalos antes de completar.')
      } else {
        toast.error('No se pudo completar la atención', data.error ?? 'Intenta de nuevo.')
      }
    },
  })

  // ── Confirmar / bloquear completar ───────────────────────────────────────

  const [showBloqueoVacio, setShowBloqueoVacio] = useState(false)
  const [showConfirmCompletar, setShowConfirmCompletar] = useState(false)
  const [verificando, setVerificando] = useState(false)

  function handleCompletar() {
    // Sesión de tratamiento pendiente → primero confirmar qué procedimientos se hicieron
    if (sesionCtx && sesionCtx.estado === 'pendiente') { setShowSesionProcs(true); return }
    proceedCompletar()
  }

  async function proceedCompletar() {
    // Sin borrador de nota no hay nada documentado → bloqueo.
    if (!notaId) { setShowBloqueoVacio(true); return }
    setVerificando(true)
    try {
      const nota = await historiaClinicaApi.notas.get(notaId)
      const tieneContenido =
        nota.motivo_consulta?.trim() ||
        nota.plan_manejo?.trim() ||
        (nota.examenes?.length ?? 0) > 0 ||
        (nota.ordenes?.length ?? 0) > 0 ||
        (nota.fotos?.length ?? 0) > 0
      if (!tieneContenido) {
        // Nota vacía → no se puede completar (salida: Descartar).
        setShowBloqueoVacio(true)
        return
      }
      // Con contenido → siempre pedir confirmación explícita.
      setShowConfirmCompletar(true)
    } catch {
      // No se pudo verificar la nota → confirmación explícita igualmente.
      setShowConfirmCompletar(true)
    } finally {
      setVerificando(false)
    }
  }

  // ── Descartar atención ─────────────────────────────────────────────────────

  const [showDescartar, setShowDescartar] = useState(false)

  const { mutate: descartar, isPending: descartando } = useMutation({
    mutationFn: async (accion: 'cancelar' | 'desiniciar') => {
      const estado = accion === 'cancelar' ? 'cancelada' : 'en_espera'
      return agendaApi.citas.cambiarEstado(citaId, { estado })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['citas'] })
      clearNota()
      startTransition(() => router.push('/atenciones'))
    },
  })

  // ── Gate: atención aún no en curso ─────────────────────────────────────────

  const [wizardAbierto, setWizardAbierto] = useState(false)

  const { mutate: iniciarAtencion, isPending: iniciando } = useMutation({
    mutationFn: () => agendaApi.citas.cambiarEstado(citaId, { estado: 'en_curso' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['citas'] })
      queryClient.invalidateQueries({ queryKey: ['citas', citaId] })
    },
    onError: (err: any) => {
      const data = err?.response?.data ?? {}
      if (data.code === 'CONSENTIMIENTO_REQUERIDO') {
        toast.error('Consentimientos pendientes', `Falta firmar: ${(data.pendientes ?? []).join(', ')}`)
      } else {
        toast.error('No se pudo iniciar la atención', data.error ?? 'Revisa el estado de la cita.')
      }
    },
  })

  // ── Tab scroll carousel ────────────────────────────────────────────────────

  const [tabActivo, setTabActivo] = useState('motivo-consulta')
  const tabsScrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  useEffect(() => {
    if (!isReady) return
    const el = tabsScrollRef.current
    if (!el) return
    const check = () => {
      setCanScrollLeft(el.scrollLeft > 0)
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
    }
    check()
    el.addEventListener('scroll', check)
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', check); ro.disconnect() }
  }, [isReady])

  function scrollTabs(dir: 'left' | 'right') {
    tabsScrollRef.current?.scrollBy({ left: dir === 'left' ? -160 : 160, behavior: 'smooth' })
  }

  // ── Render guard ───────────────────────────────────────────────────────────

  const minutosTranscurridos = cita?.fecha_inicio_real
    ? Math.floor((Date.now() - new Date(cita.fecha_inicio_real).getTime()) / 60000)
    : null

  if (loadingCita || (pacienteId && loadingPaciente)) return <LoadingState rows={6} />
  if (!cita) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">No se pudo cargar esta atención.</p>
      </div>
    )
  }

  // La pantalla clínica solo se abre para citas en curso. Cualquier otra vía
  // (p.ej. el link "Ver" de la tabla de admin sobre una cita en espera) cae
  // aquí en vez de saltarse el wizard.
  if (cita.estado !== 'en_curso') {
    const ESTADO_LABEL: Record<string, string> = {
      pendiente: 'Pendiente', confirmada: 'Confirmada', en_espera: 'En espera',
      completada: 'Completada', cancelada: 'Cancelada', no_asistio: 'No asistió',
    }
    const cerrada = ['completada', 'cancelada', 'no_asistio'].includes(cita.estado)
    const puedeIniciar =
      canIniciarAtencion(user) && ['confirmada', 'en_espera'].includes(cita.estado)

    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-4 rounded-xl border bg-white p-8 shadow-sm">
          <div className="mx-auto h-12 w-12 rounded-full bg-amber-50 flex items-center justify-center">
            <AlertTriangle className="h-6 w-6 text-amber-500" />
          </div>
          <div className="space-y-1">
            <p className="text-base font-semibold">
              {cerrada ? 'Esta atención ya está cerrada' : 'Esta atención aún no ha iniciado'}
            </p>
            <p className="text-sm text-muted-foreground">
              {cita.paciente_nombre} · {cita.servicio_nombre} — estado:{' '}
              <span className="font-medium">{ESTADO_LABEL[cita.estado] ?? cita.estado}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              {cerrada
                ? 'No se puede documentar una atención en este estado.'
                : 'Completa la llegada, consentimientos, pago y firma de asistencia antes de iniciar la atención clínica.'}
            </p>
          </div>

          {!cerrada && (
            <div className="flex flex-col gap-2">
              <Button variant="outline" onClick={() => setWizardAbierto(true)}>
                Abrir preparación del paciente
              </Button>
              {puedeIniciar && (
                <Button onClick={() => iniciarAtencion()} disabled={iniciando}>
                  {iniciando && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                  Iniciar atención
                </Button>
              )}
            </div>
          )}

          <Button variant="ghost" size="sm" asChild>
            <Link href="/atenciones">Volver a atenciones</Link>
          </Button>
        </div>

        <IniciarAtencionWizard
          citaId={wizardAbierto ? citaId : null}
          onClose={() => {
            setWizardAbierto(false)
            queryClient.invalidateQueries({ queryKey: ['citas', citaId] })
          }}
        />
      </div>
    )
  }

  if (!pacienteId || !paciente) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-sm font-medium">No se pudo cargar el paciente de esta atención.</p>
        <p className="text-sm text-muted-foreground">La cita cargó, pero falta la referencia del paciente o la consulta del paciente falló.</p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/atenciones">Volver a atenciones</Link>
        </Button>
      </div>
    )
  }

  const totalNotas = notas?.length ?? 0
  const totalFotos = notas?.reduce((acc, n) => acc + (n.fotos?.length ?? 0), 0) ?? 0

  const tabs = [
    { value: 'datos-generales',  label: 'Datos Generales',    show: tabsActivos['datos-generales'] ?? true },
    { value: 'motivo-consulta',  label: 'Motivo de Consulta', show: tabsActivos['motivo-consulta'] ?? true },
    { value: 'antecedentes',     label: 'Antecedentes',       show: tabsActivos.antecedentes ?? true },
    { value: 'mediciones',       label: 'Seguimiento',        show: tabsActivos.mediciones ?? true },
    { value: 'examenes',         label: 'Exámenes',           show: tabsActivos.examenes ?? true },
    { value: 'plan-manejo',      label: 'Plan de Manejo',     show: tabsActivos['plan-manejo'] ?? true },
    { value: 'ordenes',          label: 'Órdenes Médicas',    show: tabsActivos.ordenes ?? true },
    { value: 'fotos',            label: 'Fotos',              show: tabsActivos.fotos ?? true },
    { value: 'zonas',            label: 'Zonas',              show: tieneZonas },
    { value: 'laboratorios',     label: 'Laboratorios',       show: moduloObesidad },
    { value: 'farmacologico',    label: 'Farmacológico',      show: moduloObesidad },
  ].filter((t) => t.show)

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-background sticky top-0 z-10 min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" asChild className="shrink-0">
            <Link href="/atenciones">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Atenciones
            </Link>
          </Button>
          <div className="h-4 w-px bg-border shrink-0" />
          <div className="min-w-0">
            <span className="font-semibold text-sm">{cita.paciente_nombre}</span>
            <span className="text-muted-foreground text-sm ml-2 truncate">· {cita.servicio_nombre}</span>
          </div>
          <Badge variant="secondary" className="text-xs bg-rose-50 text-rose-700 border-rose-200 shrink-0">
            En atención
          </Badge>
          {minutosTranscurridos !== null && (
            <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
              <Clock className="h-3 w-3" />
              {formatDuracion(minutosTranscurridos)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">{formatTime(cita.fecha_inicio)}</span>
          <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => setShowDescartar(true)}>
            <XCircle className="h-4 w-4 mr-1.5" />
            Descartar
          </Button>
          <Button size="sm" onClick={handleCompletar} disabled={completando || verificando || isNavigating}>
            {(completando || verificando || isNavigating)
              ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              : <CheckCircle className="h-4 w-4 mr-1.5" />}
            {completando ? 'Completando…' : verificando ? 'Verificando…' : isNavigating ? 'Redirigiendo…' : 'Completar atención'}
          </Button>
        </div>
      </div>

      {/* Contexto de sesión de tratamiento */}
      {sesionCtx && (
        <div className="flex items-center gap-2 px-6 py-2 border-b bg-primary/5 text-xs min-w-0">
          <Stethoscope className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="font-medium shrink-0">
            Sesión {sesionCtx.numero}/{sesionCtx.total} · {sesionCtx.tratamiento_nombre}
          </span>
          {sesionCtx.procedimientos.length > 0 && (
            <span className="text-muted-foreground truncate">
              · incluye {sesionCtx.procedimientos.map((p) => p.nombre).join(', ')}
            </span>
          )}
        </div>
      )}

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left — resumen clínico siempre visible */}
        <div className="w-64 shrink-0 border-r overflow-y-auto bg-muted/20">
          <PanelPaciente paciente={paciente} cita={cita} historia={historia} />
        </div>

        {/* Main — tabs */}
        <div className="flex-1 overflow-hidden flex flex-col min-w-0">
          <Tabs
            value={tabActivo}
            onValueChange={setTabActivo}
            className={['flex flex-col flex-1 overflow-hidden', ATENCION_TAB_CARD_SCOPE].join(' ')}
          >
            {/* Tab bar con carousel */}
            <div className="border-b bg-background flex items-center overflow-hidden min-w-0">
              {canScrollLeft && (
                <button onClick={() => scrollTabs('left')} className="shrink-0 h-10 w-8 flex items-center justify-center border-r text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}
              <div ref={tabsScrollRef} className="flex-1 min-w-0 overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                <TabsList className="h-10 bg-transparent p-0 gap-0 w-max px-2">
                  {tabs.map((t) => (
                    <TabsTrigger
                      key={t.value}
                      value={t.value}
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 h-10 text-sm whitespace-nowrap"
                    >
                      {t.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
              {canScrollRight && (
                <button onClick={() => scrollTabs('right')} className="shrink-0 h-10 w-8 flex items-center justify-center border-l text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Datos Generales */}
            {(tabsActivos['datos-generales'] ?? true) && historia && (
              <TabsContent value="datos-generales" className="flex-1 overflow-y-auto px-6 py-5 mt-0">
                <TabDatosGenerales paciente={paciente} historia={historia} antecedentes={antecedentes ?? undefined} totalNotas={totalNotas} totalFotos={totalFotos} />
              </TabsContent>
            )}

            {/* Motivo de Consulta — en atención: textarea que guarda en nota */}
            {(tabsActivos['motivo-consulta'] ?? true) && historia && (
              <TabsContent value="motivo-consulta" className="flex-1 overflow-y-auto px-6 py-5 mt-0">
                <TabMotivoConsulta historia={historia} notas={notas ?? []} notaId={notaId ?? undefined} />
              </TabsContent>
            )}

            {/* Antecedentes — siempre persistente */}
            {(tabsActivos.antecedentes ?? true) && (
              <TabsContent value="antecedentes" className="flex-1 overflow-y-auto px-6 py-5 mt-0">
                <TabAntecedentes pacienteId={paciente.id} modoAtencion />
              </TabsContent>
            )}

            {/* Seguimiento — signos vitales + medidas corporales (obesidad como extra opcional) */}
            {(tabsActivos.mediciones ?? true) && pacienteId && (
              <TabsContent value="mediciones" className="flex-1 overflow-y-auto px-6 py-5 mt-0">
                <TabMediciones pacienteId={pacienteId} notaId={notaId ?? undefined} citaId={citaId} />
              </TabsContent>
            )}

            {/* Exámenes */}
            {(tabsActivos.examenes ?? true) && historia && (
              <TabsContent value="examenes" className="flex-1 overflow-y-auto px-6 py-5 mt-0">
                <TabExamenes historia={historia} notaId={notaId ?? undefined} />
              </TabsContent>
            )}

            {/* Plan de Manejo — en atención: textarea que guarda en nota */}
            {(tabsActivos['plan-manejo'] ?? true) && historia && (
              <TabsContent value="plan-manejo" className="flex-1 overflow-y-auto px-6 py-5 mt-0">
                <TabPlanManejo historia={historia} notas={notas ?? []} notaId={notaId ?? undefined} />
              </TabsContent>
            )}

            {/* Órdenes Médicas */}
            {(tabsActivos.ordenes ?? true) && historia && (
              <TabsContent value="ordenes" className="flex-1 overflow-y-auto px-6 py-5 mt-0">
                <TabOrdenesMedicas historia={historia} notaId={notaId ?? undefined} />
              </TabsContent>
            )}

            {/* Fotos */}
            {(tabsActivos.fotos ?? true) && historia && (
              <TabsContent value="fotos" className="flex-1 overflow-y-auto px-6 py-5 mt-0">
                <TabFotos historia={historia} notas={notas ?? []} modoAtencion />
              </TabsContent>
            )}

            {/* Zonas tratadas */}
            {tieneZonas && notaId && (
              <TabsContent value="zonas" className="flex-1 overflow-y-auto mt-0">
                <TabZonas notaId={notaId} />
              </TabsContent>
            )}

            {/* Obesidad — Laboratorios */}
            {moduloObesidad && pacienteId && (
              <TabsContent value="laboratorios" className="flex-1 overflow-y-auto px-6 py-5 mt-0">
                <TabLaboratorios pacienteId={pacienteId} />
              </TabsContent>
            )}

            {/* Obesidad — Farmacológico */}
            {moduloObesidad && pacienteId && (
              <TabsContent value="farmacologico" className="flex-1 overflow-y-auto px-6 py-5 mt-0">
                <TabFarmacologico pacienteId={pacienteId} notaId={notaId ?? undefined} />
              </TabsContent>
            )}

          </Tabs>
        </div>
      </div>

      <Dialog open={showDescartar} onOpenChange={setShowDescartar}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Descartar atención</DialogTitle>
            <DialogDescription>
              ¿Qué deseas hacer con esta atención? Los datos registrados en esta sesión se perderán.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <button
              className="w-full text-left rounded-lg border p-3 hover:bg-muted/50 transition-colors space-y-0.5 disabled:opacity-50"
              disabled={descartando || isNavigating}
              onClick={() => descartar('desiniciar')}
            >
              <p className="text-sm font-medium">Desiniciar atención</p>
              <p className="text-xs text-muted-foreground">La cita vuelve a estado "Confirmada". Úsalo si iniciaste por error.</p>
            </button>
            <button
              className="w-full text-left rounded-lg border border-destructive/30 p-3 hover:bg-destructive/5 transition-colors space-y-0.5 disabled:opacity-50"
              disabled={descartando || isNavigating}
              onClick={() => descartar('cancelar')}
            >
              <p className="text-sm font-medium text-destructive">Cancelar cita</p>
              <p className="text-xs text-muted-foreground">La cita queda cancelada y no se podrá recuperar.</p>
            </button>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setShowDescartar(false)} disabled={descartando}>
              Volver
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: procedimientos ejecutados en la sesión */}
      <Dialog open={showSesionProcs} onOpenChange={setShowSesionProcs}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-primary" />
              Procedimientos realizados
            </DialogTitle>
            <DialogDescription className="pt-1">
              {sesionCtx
                ? `Sesión ${sesionCtx.numero}/${sesionCtx.total} · ${sesionCtx.tratamiento_nombre}. Marca lo que se realizó en esta sesión.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-1">
            {sesionCtx?.procedimientos.map((p) => (
              <label key={p.id} className="flex items-center gap-2.5 rounded-lg border px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={procsSel.includes(p.id)}
                  onChange={() => toggleProc(p.id)}
                />
                <span className="text-sm flex-1">{p.nombre}</span>
                <span className="text-xs text-muted-foreground">{p.duracion_min} min</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSesionProcs(false)}>Cancelar</Button>
            <Button
              disabled={procsSel.length === 0}
              onClick={() => { setShowSesionProcs(false); proceedCompletar() }}
            >
              Completar sesión y atención
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: nota vacía → bloqueo total */}
      <Dialog open={showBloqueoVacio} onOpenChange={setShowBloqueoVacio}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Nota sin contenido
            </DialogTitle>
            <DialogDescription className="pt-1">
              No has documentado nada en esta atención. Registra al menos el motivo de consulta,
              el plan de manejo, exámenes, órdenes o fotos antes de completarla.
              Si necesitas cerrarla sin documentar, usa <strong>Descartar</strong>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setShowBloqueoVacio(false)}>Entendido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: confirmar completar atención */}
      <Dialog open={showConfirmCompletar} onOpenChange={setShowConfirmCompletar}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-primary" />
              Terminar atención
            </DialogTitle>
            <DialogDescription className="pt-1">
              ¿Estás seguro que deseas terminar esta atención? La nota quedará cerrada y la cita pasará a completada.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmCompletar(false)} disabled={completando}>
              Cancelar
            </Button>
            <Button onClick={() => { setShowConfirmCompletar(false); completar() }} disabled={completando}>
              Sí, terminar atención
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
