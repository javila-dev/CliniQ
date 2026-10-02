'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, ArrowRight, Building2, CalendarClock, Check, CheckCircle2, ChevronRight, CreditCard, ExternalLink, Info, Loader2,
  MapPin, MessageCircle, Plus, RefreshCw, ShieldCheck, Smartphone, Sparkles, Star, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { whatsappPropioApi } from '@/lib/api/whatsappPropio'
import { EmbeddedSignupCancelado, useEmbeddedSignup } from '@/hooks/useEmbeddedSignup'
import { cn } from '@/lib/utils'
import type {
  ConectarWhatsappRequest, ConfigurarWhatsappPropioRequest, NumeroWhatsapp, SedeWhatsapp, WhatsappPropioEstado,
} from '@/types/whatsappPropio'

// WhatsApp con número propio: la clínica conecta hasta N números (según su
// plan) con el Embedded Signup de Meta (Coexistence), uno queda como número por
// defecto y cada sede elige desde cuál envía. Sin el add-on, la pantalla dice
// qué número se usa hoy y lo promociona.
// Plan: docs/plan-whatsapp-numero-propio.md.

const QUERY_KEY = ['whatsapp-propio']
const PAGOS_META_URL = 'https://business.facebook.com/billing_hub/payment_settings'
// Centro de seguridad del portfolio: ahí se inicia la verificación del negocio.
const VERIFICAR_NEGOCIO_URL = 'https://business.facebook.com/settings/security'
// Límite de Meta para negocios sin verificar (pacientes distintos al día).
const LIMITE_SIN_VERIFICAR = 250
// Tarifa de Meta para mensajes de utilidad en Colombia (vigente desde el 1-oct-2026) y
// tasa de cambio redonda: solo para mostrar un orden de magnitud.
const PRECIO_UTILITY_USD = 0.0008
const COP_POR_USD = 3150

/** Costo aproximado en una línea: "100 mensajes ≈ $250 · 500 ≈ $1.260 · 1.000 ≈ $2.520 COP". */
function CostoAproximado() {
  const cop = (cantidad: number) => Math.round((cantidad * PRECIO_UTILITY_USD * COP_POR_USD) / 10) * 10
  return (
    <p className="mt-1 text-[12.5px] tabular-nums text-muted-foreground">
      Aprox.: 100 mensajes ≈ <span className="font-medium text-foreground">${cop(100).toLocaleString('es-CO')}</span>
      {' · '}500 ≈ <span className="font-medium text-foreground">${cop(500).toLocaleString('es-CO')}</span>
      {' · '}1.000 ≈ <span className="font-medium text-foreground">${cop(1000).toLocaleString('es-CO')}</span> COP
    </p>
  )
}

function mensajeError(err: unknown): string {
  const data = (err as { response?: { data?: { error?: string } } })?.response?.data
  if (data?.error) return data.error
  if (err instanceof Error && err.message) return err.message
  return 'No pudimos completar la acción. Intenta de nuevo.'
}

function etiquetaNumero(n: NumeroWhatsapp) {
  return n.numero_visible || 'Número sin identificar'
}

/** Número propio desde el que sale hoy una sede, o null si sale por el de CliniQ. */
function numeroEfectivo(sede: SedeWhatsapp | null, estado: WhatsappPropioEstado): NumeroWhatsapp | null {
  if (!estado.habilitado) return null
  const activo = (id: string | null) => estado.numeros.find((n) => n.id === id && n.estado === 'activo') ?? null
  if (sede?.tipo === 'cliniq') return null
  if (sede?.tipo === 'numero') {
    const propio = activo(sede.numero_id)
    if (propio) return propio
  }
  return activo(estado.numero_por_defecto_id)
}

