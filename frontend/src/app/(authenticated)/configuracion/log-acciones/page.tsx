'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronLeft, ChevronRight, Search,
  CalendarPlus, CalendarCheck, CalendarX, CalendarClock,
  FileText, PenLine, ClipboardSignature,
  CreditCard, DollarSign, Activity, LogIn, Shield, UserCog,
  BadgeCheck, Gift, Building2, Receipt, Handshake, Target,
} from 'lucide-react'
import { coreApi } from '@/lib/api/core'
import { useAuthStore } from '@/store/authStore'
import { hasPermission, PERM } from '@/lib/permissions'
import { PageHeader } from '@/components/shared/PageHeader'
import { ErrorState } from '@/components/shared/ErrorState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { NotaAjuste, SeccionAjustes, SelectAjuste, VacioAjustes } from '@/components/configuracion/ajustes'
import { cn } from '@/lib/utils'
import { mensajeDeError } from '@/lib/errores'
import { useDebounce } from '@/hooks/useDebounce'
import type { LogAccion } from '@/types/core'

const PAGE_SIZE = 25
/** Con "Todo menos inicios de sesión" se traen las últimas acciones de una vez y se
 *  quitan los ingresos en pantalla: el servidor solo filtra por una acción exacta. */
const VENTANA_SIN_INGRESOS = 500
const LOGIN = 'auth.login'

// ─── Qué significa cada acción ────────────────────────────────────────────────

type AccionMeta = {
  label: (log: LogAccion) => string
  icon: React.ElementType
  color: string // fondo + texto del ícono
}

const texto = (log: LogAccion, campo: string) => {
  const v = log.detalle?.[campo]
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}
/** Frase con el paciente si viene en el detalle: "Agendó una cita para Ana". */
const conPaciente = (con: string, sin: string) => (log: LogAccion) => {
  const paciente = texto(log, 'paciente_nombre')
  return paciente ? `${con} ${paciente}` : sin
}
/** Usa el resumen que guarda el servidor ("Rol «X» creado") o una frase fija. */
const resumenO = (fija: string) => (log: LogAccion) => texto(log, 'resumen') ?? fija

const AZUL = 'bg-blue-50 text-blue-600'
const VERDE = 'bg-emerald-50 text-emerald-600'
const ROJO = 'bg-red-50 text-red-600'
const VIOLETA = 'bg-violet-50 text-violet-600'
const AMBAR = 'bg-amber-50 text-amber-700'
const GRIS = 'bg-muted text-muted-foreground'

