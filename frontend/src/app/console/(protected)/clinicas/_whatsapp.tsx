'use client'

// Pestaña "WhatsApp" del detalle de una clínica en la consola: números propios
// conectados y sus plantillas en Meta. Crear plantillas, actualizar su estado y
// revisar la salud del número son, por ahora, acciones manuales del superadmin.
// Prefijo `_` para que Next.js no lo trate como ruta.

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, AlertTriangle, FileText, HeartPulse, Link2, Loader2, MessageCircle, RefreshCw, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { whatsappPropioAdminApi } from '@/lib/api/whatsappPropio'
import { cn } from '@/lib/utils'
import type { AdminTenant } from '@/types/admin'
import type {
  EstadoNumeroWhatsapp, EstadoPlantillaWhatsapp, NumeroWhatsappAdmin, ResultadoCrearPlantilla,
  WhatsappPropioDetalleAdmin,
} from '@/types/whatsappPropio'
import { serverErrorMessage } from './_shared'

const NUMERO_BADGE: Record<EstadoNumeroWhatsapp, { label: string; variant: 'success' | 'warning' | 'muted' | 'destructive' }> = {
  conectado:             { label: 'Conectado, sin plantillas', variant: 'muted' },
  plantillas_pendientes: { label: 'Plantillas pendientes',     variant: 'warning' },
  activo:                { label: 'Activo',                    variant: 'success' },
  error:                 { label: 'Error',                     variant: 'destructive' },
}

const PLANTILLA_BADGE: Record<EstadoPlantillaWhatsapp | 'SIN_CREAR', { label: string; className: string }> = {
  SIN_CREAR: { label: 'Sin crear',        className: 'bg-gray-100 text-gray-600' },
  PENDING:   { label: 'Pendiente',        className: 'bg-gray-100 text-gray-700' },
  APPROVED:  { label: 'Aprobada',         className: 'bg-green-100 text-green-800' },
  REJECTED:  { label: 'Rechazada',        className: 'bg-red-100 text-red-700' },
  PAUSED:    { label: 'Pausada',          className: 'bg-amber-100 text-amber-800' },
  DISABLED:  { label: 'Deshabilitada',    className: 'bg-red-100 text-red-700' },
  ERROR:     { label: 'No se pudo crear', className: 'bg-red-100 text-red-700' },
}

const RESULTADO_TEXTO: Record<ResultadoCrearPlantilla['resultado'], string> = {
  creada: 'creada',
  ya_existia: 'ya existía en Meta',
  ya_creada: 'ya estaba creada',
  error: 'rechazada',
  reintentar: 'falla temporal, reintenta',
  requiere_version: 'Meta la rechazó: hace falta una versión nueva en el catálogo',
}

const TIPO_LABEL: Record<string, string> = {
  recordatorio_cita: 'Recordatorio de cita',
  firma_documento:   'Firma de documento',
  envio_cotizacion:  'Envío de cotización',
  envio_formula:     'Orden médica',
}

type Accion = 'crear-plantillas' | 'actualizar-plantillas' | 'revisar-salud'

const AYUDA: Record<Accion, string> = {
  'crear-plantillas':
    'Envía a Meta las plantillas del catálogo que faltan en este número. Las que ya están pendientes o aprobadas no se reenvían.',
  'actualizar-plantillas':
    'Trae el estado de las plantillas (pendiente, aprobada, rechazada) desde Lyvio y pide una sincronización nueva con Meta. '
    + 'Si Meta acaba de aprobar alguna y no aparece, vuelve a pulsarlo en un minuto.',
  'revisar-salud':
    'Revisa la conexión del número en Meta (conectado, en la app de WhatsApp Business, límite diario). '
    + 'No actualiza las plantillas.',
}

// Solo se pueden crear las que no existen en Meta o fallaron al crearse; las
// rechazadas/pausadas/deshabilitadas necesitan una versión nueva en el catálogo.
const ESTADOS_CREABLES = new Set<EstadoPlantillaWhatsapp | undefined>([undefined, 'ERROR'])

