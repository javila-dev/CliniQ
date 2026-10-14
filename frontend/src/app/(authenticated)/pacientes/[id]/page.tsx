'use client'

import { use, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Pencil, FileText, Calendar, ClipboardList, Plus,
  ChevronRight, Receipt, ShieldCheck, ExternalLink, CheckCircle,
  Loader2, ClipboardCheck, Wallet, ShieldCheck as ShieldCheckIcon,
  Camera, AlertTriangle, X, RefreshCw, Lock, UserCheck, UserX,
} from 'lucide-react'
import type { CheckInRecord } from '@/lib/api/pacientes'
import { CamaraCaptura } from '@/components/shared/CamaraCaptura'
import { ReintentarPdfConsentimiento } from '@/components/historia/ReintentarPdfConsentimiento'
import Link from 'next/link'
import { pacientesApi } from '@/lib/api/pacientes'
import { clinicasApi } from '@/lib/api/clinicas'
import { cotizacionesApi } from '@/lib/api/cotizaciones'
import { cobrosApi } from '@/lib/api/cobros'
import { protocolosApi } from '@/lib/api/protocolos'
import { agendaApi } from '@/lib/api/agenda'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EtiquetaSeguimientoPaciente } from '@/components/seguimiento/EtiquetaSeguimientoPaciente'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CotizacionEnviadaChip, CotizacionEstadoBadge } from '@/components/cotizaciones/CotizacionEstadoBadge'
import { formatDate, formatFechaLocal, todayISO, cn, edadPaciente } from '@/lib/utils'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { mensajeDeError } from '@/lib/errores'
import { toast } from '@/hooks/use-toast'
import { resolveMediaUrl } from '@/lib/utils/media'
import { useAuthStore } from '@/store/authStore'
import { hasPermission, PERM } from '@/lib/permissions'
import type { EstadoCobro } from '@/types/cobros'
import type { Cita } from '@/types/agenda'

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

const CONSENT_ESTADO: Record<string, { label: string; className: string }> = {
  vigente:  { label: 'Vigente',  className: 'bg-green-50 text-green-700 ring-1 ring-green-200'  },
  vencido:  { label: 'Vencido',  className: 'bg-amber-50 text-amber-600 ring-1 ring-amber-200'  },
  faltante: { label: 'Faltante', className: 'bg-red-50 text-red-500 ring-1 ring-red-200'         },
}

// Las fechas del consentimiento son "solo día" (YYYY-MM-DD): con new Date() se
// leían como medianoche UTC y en Colombia se mostraban un día antes (M2-26).
function getConsentEstado(vencimiento: string | null | undefined): 'vigente' | 'vencido' {
  if (!vencimiento) return 'vigente'
  return vencimiento.slice(0, 10) >= todayISO() ? 'vigente' : 'vencido'
}

// Mismo formato que toLocaleDateString('es-CO') que se usaba antes (dd/mm/aaaa).
const FECHA_CORTA: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'numeric', day: 'numeric' }

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

function AsistenciaFila({ cita, pacienteId }: { cita: Cita; pacienteId: string }) {
  const qc = useQueryClient()
  const { mutate, isPending } = useMutation({
    mutationFn: () => agendaApi.citas.recuperarPdfAsistencia(cita.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['citas-asistencias', pacienteId] }),
  })

  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3">
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium truncate uppercase">{cita.servicio_nombre}</p>
          <p className="text-xs text-muted-foreground">{formatDate(cita.fecha_inicio)}</p>
        </div>
      </div>
      {cita.firma_asistencia_archivo_url ? (
        <a
          href={cita.firma_asistencia_archivo_url}
          target="_blank"
          rel="noopener noreferrer"
          title="Ver comprobante firmado"
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      ) : (
        <button
          onClick={() => mutate()}
          disabled={isPending}
          className="text-[11px] text-primary hover:underline disabled:opacity-50 shrink-0"
          title="Recuperar PDF firmado"
        >
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'PDF'}
        </button>
      )}
    </div>
  )
}

function Seccion({ title, children, hint }: { title: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3 pt-4 px-5">
        <CardTitle>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {title}
          </span>
        </CardTitle>
        {hint}
      </CardHeader>
      <CardContent className="pt-0 px-5 pb-5">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
          {children}
        </div>
      </CardContent>
    </Card>
  )
}