const ACCION_MAP: Record<string, AccionMeta> = {
  'auth.login': { label: () => 'Inició sesión', icon: LogIn, color: GRIS },
  'cita.crear': { label: conPaciente('Agendó una cita para', 'Agendó una cita'), icon: CalendarPlus, color: AZUL },
  'cita.reagendar': { label: conPaciente('Reagendó la cita de', 'Reagendó una cita'), icon: CalendarClock, color: AZUL },
  'cita.completar': { label: conPaciente('Marcó como completada la cita de', 'Marcó una cita como completada'), icon: CalendarCheck, color: VERDE },
  'cita.cancelar': {
    label: (log) => {
      const base = conPaciente('Canceló la cita de', 'Canceló una cita')(log)
      const motivo = texto(log, 'motivo')
      return motivo ? `${base} — ${motivo}` : base
    },
    icon: CalendarX,
    color: ROJO,
  },
  'historia.ver': { label: conPaciente('Consultó la historia clínica de', 'Consultó una historia clínica'), icon: FileText, color: VIOLETA },
  'nota.completar': { label: conPaciente('Completó una nota clínica de', 'Completó una nota clínica'), icon: PenLine, color: VIOLETA },
  'consentimiento.firmar': { label: conPaciente('Envió a firma el consentimiento de', 'Envió un consentimiento a firma'), icon: ClipboardSignature, color: AMBAR },
  'consentimiento.revocar': { label: conPaciente('Revocó el consentimiento de', 'Revocó un consentimiento'), icon: ClipboardSignature, color: ROJO },
  'consentimiento.firma_profesional': { label: conPaciente('Firmó como profesional el consentimiento de', 'Firmó un consentimiento como profesional'), icon: ClipboardSignature, color: VERDE },
  'cuota.modificar_plazo': { label: conPaciente('Modificó el plazo de una cuota de', 'Modificó el plazo de una cuota'), icon: CreditCard, color: AMBAR },
  'cuota.cobrar': {
    label: (log) => {
      const base = conPaciente('Registró un pago de', 'Registró un pago')(log)
      const valor = log.detalle?.valor as string | number | undefined
      return valor ? `${base} — $${valor}` : base
    },
    icon: DollarSign,
    color: VERDE,
  },
  'cobro.anular': { label: conPaciente('Anuló un cobro de', 'Anuló un cobro'), icon: Receipt, color: ROJO },
  'cobro.reversar_pago': { label: conPaciente('Reversó un pago de', 'Reversó un pago'), icon: Receipt, color: ROJO },
  'cotizacion.autorizacion_precio.solicitar': { label: conPaciente('Pidió autorizar un precio para', 'Pidió autorizar un precio'), icon: BadgeCheck, color: AMBAR },
  'cotizacion.autorizacion_precio.autorizar': { label: conPaciente('Autorizó un precio para', 'Autorizó un precio'), icon: BadgeCheck, color: VERDE },
  'cotizacion.precio_autorizado_directo': { label: conPaciente('Aplicó un precio especial para', 'Aplicó un precio especial'), icon: BadgeCheck, color: VERDE },
  'cotizacion.renovar': { label: conPaciente('Renovó la cotización de', 'Renovó una cotización'), icon: FileText, color: AZUL },
  'cotizacion.entregar_obsequio': { label: conPaciente('Entregó un obsequio a', 'Entregó un obsequio'), icon: Gift, color: VERDE },
  'cotizacion.revertir_entrega_obsequio': { label: conPaciente('Revirtió la entrega de un obsequio a', 'Revirtió la entrega de un obsequio'), icon: Gift, color: ROJO },
  'cartera.acuerdo_pago.crear': { label: conPaciente('Creó un acuerdo de pago con', 'Creó un acuerdo de pago'), icon: Handshake, color: AZUL },
  'cartera.acuerdo_pago.aplicar': { label: conPaciente('Aplicó el acuerdo de pago de', 'Aplicó un acuerdo de pago'), icon: Handshake, color: VERDE },
  'cartera.acuerdo_pago.anular': { label: conPaciente('Anuló el acuerdo de pago de', 'Anuló un acuerdo de pago'), icon: Handshake, color: ROJO },
  'cartera.acuerdo_pago.requiere_revision': { label: conPaciente('Marcó para revisión el acuerdo de pago de', 'Marcó un acuerdo de pago para revisión'), icon: Handshake, color: AMBAR },
  'seguimiento.crear_interesado': { label: () => 'Registró un interesado', icon: Target, color: AZUL },
  'seguimiento.vincular_paciente': { label: conPaciente('Vinculó un interesado con', 'Vinculó un interesado con un paciente'), icon: Target, color: VERDE },
  'seguimiento.perder': { label: () => 'Marcó un interesado como perdido', icon: Target, color: ROJO },
  'seguimiento.no_es_cliente': { label: () => 'Marcó un interesado como no cliente', icon: Target, color: GRIS },
  'rol.crear': { label: resumenO('Creó un rol'), icon: Shield, color: VIOLETA },
  'rol.permisos': { label: resumenO('Cambió los permisos de un rol'), icon: Shield, color: VIOLETA },
  'usuario.crear': { label: resumenO('Creó un usuario'), icon: UserCog, color: AZUL },
  'usuario.editar': { label: resumenO('Editó un usuario'), icon: UserCog, color: AZUL },
  'usuario.activar': { label: resumenO('Activó un usuario'), icon: UserCog, color: VERDE },
  'usuario.desactivar': { label: resumenO('Desactivó un usuario'), icon: UserCog, color: ROJO },
  'usuario.eliminar': { label: resumenO('Eliminó un usuario'), icon: UserCog, color: ROJO },
  'usuario.cambiar_password': { label: resumenO('Cambió la contraseña de un usuario'), icon: UserCog, color: AMBAR },
  'usuario.reenviar_invitacion': { label: resumenO('Reenvió una invitación'), icon: UserCog, color: AZUL },
  'usuario.suplantar': { label: resumenO('Ingresó como otro usuario'), icon: UserCog, color: AMBAR },
  'usuario.suplantar_fin': { label: resumenO('Volvió a su propia cuenta'), icon: UserCog, color: GRIS },
  'usuario.firma_capturada': { label: resumenO('Registró su firma'), icon: PenLine, color: VERDE },
  'console_usuario.crear': { label: resumenO('Creó un usuario de consola'), icon: UserCog, color: AZUL },
  'tenant.crear': { label: resumenO('Creó una clínica'), icon: Building2, color: AZUL },
  'tenant.editar': { label: resumenO('Editó los datos de una clínica'), icon: Building2, color: AZUL },
  'tenant.activar': { label: resumenO('Activó una clínica'), icon: Building2, color: VERDE },
  'tenant.desactivar': { label: resumenO('Desactivó una clínica'), icon: Building2, color: ROJO },
  'tenant.plan_cambiar': { label: resumenO('Cambió el plan de una clínica'), icon: Building2, color: AMBAR },
  'tenant.modulo': { label: resumenO('Cambió un módulo de la clínica'), icon: Building2, color: AMBAR },
}