function NumeroCard({ numero, catalogo, clinicaId, sedes }: {
  numero: NumeroWhatsappAdmin
  catalogo: WhatsappPropioDetalleAdmin['catalogo']
  clinicaId: string
  sedes: string[]  // sedes que envían desde este número
}) {
  const qc = useQueryClient()
  const [resultados, setResultados] = useState<ResultadoCrearPlantilla[] | null>(null)
  const mutation = useMutation({
    mutationFn: (accion: Accion) => whatsappPropioAdminApi.accion(numero.id, accion),
    onSuccess: (data) => {
      qc.setQueryData(['admin-whatsapp-propio', clinicaId], data.detalle)
      qc.invalidateQueries({ queryKey: ['admin-tenant-historial', clinicaId] })
      setResultados(data.resultados ?? null)
    },
  })
  // Baja en dos pasos: sin forzar; si Meta lo sigue viendo conectado, el
  // diálogo pasa a pedir confirmación para forzar (borrar el inbox lo
  // desconecta de la API sin pasar por la app de la clínica).
  const [confirmandoBaja, setConfirmandoBaja] = useState(false)
  const baja = useMutation({
    mutationFn: (forzar: boolean) => whatsappPropioAdminApi.darDeBaja(numero.id, forzar),
    onSuccess: (data) => {
      setConfirmandoBaja(false)
      qc.setQueryData(['admin-whatsapp-propio', clinicaId], data.detalle)
      qc.invalidateQueries({ queryKey: ['admin-tenant-historial', clinicaId] })
    },
  })
  const sigueConectado =
    (baja.error as { response?: { data?: { code?: string } } } | null)?.response?.data?.code === 'NUMERO_SIGUE_CONECTADO'
  const enCurso = mutation.isPending ? mutation.variables : null
  const badge = NUMERO_BADGE[numero.estado]
  const porNombre = new Map(numero.plantillas.map((p) => [p.nombre, p]))
  const hayPorCrear = catalogo.some((def) => ESTADOS_CREABLES.has(porNombre.get(def.nombre)?.estado))

  const boton = (
    accion: Accion, label: string, Icon: React.ElementType,
    { primary = false, bloqueado = '' }: { primary?: boolean; bloqueado?: string } = {},
  ) => (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* El span recibe el hover aunque el botón esté deshabilitado (pointer-events-none). */}
        <span tabIndex={bloqueado ? 0 : -1}>
          <Button
            type="button"
            size="sm"
            variant={primary ? 'default' : 'outline'}
            disabled={mutation.isPending || !!bloqueado}
            onClick={() => { setResultados(null); mutation.mutate(accion) }}
          >
            {enCurso === accion ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Icon className="mr-1.5 h-3.5 w-3.5" />}
            {label}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{bloqueado || AYUDA[accion]}</TooltipContent>
    </Tooltip>
  )

  return (
    <div className="space-y-3 rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            {numero.numero_visible || 'sin número visible'}
            {numero.es_por_defecto && <span className="rounded-full bg-rose-50 px-2 py-px text-[11px] font-medium text-rose-600">Por defecto</span>}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {sedes.length ? `Sedes: ${sedes.join(', ')}` : 'Ninguna sede lo usa'}
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
            inbox {numero.lyvio_inbox_id} · waba {numero.waba_id}
            {numero.limite_mensajes && ` · límite ${numero.limite_mensajes}`}
            {numero.ultimo_chequeo_en && ` · revisado ${new Date(numero.ultimo_chequeo_en).toLocaleString('es-CO', {
              day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
            })}`}
          </p>
        </div>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>

      {numero.ultimo_error && (
        <p className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {numero.ultimo_error}
        </p>
      )}

      <div className="divide-y rounded-lg border text-sm">
        {catalogo.map((def) => {
          const p = porNombre.get(def.nombre)
          const estado = PLANTILLA_BADGE[p?.estado ?? 'SIN_CREAR']
          const marketing = p?.categoria === 'MARKETING' && def.categoria !== 'MARKETING'
          return (
            <div key={def.nombre} className="px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1">
                  {TIPO_LABEL[def.tipo] ?? def.tipo}{' '}
                  <span className="font-mono text-[11px] text-muted-foreground">{def.nombre}</span>
                </span>
                {marketing && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-px text-[11px] font-medium text-amber-700"
                    title="Meta la clasificó como marketing: cambia el precio que paga la clínica.">
                    <AlertTriangle className="h-3 w-3" /> Meta la pasó a MARKETING
                  </span>
                )}
                <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', estado.className)}>{estado.label}</span>
              </div>
              {p?.ultimo_error && <p className="mt-1 text-xs text-red-600">{p.ultimo_error}</p>}
            </div>
          )
        })}
      </div>

      {resultados && (
        <ul className="space-y-0.5 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">
          {resultados.map((r) => (
            <li key={r.nombre}>
              <span className="font-mono">{r.nombre}</span>: {RESULTADO_TEXTO[r.resultado]}
              {r.error && ` — ${r.error}`}
            </li>
          ))}
        </ul>
      )}
      {mutation.isError && (
        <p className="text-xs text-red-600">{serverErrorMessage(mutation.error) ?? 'No se pudo completar la acción.'}</p>
      )}

      <TooltipProvider delayDuration={200}>
        <div className="flex flex-wrap justify-end gap-2">
          {boton('crear-plantillas', 'Crear plantillas', FileText, {
            bloqueado: hayPorCrear ? '' : 'Todas las plantillas ya están creadas en Meta. Usa "Actualizar estado" para ver si las aprobaron.',
          })}
          {boton('actualizar-plantillas', 'Actualizar estado', RefreshCw, { primary: true })}
          {boton('revisar-salud', 'Revisar salud', HeartPulse)}
          <Button
            type="button" size="sm" variant="outline"
            className="text-red-600 hover:text-red-600"
            disabled={mutation.isPending || baja.isPending}
            onClick={() => { baja.reset(); setConfirmandoBaja(true) }}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Dar de baja
          </Button>
        </div>
      </TooltipProvider>

      <ConfirmDialog
        open={confirmandoBaja}
        onOpenChange={(v) => { if (!v && !baja.isPending) setConfirmandoBaja(false) }}
        title={sigueConectado ? 'Meta lo sigue viendo conectado' : `Dar de baja ${numero.numero_visible || 'este número'}`}
        description={sigueConectado ? (
          <>
            La clínica no lo ha desconectado desde WhatsApp Business (Configuración → Cuenta → Plataforma
            empresarial → Desconectar). Si fuerzas la baja, se borra el inbox en Lyvio y Meta lo saca de la API
            sin pasar por la app; no sabemos con certeza cómo queda la app del teléfono. Fuerza solo si la clínica
            ya no tiene acceso a ese teléfono o lo pidió expresamente.
          </>
        ) : (
          <>
            Se borra el inbox {numero.lyvio_inbox_id} en Lyvio y el número sale de CliniQ con sus plantillas. Las
            sedes que lo usaban pasan al número por defecto. Antes se verifica en Meta que la clínica ya lo haya
            desconectado desde su app.
            {baja.isError && (
              <span className="mt-2 block text-red-600">{serverErrorMessage(baja.error) ?? 'No se pudo dar de baja.'}</span>
            )}
          </>
        )}
        confirmLabel={sigueConectado ? 'Forzar baja' : 'Dar de baja'}
        variant="destructive"
        loading={baja.isPending}
        onConfirm={() => baja.mutate(sigueConectado)}
      />
    </div>
  )
}

