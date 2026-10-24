'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, ArrowRight, Building2, CalendarClock, Check, CheckCircle2, ChevronRight, CreditCard, ExternalLink, Loader2,
  MapPin, MessageCircle, MoreHorizontal, Plus, RefreshCw, Smartphone, Star, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { whatsappPropioApi } from '@/lib/api/whatsappPropio'
import { EmbeddedSignupCancelado, useEmbeddedSignup } from '@/hooks/useEmbeddedSignup'
import { cn } from '@/lib/utils'
import {
  avisarGuardado, EtiquetaAjuste, FilaAjuste, NotaAjuste, SeccionAjustes,
} from './ajustes'
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
  if (numero.bloqueo === 'limite') return <EtiquetaAjuste tono="aviso">En pausa hoy</EtiquetaAjuste>
  if (numero.estado === 'activo') return <EtiquetaAjuste tono="activo">Activo</EtiquetaAjuste>
  if (numero.estado === 'error') {
    // EtiquetaAjuste no tiene tono de error: misma forma, en rojo.
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
        Requiere acción
      </span>
    )
  }
  return <EtiquetaAjuste tono="aviso">En aprobación</EtiquetaAjuste>
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
      ? 'Tu número ya está conectado. Mientras Meta aprueba tus mensajes, cada envío te pide confirmar si sale desde el número de CliniQ.'
      : estado.numeros.length > 0 && !estado.habilitado
        ? 'Tus números siguen conectados, pero el add-on de número propio está inactivo.'
        : 'Tus pacientes ven el número de CliniQ y, si responden, su mensaje no llega a tu clínica.'
  }

  return (
    <SeccionAjustes titulo="Número en uso" descripcion="Desde dónde reciben hoy tus pacientes los mensajes.">
      <FilaAjuste
        icono={propio ? Building2 : MessageCircle}
        apagada={!propio}
        titulo={titulo}
        descripcion={detalle}
        extra={
          <EtiquetaAjuste tono={propio ? 'activo' : pendientes ? 'aviso' : 'neutro'}>
            {propio ? 'Número propio' : pendientes ? 'En aprobación' : 'Número de CliniQ'}
          </EtiquetaAjuste>
        }
      />
      <NotaAjuste>Los códigos de check-in siempre salen desde el número de CliniQ.</NotaAjuste>
    </SeccionAjustes>
  )
}

// ─── Promoción ───────────────────────────────────────────────

const COMPARACION: { cliniq: string; propio: string }[] = [
  { cliniq: 'El paciente ve el número de CliniQ.', propio: 'El paciente ve el nombre y el número de tu clínica.' },
  { cliniq: 'Si responde, su mensaje no llega a tu clínica.', propio: 'Sus respuestas te llegan a WhatsApp Business en tu teléfono.' },
  { cliniq: 'Un solo número para todas tus sedes.', propio: 'Un número para toda la clínica o uno por sede.' },
  { cliniq: 'Consume el cupo de mensajes de tu plan.', propio: 'No consume cupo: Meta cobra los mensajes a tu cuenta.' },
]

/** Las dos columnas de la comparación, como contenido de una SeccionAjustes. */
function ComparacionNumeros() {
  return (
    <div className="grid divide-y divide-border/70 md:grid-cols-2 md:divide-x md:divide-y-0">
      <div className="px-4 py-3.5">
        <p className="mb-2 text-[13px] font-semibold text-muted-foreground">Número de CliniQ</p>
        <ul className="space-y-1.5">
          {COMPARACION.map((c) => (
            <li key={c.cliniq} className="flex gap-2 text-[13px] text-muted-foreground">
              <X className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {c.cliniq}
            </li>
          ))}
        </ul>
      </div>
      <div className="px-4 py-3.5">
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
    <SeccionAjustes
      titulo="Envía desde el número de tu clínica"
      descripcion="Conecta el WhatsApp Business que ya usas y sigue respondiendo desde tu teléfono."
      accion={estado.contacto_ventas_url && (
        <Button asChild size="sm">
          <a href={estado.contacto_ventas_url} target="_blank" rel="noreferrer">
            <MessageCircle className="mr-1.5 h-4 w-4" /> Quiero mi número propio
          </a>
        </Button>
      )}
    >
      <ComparacionNumeros />
      <NotaAjuste>
        {!estado.contacto_ventas_url && 'Escríbenos para activarlo en tu plan. '}
        {estado.whatsapp_habilitado
          ? 'Es un add-on de tu plan. Mientras tanto, todo se sigue enviando desde el número de CliniQ.'
          : 'Es un add-on que requiere tener activos los envíos por WhatsApp en tu plan.'}
      </NotaAjuste>
    </SeccionAjustes>
  )
}

