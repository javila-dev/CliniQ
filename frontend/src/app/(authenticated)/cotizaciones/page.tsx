'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Plus, FileText, Download, Loader2 } from 'lucide-react'
import { cotizacionesApi } from '@/lib/api/cotizaciones'
import { PageHeader } from '@/components/shared/PageHeader'
import { LoadingState } from '@/components/shared/LoadingState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CotizacionEstadoBadge } from '@/components/cotizaciones/CotizacionEstadoBadge'
import { formatDate } from '@/lib/utils'
import { useDebounce } from '@/hooks/useDebounce'
import type { Cotizacion } from '@/types/cotizaciones'

const ESTADO_TABS: { value: string; label: string }[] = [
  { value: 'todas',    label: 'Todas'     },
  { value: 'borrador', label: 'Borrador'  },
  { value: 'aceptada', label: 'Aceptadas' },
  { value: 'vencida',  label: 'Vencidas'  },
]

function formatCOP(value: string | number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(Number(value))
}

export default function CotizacionesPage() {
  const router = useRouter()
  const [tabEstado, setTabEstado] = useState('todas')
  const [busqueda, setBusqueda] = useState('')
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [loadingNueva, setLoadingNueva] = useState(false)
  const debouncedBusqueda = useDebounce(busqueda, 350)

  const params: Record<string, string> = {}
  if (tabEstado !== 'todas') params.estado = tabEstado
  if (debouncedBusqueda) params.search = debouncedBusqueda

  const { data, isLoading } = useQuery({
    queryKey: ['cotizaciones', params],
    queryFn: () => cotizacionesApi.list(params),
  })

  function abrirNueva() {
    setLoadingNueva(true)
    router.push('/cotizaciones/nueva')
  }

  function abrirDetalle(c: Cotizacion) {
    setLoadingId(c.id)
    router.push(`/cotizaciones/${c.id}`)
  }

  async function descargarPdf(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    const blob = await cotizacionesApi.descargarPdf(id)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cotizacion-${id.slice(0, 8)}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Cotizaciones"
        description="Gestiona las propuestas comerciales para los pacientes"
        action={
          <Button onClick={abrirNueva} disabled={loadingNueva}>
            {loadingNueva
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <Plus className="h-4 w-4 mr-2" />}
            Nueva cotización
          </Button>
        }
      />

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <Input
          placeholder="Buscar por paciente…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-64 h-9"
        />
      </div>

      {/* Tabs de estado */}
      <Tabs value={tabEstado} onValueChange={setTabEstado}>
        <TabsList className="h-9">
          {ESTADO_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="text-xs">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Lista */}
      {isLoading ? (
        <LoadingState rows={4} />
      ) : !data?.results?.length ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">
              {tabEstado !== 'todas' ? 'Sin cotizaciones con este estado' : 'Aún no hay cotizaciones creadas'}
            </p>
            <Button variant="outline" size="sm" className="mt-4" onClick={abrirNueva}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Crear la primera
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Paciente</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Estado</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Total</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden sm:table-cell">Vence</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">Profesional</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">Fecha</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {data.results.map((c) => (
                <tr
                  key={c.id}
                  className={`border-b last:border-0 hover:bg-muted/20 cursor-pointer transition-colors${loadingId === c.id ? ' opacity-60 pointer-events-none' : ''}`}
                  onClick={() => abrirDetalle(c)}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium">{c.paciente_nombre}</p>
                    <p className="text-xs text-muted-foreground">{c.items.length} servicio{c.items.length !== 1 ? 's' : ''}</p>
                  </td>
                  <td className="px-4 py-3">
                    <CotizacionEstadoBadge estado={c.estado} />
                  </td>
                  <td className="px-4 py-3 font-semibold tabular-nums">
                    {formatCOP(c.total)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                    {c.fecha_vencimiento ? formatDate(c.fecha_vencimiento) : '—'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                    {c.profesional_nombre ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                    {formatDate(c.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    {loadingId === c.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Descargar PDF"
                        onClick={(e) => descargarPdf(e, c.id)}
                      >
                        <Download className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  )
}