/** Recupera una conexión que terminó en Lyvio pero no quedó registrada en CliniQ
 *  (p. ej. la clínica vio "tardó más de lo normal"): el inbox existe en la
 *  cuenta de CliniQ en Lyvio y reintentar la conexión fallaría con "ya existe". */
function RegistrarInbox({ clinicaId }: { clinicaId: string }) {
  const qc = useQueryClient()
  const [inboxId, setInboxId] = useState('')
  const mutation = useMutation({
    mutationFn: () => whatsappPropioAdminApi.registrarInbox(clinicaId, inboxId.trim()),
    onSuccess: (data) => {
      qc.setQueryData(['admin-whatsapp-propio', clinicaId], data.detalle)
      qc.invalidateQueries({ queryKey: ['admin-tenant-historial', clinicaId] })
      setInboxId('')
    },
  })

  return (
    <div className="space-y-2 rounded-xl border bg-white p-4">
      <p className="text-sm font-semibold">Registrar un inbox existente</p>
      <p className="text-xs text-muted-foreground">
        Si la clínica conectó su número pero vio un error, el inbox puede haber quedado creado en la cuenta de CliniQ
        en Lyvio sin registrarse aquí. Búscalo en Lyvio por el número de teléfono y registra su ID.
      </p>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => { e.preventDefault(); mutation.mutate() }}
      >
        <Input
          value={inboxId}
          onChange={(e) => setInboxId(e.target.value)}
          placeholder="ID del inbox"
          inputMode="numeric"
          className="h-8 w-40"
        />
        <Button type="submit" size="sm" variant="outline" disabled={!inboxId.trim() || mutation.isPending}>
          {mutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Link2 className="mr-1.5 h-3.5 w-3.5" />}
          Registrar
        </Button>
      </form>
      {mutation.isError && (
        <p className="text-xs text-red-600">{serverErrorMessage(mutation.error) ?? 'No se pudo registrar el inbox.'}</p>
      )}
    </div>
  )
}

