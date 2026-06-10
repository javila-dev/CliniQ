'use client'

import { use, useTransition } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams, useRouter } from 'next/navigation'
import { ArrowLeft, FileText, User } from 'lucide-react'
import Link from 'next/link'
import { historiaClinicaApi } from '@/lib/api/historiaClinica'
import { pacientesApi } from '@/lib/api/pacientes'
import { LoadingState } from '@/components/shared/LoadingState'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TabDatosGenerales } from '@/components/historia/TabDatosGenerales'
import { TabMotivoConsulta } from '@/components/historia/TabMotivoConsulta'
import { TabAntecedentes } from '@/components/historia/TabAntecedentes'
import { TabExamenes } from '@/components/historia/TabExamenes'
import { TabPlanManejo } from '@/components/historia/TabPlanManejo'
import { TabOrdenesMedicas } from '@/components/historia/TabOrdenesMedicas'
import { TabFotos } from '@/components/historia/TabFotos'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { canAccess } from '@/lib/permissions'
import { useHistoriaConfig } from '@/store/historiaConfigStore'
import { cn } from '@/lib/utils'

const ALL_TABS = [
  { value: 'datos-generales', label: 'Datos Generales' },
  { value: 'motivo-consulta', label: 'Motivo de Consulta' },
  { value: 'antecedentes',    label: 'Antecedentes' },
  { value: 'examenes',        label: 'Exámenes' },
  { value: 'plan-manejo',     label: 'Plan de Manejo' },
  { value: 'ordenes',         label: 'Órdenes Médicas' },
  { value: 'fotos',           label: 'Fotos' },
] as const

const SEXO_LABEL: Record<string, string> = { M: 'Masculino', F: 'Femenino', O: 'Otro' }
const DOC_LABEL:  Record<string, string> = { CC: 'CC', CE: 'CE', PA: 'Pasaporte', TI: 'TI', NIT: 'NIT' }

function calcularEdad(fechaNacimiento: string | null): string | null {
  if (!fechaNacimiento) return null
  const hoy = new Date()
  const nac = new Date(fechaNacimiento)
  let edad = hoy.getFullYear() - nac.getFullYear()
  const m = hoy.getMonth() - nac.getMonth()
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--
  return `${edad} años`
}

interface Props { params: Promise<{ id: string }> }

export default function HistoriaPage({ params }: Props) {
  return <RoleGuard check={canAccess.historiaClinica}><HistoriaContent params={params} /></RoleGuard>
}

