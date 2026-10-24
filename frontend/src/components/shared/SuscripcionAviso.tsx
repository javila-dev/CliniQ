'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Clock, CreditCard, Loader2, Lock, LogOut, MessageCircle, RotateCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { suscripcionesApi } from '@/lib/api/suscripciones'
import { isAdminOrSuperAdmin, isSuperAdmin } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { useSuperadminClinicaStore } from '@/store/superadminClinicaStore'
import type { MiSuscripcion, PerfilBienvenida, Suscripcion, SuscripcionConContacto } from '@/types/suscripciones'

// Estado de la cuenta (prueba, mora, solo lectura, suspendida). El backend
// bloquea por su cuenta; esto solo lo explica: aviso fijo arriba, diálogo
// cuando una acción se rechaza por solo lectura y pantalla completa si la
// cuenta está suspendida.

export const MI_SUSCRIPCION_KEY = ['mi-suscripcion'] as const

const FECHA = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long' })
const fecha = (iso: string | null) => (iso ? FECHA.format(new Date(iso)) : '')

/** La suscripción, o null si la clínica no tiene (sin restricción) o aún no carga. */
export function conEstado(s: MiSuscripcion | undefined): SuscripcionConContacto | null {
  return s && s.estado !== null ? (s as SuscripcionConContacto) : null
}

/** La clínica cuya suscripción se muestra: la del usuario o, para el superadmin,
 *  la clínica en la que está operando ("Entrar como clínica"). */
function useClinicaDeLaSuscripcion(): string | null {
  const user = useAuthStore((s) => s.user)
  const clinicaActiva = useSuperadminClinicaStore((s) => s.clinicaActiva)
  if (!user) return null
  return isSuperAdmin(user) ? clinicaActiva?.id ?? null : user.clinica_id ?? null
}

export function useMiSuscripcion() {
  const clinicaId = useClinicaDeLaSuscripcion()
  return useQuery({
    // Con el id: al cambiar de clínica el superadmin no ve la anterior.
    queryKey: [...MI_SUSCRIPCION_KEY, clinicaId],
    queryFn: suscripcionesApi.mia,
    enabled: !!clinicaId,
    staleTime: 5 * 60 * 1000,
  })
}

export const RUTA_PAGAR = '/configuracion/plan/pagar'

/** Clínica activa con cobro manual que se puede pasar a tarjeta (decisión D4 del plan). */
export function invitarATarjeta(s: Pick<Suscripcion, 'estado' | 'modo_cobro'> | null | undefined): boolean {
  return !!s && s.estado === 'activa' && s.modo_cobro === 'manual'
}

const hoyISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Desde cuándo corre el primer periodo con tarjeta: el backend lo empieza al día
 *  siguiente de lo pagado a mano o, si no hay fecha, el mismo día del pago. */
export function inicioConTarjeta(s: Pick<Suscripcion, 'periodo_fin'>): string | null {
  if (!s.periodo_fin || s.periodo_fin < hoyISO()) return null
  const d = new Date(`${s.periodo_fin}T12:00:00`)
  d.setDate(d.getDate() + 1)
  return FECHA.format(d)
}

// El aviso de pasar a tarjeta se puede cerrar; vuelve a los 30 días.
const DESCARTE_TARJETA_MS = 30 * 24 * 60 * 60 * 1000
const claveDescarte = (clinicaId: string) => `cliniq:invitacion-tarjeta:${clinicaId}`

function useInvitacionDescartada(clinicaId: string | null | undefined) {
  const [descartada, setDescartada] = useState(true)
  useEffect(() => {
    if (!clinicaId) return
    try {
      const cuando = Number(localStorage.getItem(claveDescarte(clinicaId)) || 0)
      setDescartada(Date.now() - cuando < DESCARTE_TARJETA_MS)
    } catch {
      setDescartada(false)
    }
  }, [clinicaId])
  const descartar = () => {
    setDescartada(true)
    try {
      if (clinicaId) localStorage.setItem(claveDescarte(clinicaId), String(Date.now()))
    } catch { /* sin almacenamiento: solo se oculta en esta visita */ }
  }
  return [descartada, descartar] as const
}