/** Acción sin frase propia: el resumen del servidor o una frase por área. Nunca el código. */
const POR_AREA: [string, string, React.ElementType][] = [
  ['cita.', 'Hizo un cambio en una cita', CalendarPlus],
  ['historia.', 'Hizo un cambio en una historia clínica', FileText],
  ['nota.', 'Hizo un cambio en una nota clínica', PenLine],
  ['consentimiento.', 'Hizo un cambio en un consentimiento', ClipboardSignature],
  ['cuota.', 'Hizo un cambio en una cuota', CreditCard],
  ['cobro.', 'Hizo un cambio en un cobro', Receipt],
  ['cotizacion.', 'Hizo un cambio en una cotización', FileText],
  ['cartera.', 'Hizo un cambio en cartera', Handshake],
  ['seguimiento.', 'Hizo un cambio en seguimiento', Target],
  ['usuario.', 'Hizo un cambio en un usuario', UserCog],
  ['rol.', 'Hizo un cambio en un rol', Shield],
  ['tenant.', 'Hizo un cambio en la clínica', Building2],
]

function getAccionMeta(accion: string): AccionMeta {
  if (ACCION_MAP[accion]) return ACCION_MAP[accion]
  const area = POR_AREA.find(([prefijo]) => accion.startsWith(prefijo))
  return {
    label: resumenO(area?.[1] ?? 'Realizó una acción en el sistema'),
    icon: area?.[2] ?? Activity,
    color: GRIS,
  }
}

const NOMBRE_OBJETO: Record<string, string> = {
  User: 'Usuario', Rol: 'Rol', Cita: 'Cita', Cotizacion: 'Cotización', Cobro: 'Cobro',
  NotaClinica: 'Nota clínica', HistoriaClinica: 'Historia clínica', Clinica: 'Clínica',
  Cuota: 'Cuota', Paciente: 'Paciente', AcuerdoPago: 'Acuerdo de pago',
}

// Tipos que se pueden elegir. "sin_ingresos" y "todo" no son acciones del servidor.
const TIPOS = [
  { value: 'sin_ingresos', label: 'Todo menos inicios de sesión' },
  { value: 'todo', label: 'Toda la actividad' },
  { value: LOGIN, label: 'Inicios de sesión' },
  { value: 'cita.crear', label: 'Citas agendadas' },
  { value: 'cita.cancelar', label: 'Citas canceladas' },
  { value: 'cita.completar', label: 'Citas completadas' },
  { value: 'historia.ver', label: 'Historias clínicas consultadas' },
  { value: 'cuota.cobrar', label: 'Pagos registrados' },
  { value: 'cobro.anular', label: 'Cobros anulados' },
  { value: 'cotizacion.autorizacion_precio.solicitar', label: 'Precios por autorizar' },
  { value: 'cotizacion.autorizacion_precio.autorizar', label: 'Precios autorizados' },
  { value: 'rol.permisos', label: 'Cambios de permisos' },
  { value: 'usuario.suplantar', label: 'Ingresos como otro usuario' },
]

// ─── Fechas ──────────────────────────────────────────────────────────────────

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('es-CO', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

function formatDateTimeRelative(iso: string): { primary: string; secondary: string } {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffH = Math.floor(diffMin / 60)
  const diffD = Math.floor(diffH / 24)

  let primary: string
  if (diffMin < 1) primary = 'Ahora mismo'
  else if (diffMin < 60) primary = `Hace ${diffMin} min`
  else if (diffH < 24) primary = `Hace ${diffH} h`
  else if (diffD === 1) primary = 'Ayer'
  else if (diffD < 7) primary = `Hace ${diffD} días`
  else primary = d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })

  const secondary = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
  return { primary, secondary }
}

// ─── Detalle ─────────────────────────────────────────────────────────────────

