'use client'

import { use } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Pencil, FileText, Calendar, ClipboardList, Plus, ChevronRight, Receipt, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { pacientesApi } from '@/lib/api/pacientes'
import { cotizacionesApi } from '@/lib/api/cotizaciones'
import { cobrosApi } from '@/lib/api/cobros'
import { protocolosApi } from '@/lib/api/protocolos'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CotizacionEstadoBadge } from '@/components/cotizaciones/CotizacionEstadoBadge'
import { TratamientoCard } from '@/components/protocolos/TratamientoCard'
import { formatDate, cn } from '@/lib/utils'
import type { EstadoCobro } from '@/types/cobros'

// ── Mapas de etiquetas ────────────────────────────────────────────────────────

const CANAL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp', sms: 'SMS', llamada: 'Llamada',
}
const SEXO_LABEL: Record<string, string> = {
  M: 'Masculino', F: 'Femenino', O: 'Otro',
}
const ESTADO_CIVIL_LABEL: Record<string, string> = {
  soltero: 'Soltero/a', casado: 'Casado/a', union_libre: 'Unión libre',
  separado: 'Separado/a', divorciado: 'Divorciado/a', viudo: 'Viudo/a',
}
const ESCOLARIDAD_LABEL: Record<string, string> = {
  ninguna: 'Sin escolaridad', primaria: 'Primaria', secundaria: 'Secundaria',
  tecnico: 'Técnico / Tecnólogo', universitario: 'Universitario', posgrado: 'Posgrado',
}
const GRUPO_ETNICO_LABEL: Record<string, string> = {
  mestizo: 'Mestizo', blanco: 'Blanco', afrocolombiano: 'Afrocolombiano',
  indigena: 'Indígena', raizal: 'Raizal', rom: 'ROM / Gitano', otro: 'Otro',
}
const TIPO_AFILIADO_LABEL: Record<string, string> = {
  cotizante: 'Cotizante', beneficiario: 'Beneficiario', independiente: 'Independiente',
  subsidiado: 'Subsidiado', vinculado: 'Vinculado',
}
const REGIMEN_LABEL: Record<string, string> = {
  contributivo: 'Contributivo', subsidiado: 'Subsidiado', vinculado: 'Vinculado',
  especial: 'Especial / Excepción', pensionado: 'Pensionado',
}