/** Botón grande de "Reintentar pago con mi tarjeta" (diálogo, pantalla de suspendida, Configuración → Plan). */
export function BotonReintentar({ onHecho, size }: { onHecho?: () => void; size?: 'sm' | 'default' }) {
  const reintentar = useReintentarPago()
  return (
    <Button size={size} disabled={reintentar.isPending} onClick={() => reintentar.mutate(undefined, { onSuccess: () => onHecho?.() })}>
      {reintentar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCw className="mr-2 h-4 w-4" />}
      Reintentar pago
    </Button>
  )
}

/** Invita a quien administra una clínica con cobro manual a registrar tarjeta. */
function InvitacionTarjeta({ onCerrar }: { onCerrar: () => void }) {
  return (
    <div className="flex items-center gap-2.5 border-b bg-white px-4 py-2 text-sm text-foreground">
      <CreditCard className="h-4 w-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1">
        Ya puedes pagar CliniQ con tarjeta: se renueva solo y recibes la factura electrónica de cada pago.
      </span>
      <Link href="/configuracion/plan" className="shrink-0 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
        Ver cómo
      </Link>
      <button type="button" onClick={onCerrar} aria-label="Cerrar aviso" className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

/** "Elegir plan": la pantalla de pago si hay pago en línea; si no, WhatsApp con ventas. */
export function ElegirPlanLink({ s, className, children, onClick }: {
  s: SuscripcionConContacto
  className?: string
  children: React.ReactNode
  onClick?: () => void
}) {
  if (s.pago_en_linea) return <Link href={RUTA_PAGAR} className={className} onClick={onClick}>{children}</Link>
  if (!s.contacto_ventas_url) return null
  return (
    <a href={s.contacto_ventas_url} target="_blank" rel="noopener noreferrer" className={className} onClick={onClick}>
      {children}
    </a>
  )
}

function BotonElegirPlan({ s, className }: { s: SuscripcionConContacto; className?: string }) {
  return (
    <ElegirPlanLink s={s} className={cn('shrink-0 rounded-md bg-white/90 px-2.5 py-1 text-xs font-semibold text-gray-900 hover:bg-white', className)}>
      Elegir plan
    </ElegirPlanLink>
  )
}

const errorDe = (err: unknown) =>
  (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'No se pudo hacer el cobro. Intenta de nuevo.'

/** Cobra ya el periodo pendiente con la tarjeta guardada y avisa cómo terminó. */
export function useReintentarPago() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  return useMutation({
    mutationFn: suscripcionesApi.reintentarPago,
    onSuccess: (cobro) => {
      queryClient.invalidateQueries({ queryKey: MI_SUSCRIPCION_KEY })
      queryClient.invalidateQueries({ queryKey: ['pago-cobros'] })
      if (cobro.estado === 'aprobado') toast({ title: 'Pago aprobado', description: 'Tu cuenta quedó al día.' })
      else if (cobro.estado === 'pendiente') toast({ title: 'Pago en proceso', description: 'El banco aún no responde. Te avisamos aquí apenas se apruebe.' })
      else toast({ title: 'El banco rechazó el pago', description: cobro.mensaje || 'Prueba con otra tarjeta.', variant: 'destructive' })
    },
    onError: (err) => toast({ title: 'No se pudo reintentar', description: errorDe(err), variant: 'destructive' }),
  })
}

/** "Reintentar pago" + "Cambiar tarjeta", para la mora o la solo lectura por cobros rechazados. */
function AccionesCobroPendiente({ claro }: { claro?: boolean }) {
  const reintentar = useReintentarPago()
  const base = 'inline-flex shrink-0 items-center rounded-md px-2.5 py-1 text-xs font-semibold'
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Link href={`${RUTA_PAGAR}?modo=tarjeta`} className={cn(base, claro ? 'text-amber-800 hover:bg-amber-500/10' : 'text-white hover:bg-white/15')}>
        Cambiar tarjeta
      </Link>
      <button
        type="button"
        disabled={reintentar.isPending}
        onClick={() => reintentar.mutate()}
        className={cn(base, 'gap-1 disabled:opacity-70', claro ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-white/90 text-gray-900 hover:bg-white')}
      >
        {reintentar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
        Reintentar pago
      </button>
    </div>
  )
}

/** Aviso fijo bajo la cabecera según el estado de la cuenta. */
export function SuscripcionBanner() {
  const { data } = useMiSuscripcion()
  const user = useAuthStore((s) => s.user)
  const puedeElegir = isAdminOrSuperAdmin(user)
  const [invitacionDescartada, descartarInvitacion] = useInvitacionDescartada(useClinicaDeLaSuscripcion())
  const s = conEstado(data)
  if (!s) return null

  let tono: 'suave' | 'urgente' | 'grave'
  let texto: string
  const prep = s.estado === 'prueba' ? s.preparacion : null
  if (s.estado === 'prueba' && s.dias_restantes_prueba !== null) {
    const dias = s.dias_restantes_prueba
    tono = dias <= 3 ? 'urgente' : 'suave'
    texto = dias === 0
      ? 'Tu período de prueba termina hoy.'
      : dias === 1 ? 'Tu período de prueba termina mañana.' : `Te quedan ${dias} días de prueba gratuita.`
  } else if (s.estado === 'en_gracia') {
    tono = 'urgente'
    texto = s.puede_reintentar_pago
      ? `No se pudo cobrar la renovación${s.ultimo_rechazo ? ` (${s.ultimo_rechazo})` : ''}. Si no se resuelve, el ${fecha(s.solo_lectura_el)} tu cuenta quedará en solo lectura.`
      : `Hay un pago pendiente. Si no se resuelve, el ${fecha(s.solo_lectura_el)} tu cuenta quedará en solo lectura.`
  } else if (s.estado === 'solo_lectura' || s.estado === 'cancelada') {
    tono = 'grave'
    texto = s.puede_reintentar_pago
      ? `Tu cuenta está en solo lectura porque no se pudo cobrar la renovación${s.ultimo_rechazo ? ` (${s.ultimo_rechazo})` : ''}. Se suspenderá el ${fecha(s.suspension_el)}.`
      : `Tu cuenta está en solo lectura: puedes consultar tu información, pero no crear ni modificar nada. Se suspenderá el ${fecha(s.suspension_el)}.`
  } else if (invitarATarjeta(s) && s.pago_en_linea && puedeElegir && !invitacionDescartada) {
    return <InvitacionTarjeta onCerrar={descartarInvitacion} />
  } else {
    return null
  }

  return (
    <div className={cn(
      'flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium',
      tono === 'grave' && 'bg-destructive text-destructive-foreground',
      tono === 'urgente' && 'bg-amber-500 text-white',
      tono === 'suave' && 'border-b border-amber-400/30 bg-amber-400/20 text-amber-700',
    )}>
      {tono === 'grave' ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <Clock className="h-4 w-4 shrink-0" />}
      <span className="min-w-0 flex-1">
        {texto}
        {prep && !prep.todo_listo && (
          <>
            {' '}
            <Link href="/preparar-clinica" className="font-semibold underline underline-offset-2">
              Preparar mi clínica: {prep.completados} de {prep.total}
            </Link>
          </>
        )}
      </span>
      {puedeElegir && (s.puede_reintentar_pago
        ? <AccionesCobroPendiente />
        : <BotonElegirPlan s={s} className={tono === 'suave' ? 'bg-amber-600 text-white hover:bg-amber-700' : undefined} />)}
    </div>
  )
}

/** Explica una acción rechazada por solo lectura; si llega "suspendida",
 *  vuelve a pedir el estado para que aparezca la pantalla completa. */
export function AvisoSoloLecturaDialog() {
  const queryClient = useQueryClient()
  const { data } = useMiSuscripcion()
  const puedeElegir = isAdminOrSuperAdmin(useAuthStore((s) => s.user))
  const [mensaje, setMensaje] = useState<string | null>(null)

  useEffect(() => {
    function alBloquear(e: Event) {
      const detalle = (e as CustomEvent<{ code?: string; error?: string }>).detail
      queryClient.invalidateQueries({ queryKey: MI_SUSCRIPCION_KEY })
      if (detalle?.code === 'SUSCRIPCION_SOLO_LECTURA') setMensaje((actual) => actual ?? detalle.error ?? '')
    }
    window.addEventListener('cliniq:suscripcion-bloqueada', alBloquear)
    return () => window.removeEventListener('cliniq:suscripcion-bloqueada', alBloquear)
  }, [queryClient])

  const s = conEstado(data)

  return (
    <Dialog open={mensaje !== null} onOpenChange={(v) => { if (!v) setMensaje(null) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 shrink-0 text-destructive" />
            Tu cuenta está en solo lectura
          </DialogTitle>
          <DialogDescription className="leading-relaxed">{mensaje}</DialogDescription>
        </DialogHeader>
        <p className="rounded-lg bg-muted/60 px-3 py-2.5 text-[13px] leading-relaxed text-muted-foreground">
          {puedeElegir && s?.puede_reintentar_pago
            ? 'Tu información está a salvo. Al pagar la renovación con tu tarjeta (o con otra) vuelves a trabajar con normalidad, sin perder nada.'
            : puedeElegir
            ? 'Tu información está a salvo. Al activar un plan vuelves a trabajar con normalidad, sin perder nada.'
            : 'Tu información está a salvo. Avísale a quien administra la clínica para que active un plan.'}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setMensaje(null)}>Entendido</Button>
          {puedeElegir && s?.puede_reintentar_pago ? (
            <BotonReintentar onHecho={() => setMensaje(null)} />
          ) : puedeElegir && s && (s.pago_en_linea || s.contacto_ventas_url) && (
            <Button asChild>
              <ElegirPlanLink s={s} onClick={() => setMensaje(null)}>Elegir plan</ElegirPlanLink>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

const PROFESIONALES: { valor: NonNullable<PerfilBienvenida['profesionales']>; label: string }[] = [
  { valor: '1', label: 'Solo yo' },
  { valor: '2-3', label: '2 a 3' },
  { valor: '4-10', label: '4 a 10' },
  { valor: 'mas_10', label: 'Más de 10' },
]

const ESPECIALIDADES: { valor: NonNullable<PerfilBienvenida['especialidad']>; label: string }[] = [
  { valor: 'estetica', label: 'Medicina estética' },
  { valor: 'obesidad', label: 'Obesidad y nutrición' },
  { valor: 'dermatologia', label: 'Dermatología' },
  { valor: 'spa', label: 'Spa y bienestar' },
  { valor: 'otra', label: 'Otra' },
]

function Opciones<T extends string>({ opciones, valor, onChange }: {
  opciones: { valor: T; label: string }[]
  valor: T | undefined
  onChange: (v: T | undefined) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          aria-pressed={valor === o.valor}
          onClick={() => onChange(valor === o.valor ? undefined : o.valor)}
          className={cn(
            'rounded-full border px-3 py-1.5 text-sm transition-colors',
            valor === o.valor ? 'border-primary bg-primary/10 font-medium text-primary' : 'hover:bg-muted',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Primer ingreso de quien administra una clínica en prueba: dos preguntas
 *  opcionales y directo a "Preparar mi clínica". Sale una sola vez. */
export function BienvenidaPruebaDialog() {
  const queryClient = useQueryClient()
  const s = conEstado(useMiSuscripcion().data)
  const [profesionales, setProfesionales] = useState<PerfilBienvenida['profesionales']>()
  const [especialidad, setEspecialidad] = useState<PerfilBienvenida['especialidad']>()
  const mutation = useMutation({
    mutationFn: () => suscripcionesApi.guardarPerfil({ profesionales, especialidad }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: MI_SUSCRIPCION_KEY }),
  })

  function cerrar() {
    mutation.mutate()
  }

  const abierto = !!s?.bienvenida_pendiente && !mutation.isPending && !mutation.isSuccess

  return (
    <Dialog open={abierto} onOpenChange={(v) => { if (!v) cerrar() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Te damos la bienvenida a CliniQ</DialogTitle>
          <DialogDescription className="leading-relaxed">
            Tienes {s?.dias_restantes_prueba ?? 14} días de prueba con todo incluido. Dos preguntas rápidas, opcionales,
            para ayudarte mejor:
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">¿Cuántas personas atienden pacientes?</p>
            <Opciones<NonNullable<PerfilBienvenida['profesionales']>> opciones={PROFESIONALES} valor={profesionales} onChange={setProfesionales} />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">¿A qué se dedica tu clínica?</p>
            <Opciones<NonNullable<PerfilBienvenida['especialidad']>> opciones={ESPECIALIDADES} valor={especialidad} onChange={setEspecialidad} />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          El siguiente paso es preparar tu clínica: sede, equipo y procedimientos. Toma unos minutos y al final
          agendas tu primera cita.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={cerrar}>Ahora no</Button>
          <Button asChild>
            <Link href="/preparar-clinica" onClick={cerrar}>Preparar mi clínica</Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Pantalla completa de cuenta suspendida (solo entra quien la administra). */
export function CuentaSuspendida({ suscripcion }: { suscripcion: SuscripcionConContacto }) {
  const logout = useAuthStore((s) => s.logout)
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl border bg-white p-8 text-center shadow-sm">
        <Image src="/brand/cliniq-logo-horizontal.svg" alt="CliniQ" width={128} height={40} className="mx-auto h-auto w-[128px]" />
        <div className="mx-auto mt-8 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <Lock className="h-6 w-6 text-destructive" />
        </div>
        <h1 className="mt-4 text-xl font-semibold">La cuenta de {suscripcion.clinica_nombre} está suspendida</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {suscripcion.puede_reintentar_pago
            ? `Tu información está a salvo: no se ha borrado nada. No se pudo cobrar la renovación${suscripcion.ultimo_rechazo ? ` (${suscripcion.ultimo_rechazo})` : ''}; al pagarla vuelves a trabajar con todo tal como lo dejaste.`
            : 'Tu información está a salvo: no se ha borrado nada. Elige un plan para reactivar la cuenta y volver a trabajar con todo tal como lo dejaste.'}
        </p>
        <div className="mt-6 flex flex-col gap-2">
          {suscripcion.puede_reintentar_pago && (
            <>
              <BotonReintentar />
              <Button asChild variant="outline"><Link href={`${RUTA_PAGAR}?modo=tarjeta`}>Pagar con otra tarjeta</Link></Button>
            </>
          )}
          {!suscripcion.puede_reintentar_pago && (suscripcion.pago_en_linea || suscripcion.contacto_ventas_url) && (
            <Button asChild>
              <ElegirPlanLink s={suscripcion}>
                <MessageCircle className="mr-2 h-4 w-4" />
                {suscripcion.pago_en_linea ? 'Elegir plan' : 'Elegir plan por WhatsApp'}
              </ElegirPlanLink>
            </Button>
          )}
          <Button variant="ghost" onClick={() => logout()}>
            <LogOut className="mr-2 h-4 w-4" />
            Cerrar sesión
          </Button>
        </div>
      </div>
    </div>
  )
}

/** En AppShell: si la cuenta está suspendida, la pantalla completa reemplaza la app. */
export function useCuentaSuspendida() {
  const { data } = useMiSuscripcion()
  const isImpersonating = useAuthStore((s) => s.isImpersonating)
  // El superadmin entra igual (el backend no lo bloquea): ve la clínica, no la pantalla de suspendida.
  const superadmin = isSuperAdmin(useAuthStore((s) => s.user))
  const s = conEstado(data)
  return s && s.acceso === 'ninguno' && !isImpersonating && !superadmin ? s : null
}