function DetalleDialog({ log, onClose }: { log: LogAccion; onClose: () => void }) {
  const meta = getAccionMeta(log.accion)
  const Icon = meta.icon
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <span className={cn('h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0', meta.color)}>
              <Icon className="h-3.5 w-3.5" />
            </span>
            {meta.label(log)}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
            <div>
              <span className="text-muted-foreground block">Usuario</span>
              <p className="font-medium">{log.usuario_nombre}</p>
            </div>
            <div>
              <span className="text-muted-foreground block">Fecha y hora</span>
              <p className="font-medium">{formatDateTime(log.created_at)}</p>
            </div>
            <div>
              <span className="text-muted-foreground block">Sobre</span>
              <p className="font-medium">{NOMBRE_OBJETO[log.objeto_tipo] ?? log.objeto_tipo}</p>
            </div>
            {log.ip && (
              <div>
                <span className="text-muted-foreground block">Dirección IP</span>
                <p className="font-medium font-mono">{log.ip}</p>
              </div>
            )}
            <div className="col-span-2">
              <span className="text-muted-foreground block">Referencia</span>
              <p className="font-mono text-xs text-muted-foreground break-all">{log.objeto_id}</p>
            </div>
          </div>
          {Object.keys(log.detalle ?? {}).length > 0 && (
            <div>
              <p className="text-[13px] text-muted-foreground mb-1.5">Información adicional</p>
              <pre className="rounded-md bg-muted/50 border p-3 text-xs font-mono overflow-auto max-h-56 whitespace-pre-wrap break-all">
                {JSON.stringify(log.detalle, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Paginación ──────────────────────────────────────────────────────────────

function Paginacion({
  page, total, pageSize, onPage, className,
}: { page: number; total: number; pageSize: number; onPage: (p: number) => void; className?: string }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = Math.min((page - 1) * pageSize + 1, total)
  const to   = Math.min(page * pageSize, total)
  return (
    <div className={cn('flex items-center gap-2 text-[13px] text-muted-foreground', className)}>
      <span className="tabular-nums">{total === 0 ? 'Sin resultados' : `${from}–${to} de ${total}`}</span>
      <div className="flex items-center">
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Página anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Página siguiente">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

// ─── Página ──────────────────────────────────────────────────────────────────

export default function LogAccionesPage() {
  const { user } = useAuthStore()
  const canVer = hasPermission(user, PERM.CORE_VER_LOG_ACCIONES)

  const [page, setPage]               = useState(1)
  const [filterUsuario, setFilterUsuario] = useState('')
  const [filterDesde, setFilterDesde]     = useState('')
  const [filterHasta, setFilterHasta]     = useState('')
  const [tipo, setTipo]               = useState('sin_ingresos')
  const [detalle, setDetalle]         = useState<LogAccion | null>(null)
  // El nombre se busca al dejar de escribir, no con cada letra.
  const usuarioBuscado = useDebounce(filterUsuario.trim(), 350)
  const sinIngresos = tipo === 'sin_ingresos'

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['log-acciones', sinIngresos ? 'sin_ingresos' : page, tipo, usuarioBuscado, filterDesde, filterHasta],
    queryFn: () => coreApi.logAcciones.list({
      page: sinIngresos ? 1 : page,
      page_size: sinIngresos ? VENTANA_SIN_INGRESOS : PAGE_SIZE,
      ...(!sinIngresos && tipo !== 'todo' && { accion: tipo }),
      ...(usuarioBuscado && { usuario: usuarioBuscado }),
      ...(filterDesde    && { fecha_desde: filterDesde }),
      ...(filterHasta    && { fecha_hasta: filterHasta }),
    }),
    enabled: canVer,
  })

  // Sin ingresos: se filtra y pagina aquí sobre la ventana de las últimas acciones.
  const sinLogin = sinIngresos ? (data?.results ?? []).filter((l) => l.accion !== LOGIN) : []
  const logs  = sinIngresos ? sinLogin.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : (data?.results ?? [])
  const total = sinIngresos ? sinLogin.length : (data?.count ?? 0)
  const ventanaRecortada = sinIngresos && (data?.count ?? 0) > VENTANA_SIN_INGRESOS

  function resetPage() { setPage(1) }
  const hasFilters = !!(filterUsuario || filterDesde || filterHasta || !sinIngresos)
  const limpiar = () => { setFilterUsuario(''); setFilterDesde(''); setFilterHasta(''); setTipo('sin_ingresos'); resetPage() }

  if (!canVer) {
    return (
      <div className="space-y-6">
        <PageHeader helpSlug="log-de-acciones-y-auditoria" title="Registro de actividad" description="Historial de acciones del sistema." />
        <SeccionAjustes titulo="Actividad">
          <VacioAjustes titulo="No tienes permiso para ver el registro de actividad" />
        </SeccionAjustes>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        helpSlug="log-de-acciones-y-auditoria"
        title="Registro de actividad"
        description="Quién hizo qué y cuándo en el sistema."
      />

      <div className="space-y-7">
        <SeccionAjustes
          titulo="Actividad"
          descripcion="Toca una acción para ver su detalle."
          accion={!isLoading && !isError && total > 0
            ? <Paginacion page={page} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
            : undefined}
        >
          {/* Filtros */}
          <div className="grid grid-cols-2 gap-2 bg-muted/30 px-4 py-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_auto]">
            <div className="relative col-span-2 lg:col-span-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="h-9 bg-white pl-8 text-[13px]"
                placeholder="Buscar por usuario"
                aria-label="Usuario"
                value={filterUsuario}
                onChange={(e) => { setFilterUsuario(e.target.value); resetPage() }}
              />
            </div>
            <div className="col-span-2 lg:col-span-1">
              <SelectAjuste
                valor={tipo}
                opciones={TIPOS}
                onCambiar={(v) => { setTipo(v); resetPage() }}
                etiqueta="Tipo de actividad"
                ancho="w-full bg-white text-[13px]"
              />
            </div>
            <Input type="date" aria-label="Desde" title="Desde" className="h-9 bg-white text-[13px]" value={filterDesde}
              onChange={(e) => { setFilterDesde(e.target.value); resetPage() }} />
            <Input type="date" aria-label="Hasta" title="Hasta" className="h-9 bg-white text-[13px]" value={filterHasta}
              onChange={(e) => { setFilterHasta(e.target.value); resetPage() }} />
            {hasFilters && (
              <Button size="sm" variant="ghost" className="col-span-2 h-9 justify-self-end text-[13px] text-muted-foreground lg:col-span-1"
                onClick={limpiar}>
                Limpiar
              </Button>
            )}
          </div>

          {isLoading && (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">Cargando actividad…</div>
          )}
          {!isLoading && isError && (
            <ErrorState message={mensajeDeError(error, 'No se pudo cargar el registro de actividad.')} onRetry={() => refetch()} />
          )}
          {!isLoading && !isError && logs.length === 0 && (
            <VacioAjustes
              titulo="No hay actividad con estos filtros"
              descripcion={sinIngresos ? 'Los inicios de sesión están ocultos. Elige «Toda la actividad» para verlos.' : undefined}
            />
          )}
          {!isLoading && !isError && logs.length > 0 && (
            <ul className="divide-y divide-border/70">
              {logs.map((log) => {
                const meta = getAccionMeta(log.accion)
                const Icon = meta.icon
                const { primary, secondary } = formatDateTimeRelative(log.created_at)
                return (
                  <li key={log.id}>
                    <button
                      type="button"
                      onClick={() => setDetalle(log)}
                      className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                    >
                      <span className={cn('h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0', meta.color)}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      {/* En pantallas anchas, una sola línea: qué · quién · cuándo. */}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm leading-snug text-foreground" title={meta.label(log)}>{meta.label(log)}</span>
                        <span className="mt-0.5 block truncate text-[13px] text-muted-foreground md:hidden">
                          <span className="font-medium text-foreground/80">{log.usuario_nombre}</span>
                          {' · '}{primary} {secondary}
                        </span>
                      </span>
                      <span className="hidden w-44 shrink-0 truncate text-[13px] font-medium text-foreground/80 md:block">
                        {log.usuario_nombre}
                      </span>
                      <span className="hidden w-36 shrink-0 text-right text-[13px] text-muted-foreground md:block" title={formatDateTime(log.created_at)}>
                        {primary} <span className="tabular-nums">{secondary}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {!isLoading && !isError && total > PAGE_SIZE && (
            <div className="flex justify-end px-4 py-1.5">
              <Paginacion page={page} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
            </div>
          )}
          {!isLoading && !isError && ventanaRecortada && (
            <NotaAjuste>
              Para ocultar los inicios de sesión se revisan las últimas {VENTANA_SIN_INGRESOS} acciones registradas. Para ver anteriores, filtra por fechas.
            </NotaAjuste>
          )}
        </SeccionAjustes>
      </div>

      {detalle && <DetalleDialog log={detalle} onClose={() => setDetalle(null)} />}
    </div>
  )
}