/** Con el add-on pero sin números conectados. */
function CambiarANumeroPropio({ estado, onConectar }: { estado: WhatsappPropioEstado; onConectar: () => void }) {
  return (
    <SeccionAjustes
      titulo="Cambia a tu número propio"
      descripcion={estado.en_prueba
        ? 'Incluido en tu prueba. Tus pacientes verán el nombre de tu clínica y te responderán a ti.'
        : 'Tu plan ya lo incluye. Conéctalo en unos minutos y todas tus sedes lo usarán.'}
      accion={
        <div className="flex flex-wrap justify-end gap-2">
          {estado.en_prueba && estado.contacto_ventas_url && (
            <Button asChild size="sm" variant="outline">
              <a href={estado.contacto_ventas_url} target="_blank" rel="noreferrer">Que me ayuden</a>
            </Button>
          )}
          <Button size="sm" onClick={onConectar}>
            Conectar mi número <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      }
    >
      <ComparacionNumeros />
      {estado.en_prueba && (
        <NotaAjuste>
          Conectarlo pide tu cuenta de Meta Business y toma unos 15 minutos: si quieres, lo hacemos contigo por WhatsApp.
          Si al terminar la prueba tu plan no lo incluye, tus mensajes vuelven a salir por el número de CliniQ y tu número queda guardado.
        </NotaAjuste>
      )}
      <NotaAjuste>
        Hasta que Meta apruebe tus mensajes, cada envío te pide confirmar si sale desde el número de CliniQ.
      </NotaAjuste>
    </SeccionAjustes>
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
                : 'Meta está revisando los mensajes de CliniQ (de minutos a un día). Mientras tanto, cada envío te pide confirmar si sale desde el número de CliniQ.'}
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

// ─── Dar de baja ─────────────────────────────────────────────

/** Saca un número de CliniQ (p. ej. para conectar otro). Primero la clínica lo
 *  desconecta desde la app: así su WhatsApp Business del teléfono no se toca. */
function DarDeBajaDialog({ numero, estado, onClose }: {
  numero: NumeroWhatsapp | null
  estado: WhatsappPropioEstado
  onClose: () => void
}) {
  const qc = useQueryClient()
  const baja = useMutation({
    mutationFn: (id: string) => whatsappPropioApi.darDeBaja(id),
    onSuccess: (data) => {
      qc.setQueryData(QUERY_KEY, data)
      onClose()
    },
  })
  const quedanOtros = estado.numeros.length > 1
  const cerrar = () => {
    if (baja.isPending) return
    baja.reset()
    onClose()
  }

  return (
    <Dialog open={!!numero} onOpenChange={(v) => { if (!v) cerrar() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Dar de baja {numero ? etiquetaNumero(numero) : ''}</DialogTitle>
          <DialogDescription className="leading-relaxed">
            CliniQ dejará de enviar mensajes desde este número. Tu WhatsApp Business en el teléfono sigue igual,
            con todos tus chats.
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-3">
          <li className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">1</span>
            <div>
              <p className="text-sm font-medium">Desconéctalo desde tu teléfono</p>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                En WhatsApp Business: Configuración → Cuenta → Plataforma empresarial (Business Platform) →
                Desconectar. Es la forma segura de salir: tu app no pierde nada.
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">2</span>
            <div>
              <p className="text-sm font-medium">Confirma aquí</p>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                {quedanOtros
                  ? 'Las sedes que usaban este número pasan al número por defecto.'
                  : 'Tus mensajes vuelven a salir desde el número de CliniQ.'}
                {' '}Después puedes conectar otro número.
              </p>
            </div>
          </li>
        </ol>

        {baja.isError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-700">
            {mensajeError(baja.error)}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={cerrar} disabled={baja.isPending}>Cancelar</Button>
          <Button variant="destructive" disabled={!numero || baja.isPending} onClick={() => numero && baja.mutate(numero.id)}>
            {baja.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Ya lo desconecté, dar de baja
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Tus números ─────────────────────────────────────────────

/** Límite diario de Meta del número y cómo ampliarlo, en una línea (va dentro del texto de la fila). */
function LimiteDiario({ numero }: { numero: NumeroWhatsapp }) {
  if (numero.limite_mensajes === 'TIER_UNLIMITED') {
    return <span className="mt-0.5 block">Sin límite diario de Meta.</span>
  }
  if (numero.limite_diario === null) return null
  return (
    <span className="mt-0.5 block">
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
    </span>
  )
}

function TusNumeros({ estado, onConectar, onReconectar, onDarDeBaja }: {
  estado: WhatsappPropioEstado
  onConectar: () => void
  onReconectar: (numero: NumeroWhatsapp) => void
  onDarDeBaja: (numero: NumeroWhatsapp) => void
}) {
  const lleno = estado.numeros.length >= estado.numeros_incluidos
  // Meta no deja más de 2 números a un negocio sin verificar, aunque el plan incluya más.
  const topeMeta = estado.numeros_permitidos_meta !== null && estado.numeros.length >= estado.numeros_permitidos_meta
  // Meta rechazó un envío por falta de pago: la clínica lo corrige en Meta y lo
  // confirma aquí. Si sigue sin pago, el próximo envío vuelve a bloquear el número.
  const pago = useConfigurar()
  return (
    <SeccionAjustes
      titulo="Tus números"
      descripcion={`${estado.numeros.length} de ${estado.numeros_incluidos} incluidos en tu plan.`}
      accion={!lleno && !topeMeta && (
        <Button size="sm" variant="outline" onClick={onConectar}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Conectar otro número
        </Button>
      )}
    >
      {estado.numeros.map((n) => {
        const pausa = n.bloqueo === 'limite'
        const conError = n.estado === 'error' && !pausa
        const acciones = n.bloqueo === 'conexion' || n.bloqueo === 'pago'
        return (
          <div key={n.id} className={cn(conError && 'bg-red-50/60', pausa && 'bg-amber-50/60')}>
            <FilaAjuste
              icono={MessageCircle}
              titulo={etiquetaNumero(n)}
              extra={n.es_por_defecto && estado.numeros.length > 1 && (
                <EtiquetaAjuste tono="marca" icono={Star}>Por defecto</EtiquetaAjuste>
              )}
              descripcion={
                <>
                  <span className={cn('block', conError ? 'text-red-700' : pausa && 'text-amber-800')}>
                    {n.estado === 'activo' && 'Enviando mensajes.'}
                    {(n.estado === 'conectado' || n.estado === 'plantillas_pendientes')
                      && 'Meta está aprobando tus mensajes (de minutos a un día). Mientras tanto, cada envío te pide confirmar si sale desde el número de CliniQ.'}
                    {n.estado === 'error' && (n.ultimo_error || 'Este número tiene un problema. Mientras tanto, cada envío te pide confirmar si sale desde el número de CliniQ.')}
                  </span>
                  <LimiteDiario numero={n} />
                </>
              }
              contenido={acciones && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                  {n.bloqueo === 'conexion' && (
                    <Button size="sm" variant="outline" onClick={() => onReconectar(n)}>
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Reconectar
                    </Button>
                  )}
                  {n.bloqueo === 'pago' && (
                    <>
                      <a href={PAGOS_META_URL} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
                        Abrir pagos en Meta <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      <Button size="sm" variant="outline" disabled={pago.isPending}
                        onClick={() => pago.mutate({ pago_meta_configurado: true })}>
                        {pago.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                        Ya agregué el método de pago
                      </Button>
                    </>
                  )}
                </div>
              )}
            >
              <EstadoBadge numero={n} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Acciones de ${etiquetaNumero(n)}`}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onDarDeBaja(n)} className="text-red-600 focus:text-red-600">
                    Dar de baja este número
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </FilaAjuste>
          </div>
        )
      })}
      {!lleno && topeMeta ? (
        <NotaAjuste>
          Meta permite {estado.numeros_permitidos_meta} números a los negocios sin verificar.{' '}
          <a href={VERIFICAR_NEGOCIO_URL} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
            Verificar mi negocio <ExternalLink className="h-3 w-3" />
          </a>
        </NotaAjuste>
      ) : lleno ? (
        <NotaAjuste>
          ¿Quieres un número para otra sede? Tu plan incluye {estado.numeros_incluidos}{' '}
          {estado.numeros_incluidos === 1 ? 'número' : 'números'}.
          {estado.contacto_ventas_url && (
            <>
              {' '}
              <a href={estado.contacto_ventas_url} target="_blank" rel="noreferrer"
                className="font-medium text-primary hover:underline">
                Pedir otro número
              </a>
            </>
          )}
        </NotaAjuste>
      ) : null}
    </SeccionAjustes>
  )
}

// ─── Asignación ──────────────────────────────────────────────

function valorSede(s: SedeWhatsapp) {
  return s.tipo === 'numero' && s.numero_id ? `numero:${s.numero_id}` : s.tipo
}

/** Desde qué número envía cada sede. Con un solo número y una sola sede no
 *  hay nada que elegir y no se muestra. Cada lista se guarda al elegir y el
 *  aviso ofrece deshacer. */
function Asignacion({ estado }: { estado: WhatsappPropioEstado }) {
  const configurar = useConfigurar()
  const porDefecto = estado.numeros.find((n) => n.es_por_defecto) ?? null
  const variosNumeros = estado.numeros.length > 1
  if (!variosNumeros && estado.sedes.length <= 1) return null

  const cambiarSede = (sede: SedeWhatsapp, valor: string, antes?: string) => {
    const [tipo, numeroId] = valor.split(':') as [SedeWhatsapp['tipo'], string | undefined]
    configurar.mutate(
      { asignaciones: [{ sede_id: sede.id, tipo, numero_id: numeroId ?? null }] },
      { onSuccess: () => avisarGuardado(antes ? () => cambiarSede(sede, antes) : undefined) },
    )
  }

  const cambiarPorDefecto = (id: string, antes?: string | null) => {
    configurar.mutate(
      { numero_por_defecto_id: id },
      { onSuccess: () => avisarGuardado(antes ? () => cambiarPorDefecto(antes) : undefined) },
    )
  }

  return (
    <SeccionAjustes titulo="Asignación" descripcion="Elige desde qué número envía cada sede.">
      {variosNumeros && (
        <FilaAjuste
          icono={Star}
          titulo="Número por defecto"
          descripcion="Para sedes nuevas, documentos sin sede y cuando el número de una sede tiene un problema."
        >
          <Select
            value={estado.numero_por_defecto_id ?? undefined}
            onValueChange={(id) => cambiarPorDefecto(id, estado.numero_por_defecto_id)}
            disabled={configurar.isPending}
          >
            <SelectTrigger className="h-9 w-[8.25rem] sm:w-56" aria-label="Número por defecto">
              <SelectValue placeholder="Elige un número" />
            </SelectTrigger>
            <SelectContent>
              {estado.numeros.map((n) => (
                <SelectItem key={n.id} value={n.id}>
                  {etiquetaNumero(n)}{n.estado !== 'activo' ? ' (en aprobación)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilaAjuste>
      )}
      {estado.sedes.map((sede) => {
        const efectivo = numeroEfectivo(sede, estado)
        return (
          <FilaAjuste
            key={sede.id}
            icono={MapPin}
            titulo={sede.nombre}
            descripcion={efectivo
              ? `Enviando desde ${etiquetaNumero(efectivo)}`
              : sede.tipo === 'cliniq'
                ? 'Enviando desde el número de CliniQ'
                : 'Tu número aún no está disponible: cada envío pide confirmar si sale desde el de CliniQ'}
          >
            <Select
              value={valorSede(sede)}
              onValueChange={(v) => cambiarSede(sede, v, valorSede(sede))}
              disabled={configurar.isPending}
            >
              <SelectTrigger className="h-9 w-[8.25rem] sm:w-56" aria-label={`Número de ${sede.nombre}`}>
                <SelectValue />
              </SelectTrigger>
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
          </FilaAjuste>
        )
      })}
      {configurar.isError && (
        <p className="px-4 py-2.5 text-sm text-destructive">{mensajeError(configurar.error)}</p>
      )}
      <NotaAjuste>
        Los documentos sin sede (consentimientos, órdenes médicas, firmas) usan la sede de la cita relacionada o,
        si no hay, la última sede donde se atendió el paciente. Si el número de una sede tiene un problema, el
        mensaje sale desde el número por defecto. Si ninguno está disponible, CliniQ te pregunta antes de enviarlo
        desde su número; si Meta lo rechaza después de enviado, lo verás en el inicio como un envío que no salió.
      </NotaAjuste>
    </SeccionAjustes>
  )
}

// ─── Página ──────────────────────────────────────────────────

export function WhatsappPropioConfig() {
  const { data: estado, isLoading, isError, refetch } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: whatsappPropioApi.estado,
  })
  const [conectando, setConectando] = useState(false)
  const [reconectando, setReconectando] = useState<NumeroWhatsapp | null>(null)
  const [dandoDeBaja, setDandoDeBaja] = useState<NumeroWhatsapp | null>(null)

  if (isLoading) {
    return (
      <SeccionAjustes titulo="Número en uso" descripcion="Desde dónde reciben hoy tus pacientes los mensajes.">
        <div className="flex items-center gap-4 px-4 py-3.5">
          <div className="h-8 w-8 shrink-0 animate-pulse rounded-lg bg-muted" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-48 animate-pulse rounded bg-muted" />
            <div className="h-2.5 w-72 max-w-full animate-pulse rounded bg-muted" />
          </div>
        </div>
      </SeccionAjustes>
    )
  }
  if (isError || !estado) {
    return (
      <SeccionAjustes titulo="Número en uso">
        <FilaAjuste icono={AlertTriangle} titulo="No pudimos cargar la configuración de WhatsApp.">
          <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>Reintentar</Button>
        </FilaAjuste>
      </SeccionAjustes>
    )
  }

  return (
    <div className="space-y-7">
      <NumeroEnUso estado={estado} />

      {!estado.habilitado ? (
        <PromoNumeroPropio estado={estado} />
      ) : estado.numeros.length === 0 ? (
        <CambiarANumeroPropio estado={estado} onConectar={() => setConectando(true)} />
      ) : (
        <>
          <TusNumeros
            estado={estado}
            onConectar={() => { setReconectando(null); setConectando(true) }}
            onReconectar={(n) => { setReconectando(n); setConectando(true) }}
            onDarDeBaja={setDandoDeBaja}
          />
          <DarDeBajaDialog numero={dandoDeBaja} estado={estado} onClose={() => setDandoDeBaja(null)} />
          <Asignacion estado={estado} />
        </>
      )}

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