function EstadoBadge({ numero }: { numero: NumeroWhatsapp }) {
  const conf = numero.bloqueo === 'limite' ? { texto: 'En pausa hoy', clase: 'bg-amber-50 text-amber-700' } : {
    activo: { texto: 'Activo', clase: 'bg-emerald-50 text-emerald-700' },
    conectado: { texto: 'En aprobación', clase: 'bg-amber-50 text-amber-700' },
    plantillas_pendientes: { texto: 'En aprobación', clase: 'bg-amber-50 text-amber-700' },
    error: { texto: 'Requiere acción', clase: 'border border-red-200 text-red-700' },
  }[numero.estado]
  return (
    <span className={cn('shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11.5px] font-medium', conf.clase)}>
      {conf.texto}
    </span>
  )
}

function useConfigurar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: ConfigurarWhatsappPropioRequest) => whatsappPropioApi.configurar(data),
    onSuccess: (data) => qc.setQueryData(QUERY_KEY, data),
  })
}

// ─── Número en uso ───────────────────────────────────────────

/** Desde qué número reciben hoy los pacientes, en una frase. */
function NumeroEnUso({ estado }: { estado: WhatsappPropioEstado }) {
  const sedes = estado.sedes.length > 0 ? estado.sedes : [null]
  const conPropio = sedes.map((s) => numeroEfectivo(s, estado)).filter(Boolean) as NumeroWhatsapp[]
  const distintos = new Set(conPropio.map((n) => n.id))
  const propio = conPropio.length > 0
  const pendientes = estado.habilitado && !propio && estado.numeros.length > 0

  let titulo: string
  let detalle: string
  if (!estado.whatsapp_habilitado) {
    titulo = 'Tu plan no incluye envíos por WhatsApp'
    detalle = 'Tus pacientes no reciben recordatorios, cotizaciones ni documentos por WhatsApp.'
  } else if (propio && conPropio.length === sedes.length && distintos.size === 1) {
    titulo = `Desde el número de tu clínica (${etiquetaNumero(conPropio[0])})`
    detalle = 'Tus pacientes ven el nombre de tu clínica y sus respuestas te llegan a WhatsApp Business.'
  } else if (propio && conPropio.length === sedes.length) {
    titulo = 'Desde los números de tu clínica'
    detalle = 'Cada sede envía desde el número que le asignaste y las respuestas te llegan a WhatsApp Business.'
  } else if (propio) {
    titulo = `Desde tus números en ${conPropio.length} de ${sedes.length} sedes`
    detalle = 'Las demás sedes envían desde el número de CliniQ.'
  } else {
    titulo = `Desde el número de CliniQ${estado.numero_cliniq ? ` (${estado.numero_cliniq})` : ''}`
    detalle = pendientes
      ? 'Tu número ya está conectado: mientras Meta aprueba tus mensajes, se siguen enviando desde el número de CliniQ.'
      : estado.numeros.length > 0 && !estado.habilitado
        ? 'Tus números siguen conectados, pero el add-on de número propio está inactivo.'
        : 'Tus pacientes ven el número de CliniQ y, si responden, su mensaje no llega a tu clínica.'
  }

  return (
    <section className={cn(
      'flex items-center gap-4 rounded-xl border p-4',
      propio ? 'border-emerald-200 bg-emerald-50/60' : 'bg-white',
    )}>
      <div className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
        propio ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground',
      )}>
        {propio ? <Building2 className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">Tus pacientes reciben los mensajes</p>
        <p className="text-[15px] font-semibold">{titulo}</p>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">{detalle}</p>
      </div>
      <span className={cn(
        'shrink-0 rounded-full px-2.5 py-0.5 text-[11.5px] font-medium',
        propio ? 'bg-emerald-100 text-emerald-800' : pendientes ? 'bg-amber-50 text-amber-700' : 'bg-muted text-muted-foreground',
      )}>
        {propio ? 'Número propio' : pendientes ? 'En aprobación' : 'Número de CliniQ'}
      </span>
    </section>
  )
}

// ─── Promoción ───────────────────────────────────────────────

const COMPARACION: { cliniq: string; propio: string }[] = [
  { cliniq: 'El paciente ve el número de CliniQ.', propio: 'El paciente ve el nombre y el número de tu clínica.' },
  { cliniq: 'Si responde, su mensaje no llega a tu clínica.', propio: 'Sus respuestas te llegan a WhatsApp Business en tu teléfono.' },
  { cliniq: 'Un solo número para todas tus sedes.', propio: 'Un número para toda la clínica o uno por sede.' },
  { cliniq: 'Consume el cupo de mensajes de tu plan.', propio: 'No consume cupo: Meta cobra los mensajes a tu cuenta.' },
]

