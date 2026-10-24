'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Clock, Lock, LogOut, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { suscripcionesApi } from '@/lib/api/suscripciones'
import { isAdminOrSuperAdmin, isSuperAdmin } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import type { MiSuscripcion, PerfilBienvenida, SuscripcionConContacto } from '@/types/suscripciones'

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

export function useMiSuscripcion() {
  const user = useAuthStore((s) => s.user)
  const habilitada = !!user && !isSuperAdmin(user) && !!user.clinica_id
  return useQuery({
    queryKey: MI_SUSCRIPCION_KEY,
    queryFn: suscripcionesApi.mia,
    enabled: habilitada,
    staleTime: 5 * 60 * 1000,
  })
}

export const RUTA_PAGAR = '/configuracion/plan/pagar'

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
      {s.estado === 'en_gracia' ? 'Actualizar tarjeta' : 'Elegir plan'}
    </ElegirPlanLink>
  )
}

/** Aviso fijo bajo la cabecera según el estado de la cuenta. */
export function SuscripcionBanner() {
  const { data } = useMiSuscripcion()
  const puedeElegir = isAdminOrSuperAdmin(useAuthStore((s) => s.user))
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
    texto = `Hay un pago pendiente. Si no se resuelve, el ${fecha(s.solo_lectura_el)} tu cuenta quedará en solo lectura.`
  } else if (s.estado === 'solo_lectura' || s.estado === 'cancelada') {
    tono = 'grave'
    texto = `Tu cuenta está en solo lectura: puedes consultar tu información, pero no crear ni modificar nada. Se suspenderá el ${fecha(s.suspension_el)}.`
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
      {puedeElegir && <BotonElegirPlan s={s} className={tono === 'suave' ? 'bg-amber-600 text-white hover:bg-amber-700' : undefined} />}
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
          {puedeElegir
            ? 'Tu información está a salvo. Al activar un plan vuelves a trabajar con normalidad, sin perder nada.'
            : 'Tu información está a salvo. Avísale a quien administra la clínica para que active un plan.'}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setMensaje(null)}>Entendido</Button>
          {puedeElegir && s && (s.pago_en_linea || s.contacto_ventas_url) && (
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
          Tu información está a salvo: no se ha borrado nada. Elige un plan para reactivar la cuenta y volver a
          trabajar con todo tal como lo dejaste.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          {(suscripcion.pago_en_linea || suscripcion.contacto_ventas_url) && (
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
  const s = conEstado(data)
  return s && s.acceso === 'ninguno' && !isImpersonating ? s : null
}