function HistoriaContent({ params }: Props) {
  const { id: pacienteId } = use(params)
  const searchParams = useSearchParams()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const tabActivo = searchParams.get('tab') ?? 'datos-generales'
  const { tabsActivos } = useHistoriaConfig()
  const TABS = ALL_TABS.filter((t) => tabsActivos[t.value] ?? true)

  const { data: paciente, isLoading: loadingPaciente } = useQuery({
    queryKey: ['pacientes', pacienteId],
    queryFn: () => pacientesApi.get(pacienteId),
  })

  const { data: historiasData, isLoading: loadingHistoria } = useQuery({
    queryKey: ['historias', pacienteId],
    queryFn: () => historiaClinicaApi.historias.list({ paciente: pacienteId }),
  })

  const historia = historiasData?.results.find((h) => h.paciente === pacienteId)

  const { data: notas } = useQuery({
    queryKey: ['historia', historia?.id, 'notas'],
    queryFn: () => historiaClinicaApi.historias.notas(historia!.id),
    enabled: Boolean(historia?.id),
  })

  const { data: antecedentes } = useQuery({
    queryKey: ['antecedentes', pacienteId],
    queryFn: () => historiaClinicaApi.antecedentes.get(pacienteId),
    retry: false,
  })

  function handleTabChange(value: string) {
    startTransition(() => {
      const p = new URLSearchParams(searchParams.toString())
      p.set('tab', value)
      router.replace(`/pacientes/${pacienteId}/historia?${p.toString()}`)
    })
  }

  if (loadingHistoria || loadingPaciente) return <LoadingState rows={4} />

  if (!historia) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/pacientes/${pacienteId}`}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Volver
            </Link>
          </Button>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">
              Este paciente aún no tiene historia clínica.
              Se creará automáticamente al completar la primera cita.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const totalFotos = notas?.reduce((acc, n) => acc + (n.fotos?.length ?? 0), 0) ?? 0
  const edad = paciente ? calcularEdad(paciente.fecha_nacimiento) : null
  const iniciales = paciente
    ? `${paciente.nombres?.[0] ?? ''}${paciente.apellidos?.[0] ?? ''}`.toUpperCase()
    : '?'

  return (
    <div className="space-y-0">
      {/* Header paciente */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" asChild className="-ml-2 shrink-0">
              <Link href={`/pacientes/${pacienteId}`}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Paciente
              </Link>
            </Button>

            <div className="h-5 w-px bg-border" />

            {/* Avatar + datos */}
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-rose-100 flex items-center justify-center text-sm font-bold text-rose-700 shrink-0">
                {iniciales}
              </div>
              <div>
                <h1 className="font-semibold text-sm leading-tight">{paciente?.nombre_completo}</h1>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {paciente && (
                    <span className="text-xs text-muted-foreground">
                      {DOC_LABEL[paciente.tipo_documento]} {paciente.numero_documento}
                    </span>
                  )}
                  {edad && (
                    <>
                      <span className="text-muted-foreground/40 text-xs">·</span>
                      <span className="text-xs text-muted-foreground">{edad}</span>
                    </>
                  )}
                  {paciente?.sexo && (
                    <>
                      <span className="text-muted-foreground/40 text-xs">·</span>
                      <span className="text-xs text-muted-foreground">{SEXO_LABEL[paciente.sexo]}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <User className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Historia clínica</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tabActivo} onValueChange={handleTabChange}>
        {/* Tab bar */}
        <div className="bg-white border-b sticky top-0 z-10 px-6">
          <div className="overflow-x-auto -mx-6 px-6" style={{ scrollbarWidth: 'none' }}>
            <TabsList className="h-10 bg-transparent p-0 gap-0 w-max">
              {TABS.map((t) => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  disabled={isPending}
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 h-10 text-sm whitespace-nowrap"
                >
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* Barra de progreso al cambiar tab */}
          <div className={cn(
            'absolute bottom-0 left-0 h-0.5 bg-primary/40 transition-all duration-300',
            isPending ? 'w-full animate-pulse' : 'w-0'
          )} />
        </div>

        {/* Contenido — envuelto en área con padding uniforme */}
        <div className={cn('px-6 py-6 transition-opacity duration-150', isPending && 'opacity-50 pointer-events-none')}>
          <TabsContent value="datos-generales" className="mt-0">
            {paciente && (
              <TabDatosGenerales
                paciente={paciente}
                historia={historia}
                antecedentes={antecedentes}
                totalNotas={notas?.length ?? 0}
                totalFotos={totalFotos}
              />
            )}
          </TabsContent>

          <TabsContent value="motivo-consulta" className="mt-0">
            <TabMotivoConsulta historia={historia} notas={notas ?? []} />
          </TabsContent>

          <TabsContent value="antecedentes" className="mt-0">
            <TabAntecedentes pacienteId={pacienteId} />
          </TabsContent>

          <TabsContent value="examenes" className="mt-0">
            <TabExamenes historia={historia} />
          </TabsContent>

          <TabsContent value="plan-manejo" className="mt-0">
            <TabPlanManejo historia={historia} notas={notas ?? []} />
          </TabsContent>

          <TabsContent value="ordenes" className="mt-0">
            <TabOrdenesMedicas historia={historia} />
          </TabsContent>

          <TabsContent value="fotos" className="mt-0">
            <TabFotos historia={historia} notas={notas ?? []} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