function ComparacionNumeros() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-lg border bg-white p-3.5">
        <p className="mb-2 text-[13px] font-semibold text-muted-foreground">Número de CliniQ</p>
        <ul className="space-y-1.5">
          {COMPARACION.map((c) => (
            <li key={c.cliniq} className="flex gap-2 text-[13px] text-muted-foreground">
              <X className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {c.cliniq}
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-lg border border-primary/30 bg-white p-3.5">
        <p className="mb-2 text-[13px] font-semibold text-primary">Número de tu clínica</p>
        <ul className="space-y-1.5">
          {COMPARACION.map((c) => (
            <li key={c.propio} className="flex gap-2 text-[13px]">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /> {c.propio}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/** Sin el add-on: se promociona el número propio. */
function PromoNumeroPropio({ estado }: { estado: WhatsappPropioEstado }) {
  return (
    <section className="space-y-4 rounded-xl border bg-primary/[0.03] p-5">
      <div>
        <p className="flex items-center gap-2 text-base font-semibold">
          <Sparkles className="h-4 w-4 text-primary" /> Envía desde el número de tu clínica
        </p>
        <p className="mt-1 max-w-[62ch] text-[13px] leading-relaxed text-muted-foreground">
          Conecta el WhatsApp Business que ya usas y sigue respondiendo desde tu teléfono: CliniQ envía los
          recordatorios, cotizaciones y documentos desde tu número.
        </p>
      </div>
      <ComparacionNumeros />
      <div className="flex flex-wrap items-center gap-3">
        {estado.contacto_ventas_url ? (
          <Button asChild>
            <a href={estado.contacto_ventas_url} target="_blank" rel="noreferrer">
              <MessageCircle className="mr-1.5 h-4 w-4" /> Quiero mi número propio
            </a>
          </Button>
        ) : (
          <p className="text-[13px] font-medium">Escríbenos para activarlo en tu plan.</p>
        )}
        <p className="text-[12px] text-muted-foreground">
          {estado.whatsapp_habilitado
            ? 'Es un add-on de tu plan. Mientras tanto, todo se sigue enviando desde el número de CliniQ.'
            : 'Es un add-on que requiere tener activos los envíos por WhatsApp en tu plan.'}
        </p>
      </div>
    </section>
  )
}

/** Con el add-on pero sin números conectados. */
function CambiarANumeroPropio({ onConectar }: { onConectar: () => void }) {
  return (
    <section className="space-y-4 rounded-xl border bg-white p-5">
      <div>
        <p className="flex items-center gap-2 text-base font-semibold">
          <Sparkles className="h-4 w-4 text-primary" /> Cambia a tu número propio
        </p>
        <p className="mt-1 max-w-[62ch] text-[13px] leading-relaxed text-muted-foreground">
          Tu plan ya incluye el número propio. Conecta el WhatsApp Business de tu clínica en unos minutos: todas tus
          sedes lo usarán. Hasta que Meta apruebe tus mensajes, todo se sigue enviando desde el número de CliniQ.
        </p>
      </div>
      <ComparacionNumeros />
      <div className="flex justify-end">
        <Button onClick={onConectar}>
          Conectar mi número <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
      </div>
    </section>
  )
}

// ─── Conectar un número ──────────────────────────────────────

/** Conecta un número nuevo o, con `reconectar`, vuelve a conectar uno que Meta desconectó. */
function ConectarDialog({ estado, open, onClose, reconectar }: {
  estado: WhatsappPropioEstado
  open: boolean
  onClose: () => void
  reconectar?: NumeroWhatsapp | null
}) {
  const qc = useQueryClient()
  const { abrir, abriendo } = useEmbeddedSignup({ appId: estado.meta_app_id, configId: estado.meta_config_id })
  const [error, setError] = useState<string | null>(null)
  const [conectado, setConectado] = useState(false)
  // Se fija al abrir: al conectar, `estado` ya trae el número nuevo.
  const [primero, setPrimero] = useState(estado.numeros.length === 0)
  const pago = useConfigurar()
  const conectar = useMutation({
    mutationFn: (data: ConectarWhatsappRequest) =>
      reconectar ? whatsappPropioApi.reconectar(reconectar.id, data) : whatsappPropioApi.conectar(data),
    onSuccess: (data) => {
      qc.setQueryData(QUERY_KEY, data)
      setConectado(true)
    },
    onError: (err) => setError(mensajeError(err)),
  })

  const handleConectar = async () => {
    setError(null)
    setPrimero(estado.numeros.length === 0)
    try {
      const r = await abrir()
      conectar.mutate({
        evento: r.evento, code: r.code, waba_id: r.waba_id,
        phone_number_id: r.phone_number_id, business_id: r.business_id,
      })
    } catch (err) {
      setError(err instanceof EmbeddedSignupCancelado ? err.message : mensajeError(err))
    }
  }

  const cerrar = () => {
    if (abriendo || conectar.isPending) return
    setError(null)
    setConectado(false)
    onClose()
  }
  const ocupado = abriendo || conectar.isPending

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) cerrar() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {conectado ? (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
              <p className="text-base font-semibold">{reconectar ? 'Número reconectado' : 'Número conectado'}</p>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {reconectar
                ? 'Los mensajes vuelven a salir desde tu número.'
                : 'Meta está revisando los mensajes de CliniQ (de minutos a un día). Mientras tanto, todo se envía como hasta ahora.'}
              {!reconectar && (primero
                ? ' Todas tus sedes usarán este número.'
                : ' Asígnalo a tus sedes en la sección Asignación.')}
            </p>
            <p className="text-[13px] text-muted-foreground">
              Recuerda abrir WhatsApp Business en tu teléfono al menos una vez cada 14 días.
            </p>
            <div className="flex justify-end"><Button onClick={cerrar}>Entendido</Button></div>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {reconectar
                  ? `Reconecta ${etiquetaNumero(reconectar)}`
                  : estado.numeros.length === 0 ? 'Conecta el número de tu clínica' : 'Conecta otro número'}
              </DialogTitle>
              <DialogDescription className="leading-relaxed">
                Se abrirá una ventana de Meta: inicia sesión con Facebook, elige{' '}
                {reconectar ? 'el mismo número' : 'tu WhatsApp Business'} y escanea el código QR con tu teléfono.
                Toma unos 5 minutos.
              </DialogDescription>
            </DialogHeader>

            <ul className="space-y-3">
              {!reconectar && (
                <li className="flex gap-3">
                  <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <div>
                    <p className="text-sm font-medium">Tu WhatsApp sigue igual</p>
                    <p className="text-[13px] text-muted-foreground">
                      Sigues respondiendo desde tu teléfono y desde WhatsApp Web, como siempre.
                    </p>
                  </div>
                </li>
              )}
              {!reconectar && (
                <li className="flex gap-3">
                  <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">Agrega una tarjeta en Meta</p>
                    <p className="text-[13px] text-muted-foreground">
                      Meta cobra solo lo que CliniQ envía; lo que escribes desde tu teléfono es gratis.
                    </p>
                    <CostoAproximado />
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                      <a href={PAGOS_META_URL} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
                        Abrir pagos en Meta <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      <Checkbox
                        id="pago-meta"
                        label="Ya la agregué"
                        checked={estado.pago_meta_configurado}
                        disabled={pago.isPending}
                        onChange={(e) => pago.mutate({ pago_meta_configurado: e.target.checked })}
                      />
                    </div>
                  </div>
                </li>
              )}
              <li className="flex gap-3">
                <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Abre WhatsApp Business cada 14 días</p>
                  <p className="text-[13px] text-muted-foreground">Si no, Meta desconecta el número.</p>
                </div>
              </li>
            </ul>

            {/* Si Meta no ofrece Coexistence para el número, su ventana propone
                pasarlo a la API eliminándolo de la app: la clínica perdería su
                WhatsApp Business en el teléfono y no hay vuelta atrás. */}
            <div className="flex gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="text-[13px] leading-relaxed">
                <span className="font-semibold">Si Meta te pide eliminar o desconectar tu número, no lo hagas:</span>{' '}
                cierra la ventana. Tu número aún no es elegible y perderías WhatsApp Business en tu teléfono.
              </p>
            </div>

            {!reconectar && (
              <details className="group rounded-lg bg-muted/50 px-3 py-2 text-[12.5px] text-muted-foreground">
                <summary className="flex cursor-pointer list-none items-center gap-1 font-medium">
                  <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" /> Pequeños cambios en la app
                </summary>
                <p className="mt-1.5 leading-relaxed">
                  La app de WhatsApp para Windows deja de funcionar como dispositivo vinculado (usa WhatsApp Web).
                  Tampoco estarán los mensajes temporales, los de &quot;ver una vez&quot;, la ubicación en tiempo real
                  ni las listas de difusión. La ventana de Meta muestra &quot;Lyvio&quot;, nuestro proveedor.
                </p>
              </details>
            )}

            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-700">{error}</p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={cerrar} disabled={ocupado}>Cancelar</Button>
              <Button onClick={handleConectar} disabled={ocupado}>
                {ocupado ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-1.5 h-4 w-4" />}
                {conectar.isPending ? 'Conectando…' : reconectar ? 'Reconectar' : 'Conectar con WhatsApp'}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Tus números ─────────────────────────────────────────────

/** Límite diario de Meta del número y cómo ampliarlo, en una línea. */
function LimiteDiario({ numero }: { numero: NumeroWhatsapp }) {
  if (numero.limite_mensajes === 'TIER_UNLIMITED') {
    return <p className="mt-0.5 text-[12px] text-muted-foreground">Sin límite diario de Meta.</p>
  }
  if (numero.limite_diario === null) return null
  return (
    <p className="mt-0.5 text-[12px] text-muted-foreground">
      Meta te deja escribir a {numero.limite_diario.toLocaleString('es-CO')} pacientes distintos al día.
      {numero.limite_diario <= LIMITE_SIN_VERIFICAR && (
        <>
          {' '}
          <a href={VERIFICAR_NEGOCIO_URL} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline">
            Verifica tu negocio en Meta para ampliarlo <ExternalLink className="h-3 w-3" />
          </a>
        </>
      )}
    </p>
  )
}

function TusNumeros({ estado, onConectar, onReconectar }: {
  estado: WhatsappPropioEstado
  onConectar: () => void
  onReconectar: (numero: NumeroWhatsapp) => void
}) {
  const lleno = estado.numeros.length >= estado.numeros_incluidos
  // Meta no deja más de 2 números a un negocio sin verificar, aunque el plan incluya más.
  const topeMeta = estado.numeros_permitidos_meta !== null && estado.numeros.length >= estado.numeros_permitidos_meta
  // Meta rechazó un envío por falta de pago: la clínica lo corrige en Meta y lo
  // confirma aquí. Si sigue sin pago, el próximo envío vuelve a bloquear el número.
  const pago = useConfigurar()
  return (
    <section className="overflow-hidden rounded-xl border bg-white">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <p className="text-[13.5px] font-semibold">Tus números</p>
        <span className="text-[12px] tabular-nums text-muted-foreground">
          {estado.numeros.length} de {estado.numeros_incluidos} incluidos en tu plan
        </span>
      </div>
      <div className="divide-y divide-border/60">
        {estado.numeros.map((n) => {
          const pausa = n.bloqueo === 'limite'
          const conError = n.estado === 'error' && !pausa
          return (
          <div key={n.id} className={cn(
            'flex items-center gap-3 px-4 py-3.5', conError && 'bg-red-50/60', pausa && 'bg-amber-50/60',
          )}>
            <MessageCircle className={cn(
              'h-4 w-4 shrink-0', conError ? 'text-red-600' : pausa ? 'text-amber-600' : 'text-muted-foreground',
            )} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-medium">
                {etiquetaNumero(n)}
                {n.es_por_defecto && estado.numeros.length > 1 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-px text-[11px] font-medium text-primary">
                    <Star className="h-3 w-3" /> Por defecto
                  </span>
                )}
              </p>
              <p className={cn(
                'mt-0.5 text-[12.5px] leading-relaxed',
                conError ? 'text-red-700' : pausa ? 'text-amber-800' : 'text-muted-foreground',
              )}>
                {n.estado === 'activo' && 'Enviando mensajes.'}
                {(n.estado === 'conectado' || n.estado === 'plantillas_pendientes')
                  && 'Meta está aprobando tus mensajes (de minutos a un día). Mientras tanto se usa el número de CliniQ.'}
                {n.estado === 'error' && (n.ultimo_error || 'Este número tiene un problema. Mientras tanto se usa otro número.')}
              </p>
              <LimiteDiario numero={n} />
              {n.bloqueo === 'conexion' && (
                <Button size="sm" variant="outline" className="mt-2" onClick={() => onReconectar(n)}>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Reconectar
                </Button>
              )}
              {n.bloqueo === 'pago' && (
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                  <a href={PAGOS_META_URL} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[12.5px] font-medium text-primary hover:underline">
                    Abrir pagos en Meta <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <Button size="sm" variant="outline" disabled={pago.isPending}
                    onClick={() => pago.mutate({ pago_meta_configurado: true })}>
                    {pago.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                    Ya agregué el método de pago
                  </Button>
                </div>
              )}
            </div>
            <EstadoBadge numero={n} />
          </div>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
        {!lleno && topeMeta ? (
          <>
            <p className="text-[12.5px] text-muted-foreground">
              Meta permite {estado.numeros_permitidos_meta} números a los negocios sin verificar.
            </p>
            <a href={VERIFICAR_NEGOCIO_URL} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 text-[12.5px] font-medium text-primary hover:underline">
              Verificar mi negocio <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </>
        ) : lleno ? (
          <>
            <p className="text-[12.5px] text-muted-foreground">
              ¿Quieres un número para otra sede? Tu plan incluye {estado.numeros_incluidos}{' '}
              {estado.numeros_incluidos === 1 ? 'número' : 'números'}.
            </p>
            {estado.contacto_ventas_url && (
              <a href={estado.contacto_ventas_url} target="_blank" rel="noreferrer"
                className="text-[12.5px] font-medium text-primary hover:underline">
                Pedir otro número
              </a>
            )}
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={onConectar}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Conectar otro número
          </Button>
        )}
      </div>
    </section>
  )
}

// ─── Asignación ──────────────────────────────────────────────

function valorSede(s: SedeWhatsapp) {
  return s.tipo === 'numero' && s.numero_id ? `numero:${s.numero_id}` : s.tipo
}

/** Desde qué número envía cada sede. Con un solo número y una sola sede no
 *  hay nada que elegir y no se muestra. */
function Asignacion({ estado }: { estado: WhatsappPropioEstado }) {
  const configurar = useConfigurar()
  const porDefecto = estado.numeros.find((n) => n.es_por_defecto) ?? null
  const variosNumeros = estado.numeros.length > 1
  if (!variosNumeros && estado.sedes.length <= 1) return null

  const cambiarSede = (sede: SedeWhatsapp, valor: string) => {
    const [tipo, numeroId] = valor.split(':') as [SedeWhatsapp['tipo'], string | undefined]
    configurar.mutate({ asignaciones: [{ sede_id: sede.id, tipo, numero_id: numeroId ?? null }] })
  }

  return (
    <section className="overflow-hidden rounded-xl border bg-white">
      <div className="border-b px-4 py-3">
        <p className="text-[13.5px] font-semibold">Asignación</p>
        <p className="text-[12.5px] text-muted-foreground">Elige desde qué número envía cada sede.</p>
      </div>
      <div className="divide-y divide-border/60">
        {variosNumeros && (
          <div className="flex flex-wrap items-center gap-3 px-4 py-3.5">
            <Star className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Número por defecto</p>
              <p className="text-[12.5px] text-muted-foreground">
                Para sedes nuevas, documentos sin sede y cuando el número de una sede tiene un problema.
              </p>
            </div>
            <Select
              value={estado.numero_por_defecto_id ?? undefined}
              onValueChange={(id) => configurar.mutate({ numero_por_defecto_id: id })}
              disabled={configurar.isPending}
            >
              <SelectTrigger className="w-56"><SelectValue placeholder="Elige un número" /></SelectTrigger>
              <SelectContent>
                {estado.numeros.map((n) => (
                  <SelectItem key={n.id} value={n.id}>
                    {etiquetaNumero(n)}{n.estado !== 'activo' ? ' (en aprobación)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {estado.sedes.map((sede) => {
          const efectivo = numeroEfectivo(sede, estado)
          return (
            <div key={sede.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
              <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{sede.nombre}</p>
                <p className="text-[12.5px] text-muted-foreground">
                  {efectivo ? `Enviando desde ${etiquetaNumero(efectivo)}` : 'Enviando desde el número de CliniQ'}
                </p>
              </div>
              <Select
                value={valorSede(sede)}
                onValueChange={(v) => cambiarSede(sede, v)}
                disabled={configurar.isPending}
              >
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="por_defecto">
                    {variosNumeros ? 'Número por defecto' : 'Número de tu clínica'}
                    {porDefecto ? ` (${etiquetaNumero(porDefecto)})` : ''}
                  </SelectItem>
                  {variosNumeros && estado.numeros.map((n) => (
                    <SelectItem key={n.id} value={`numero:${n.id}`}>
                      {etiquetaNumero(n)}{n.estado !== 'activo' ? ' (en aprobación)' : ''}
                    </SelectItem>
                  ))}
                  <SelectItem value="cliniq">Número de CliniQ</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )
        })}
      </div>
      {configurar.isError && (
        <p className="border-t px-4 py-2.5 text-sm text-red-600">{mensajeError(configurar.error)}</p>
      )}
      <div className="space-y-1 border-t bg-blue-50/60 px-4 py-3 text-[12.5px] leading-relaxed text-blue-900">
        <p className="flex items-center gap-1.5 font-medium"><Info className="h-3.5 w-3.5" /> ¿Qué número se usa?</p>
        <p>
          Los documentos sin sede (consentimientos, órdenes médicas, firmas) usan la sede de la cita relacionada o,
          si no hay, la última sede donde se atendió el paciente. Si el número de una sede tiene un problema, el
          mensaje sale desde el número por defecto, y si ninguno está disponible, desde el número de CliniQ.
        </p>
      </div>
    </section>
  )
}

// ─── Página ──────────────────────────────────────────────────

export function WhatsappPropioConfig() {
  const { data: estado, isLoading, isError } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: whatsappPropioApi.estado,
  })
  const [conectando, setConectando] = useState(false)
  const [reconectando, setReconectando] = useState<NumeroWhatsapp | null>(null)

  if (isLoading) return <div className="h-48 animate-pulse rounded-xl border bg-muted/40" />
  if (isError || !estado) {
    return <p className="rounded-xl border bg-white px-4 py-6 text-sm text-muted-foreground">No pudimos cargar la configuración de WhatsApp.</p>
  }

  return (
    <div className="space-y-4">
      <NumeroEnUso estado={estado} />

      {!estado.habilitado ? (
        <PromoNumeroPropio estado={estado} />
      ) : estado.numeros.length === 0 ? (
        <CambiarANumeroPropio onConectar={() => setConectando(true)} />
      ) : (
        <>
          <TusNumeros
            estado={estado}
            onConectar={() => { setReconectando(null); setConectando(true) }}
            onReconectar={(n) => { setReconectando(n); setConectando(true) }}
          />
          <Asignacion estado={estado} />
        </>
      )}

      <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" /> Los códigos de check-in siempre salen desde el número de CliniQ.
      </p>

      {estado.habilitado && (
        <ConectarDialog
          estado={estado}
          open={conectando}
          reconectar={reconectando}
          onClose={() => { setConectando(false); setReconectando(null) }}
        />
      )}
    </div>
  )
}