export function WhatsappPropioConsola({ tenant }: { tenant: AdminTenant }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-whatsapp-propio', tenant.id],
    queryFn: () => whatsappPropioAdminApi.detalle(tenant.id),
  })

  if (isLoading) return <div className="h-40 animate-pulse rounded-xl bg-gray-100" />
  if (isError || !data) return <p className="text-sm text-muted-foreground">No se pudo cargar el estado de WhatsApp.</p>

  const activos = data.numeros.filter((n) => n.estado === 'activo').length
  // Sedes que envían desde cada número (sin asignación = número por defecto).
  const sedesDe = (numeroId: string) => data.sedes
    .filter((s) => (s.tipo === 'numero' ? s.numero_id === numeroId : s.tipo === 'por_defecto' && numeroId === data.numero_por_defecto_id))
    .map((s) => s.nombre)
  const conCliniq = data.sedes.filter((s) => s.tipo === 'cliniq').map((s) => s.nombre)

  return (
    <div className="max-w-4xl space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Add-on', valor: data.habilitado ? 'Activado' : 'Desactivado' },
          { label: 'Números conectados', valor: `${data.numeros.length} de ${data.numeros_incluidos}` },
          { label: 'Números activos', valor: `${activos} de ${data.numeros.length}` },
          { label: 'Pago en Meta', valor: data.pago_meta_configurado ? 'Confirmado' : 'Sin confirmar' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border bg-white p-3.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{s.label}</p>
            <p className="mt-1 text-sm font-semibold">{s.valor}</p>
          </div>
        ))}
      </div>

      {!data.habilitado && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          El add-on de número propio está apagado para esta clínica: sus números no se usan y todo sale por el número
          compartido. Actívalo en la pestaña General.
        </p>
      )}

      {data.numeros.length === 0 ? (
        <div className="rounded-xl border bg-white py-10 text-center">
          <MessageCircle className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            La clínica todavía no conectó ningún número. Lo hace desde Configuración → WhatsApp → Número de envío.
          </p>
        </div>
      ) : (
        data.numeros.map((n) => (
          <NumeroCard
            key={n.id}
            numero={n}
            catalogo={data.catalogo}
            clinicaId={tenant.id}
            sedes={sedesDe(n.id)}
          />
        ))
      )}

      {conCliniq.length > 0 && (
        <p className="text-xs text-muted-foreground">Sedes que eligieron el número de CliniQ: {conCliniq.join(', ')}.</p>
      )}

      {data.habilitado && data.numeros.length < data.numeros_incluidos && <RegistrarInbox clinicaId={tenant.id} />}

      <p className="text-xs text-muted-foreground">
        &quot;Actualizar estado&quot; muestra lo último que Lyvio sincronizó con Meta y pide una sincronización nueva:
        si Meta acaba de aprobar, vuelve a pulsarlo en un minuto. El número pasa a activo cuando las{' '}
        {data.catalogo.length} están aprobadas. No borres el inbox a mano en Lyvio: usa &quot;Dar de baja&quot;, que
        primero verifica que la clínica lo haya desconectado desde su app.
      </p>
    </div>
  )
}
