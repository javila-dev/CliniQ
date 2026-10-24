'use client'

// Pago de la suscripción con tarjeta (Wompi). Tres modos:
//  - contratar: plan y ciclo → datos de facturación → tarjeta → resultado
//  - tarjeta:   cambiar la tarjeta guardada (en mora, reintenta el cobro)
//  - plan:      subir (se cobra ya, prorrateado) o bajar de plan (al renovar)
//  - facturacion: corregir los datos de la factura sin pagar
// La tarjeta se tokeniza en el navegador directo con Wompi: su número nunca
// llega al servidor de CliniQ.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, CreditCard, Loader2, Lock, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MI_SUSCRIPCION_KEY } from '@/components/shared/SuscripcionAviso'
import { erroresFacturacion, FormFacturacion, type ErroresFacturacion } from './FormFacturacion'
import { suscripcionesApi, tokenizarTarjeta, type DatosTarjeta } from '@/lib/api/suscripciones'
import { cn } from '@/lib/utils'
import type { Ciclo, CobroSuscripcion, ConfigPago, DatosFacturacion, PlanPago, TarjetaNueva } from '@/types/suscripciones'

export type ModoPago = 'contratar' | 'tarjeta' | 'plan' | 'facturacion'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const FECHA = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
const fecha = (iso: string) => FECHA.format(new Date(`${iso}T12:00:00`))

function mensajeError(err: unknown): string {
  const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data
  if (data && typeof data.error === 'string') return data.error
  if (data) {
    for (const v of Object.values(data)) {
      if (Array.isArray(v) && typeof v[0] === 'string') return v[0]
      if (v && typeof v === 'object') {
        const interno = Object.values(v as Record<string, unknown>).find(x => Array.isArray(x)) as string[] | undefined
        if (interno?.[0]) return interno[0]
      }
    }
  }
  return err instanceof Error ? err.message : 'No se pudo completar la operación. Intenta de nuevo.'
}

// ─── Elegir plan y ciclo ──────────────────────────────────────────────────────