function Dato({ label, value, wide }: { label: string; value?: string | null | boolean; wide?: boolean }) {
  const texto = value === true ? 'Sí' : value === false ? 'No' : (value ?? '—')
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

/** Error al cargar una sección de la ficha: distinto de "no hay registros". */
function ErrorCargaModal({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="px-6 py-4 text-sm">
      <p className="text-destructive">No se pudo cargar esta información.</p>
      <button type="button" onClick={onRetry} className="mt-1 text-xs font-medium underline-offset-2 hover:underline">
        Reintentar
      </button>
    </div>
  )
}

type ModalType = 'cotizaciones' | 'asistencias' | 'ingresos' | 'consentimientos' | 'verificaciones' | null

interface Props { params: Promise<{ id: string }> }

export default function PacienteDetailPage({ params }: Props) {
  const { id } = use(params)
  const [activeModal, setActiveModal] = useState<ModalType>(null)
  const [showEnrollment, setShowEnrollment] = useState(false)
  const [showFotoControl, setShowFotoControl] = useState(false)
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const canCambiarFotoControl = hasPermission(user, PERM.PACIENTES_FOTO_CONTROL_CAMBIAR)
  const canEliminarFotoControl = hasPermission(user, PERM.PACIENTES_FOTO_CONTROL_ELIMINAR)
  const canCrearCotizacion = hasPermission(user, PERM.COTIZACIONES_GESTIONAR)
  // Cada sección solo aparece con su permiso: sin él mostraba "Sin cotizaciones"
  // o "Sin ingresos" aunque existieran (la consulta respondía 403).
  const canVerCotizaciones = hasPermission(user, PERM.COTIZACIONES_VER)
  const canVerCobros = hasPermission(user, PERM.COBROS_VER)
  const canVerAgenda = hasPermission(user, PERM.AGENDA_VER)
  const canVerHistoria = hasPermission(user, PERM.HISTORIA_VER)
  const canEditar = hasPermission(user, PERM.PACIENTES_EDITAR)

  const { data: p, isLoading, isError, refetch } = useQuery({
    queryKey: ['pacientes', id],
    queryFn: () => pacientesApi.get(id),
  })

  const { data: wizardConfig } = useQuery({
    queryKey: ['wizard-config'],
    queryFn: () => clinicasApi.wizardConfig.get(),
  })

  const cotizacionesQ = useQuery({
    queryKey: ['cotizaciones', { paciente: id }],
    queryFn: () => cotizacionesApi.list({ paciente: id }),
    enabled: !!id && canVerCotizaciones,
  })
  const cotizacionesData = cotizacionesQ.data

  const cobrosQ = useQuery({
    queryKey: ['ingresos', { paciente: id, page_size: 5 }],
    queryFn: () => cobrosApi.list({ paciente: id, page_size: 5 }),
    enabled: !!id && canVerCobros,
  })
  const cobrosData = cobrosQ.data

  const consentimientosQ = useQuery({
    queryKey: ['consentimientos-paciente', id],
    queryFn: () => protocolosApi.consentimientos.list(id),
    enabled: !!id,
    retry: 1,
  })
  const consentimientos = consentimientosQ.data

  const asistenciasQ = useQuery({
    queryKey: ['citas-asistencias', id],
    queryFn: () => agendaApi.citas.list({ paciente: id, firma_asistencia_estado: 'firmada' }),
    enabled: !!id && canVerAgenda,
  })
  const citasFirmadas = asistenciasQ.data?.results

  const [confirmarActivo, setConfirmarActivo] = useState(false)
  const activoMut = useMutation({
    mutationFn: (activo: boolean) => pacientesApi.update(id, { activo }),
    onSuccess: (actualizado) => {
      qc.invalidateQueries({ queryKey: ['pacientes'] })
      setConfirmarActivo(false)
      toast.success(actualizado.activo ? 'Paciente reactivado' : 'Paciente desactivado')
    },
    onError: (err) => toast.error('No se pudo cambiar el estado del paciente', mensajeDeError(err)),
  })

  if (isLoading) return <LoadingState rows={4} />
  if (isError || !p) return <ErrorState onRetry={refetch} />

  const initials = `${p.nombres.charAt(0)}${p.apellidos.charAt(0)}`.toUpperCase()
  const fotoControlUrl = resolveMediaUrl(p.foto_control_url ?? null)
  const edad = edadPaciente(p)
  const direccionCompleta = [p.direccion, p.barrio, p.ciudad].filter(Boolean).join(', ')

  // El total real (count), no las filas de la primera página (máx. 25) (M2-26).
  const cotCount = cotizacionesData?.count ?? 0
  const cobrosCount = cobrosData?.count ?? 0
  const asistenciasCount = asistenciasQ.data?.count ?? 0
  const consentCount = consentimientos?.length ?? 0

  return (
    <div className="space-y-6">

      {/* ── Encabezado ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          {p.tiene_foto_control !== null ? (
            <button
              type="button"
              onClick={() => setShowFotoControl(true)}
              title={fotoControlUrl ? 'Ver foto de control' : 'Sin foto de control'}
              className="h-14 w-14 rounded-full overflow-hidden shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              {fotoControlUrl ? (
                <img src={fotoControlUrl} alt="Foto de control" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-rose-100 text-rose-600 font-bold flex items-center justify-center text-xl select-none">
                  {initials}
                </div>
              )}
            </button>
          ) : (
            <div className="h-14 w-14 rounded-full bg-rose-100 text-rose-600 font-bold flex items-center justify-center text-xl select-none shrink-0">
              {initials}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight truncate">{p.nombre_completo}</h1>
              <Badge variant={p.activo ? 'success' : 'secondary'} className="shrink-0">
                {p.activo ? 'Activo' : 'Inactivo'}
              </Badge>
              <EtiquetaSeguimientoPaciente pacienteId={id} />
            </div>
            <p className="text-sm text-muted-foreground">
              {p.tipo_documento} {p.numero_documento}
              {edad !== null && <> · {edad} años</>}
              {p.fecha_nacimiento && <> · Nacimiento: {formatDate(p.fecha_nacimiento)}</>}
            </p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" asChild>
            <Link href="/pacientes"><ArrowLeft className="h-4 w-4 mr-2" />Volver</Link>
          </Button>
          {canEditar && (
            <Button variant="outline" asChild>
              <Link href={`/pacientes/${id}/editar`}><Pencil className="h-4 w-4 mr-2" />Editar</Link>
            </Button>
          )}
          {/* No había forma de desactivar a un paciente (M2-26). */}
          {canEditar && (
            <Button variant="outline" onClick={() => setConfirmarActivo(true)}>
              {p.activo
                ? <><UserX className="h-4 w-4 mr-2" />Desactivar</>
                : <><UserCheck className="h-4 w-4 mr-2" />Reactivar</>}
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmarActivo}
        onOpenChange={(v) => { if (!v && !activoMut.isPending) setConfirmarActivo(false) }}
        title={p.activo ? 'Desactivar paciente' : 'Reactivar paciente'}
        description={p.activo
          ? 'El paciente quedará como inactivo en el listado. Su historia, citas y cobros se conservan, y puedes reactivarlo cuando quieras.'
          : 'El paciente volverá a figurar como activo en el listado.'}
        confirmLabel={p.activo ? 'Desactivar' : 'Reactivar'}
        variant={p.activo ? 'destructive' : 'default'}
        loading={activoMut.isPending}
        onConfirm={() => activoMut.mutate(!p.activo)}
      />

      {/* ── Banner foto de control faltante ──────────────────────────────── */}
      {wizardConfig?.paso_verificacion_facial && !p.tiene_foto_control && canCambiarFotoControl && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-800">Sin foto de control</p>
            <p className="text-xs text-amber-600 mt-0.5">
              Este paciente no tiene foto registrada. La verificación de identidad no podrá realizarse en sus citas.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 border-amber-300 text-amber-700 hover:bg-amber-100 gap-1.5"
            onClick={() => setShowEnrollment(true)}
          >
            <Camera className="h-3.5 w-3.5" />
            Tomar foto
          </Button>
        </div>
      )}

      {showEnrollment && (
        <Dialog open onOpenChange={(open) => { if (!open) setShowEnrollment(false) }}>
          <DialogContent className="max-w-xl">
            <EnrollmentFotoDialog
              pacienteId={id}
              onDone={() => {
                setShowEnrollment(false)
                qc.invalidateQueries({ queryKey: ['pacientes', id] })
              }}
            />
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={showFotoControl} onOpenChange={setShowFotoControl}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Foto de control</DialogTitle>
          </DialogHeader>
          <FotoControlModal
            pacienteId={id}
            fotoControlUrl={fotoControlUrl}
            canCambiar={canCambiarFotoControl}
            canEliminar={canEliminarFotoControl}
            onClose={() => setShowFotoControl(false)}
            onUpdated={() => qc.invalidateQueries({ queryKey: ['pacientes', id] })}
          />
        </DialogContent>
      </Dialog>

      {/* ── Contenido ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Columna principal */}
        <div className="lg:col-span-2 space-y-4">
          <Seccion
            title="Identificación y contacto"
            hint={p.datos_sensibles_ocultos ? (
              <p className="flex items-center gap-1.5 text-xs text-amber-600 mt-1">
                <Lock className="h-3 w-3 shrink-0" />
                Datos enmascarados — requiere el permiso “Ver datos sensibles del paciente”.
              </p>
            ) : undefined}
          >
            <Dato label="Tipo de documento" value={p.tipo_documento} />
            <Dato label="Número de documento" value={p.numero_documento} />
            <Dato label="Sexo" value={SEXO_LABEL[p.sexo] ?? p.sexo} />
            <Dato label="Teléfono" value={p.telefono} />
            <Dato label="Correo electrónico" value={p.email} />
            <Dato label="Canal de confirmación" value={CANAL_LABEL[p.canal_confirmacion] ?? p.canal_confirmacion} />
            <Dato label="Autoriza tratamiento de datos" value={p.autoriza_datos} />
          </Seccion>

          <Seccion title="Datos personales">
            <Dato label="Dirección" value={direccionCompleta || null} wide />
            <Dato label="Estado civil" value={ESTADO_CIVIL_LABEL[p.estado_civil ?? ''] ?? p.estado_civil} />
            <Dato label="Ocupación" value={p.ocupacion} />
            <Dato label="Escolaridad" value={ESCOLARIDAD_LABEL[p.escolaridad ?? ''] ?? p.escolaridad} />
            <Dato label="Grupo étnico" value={GRUPO_ETNICO_LABEL[p.grupo_etnico ?? ''] ?? p.grupo_etnico} />
          </Seccion>

          <Seccion title="Salud y afiliación">
            <Dato label="Grupo sanguíneo" value={p.grupo_sanguineo} />
            <Dato label="EPS / Aseguradora" value={p.eps} />
            <Dato label="Tipo de afiliado" value={TIPO_AFILIADO_LABEL[p.tipo_afiliado ?? ''] ?? p.tipo_afiliado} />
            <Dato label="Régimen" value={REGIMEN_LABEL[p.regimen ?? ''] ?? p.regimen} />
          </Seccion>

          <Seccion title="Responsable / Acompañante">
            <Dato label="Nombre" value={p.nombre_responsable} />
            <Dato label="Parentesco" value={p.parentesco_responsable} />
            <Dato label="Teléfono" value={p.telefono_responsable} />
          </Seccion>

        </div>

        {/* Panel lateral */}
        <div className="space-y-4">

          {/* Acciones rápidas */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Acciones rápidas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {canVerHistoria && (
                <Button variant="outline" className="w-full justify-start" asChild>
                  <Link href={`/pacientes/${id}/historia`}>
                    <FileText className="h-4 w-4 mr-2" />Historia clínica
                  </Link>
                </Button>
              )}
              {canVerAgenda && (
                <Button variant="outline" className="w-full justify-start" asChild>
                  <Link href={`/agenda?paciente=${id}`}>
                    <Calendar className="h-4 w-4 mr-2" />Ver citas
                  </Link>
                </Button>
              )}
              {canCrearCotizacion && (
                <Button variant="outline" className="w-full justify-start" asChild>
                  <Link href={`/cotizaciones/nueva?paciente=${id}`}>
                    <ClipboardList className="h-4 w-4 mr-2" />Nueva cotización
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Historial */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Historial</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {canVerCotizaciones && (
                <Button
                  variant="outline"
                  className="w-full justify-between"
                  onClick={() => setActiveModal('cotizaciones')}
                >
                  <span className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4" />Cotizaciones
                  </span>
                  {cotCount > 0 && <Badge variant="secondary" className="text-xs">{cotCount}</Badge>}
                </Button>
              )}
              {canVerAgenda && (
                <Button
                  variant="outline"
                  className="w-full justify-between"
                  onClick={() => setActiveModal('asistencias')}
                >
                  <span className="flex items-center gap-2">
                    <ClipboardCheck className="h-4 w-4" />Asistencias
                  </span>
                  {asistenciasCount > 0 && <Badge variant="secondary" className="text-xs">{asistenciasCount}</Badge>}
                </Button>
              )}
              {canVerCobros && (
                <Button
                  variant="outline"
                  className="w-full justify-between"
                  onClick={() => setActiveModal('ingresos')}
                >
                  <span className="flex items-center gap-2">
                    <Wallet className="h-4 w-4" />Ingresos
                  </span>
                  {cobrosCount > 0 && <Badge variant="secondary" className="text-xs">{cobrosCount}</Badge>}
                </Button>
              )}
              <Button
                variant="outline"
                className="w-full justify-between"
                onClick={() => setActiveModal('consentimientos')}
              >
                <span className="flex items-center gap-2">
                  <ShieldCheckIcon className="h-4 w-4" />Consentimientos
                </span>
                {consentCount > 0 && <Badge variant="secondary" className="text-xs">{consentCount}</Badge>}
              </Button>
              {p.tiene_foto_control !== null && (
                <Button
                  variant="outline"
                  className="w-full justify-between"
                  onClick={() => setActiveModal('verificaciones')}
                >
                  <span className="flex items-center gap-2">
                    <Camera className="h-4 w-4" />Verificaciones faciales
                  </span>
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Fechas */}
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

      {/* ── Modal: Cotizaciones ───────────────────────────────────────────────── */}
      <Dialog open={activeModal === 'cotizaciones'} onOpenChange={(o) => !o && setActiveModal(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center justify-between pr-6">
              <span>Cotizaciones</span>
              {canCrearCotizacion && (
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" asChild>
                  <Link href={`/cotizaciones/nueva?paciente=${id}`} onClick={() => setActiveModal(null)}>
                    <Plus className="h-3.5 w-3.5" />Nueva
                  </Link>
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 -mx-6 px-0">
            {cotizacionesQ.isError ? (
              <ErrorCargaModal onRetry={() => cotizacionesQ.refetch()} />
            ) : !cotCount ? (
              <p className="text-sm text-muted-foreground/60 italic px-6 py-4">Sin cotizaciones registradas.</p>
            ) : (
              <div className="divide-y">
                {cotizacionesData!.results.map((c) => (
                  <Link
                    key={c.id}
                    href={c.estado === 'aceptada' ? `/ventas/${c.id}` : `/cotizaciones/${c.id}`}
                    onClick={() => setActiveModal(null)}
                    className="flex items-center justify-between gap-3 px-6 py-3 hover:bg-muted/30 transition-colors group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <CotizacionEstadoBadge estado={c.estado_comercial ?? c.estado} />
                        {c.estado === 'borrador' && <CotizacionEnviadaChip enviadaEn={c.enviada_en} />}
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
                {cotCount > cotizacionesData!.results.length && (
                  <p className="text-xs text-muted-foreground px-6 py-3">
                    Se muestran {cotizacionesData!.results.length} de {cotCount} cotizaciones.
                  </p>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Asistencias ───────────────────────────────────────────────── */}
      <Dialog open={activeModal === 'asistencias'} onOpenChange={(o) => !o && setActiveModal(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>Asistencias firmadas</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 -mx-6 px-0">
            {asistenciasQ.isError ? (
              <ErrorCargaModal onRetry={() => asistenciasQ.refetch()} />
            ) : !asistenciasCount ? (
              <p className="text-sm text-muted-foreground/60 italic px-6 py-4">Sin asistencias firmadas.</p>
            ) : (
              <div className="divide-y">
                {citasFirmadas!.map((c) => (
                  <AsistenciaFila key={c.id} cita={c} pacienteId={id} />
                ))}
                {asistenciasCount > citasFirmadas!.length && (
                  <p className="text-xs text-muted-foreground px-5 py-3">
                    Se muestran {citasFirmadas!.length} de {asistenciasCount} asistencias.
                  </p>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Ingresos ──────────────────────────────────────────────────── */}
      <Dialog open={activeModal === 'ingresos'} onOpenChange={(o) => !o && setActiveModal(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center justify-between pr-6">
              <span>Ingresos</span>
              <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                <Link href={`/ingresos?paciente=${id}`} onClick={() => setActiveModal(null)}>
                  Ver todos
                </Link>
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 -mx-6 px-0">
            {cobrosQ.isError ? (
              <ErrorCargaModal onRetry={() => cobrosQ.refetch()} />
            ) : !cobrosData?.results?.length ? (
              <p className="text-sm text-muted-foreground/60 italic px-6 py-4">Sin ingresos registrados.</p>
            ) : (
              <div className="divide-y">
                {cobrosData.results.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 px-6 py-3">
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
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Consentimientos ───────────────────────────────────────────── */}
      <Dialog open={activeModal === 'consentimientos'} onOpenChange={(o) => !o && setActiveModal(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>Consentimientos</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 py-2">
            {consentimientosQ.isError ? (
              <ErrorCargaModal onRetry={() => consentimientosQ.refetch()} />
            ) : !consentCount ? (
              <p className="text-sm text-muted-foreground/60 italic py-4">Sin consentimientos registrados.</p>
            ) : (
              <div className="space-y-3">
                {consentimientos!.map((c) => {
                  const estado = getConsentEstado(c.vigencia_hasta)
                  const cfg = CONSENT_ESTADO[estado]
                  return (
                    <div key={c.id} className="flex items-center gap-3">
                      <ShieldCheck className={cn('h-4 w-4 shrink-0', estado === 'vigente' ? 'text-green-500' : 'text-amber-500')} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.template_nombre}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.procedimiento_nombre && `${c.procedimiento_nombre} · `}
                          {c.fecha_firma && `Firmado ${formatFechaLocal(c.fecha_firma, FECHA_CORTA)}`}
                          {c.fecha_firma && c.vigencia_hasta && ' · '}
                          {c.vigencia_hasta && `Vence ${formatFechaLocal(c.vigencia_hasta, FECHA_CORTA)}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!c.archivo_url && c.pdf_pendiente && (
                          <ReintentarPdfConsentimiento
                            consentimientoId={c.id}
                            invalidar={[['consentimientos-paciente', id]]}
                          />
                        )}
                        {c.archivo_url && (
                          <a
                            href={c.archivo_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            title="Ver PDF"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                        <span className={cn('inline-flex px-2 py-0.5 rounded-md text-[10px] font-medium', cfg.className)}>
                          {cfg.label}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal verificaciones faciales ─────────────────────────────────────── */}
      <Dialog open={activeModal === 'verificaciones'} onOpenChange={(o) => !o && setActiveModal(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-4 w-4" />
              Verificaciones faciales
            </DialogTitle>
          </DialogHeader>
          <VerificacionesModal pacienteId={id} fotoControlUrl={resolveMediaUrl((p as any).foto_control_url ?? null)} />
        </DialogContent>
      </Dialog>

    </div>
  )
}

function VerificacionesModal({ pacienteId, fotoControlUrl }: { pacienteId: string; fotoControlUrl: string | null }) {
  const { data: checkins = [], isLoading } = useQuery<CheckInRecord[]>({
    queryKey: ['checkins', pacienteId],
    queryFn: () => pacientesApi.checkins(pacienteId),
  })

  return (
    <div className="overflow-y-auto flex-1 space-y-4 pt-1">
      {/* Foto de control */}
      <div className="flex items-center gap-4 rounded-xl border bg-gray-50 p-4">
        <div className="h-20 w-20 rounded-lg overflow-hidden border bg-white shrink-0">
          {fotoControlUrl ? (
            <img src={fotoControlUrl} alt="Foto de control" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Camera className="h-6 w-6 text-muted-foreground/30" />
            </div>
          )}
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-800">Foto de control</p>
          <p className="text-xs text-muted-foreground mt-0.5">Referencia base para todas las verificaciones</p>
          {!fotoControlUrl && <p className="text-xs text-amber-600 mt-1">Sin foto registrada</p>}
        </div>
      </div>

      {/* Historial */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Historial ({checkins.length})
        </p>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : checkins.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8 italic">
            Aún no hay verificaciones registradas.
          </p>
        ) : (
          <div className="space-y-3">
            {checkins.map(ch => {
              const cfg = CONFIDENCE_CONFIG[ch.confidence]
              return (
                <div key={ch.id} className="flex gap-4 rounded-xl border bg-white p-3">
                  {/* Foto live grande */}
                  <div className="h-24 w-24 rounded-lg overflow-hidden border bg-gray-50 shrink-0">
                    {ch.foto_live_url ? (
                      <a href={resolveMediaUrl(ch.foto_live_url) ?? undefined} target="_blank" rel="noopener noreferrer">
                        <img src={resolveMediaUrl(ch.foto_live_url) ?? ''} alt="Foto verificación" className="w-full h-full object-cover hover:opacity-90 transition-opacity" />
                      </a>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Camera className="h-5 w-5 text-muted-foreground/25" />
                      </div>
                    )}
                  </div>

                  {/* Datos */}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cfg.cls}`}>
                        {cfg.label}
                      </span>
                      <span className="text-sm font-medium">{Math.round(ch.score * 100)}% similitud</span>
                      {!ch.match && (
                        <span className="text-xs text-red-500 font-medium">· No coincide</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(ch.created_at).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                    {ch.realizado_por_nombre && (
                      <p className="text-xs text-muted-foreground">Por: {ch.realizado_por_nombre}</p>
                    )}
                    {ch.cita_fecha && (
                      <p className="text-xs text-muted-foreground">
                        Cita: {new Date(ch.cita_fecha).toLocaleDateString('es-CO', { dateStyle: 'medium' })}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

const CONFIDENCE_CONFIG = {
  alta:  { label: 'Alta',  cls: 'bg-green-100 text-green-700 border-green-200' },
  media: { label: 'Media', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  baja:  { label: 'Baja',  cls: 'bg-red-100 text-red-700 border-red-200'       },
}

function EnrollmentFotoDialog({ pacienteId, onDone, onCancelar }: { pacienteId: string; onDone: () => void; onCancelar?: () => void }) {
  const [state, setState] = useState<'camara' | 'uploading' | 'ok' | 'error'>('camara')
  const [enrollErrors, setEnrollErrors]   = useState<string[]>([])
  const [enrollWarnings, setEnrollWarnings] = useState<string[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function subir(file: File) {
    setState('uploading')
    try {
      await pacientesApi.enrollment(pacienteId, file)
      setState('ok')
      setTimeout(onDone, 1500)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { errors?: string[]; warnings?: string[]; error?: string } } }
      const errs  = e?.response?.data?.errors   ?? []
      const warns = e?.response?.data?.warnings ?? []
      if (errs.length > 0 || warns.length > 0) {
        setEnrollErrors(errs)
        setEnrollWarnings(warns)
        setErrorMsg(null)
      } else {
        setErrorMsg(e?.response?.data?.error ?? 'La foto no pudo procesarse. Intenta con otra.')
        setEnrollErrors([])
        setEnrollWarnings([])
      }
      setState('error')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <ShieldCheckIcon className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">Foto de control</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Toma una foto del paciente para habilitar la verificación de identidad en sus citas.
          </p>
        </div>
      </div>

      {state === 'camara' && (
        <CamaraCaptura
          onCaptura={subir}
          onCancelar={onCancelar ?? onDone}
          labelCapturar="Tomar foto de control"
        />
      )}

      {state === 'uploading' && (
        <div className="flex flex-col items-center gap-2 py-8">
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Procesando foto…</p>
        </div>
      )}

      {state === 'ok' && (
        <div className="flex flex-col items-center gap-2 py-8">
          <CheckCircle className="h-8 w-8 text-emerald-500" />
          <p className="text-sm font-medium text-emerald-700">Foto de control registrada</p>
        </div>
      )}

      {state === 'error' && (
        <div className="space-y-3">
          {(enrollErrors.length > 0 || enrollWarnings.length > 0) && (
            <div className="space-y-1.5">
              {enrollErrors.map((msg, i) => (
                <div key={i} className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2">
                  <span className="text-red-500 shrink-0 mt-0.5 text-sm">✕</span>
                  <p className="text-xs text-red-700">{msg}</p>
                </div>
              ))}
              {enrollWarnings.map((msg, i) => (
                <div key={i} className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
                  <span className="text-amber-500 shrink-0 mt-0.5 text-sm">!</span>
                  <p className="text-xs text-amber-700">{msg}</p>
                </div>
              ))}
            </div>
          )}
          {errorMsg && (
            <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2">
              <span className="text-red-500 shrink-0 mt-0.5 text-sm">✕</span>
              <p className="text-xs text-red-700">{errorMsg}</p>
            </div>
          )}
          <Button variant="outline" className="w-full" onClick={() => setState('camara')}>
            <Camera className="h-4 w-4 mr-2" />Reintentar
          </Button>
          <Button variant="ghost" size="sm" className="w-full text-muted-foreground gap-1.5" onClick={onDone}>
            <X className="h-3.5 w-3.5" />Cancelar
          </Button>
        </div>
      )}
    </div>
  )
}

function FotoControlModal({
  pacienteId, fotoControlUrl, canCambiar, canEliminar, onClose, onUpdated,
}: {
  pacienteId: string
  fotoControlUrl: string | null
  canCambiar: boolean
  canEliminar: boolean
  onClose: () => void
  onUpdated: () => void
}) {
  const [modo, setModo] = useState<'ver' | 'capturar'>('ver')
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false)

  const eliminarMutation = useMutation({
    mutationFn: () => pacientesApi.eliminarFotoControl(pacienteId),
    onSuccess: () => {
      onUpdated()
      onClose()
    },
  })

  if (modo === 'capturar') {
    return (
      <EnrollmentFotoDialog
        pacienteId={pacienteId}
        onCancelar={() => setModo('ver')}
        onDone={() => {
          onUpdated()
          onClose()
        }}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-3">
        <div className="h-56 w-56 rounded-xl overflow-hidden border bg-muted">
          {fotoControlUrl ? (
            <img src={fotoControlUrl} alt="Foto de control" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full flex items-center justify-center">
              <Camera className="h-10 w-10 text-muted-foreground/30" />
            </div>
          )}
        </div>
        {!fotoControlUrl && (
          <p className="text-sm text-muted-foreground text-center">Este paciente no tiene foto de control.</p>
        )}
      </div>

      {eliminarMutation.isError && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
          <p className="text-sm text-destructive">No se pudo eliminar la foto. Intenta de nuevo.</p>
        </div>
      )}

      {confirmandoEliminar ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
          <p className="text-sm text-red-700">
            ¿Eliminar la foto de control? El paciente quedará sin verificación facial hasta registrar una nueva.
          </p>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={() => setConfirmandoEliminar(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={eliminarMutation.isPending}
              onClick={() => eliminarMutation.mutate()}
            >
              {eliminarMutation.isPending ? 'Eliminando…' : 'Sí, eliminar'}
            </Button>
          </div>
        </div>
      ) : (
        (canCambiar || (canEliminar && fotoControlUrl)) && (
          <div className="flex gap-2 justify-center flex-wrap">
            {canCambiar && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setModo('capturar')}>
                <RefreshCw className="h-3.5 w-3.5" />
                {fotoControlUrl ? 'Retomar foto' : 'Tomar foto'}
              </Button>
            )}
            {canEliminar && fotoControlUrl && (
              <Button size="sm" variant="destructive" className="gap-1.5" onClick={() => setConfirmandoEliminar(true)}>
                <X className="h-3.5 w-3.5" />
                Eliminar foto
              </Button>
            )}
          </div>
        )
      )}
    </div>
  )
}