function calcularEdad(fechaNacimiento: string): number {
  const hoy = new Date()
  const nac = new Date(fechaNacimiento)
  let edad = hoy.getFullYear() - nac.getFullYear()
  const m = hoy.getMonth() - nac.getMonth()
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--
  return edad
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CONSENT_ESTADO: Record<string, { label: string; className: string }> = {
  vigente:  { label: 'Vigente',  className: 'bg-green-50 text-green-700 ring-1 ring-green-200'  },
  vencido:  { label: 'Vencido',  className: 'bg-amber-50 text-amber-600 ring-1 ring-amber-200'  },
  faltante: { label: 'Faltante', className: 'bg-red-50 text-red-500 ring-1 ring-red-200'         },
}

function getConsentEstado(vencimiento: string): 'vigente' | 'vencido' {
  return new Date(vencimiento) >= new Date() ? 'vigente' : 'vencido'
}

const COBRO_ESTADO_STYLE: Record<EstadoCobro, string> = {
  pendiente:      'bg-amber-50 text-amber-600 ring-1 ring-amber-200',
  pagado_parcial: 'bg-blue-50 text-blue-600 ring-1 ring-blue-200',
  pagado:         'bg-green-50 text-green-700 ring-1 ring-green-200',
  anulado:        'bg-gray-100 text-gray-500 ring-1 ring-gray-200',
}
const COBRO_ESTADO_LABEL: Record<EstadoCobro, string> = {
  pendiente: 'Pendiente', pagado_parcial: 'Parcial', pagado: 'Pagado', anulado: 'Anulado',
}
const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

// ── Sub-componentes ───────────────────────────────────────────────────────────

function Seccion({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3 pt-4 px-5">
        <CardTitle>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {title}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 px-5 pb-5">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
          {children}
        </div>
      </CardContent>
    </Card>
  )
}

function Dato({
  label, value, wide,
}: {
  label: string
  value?: string | null | boolean
  wide?: boolean
}) {
  const texto =
    value === true ? 'Sí' :
    value === false ? 'No' :
    (value ?? '—')

  return (
    <div className={wide ? 'col-span-2 sm:col-span-3' : ''}>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className={`text-sm font-medium ${!value && value !== false ? 'text-muted-foreground/50' : ''}`}>
        {texto}
      </p>
    </div>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────

interface Props { params: Promise<{ id: string }> }

export default function PacienteDetailPage({ params }: Props) {
  const { id } = use(params)

  const { data: p, isLoading, isError, refetch } = useQuery({
    queryKey: ['pacientes', id],
    queryFn: () => pacientesApi.get(id),
  })

  const { data: cotizacionesData } = useQuery({
    queryKey: ['cotizaciones', { paciente: id }],
    queryFn: () => cotizacionesApi.list({ paciente: id }),
    enabled: !!id,
  })

  const { data: cobrosData } = useQuery({
    queryKey: ['ingresos', { paciente: id, page_size: 5 }],
    queryFn: () => cobrosApi.list({ paciente: id, page_size: 5 }),
    enabled: !!id,
  })

  const { data: tratamientos = [] } = useQuery({
    queryKey: ['tratamientos-paciente', id],
    queryFn: () => protocolosApi.tratamientos.list({ paciente: id }),
    enabled: !!id,
  })

  const { data: consentimientos } = useQuery({
    queryKey: ['consentimientos-paciente', id],
    queryFn: () => protocolosApi.consentimientos.list(id),
    enabled: !!id,
    retry: 1,
  })

  if (isLoading) return <LoadingState rows={4} />
  if (isError || !p) return <ErrorState onRetry={refetch} />

  const initials = `${p.nombres.charAt(0)}${p.apellidos.charAt(0)}`.toUpperCase()
  const edad = p.fecha_nacimiento ? calcularEdad(p.fecha_nacimiento) : null
  const direccionCompleta = [p.direccion, p.barrio, p.ciudad].filter(Boolean).join(', ')

  return (
    <div className="space-y-6">

      {/* ── Encabezado con avatar ──────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          {/* Avatar */}
          <div className="h-14 w-14 rounded-full bg-rose-100 text-rose-600 font-bold flex items-center justify-center text-xl shrink-0 select-none">
            {initials}
          </div>
          {/* Info */}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight truncate">{p.nombre_completo}</h1>
              <Badge variant={p.activo ? 'success' : 'secondary'} className="shrink-0">
                {p.activo ? 'Activo' : 'Inactivo'}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {p.tipo_documento} {p.numero_documento}
              {edad !== null && <> · {edad} años</>}
              {p.fecha_nacimiento && <> · Nacimiento: {formatDate(p.fecha_nacimiento)}</>}
            </p>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" asChild>
            <Link href="/pacientes">
              <ArrowLeft className="h-4 w-4 mr-2" />Volver
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/pacientes/${id}/editar`}>
              <Pencil className="h-4 w-4 mr-2" />Editar
            </Link>
          </Button>
          <Button asChild>
            <Link href={`/pacientes/${id}/historia`}>
              <FileText className="h-4 w-4 mr-2" />Historia clínica
            </Link>
          </Button>
        </div>
      </div>

      {/* ── Contenido ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Columna principal */}
        <div className="lg:col-span-2 space-y-4">

          {/* Identificación y contacto */}
          <Seccion title="Identificación y contacto">
            <Dato label="Tipo de documento" value={p.tipo_documento} />
            <Dato label="Número de documento" value={p.numero_documento} />
            <Dato label="Sexo" value={SEXO_LABEL[p.sexo] ?? p.sexo} />
            <Dato label="Teléfono" value={p.telefono} />
            <Dato label="Correo electrónico" value={p.email} />
            <Dato label="Canal de confirmación" value={CANAL_LABEL[p.canal_confirmacion] ?? p.canal_confirmacion} />
            <Dato label="Autoriza tratamiento de datos" value={p.autoriza_datos} />
          </Seccion>

          {/* Datos personales */}
          <Seccion title="Datos personales">
            <Dato label="Dirección" value={direccionCompleta || null} wide />
            <Dato label="Estado civil" value={ESTADO_CIVIL_LABEL[p.estado_civil ?? ''] ?? p.estado_civil} />
            <Dato label="Ocupación" value={p.ocupacion} />
            <Dato label="Escolaridad" value={ESCOLARIDAD_LABEL[p.escolaridad ?? ''] ?? p.escolaridad} />
            <Dato label="Grupo étnico" value={GRUPO_ETNICO_LABEL[p.grupo_etnico ?? ''] ?? p.grupo_etnico} />
          </Seccion>

          {/* Salud y afiliación */}
          <Seccion title="Salud y afiliación">
            <Dato label="Grupo sanguíneo" value={p.grupo_sanguineo} />
            <Dato label="EPS / Aseguradora" value={p.eps} />
            <Dato label="Tipo de afiliado" value={TIPO_AFILIADO_LABEL[p.tipo_afiliado ?? ''] ?? p.tipo_afiliado} />
            <Dato label="Régimen" value={REGIMEN_LABEL[p.regimen ?? ''] ?? p.regimen} />
          </Seccion>

          {/* Responsable */}
          <Seccion title="Responsable / Acompañante">
            <Dato label="Nombre" value={p.nombre_responsable} />
            <Dato label="Parentesco" value={p.parentesco_responsable} />
            <Dato label="Teléfono" value={p.telefono_responsable} />
          </Seccion>

        </div>

        {/* Panel lateral */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Acciones rápidas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link href={`/pacientes/${id}/historia`}>
                  <FileText className="h-4 w-4 mr-2" />Historia clínica
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link href={`/agenda?paciente=${id}`}>
                  <Calendar className="h-4 w-4 mr-2" />Ver citas
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link href={`/cotizaciones/nueva?paciente=${id}`}>
                  <ClipboardList className="h-4 w-4 mr-2" />Nueva cotización
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Registrado</p>
                <p className="text-sm font-medium">{formatDate(p.created_at)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Última actualización</p>
                <p className="text-sm font-medium">{formatDate(p.updated_at)}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Cotizaciones del paciente ──────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3 pt-4 px-5">
          <div className="flex items-center justify-between">
            <CardTitle>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cotizaciones</span>
            </CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-primary gap-1" asChild>
              <Link href={`/cotizaciones/nueva?paciente=${id}`}>
                <Plus className="h-3.5 w-3.5" />Nueva
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0 px-5 pb-5">
          {!cotizacionesData?.results?.length ? (
            <p className="text-sm text-muted-foreground/60 italic">Sin cotizaciones registradas.</p>
          ) : (
            <div className="divide-y -mx-5">
              {cotizacionesData.results.slice(0, 5).map((c) => (
                <Link
                  key={c.id}
                  href={`/cotizaciones/${c.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-muted/30 transition-colors group"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <CotizacionEstadoBadge estado={c.estado} />
                      <span className="text-xs text-muted-foreground">{formatDate(c.created_at)}</span>
                    </div>
                    <p className="text-sm font-medium mt-0.5">
                      {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(Number(c.total))}
                      <span className="text-xs text-muted-foreground font-normal ml-1.5">
                        · {c.items.length} servicio{c.items.length !== 1 ? 's' : ''}
                      </span>
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground/60 shrink-0 transition-colors" />
                </Link>
              ))}
              {(cotizacionesData.results.length ?? 0) > 5 && (
                <div className="px-5 py-3">
                  <Link href={`/cotizaciones?paciente=${id}`} className="text-xs text-primary hover:underline">
                    Ver todas las cotizaciones ({cotizacionesData.results.length})
                  </Link>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Tratamientos activos ──────────────────────────────────────────── */}
      {tratamientos.length > 0 && (
        <Card>
          <CardHeader className="pb-3 pt-4 px-5">
            <CardTitle>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tratamientos</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-5 pb-5 space-y-3">
            {tratamientos
              .sort((a, b) => {
                const order = { activo: 0, completado: 1, abandonado: 2 }
                return (order[a.estado] ?? 1) - (order[b.estado] ?? 1)
              })
              .map((t) => (
                <TratamientoCard
                  key={t.id}
                  tratamiento={t}
                  defaultExpanded={t.estado === 'activo'}
                />
              ))}
          </CardContent>
        </Card>
      )}

      {/* ── Ingresos del paciente ──────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3 pt-4 px-5">
          <div className="flex items-center justify-between">
            <CardTitle>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ingresos</span>
            </CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-primary gap-1" asChild>
              <Link href={`/ingresos?paciente=${id}`}>
                Ver todos
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0 px-5 pb-5">
          {!cobrosData?.results?.length ? (
            <p className="text-sm text-muted-foreground/60 italic">Sin ingresos registrados.</p>
          ) : (
            <div className="divide-y -mx-5">
              {cobrosData.results.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="flex items-center justify-center h-7 w-7 rounded-md bg-gray-50 shrink-0">
                      <Receipt className="h-3.5 w-3.5 text-gray-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{COP.format(Number(c.total))}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(c.fecha)}</p>
                    </div>
                  </div>
                  <span className={cn('inline-flex px-2 py-0.5 rounded-md text-xs font-medium shrink-0', COBRO_ESTADO_STYLE[c.estado])}>
                    {COBRO_ESTADO_LABEL[c.estado]}
                  </span>
                </div>
              ))}
              {(cobrosData.count ?? 0) > 5 && (
                <div className="px-5 py-3">
                  <Link href={`/ingresos?paciente=${id}`} className="text-xs text-primary hover:underline">
                    Ver todos los ingresos ({cobrosData.count})
                  </Link>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Consentimientos del paciente ───────────────────────────────────── */}
      {consentimientos !== undefined && (
        <Card>
          <CardHeader className="pb-3 pt-4 px-5">
            <div className="flex items-center justify-between">
              <CardTitle>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Consentimientos</span>
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0 px-5 pb-5">
            {!consentimientos?.length ? (
              <p className="text-sm text-muted-foreground/60 italic">Sin consentimientos registrados.</p>
            ) : (
              <div className="space-y-2">
                {consentimientos.map((c) => {
                  const estado = getConsentEstado(c.vigencia_hasta)
                  const cfg = CONSENT_ESTADO[estado]
                  return (
                    <div key={c.id} className="flex items-center gap-3">
                      <ShieldCheck className={cn('h-4 w-4 shrink-0', estado === 'vigente' ? 'text-green-500' : 'text-amber-500')} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.template_nombre}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.procedimiento_nombre && `${c.procedimiento_nombre} · `}
                          Firmado {new Date(c.fecha_firma).toLocaleDateString('es-CO')}
                          {' · '}vence {new Date(c.vigencia_hasta).toLocaleDateString('es-CO')}
                        </p>
                      </div>
                      <span className={cn('inline-flex px-2 py-0.5 rounded-md text-[10px] font-medium shrink-0', cfg.className)}>
                        {cfg.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