function ElegirPlan({ planes, plan, ciclo, actualId, onPlan, onCiclo }: {
  planes: PlanPago[]
  plan: string | null
  ciclo: Ciclo
  actualId?: string | null
  onPlan: (id: string) => void
  onCiclo: (c: Ciclo) => void
}) {
  const hayAnual = planes.some(p => p.descuento_anual_pct > 0)
  return (
    <div className="space-y-4">
      {hayAnual && (
        <div className="inline-flex rounded-lg border bg-white p-1 text-sm">
          {(['mensual', 'anual'] as const).map(c => (
            <button
              key={c}
              type="button"
              aria-pressed={ciclo === c}
              onClick={() => onCiclo(c)}
              className={cn('rounded-md px-3 py-1.5 font-medium', ciclo === c ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              {c === 'mensual' ? 'Mensual' : 'Anual, con descuento'}
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {planes.map(p => {
          const precio = Number(ciclo === 'anual' ? p.precio_anual : p.precio_mensual)
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={plan === p.id}
              disabled={!!p.bloqueo}
              onClick={() => onPlan(p.id)}
              className={cn(
                'rounded-xl border bg-white p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                plan === p.id ? 'border-primary ring-2 ring-primary/20' : 'hover:border-gray-300',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{p.nombre}</p>
                {actualId === p.id && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Actual</span>}
              </div>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {COP.format(precio)}
                <span className="text-sm font-normal text-muted-foreground"> /{ciclo === 'anual' ? 'año' : 'mes'}</span>
              </p>
              {ciclo === 'anual' && p.descuento_anual_pct > 0 && (
                <p className="text-xs text-emerald-700">Ahorras {p.descuento_anual_pct} % frente a pagar mes a mes</p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                {p.max_usuarios ? `Hasta ${p.max_usuarios} usuarios` : 'Usuarios ilimitados'} · {p.max_sedes ? `hasta ${p.max_sedes} ${p.max_sedes === 1 ? 'sede' : 'sedes'}` : 'sedes ilimitadas'}
              </p>
              {p.bloqueo ? (
                <p className="mt-2 text-xs text-destructive">{p.bloqueo}</p>
              ) : p.pierdes.length > 0 && (
                <p className="mt-2 text-xs text-amber-700">Dejas de tener: {p.pierdes.join(', ')}.</p>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Datos de facturación ──────────────────────────────────────────────────────

function Campo({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  )
}

// ─── Tarjeta y aceptaciones ────────────────────────────────────────────────────

const TARJETA_VACIA: DatosTarjeta = { numero: '', cvc: '', expira_mes: '', expira_anio: '', titular: '' }

function FormTarjeta({ tarjeta, onChange }: { tarjeta: DatosTarjeta; onChange: (t: DatosTarjeta) => void }) {
  const numero = tarjeta.numero.replace(/\D/g, '').slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ')
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      <div className="sm:col-span-4">
        <Campo id="numero-tarjeta" label="Número de la tarjeta">
          <Input id="numero-tarjeta" inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000"
            value={numero} onChange={e => onChange({ ...tarjeta, numero: e.target.value })} />
        </Campo>
      </div>
      <div className="sm:col-span-2">
        <Campo id="titular" label="Nombre como aparece en la tarjeta">
          <Input id="titular" autoComplete="cc-name" value={tarjeta.titular} onChange={e => onChange({ ...tarjeta, titular: e.target.value })} />
        </Campo>
      </div>
      <Campo id="vence" label="Vence (MM/AA)">
        <div className="flex items-center gap-1">
          <Input id="vence" inputMode="numeric" autoComplete="cc-exp-month" placeholder="MM" maxLength={2}
            value={tarjeta.expira_mes} onChange={e => onChange({ ...tarjeta, expira_mes: e.target.value.replace(/\D/g, '') })} />
          <span className="text-muted-foreground">/</span>
          <Input aria-label="Año de vencimiento" inputMode="numeric" autoComplete="cc-exp-year" placeholder="AA" maxLength={2}
            value={tarjeta.expira_anio} onChange={e => onChange({ ...tarjeta, expira_anio: e.target.value.replace(/\D/g, '') })} />
        </div>
      </Campo>
      <Campo id="cvc" label="CVC">
        <Input id="cvc" inputMode="numeric" autoComplete="cc-csc" maxLength={4} type="password"
          value={tarjeta.cvc} onChange={e => onChange({ ...tarjeta, cvc: e.target.value.replace(/\D/g, '') })} />
      </Campo>
    </div>
  )
}

function tarjetaCompleta(t: DatosTarjeta) {
  return t.numero.replace(/\D/g, '').length >= 13 && /^\d{2}$/.test(t.expira_mes.padStart(2, '0')) && t.expira_anio.length === 2
    && t.cvc.length >= 3 && t.titular.trim().length >= 3
}

function Aceptaciones({ config, valores, onChange, renovacion }: {
  config: ConfigPago
  valores: { wompi: boolean; datos: boolean; terminos: boolean }
  onChange: (v: { wompi: boolean; datos: boolean; terminos: boolean }) => void
  renovacion?: string
}) {
  const a = config.aceptacion!
  const fila = (clave: keyof typeof valores, contenido: React.ReactNode) => (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-relaxed">
      <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-primary" checked={valores[clave]}
        onChange={e => onChange({ ...valores, [clave]: e.target.checked })} />
      <span>{contenido}</span>
    </label>
  )
  return (
    <div className="space-y-2.5">
      {fila('wompi', <>Acepto los <a href={a.acceptance_permalink} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline-offset-2 hover:underline">términos y condiciones de Wompi</a>, la pasarela de pago.</>)}
      {fila('datos', <>Autorizo el <a href={a.personal_auth_permalink} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline-offset-2 hover:underline">tratamiento de mis datos personales</a> por parte de Wompi.</>)}
      {renovacion && fila('terminos', renovacion)}
    </div>
  )
}

// ─── Resultado del cobro ───────────────────────────────────────────────────────

function useEsperarCobro(referencia: string | null) {
  const [intentos, setIntentos] = useState(0)
  const query = useQuery({
    queryKey: ['pago-cobro', referencia],
    queryFn: () => suscripcionesApi.cobro(referencia!),
    enabled: !!referencia,
    refetchInterval: (q) => (q.state.data?.estado === 'pendiente' && intentos < 40 ? 2500 : false),
  })
  useEffect(() => {
    if (query.dataUpdatedAt) setIntentos(n => n + 1)
  }, [query.dataUpdatedAt])
  return query.data
}

function Resultado({ cobro, onReintentar }: { cobro: CobroSuscripcion; onReintentar: () => void }) {
  if (cobro.estado === 'pendiente') {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="font-medium">Procesando el pago…</p>
        <p className="max-w-sm text-sm text-muted-foreground">El banco está confirmando el cobro. No cierres esta página; suele tardar unos segundos.</p>
      </div>
    )
  }
  if (cobro.estado === 'aprobado') {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-500" />
        <p className="text-lg font-semibold">Pago aprobado</p>
        <p className="max-w-md text-sm text-muted-foreground">
          {cobro.concepto === 'cambio_plan'
            ? `Ya tienes el plan ${cobro.plan_nombre}. Se cobraron ${COP.format(Number(cobro.monto))} por los días que quedan del periodo.`
            : `Tu plan ${cobro.plan_nombre} quedó activo del ${fecha(cobro.periodo_inicio)} al ${fecha(cobro.periodo_fin)}. Se renueva automáticamente con esta tarjeta.`}
        </p>
        <Button asChild className="mt-2"><Link href="/configuracion/plan">Ver mi plan</Link></Button>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <XCircle className="h-10 w-10 text-destructive" />
      <p className="text-lg font-semibold">El pago no fue aprobado</p>
      <p className="max-w-md text-sm text-muted-foreground">{cobro.mensaje || 'El banco rechazó el cobro.'} No se te cobró nada. Puedes intentar con otra tarjeta.</p>
      <Button className="mt-2" onClick={onReintentar}>Intentar con otra tarjeta</Button>
    </div>
  )
}

// ─── Pantalla ─────────────────────────────────────────────────────────────────

export function PagoSuscripcion({ modo }: { modo: ModoPago }) {
  const queryClient = useQueryClient()
  const { data: config, isLoading, error } = useQuery({ queryKey: ['pago-config'], queryFn: suscripcionesApi.configPago, staleTime: 0 })

  const [paso, setPaso] = useState(modo === 'tarjeta' ? 3 : 1)
  const [plan, setPlan] = useState<string | null>(null)
  const [ciclo, setCiclo] = useState<Ciclo>('mensual')
  const [facturacion, setFacturacion] = useState<DatosFacturacion | null>(null)
  const [tarjeta, setTarjeta] = useState<DatosTarjeta>(TARJETA_VACIA)
  const [acepta, setAcepta] = useState({ wompi: false, datos: false, terminos: false })
  const [referencia, setReferencia] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  // Errores de facturación: los del navegador se muestran al intentar seguir;
  // los del servidor, siempre (p. ej. si cambió una regla).
  const [mostrarErrores, setMostrarErrores] = useState(false)
  const [erroresServidor, setErroresServidor] = useState<ErroresFacturacion>({})
  const cobro = useEsperarCobro(referencia)

  useEffect(() => {
    if (!config?.disponible) return
    setFacturacion(f => f ?? config.datos_facturacion ?? null)
    if (modo === 'facturacion' && Object.keys(config.datos_facturacion_faltantes ?? {}).length) setMostrarErrores(true)
    setCiclo(c => (config.suscripcion?.estado === 'activa' ? config.suscripcion.ciclo : c))
    // Por defecto, el plan actual o el primero que se pueda contratar con el uso de hoy.
    setPlan(p => p ?? (modo === 'plan' ? null : config.plan_actual_id ?? config.planes?.find(x => !x.bloqueo)?.id ?? null))
  }, [config, modo])

  useEffect(() => {
    if (cobro && cobro.estado !== 'pendiente') {
      queryClient.invalidateQueries({ queryKey: MI_SUSCRIPCION_KEY })
      queryClient.invalidateQueries({ queryKey: ['pago-cobros'] })
    }
  }, [cobro, queryClient])

  const planElegido = useMemo(() => config?.planes?.find(p => p.id === plan) ?? null, [config, plan])
  const total = planElegido ? Number(ciclo === 'anual' ? planElegido.precio_anual : planElegido.precio_mensual) : 0

  const enviar = useMutation({
    mutationFn: async () => {
      setAviso(null)
      if (modo === 'plan') return { cambio: await suscripcionesApi.cambiarPlan({ plan: plan!, ciclo }) }
      if (modo === 'facturacion') return { facturacion: await suscripcionesApi.guardarFacturacion(facturacion!) }
      // Wompi acepta cada token de aceptación una sola vez: se piden de nuevo en
      // cada intento (p. ej. al reintentar con otra tarjeta tras un rechazo).
      const fresco = await queryClient.fetchQuery({ queryKey: ['pago-config'], queryFn: suscripcionesApi.configPago, staleTime: 0 })
      const { token, tarjeta: vista } = await tokenizarTarjeta(fresco.url_api!, fresco.llave_publica!, tarjeta)
      const base: TarjetaNueva = {
        token,
        acceptance_token: fresco.aceptacion!.acceptance_token,
        accept_personal_auth: fresco.aceptacion!.personal_auth_token,
        tarjeta: vista,
      }
      if (modo === 'tarjeta') return { tarjeta: await suscripcionesApi.cambiarTarjeta(base) }
      return { cobro: await suscripcionesApi.contratar({ ...base, plan: plan!, ciclo, acepta_terminos: acepta.terminos, datos_facturacion: facturacion! }) }
    },
    onSuccess: (r) => {
      setTarjeta(TARJETA_VACIA)
      if ('cobro' in r && r.cobro) setReferencia(r.cobro.referencia)
      else if ('cambio' in r && r.cambio?.cobro) setReferencia(r.cambio.cobro.referencia)
      else {
        queryClient.invalidateQueries({ queryKey: MI_SUSCRIPCION_KEY })
        setAviso('tarjeta' in r
          ? 'Listo: la tarjeta quedó guardada para los próximos cobros.'
          : 'facturacion' in r
            ? 'Listo: tus datos de facturación quedaron completos. Las próximas facturas saldrán con ellos.'
            : 'Listo: el cambio se aplicará desde la próxima renovación.')
      }
    },
    onError: (err) => {
      // Datos de facturación rechazados por el servidor: de vuelta al formulario, con cada error en su campo.
      const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data
      const porCampo = (modo === 'facturacion' ? data : data?.datos_facturacion) as Record<string, string[] | string> | undefined
      if (porCampo && typeof porCampo === 'object' && !('error' in porCampo)) {
        setErroresServidor(Object.fromEntries(Object.entries(porCampo).map(([k, v]) => [k, Array.isArray(v) ? v[0] : String(v)])))
        if (modo === 'contratar') setPaso(2)
        setAviso('Revisa los datos de facturación marcados.')
        return
      }
      setAviso(mensajeError(err))
    },
  })

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (error || !config) return <p className="py-10 text-center text-sm text-destructive">{mensajeError(error)}</p>
  if (!config.disponible) {
    return <p className="py-10 text-center text-sm text-muted-foreground">El pago en línea no está disponible. Escríbenos para activar tu plan.</p>
  }

  if (cobro) return <Resultado cobro={cobro} onReintentar={() => { setReferencia(null); setPaso(modo === 'plan' ? 1 : 3) }} />
  if (aviso && !enviar.isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-500" />
        <p className="max-w-md text-sm">{aviso}</p>
        <Button asChild><Link href="/configuracion/plan">Ver mi plan</Link></Button>
      </div>
    )
  }

  const renovacionTexto = planElegido
    ? `Entiendo que el plan ${planElegido.nombre} se cobra hoy y se renueva automáticamente cada ${ciclo === 'anual' ? 'año' : 'mes'} con esta tarjeta hasta que cancele la renovación desde Configuración → Plan, y acepto los términos de servicio de CliniQ.`
    : undefined

  const pasos = modo === 'contratar' ? ['Plan', 'Facturación', 'Pago'] : []
  const ubicaciones = config.ubicaciones ?? {}
  const erroresLocales = facturacion ? erroresFacturacion(facturacion, ubicaciones) : {}
  const facturacionValida = !!facturacion && Object.keys(erroresLocales).length === 0
  const erroresVisibles: ErroresFacturacion = { ...(mostrarErrores ? erroresLocales : {}), ...erroresServidor }

  function cambiarFacturacion(d: DatosFacturacion) {
    setFacturacion(d)
    setErroresServidor({})
  }

  function seguir() {
    if (paso === 2 && !facturacionValida) {
      setMostrarErrores(true)
      return
    }
    setPaso(p => p + 1)
  }
  const puedePagar = tarjetaCompleta(tarjeta) && acepta.wompi && acepta.datos && (modo !== 'contratar' || acepta.terminos)

  return (
    <div className="space-y-6">
      {config.ambiente === 'sandbox' && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Modo de pruebas de Wompi: no se cobra dinero real. Tarjeta aprobada: 4242 4242 4242 4242; rechazada: 4111 1111 1111 1111.
        </p>
      )}

      {pasos.length > 0 && (
        <ol className="flex gap-4 text-sm">
          {pasos.map((nombre, i) => (
            <li key={nombre} className={cn('flex items-center gap-2', paso === i + 1 ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
              <span className={cn('flex h-6 w-6 items-center justify-center rounded-full text-xs', paso > i ? 'bg-primary text-primary-foreground' : 'bg-muted')}>{i + 1}</span>
              {nombre}
            </li>
          ))}
        </ol>
      )}

      {(modo === 'plan' || (modo === 'contratar' && paso === 1)) && config.planes && (
        <ElegirPlan planes={config.planes} plan={plan} ciclo={ciclo} actualId={config.plan_actual_id} onPlan={setPlan} onCiclo={setCiclo} />
      )}

      {((modo === 'contratar' && paso === 2) || modo === 'facturacion') && facturacion && (
        <FormFacturacion
          datos={facturacion}
          onChange={cambiarFacturacion}
          errores={erroresVisibles}
          ubicaciones={ubicaciones}
          responsabilidades={config.responsabilidades_fiscales ?? {}}
        />
      )}

      {modo !== 'plan' && modo !== 'facturacion' && paso === 3 && (
        <div className="space-y-5">
          {modo === 'contratar' && planElegido && (
            <div className="rounded-xl border bg-muted/40 p-4 text-sm">
              <p className="font-medium">Plan {planElegido.nombre} · {ciclo === 'anual' ? 'anual' : 'mensual'}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{COP.format(total)}</p>
              {config.suscripcion?.estado === 'prueba' && (
                <p className="mt-1 text-muted-foreground">Se cobra hoy y el periodo empieza cuando termine tu prueba: no pierdes los días que te quedan.</p>
              )}
            </div>
          )}
          <FormTarjeta tarjeta={tarjeta} onChange={setTarjeta} />
          <Aceptaciones config={config} valores={acepta} onChange={setAcepta} renovacion={modo === 'contratar' ? renovacionTexto : undefined} />
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5" /> Los datos de la tarjeta van directo a Wompi; CliniQ no los ve ni los guarda.
          </p>
        </div>
      )}

      {enviar.isError && aviso && <p className="text-sm text-destructive">{aviso}</p>}

      <div className="flex justify-between gap-2">
        {modo === 'contratar' && paso > 1 ? (
          <Button variant="ghost" onClick={() => setPaso(p => p - 1)} disabled={enviar.isPending}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Atrás
          </Button>
        ) : <Button variant="ghost" asChild><Link href="/configuracion/plan">Cancelar</Link></Button>}

        {modo === 'contratar' && paso < 3 ? (
          <Button onClick={seguir} disabled={paso === 1 && !plan}>Continuar</Button>
        ) : modo === 'facturacion' ? (
          <Button onClick={() => (facturacionValida ? enviar.mutate() : setMostrarErrores(true))} disabled={enviar.isPending}>
            {enviar.isPending ? 'Guardando…' : 'Guardar datos'}
          </Button>
        ) : modo === 'plan' ? (
          <Button onClick={() => enviar.mutate()} disabled={!plan || plan === config.plan_actual_id && ciclo === config.suscripcion?.ciclo || enviar.isPending}>
            {enviar.isPending ? 'Guardando…' : 'Cambiar de plan'}
          </Button>
        ) : (
          <Button onClick={() => enviar.mutate()} disabled={!puedePagar || enviar.isPending}>
            {enviar.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CreditCard className="mr-1.5 h-4 w-4" />}
            {modo === 'tarjeta' ? 'Guardar tarjeta' : `Pagar ${COP.format(total)}`}
          </Button>
        )}
      </div>
    </div>
  )
}
