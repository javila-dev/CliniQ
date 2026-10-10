'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Plus, FileText, Loader2, X } from 'lucide-react'
import { cotizacionesApi } from '@/lib/api/cotizaciones'
import { PageHeader } from '@/components/shared/PageHeader'
import { LoadingState } from '@/components/shared/LoadingState'
import { PuestaEnMarchaButton } from '@/components/shared/PuestaEnMarchaButton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CotizacionEnviadaChip, CotizacionEstadoBadge } from '@/components/cotizaciones/CotizacionEstadoBadge'
import {
  CeldaFecha, CeldaPersona, Dinero, Encabezado, FilaClic, Paginacion, TablaContenedor, TablaVacia, Td, Th,
} from '@/components/shared/TablaDatos'
import { useDebounce } from '@/hooks/useDebounce'
import { useAuthStore } from '@/store/authStore'
import { useUserSedes } from '@/hooks/useUserSedes'
import { hasPermission, isProfesional, PERM } from '@/lib/permissions'
import type { Cotizacion, EstadoComercial } from '@/types/cotizaciones'

// Solo propuestas: las aceptadas son ventas y viven en /ventas ("Vendidas"
// queda para ver qué cotizaciones se cerraron).
const ESTADO_TABS: { value: string; label: string }[] = [
  { value: 'borrador',   label: 'Abiertas'    },
  { value: 'vencida',    label: 'Vencidas'    },
  { value: 'descartada', label: 'Descartadas' },
  { value: 'aceptada',   label: 'Vendidas'    },
  { value: 'todas',      label: 'Todas'       },
]

const PAGE_SIZE = 25

