'use client'

import { use, useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle, Clock, ChevronLeft, ChevronRight, XCircle } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { agendaApi } from '@/lib/api/agenda'
import { pacientesApi } from '@/lib/api/pacientes'
import { historiaClinicaApi } from '@/lib/api/historiaClinica'
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
import { useAtencionConfig } from '@/store/atencionConfigStore'
import { useNotaEnProgreso } from '@/store/notaEnProgresoStore'
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
  const queryClient = useQueryClient()
  const { tabsActivos } = useAtencionConfig()
  const { notaId, setNota, clear: clearNota } = useNotaEnProgreso()

  // ── Queries ────────────────────────────────────────────────────────────────

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

  const isReady = !loadingCita && !loadingPaciente && Boolean(cita) && Boolean(historia)

  useEffect(() => {
    if (!isReady || !historia || !cita) return
    if (notaId) return   // ya existe borrador para esta sesión
    historiaClinicaApi.notas.createBorrador(historia.id, cita.id)
      .then((nota) => setNota(nota.id, cita.id))
      .catch(() => {/* H26 pendiente — no bloquear la pantalla */})
  }, [isReady, historia?.id, cita?.id])

  // Limpiar store al desmontar
  useEffect(() => () => clearNota(), [])

  // ── Completar atención ─────────────────────────────────────────────────────

  const { mutate: completar, isPending: completando } = useMutation({
    mutationFn: async () => {
      // H26: completar la nota antes de cambiar estado de cita
      if (notaId) {
        await historiaClinicaApi.notas.completar(notaId).catch(() => {/* H26 pendiente */})
      }
      return agendaApi.citas.cambiarEstado(citaId, { estado: 'completada' })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['citas'] })
      clearNota()
      router.push('/atenciones')
    },
  })

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
      router.push('/atenciones')
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
    { value: 'datos-generales',  label: 'Datos Generales',   show: tabsActivos['datos-generales'] ?? true },
    { value: 'motivo-consulta',  label: 'Motivo de Consulta', show: tabsActivos['motivo-consulta'] ?? true },
    { value: 'antecedentes',     label: 'Antecedentes',       show: tabsActivos.antecedentes ?? true },
    { value: 'examenes',         label: 'Exámenes',           show: tabsActivos.examenes ?? true },
    { value: 'plan-manejo',      label: 'Plan de Manejo',     show: tabsActivos['plan-manejo'] ?? true },
    { value: 'ordenes',          label: 'Órdenes Médicas',    show: tabsActivos.ordenes ?? true },
    { value: 'fotos',            label: 'Fotos',              show: tabsActivos.fotos ?? true },
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
          <Button size="sm" onClick={() => completar()} disabled={completando}>
            <CheckCircle className="h-4 w-4 mr-1.5" />
            {completando ? 'Completando…' : 'Completar atención'}
          </Button>
        </div>
      </div>

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
              disabled={descartando}
              onClick={() => descartar('desiniciar')}
            >
              <p className="text-sm font-medium">Desiniciar atención</p>
              <p className="text-xs text-muted-foreground">La cita vuelve a estado "Confirmada". Úsalo si iniciaste por error.</p>
            </button>
            <button
              className="w-full text-left rounded-lg border border-destructive/30 p-3 hover:bg-destructive/5 transition-colors space-y-0.5 disabled:opacity-50"
              disabled={descartando}
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
    </div>
  )
}