export default function CotizacionesPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const canGestionar = hasPermission(user, PERM.COTIZACIONES_GESTIONAR)
  const [tabEstado, setTabEstado] = useState('borrador')
  const [busqueda, setBusqueda] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [sede, setSede] = useState('todas')
  const [profesional, setProfesional] = useState('todos')
  const [page, setPage] = useState(1)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [loadingNueva, setLoadingNueva] = useState(false)
  const debouncedBusqueda = useDebounce(busqueda, 350)
  const { sedes } = useUserSedes()
  // Un profesional solo ve en el listado sus propias cotizaciones: el filtro no aplica.
  const filtraPorProfesional = !isProfesional(user)
  const { data: profesionales = [] } = useQuery({
    queryKey: ['cotizaciones', 'profesionales'],
    queryFn: () => cotizacionesApi.profesionales(),
    enabled: filtraPorProfesional,
    staleTime: 5 * 60 * 1000,
  })

  const params: {
    estado_comercial?: EstadoComercial
    search?: string
    fecha_desde?: string
    fecha_hasta?: string
    sede?: string
    profesional?: string
    page: number
  } = { page }
  if (tabEstado !== 'todas') params.estado_comercial = tabEstado as EstadoComercial
  if (debouncedBusqueda) params.search = debouncedBusqueda
  if (fechaDesde) params.fecha_desde = fechaDesde
  if (fechaHasta) params.fecha_hasta = fechaHasta
  if (sede !== 'todas') params.sede = sede
  if (profesional !== 'todos') params.profesional = profesional

  const { data, isLoading } = useQuery({
    queryKey: ['cotizaciones', params],
    queryFn: () => cotizacionesApi.list(params),
  })

  const total = data?.count ?? 0
  const hayFiltros = Boolean(debouncedBusqueda || fechaDesde || fechaHasta || sede !== 'todas' || profesional !== 'todos')

  function cambiarTab(v: string) {
    setTabEstado(v)
    setPage(1)
  }

  function cambiarBusqueda(v: string) {
    setBusqueda(v)
    setPage(1)
  }

  function cambiarFecha(campo: 'desde' | 'hasta', v: string) {
    if (campo === 'desde') setFechaDesde(v)
    else setFechaHasta(v)
    setPage(1)
  }

  function cambiarSelect(setter: (v: string) => void, v: string) {
    setter(v)
    setPage(1)
  }

  function limpiarFiltros() {
    setBusqueda('')
    setFechaDesde('')
    setFechaHasta('')
    setSede('todas')
    setProfesional('todos')
    setPage(1)
  }

  function abrirNueva() {
    setLoadingNueva(true)
    router.push('/cotizaciones/nueva')
  }

  function abrirDetalle(c: Cotizacion) {
    setLoadingId(c.id)
    router.push(c.estado === 'aceptada' ? `/ventas/${c.id}` : `/cotizaciones/${c.id}`)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Cotizaciones"
        description="Propuestas enviadas a los pacientes. Las aceptadas pasan a Ventas."
        helpSlug="crear-y-enviar-una-cotizacion"
        action={
          <div className="flex items-center gap-2">
            <PuestaEnMarchaButton />
            {canGestionar && (
              <Button onClick={abrirNueva} disabled={loadingNueva}>
                {loadingNueva
                  ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  : <Plus className="h-4 w-4 mr-2" />}
                Nueva cotización
              </Button>
            )}
          </div>
        }
      />

      {/* Filtros */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Buscar</label>
          <Input
            placeholder="Nombre del paciente…"
            value={busqueda}
            onChange={(e) => cambiarBusqueda(e.target.value)}
            className="w-64 h-9"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Desde</label>
          <Input
            type="date"
            value={fechaDesde}
            max={fechaHasta || undefined}
            onChange={(e) => cambiarFecha('desde', e.target.value)}
            className="w-40 h-9"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Hasta</label>
          <Input
            type="date"
            value={fechaHasta}
            min={fechaDesde || undefined}
            onChange={(e) => cambiarFecha('hasta', e.target.value)}
            className="w-40 h-9"
          />
        </div>
        {sedes.length > 1 && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Sede</label>
            <Select value={sede} onValueChange={(v) => cambiarSelect(setSede, v)}>
              <SelectTrigger className="w-44 h-9">
                <SelectValue placeholder="Sede" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas las sedes</SelectItem>
                {sedes.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {filtraPorProfesional && profesionales.length > 1 && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Profesional</label>
            <Select value={profesional} onValueChange={(v) => cambiarSelect(setProfesional, v)}>
              <SelectTrigger className="w-52 h-9">
                <SelectValue placeholder="Profesional" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los profesionales</SelectItem>
                {profesionales.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {hayFiltros && (
          <Button variant="ghost" size="sm" className="h-9" onClick={limpiarFiltros}>
            <X className="h-3.5 w-3.5 mr-1.5" />
            Limpiar
          </Button>
        )}

        {/* Filtro de estado — en la misma fila, alineado a la derecha */}
        <Tabs value={tabEstado} onValueChange={cambiarTab} className="ml-auto max-w-full overflow-x-auto">
          <TabsList className="h-9">
            {ESTADO_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="text-xs">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Lista */}
      {isLoading ? (
        <LoadingState rows={4} />
      ) : !data?.results?.length ? (
        <TablaVacia
          icono={<FileText className="h-5 w-5" />}
          titulo={tabEstado === 'borrador' && !hayFiltros
            ? 'No hay cotizaciones abiertas'
            : tabEstado !== 'todas' || hayFiltros
              ? 'Sin cotizaciones para estos filtros'
              : 'Aún no hay cotizaciones creadas'}
          accion={canGestionar && !hayFiltros && (tabEstado === 'todas' || tabEstado === 'borrador') ? (
            <Button variant="outline" size="sm" onClick={abrirNueva}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Crear la primera
            </Button>
          ) : undefined}
        />
      ) : (
        <TablaContenedor pie={<Paginacion page={page} total={total} pageSize={PAGE_SIZE} onPage={setPage} />}>
          <Encabezado>
            <Th>Paciente</Th>
            <Th>Estado</Th>
            <Th className="hidden md:table-cell">Creada</Th>
            <Th className="hidden sm:table-cell">Vence</Th>
            <Th align="right">Total</Th>
            <th className="w-10" />
          </Encabezado>
          <tbody>
            {data.results.map((c) => (
              <FilaClic key={c.id} onClick={() => abrirDetalle(c)} cargando={loadingId === c.id}>
                <Td>
                  <CeldaPersona
                    nombre={c.paciente_nombre}
                    detalle={[c.profesional_nombre, sedes.length > 1 ? c.sede_nombre : null].filter(Boolean).join(' · ') || undefined}
                  />
                </Td>
                <Td>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <CotizacionEstadoBadge estado={c.estado_comercial ?? c.estado} />
                    {c.estado === 'borrador' && <CotizacionEnviadaChip enviadaEn={c.enviada_en} />}
                  </div>
                </Td>
                <Td className="hidden md:table-cell w-32"><CeldaFecha fecha={c.created_at} /></Td>
                <Td className="hidden sm:table-cell w-32">
                  {c.estado === 'aceptada'
                    ? <CeldaFecha fecha={c.aceptada_en ?? null} nota="vendida" />
                    : c.estado === 'descartada' || !c.fecha_vencimiento
                      ? <span className="text-gray-400">—</span>
                      : <CeldaFecha fecha={c.fecha_vencimiento} tono={c.estado_comercial === 'vencida' ? 'aviso' : undefined} />}
                </Td>
                <Td align="right"><Dinero valor={c.total} className="font-semibold text-gray-900" /></Td>
              </FilaClic>
            ))}
          </tbody>
        </TablaContenedor>
      )}

    </div>
  )
}
