'use client'

import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, BadgeCheck, Building2, CalendarClock, CreditCard, MessageCircle, Receipt, RefreshCw, ScanFace, Smartphone, Sparkles, Users } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { useAuthStore } from '@/store/authStore'
import { clinicasApi } from '@/lib/api/clinicas'
import { cn } from '@/lib/utils'
import { EtiquetaAjuste, FilaAjuste, NotaAjuste, SeccionAjustes } from '@/components/configuracion/ajustes'
import { Button } from '@/components/ui/button'
import { BotonReintentar, conEstado, ElegirPlanLink, inicioConTarjeta, invitarATarjeta, MI_SUSCRIPCION_KEY, RUTA_PAGAR, useMiSuscripcion } from '@/components/shared/SuscripcionAviso'
import { suscripcionesApi } from '@/lib/api/suscripciones'
import { isAdminOrSuperAdmin } from '@/lib/permissions'
import type { CobroSuscripcion, Suscripcion } from '@/types/suscripciones'

// Estado de la cuenta, lo que incluye el plan y cuánto se lleva usado. Con pago
// en línea, quien administra elige o cambia de plan, cambia la tarjeta y cancela
// la renovación desde aquí; sin él, "Elegir plan" abre un WhatsApp con ventas.
// Los add-ons los sigue activando el equipo de CliniQ.

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const FECHA_CORTA = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
const fechaCorta = (iso: string) => FECHA_CORTA.format(new Date(iso.length === 10 ? `${iso}T12:00:00` : iso))

/** El enlace del PDF lo da Alegra en el momento: se abre la pestaña antes de
 *  pedirlo para que el navegador no la bloquee como ventana emergente. */
async function abrirFactura(referencia: string) {
  const ventana = window.open('', '_blank')
  try {
    const { url } = await suscripcionesApi.facturaPdf(referencia)
    if (ventana) ventana.location.href = url
  } catch {
    ventana?.close()
    window.alert('No pudimos abrir la factura en este momento. Intenta de nuevo.')
  }
}

const TONO_COBRO: Record<CobroSuscripcion['estado'], 'activo' | 'aviso' | 'neutro'> = {
  aprobado: 'activo', pendiente: 'neutro', rechazado: 'aviso', error: 'aviso', anulado: 'neutro',
}

const FECHA_LARGA = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
const fechaLarga = (iso: string | null) => (iso ? FECHA_LARGA.format(new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)) : '')

const TONO_ESTADO: Record<Suscripcion['estado'], 'activo' | 'aviso' | 'neutro' | 'marca'> = {
  prueba: 'marca',
  activa: 'activo',
  en_gracia: 'aviso',
  solo_lectura: 'aviso',
  cancelada: 'neutro',
  suspendida: 'aviso',
}

/** La fecha que importa según el estado: fin de la prueba, pagado hasta, suspensión. */
function proximaFecha(s: Suscripcion): string {
  if (s.estado === 'prueba') return `La prueba gratuita termina el ${fechaLarga(s.prueba_termina_el)}.`
  if (s.estado === 'en_gracia') return `Hay un pago pendiente. El ${fechaLarga(s.solo_lectura_el)} la cuenta pasará a solo lectura.`
  if (s.estado === 'solo_lectura' || s.estado === 'cancelada') return `Puedes consultar tu información, pero no crear ni modificar nada. Se suspenderá el ${fechaLarga(s.suspension_el)}.`
  if (s.periodo_fin) return `Pagado hasta el ${fechaLarga(s.periodo_fin)}.`
  return 'Sin fecha de vencimiento.'
}

/** Fila de consumo: "usado / incluido" a la derecha y barra debajo; se pone ámbar al pasar el 80 %. */
function FilaConsumo({ icono, titulo, descripcion, usado, incluido, unidad }: {
  icono: React.ElementType
  titulo: string
  descripcion: React.ReactNode
  usado: number
  incluido: number | null
  unidad: string
}) {
  const pct = incluido ? Math.min((usado / incluido) * 100, 100) : 0
  return (
    <FilaAjuste
      icono={icono}
      titulo={titulo}
      descripcion={descripcion}
      contenido={incluido !== null && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className={cn('h-full rounded-full', pct >= 80 ? 'bg-amber-500' : 'bg-primary')} style={{ width: `${pct}%` }} />
        </div>
      )}
    >
      <p className="text-sm tabular-nums">
        <span className="font-semibold">{usado}</span>
        <span className="text-muted-foreground"> / {incluido ?? '∞'} {unidad}</span>
      </p>
    </FilaAjuste>
  )
}

function FilasCargando({ filas }: { filas: number }) {
  return (
    <>
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5">
          <div className="h-8 w-8 shrink-0 animate-pulse rounded-lg bg-muted" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-40 animate-pulse rounded bg-muted" />
            <div className="h-2.5 w-64 max-w-full animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </>
  )
}

export default function PlanConfigPage() {
  const { user } = useAuthStore()
  const clinicaId = user?.clinica_id

  const { data: clinica, isLoading } = useQuery({
    queryKey: ['mi-clinica', clinicaId],
    queryFn: () => clinicasApi.miClinica(clinicaId),
    enabled: !!clinicaId,
  })
  const { data: planUsuarios } = useQuery({ queryKey: ['mi-plan'], queryFn: clinicasApi.getMiPlan })
  const { data: planSedes } = useQuery({ queryKey: ['sedes-limite'], queryFn: clinicasApi.getSedesLimite })

  const { data: miSuscripcion } = useMiSuscripcion()
  const suscripcion = conEstado(miSuscripcion)
  const esAdmin = isAdminOrSuperAdmin(user)
  const conTarjeta = !!suscripcion?.pago_en_linea && suscripcion.modo_cobro === 'automatico' && !!suscripcion.tarjeta
    && (suscripcion.estado === 'activa' || suscripcion.estado === 'en_gracia')
  const queryClient = useQueryClient()
  const { data: historial } = useQuery({
    queryKey: ['pago-cobros'],
    queryFn: suscripcionesApi.cobros,
    enabled: !!suscripcion?.pago_en_linea && esAdmin,
  })
  const renovacion = useMutation({
    mutationFn: (cancelar: boolean) => suscripcionesApi.cancelarRenovacion(cancelar),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MI_SUSCRIPCION_KEY }),
  })

  const whatsapp = clinica?.whatsapp_uso

  const addons = [
    { icono: ScanFace, titulo: 'Verificación facial', detalle: 'Compara la foto en vivo del paciente con su foto de control al llegar.', activo: !!clinica?.facial_verificacion_habilitada },
    { icono: Sparkles, titulo: 'Módulo estético', detalle: 'Procedimientos y zonas corporales en la atención y la historia.', activo: !!clinica?.modulo_estetico_habilitado },
    { icono: Smartphone, titulo: 'WhatsApp con número propio', detalle: 'Tus pacientes reciben los mensajes desde el WhatsApp de tu clínica y te responden a ti.', activo: !!clinica?.whatsapp_numero_propio_habilitado },
  ]

  return (
    <div className="space-y-6">
      <PageHeader title="Plan" description="Lo que incluye tu plan y cuánto llevas usado este mes." />

      <div className="space-y-7">
        {suscripcion && (
          <SeccionAjustes
            titulo="Tu cuenta"
            descripcion="Estado de la suscripción de tu clínica a CliniQ."
            accion={esAdmin && !conTarjeta && !suscripcion.puede_reintentar_pago && suscripcion.estado !== 'activa' && (suscripcion.pago_en_linea || suscripcion.contacto_ventas_url) && (
              <Button asChild size="sm">
                <ElegirPlanLink s={suscripcion}>Elegir plan</ElegirPlanLink>
              </Button>
            )}
          >
            <FilaAjuste
              icono={BadgeCheck}
              titulo={suscripcion.plan_nombre ? `Plan ${suscripcion.plan_nombre}` : 'Sin plan asignado'}
              descripcion={suscripcion.estado === 'prueba' ? 'Durante la prueba tienes acceso a todo.' : `Cobro ${suscripcion.ciclo}.`}
            >
              <EtiquetaAjuste tono={TONO_ESTADO[suscripcion.estado]}>{suscripcion.estado_label}</EtiquetaAjuste>
            </FilaAjuste>
            <FilaAjuste icono={CalendarClock} titulo="Fechas" descripcion={proximaFecha(suscripcion)}>
              {suscripcion.estado === 'prueba' && suscripcion.dias_restantes_prueba !== null && (
                <EtiquetaAjuste tono="aviso">
                  {suscripcion.dias_restantes_prueba === 0
                    ? 'Termina hoy'
                    : suscripcion.dias_restantes_prueba === 1 ? 'Termina mañana' : `Quedan ${suscripcion.dias_restantes_prueba} días`}
                </EtiquetaAjuste>
              )}
            </FilaAjuste>
            {suscripcion.puede_reintentar_pago && esAdmin && (
              <FilaAjuste
                icono={AlertTriangle}
                titulo="Pago pendiente"
                descripcion={`No se pudo cobrar la renovación${suscripcion.ultimo_rechazo ? ` (${suscripcion.ultimo_rechazo})` : ''}. Si ya resolviste con tu banco, cóbrala ahora con tu tarjeta; si no, cámbiala abajo.`}
              >
                <BotonReintentar size="sm" />
              </FilaAjuste>
            )}
            {conTarjeta && (
              <>
                <FilaAjuste
                  icono={RefreshCw}
                  titulo="Próximo cobro"
                  descripcion={
                    suscripcion.cancelar_al_terminar_periodo
                      ? `No se renovará: tu plan termina el ${fechaLarga(suscripcion.periodo_fin)}.`
                      : suscripcion.proximo_cobro_el
                        ? `${fechaLarga(suscripcion.proximo_cobro_el)} · ${COP.format(Number(suscripcion.precio_periodo ?? 0))}${suscripcion.plan_pendiente_nombre || suscripcion.ciclo_pendiente ? ` · desde esa renovación: ${suscripcion.plan_pendiente_nombre ?? suscripcion.plan_nombre} ${suscripcion.ciclo_pendiente || suscripcion.ciclo}` : ''}`
                        : 'Sin cobro programado.'
                  }
                >
                  {esAdmin && (
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button asChild size="sm" variant="outline"><Link href={`${RUTA_PAGAR}?modo=plan`}>Cambiar de plan</Link></Button>
                      <Button size="sm" variant="ghost" disabled={renovacion.isPending}
                        onClick={() => renovacion.mutate(!suscripcion.cancelar_al_terminar_periodo)}>
                        {suscripcion.cancelar_al_terminar_periodo ? 'Reanudar renovación' : 'Cancelar renovación'}
                      </Button>
                    </div>
                  )}
                </FilaAjuste>
                <FilaAjuste
                  icono={CreditCard}
                  titulo={`${suscripcion.tarjeta!.marca || 'Tarjeta'} •••• ${suscripcion.tarjeta!.ultimos4}`}
                  descripcion={suscripcion.tarjeta!.expira_mes ? `Vence ${suscripcion.tarjeta!.expira_mes}/${suscripcion.tarjeta!.expira_anio}` : 'Tarjeta para el cobro automático.'}
                >
                  {esAdmin && <Button asChild size="sm" variant="outline"><Link href={`${RUTA_PAGAR}?modo=tarjeta`}>Cambiar tarjeta</Link></Button>}
                </FilaAjuste>
              </>
            )}
            {invitarATarjeta(suscripcion) && suscripcion.pago_en_linea && esAdmin && (
              <FilaAjuste
                icono={CreditCard}
                titulo="Paga con tarjeta"
                descripcion={`Hoy pagas a mano. Con tarjeta tu plan se renueva solo cada ${suscripcion.ciclo === 'anual' ? 'año' : 'mes'} y recibes la factura electrónica de cada pago. ${
                  inicioConTarjeta(suscripcion)
                    ? `Lo que ya pagaste se respeta: el primer periodo con tarjeta empieza el ${inicioConTarjeta(suscripcion)}.`
                    : 'El primer cobro se hace al registrarla.'
                }`}
              >
                <Button asChild size="sm"><Link href={RUTA_PAGAR}>Registrar tarjeta</Link></Button>
              </FilaAjuste>
            )}
            {suscripcion.pago_en_linea && esAdmin && (
              <FilaAjuste
                icono={Receipt}
                titulo="Datos de facturación"
                descripcion={suscripcion.facturacion_incompleta
                  ? 'Faltan datos para emitir tu factura electrónica. Complétalos con la información del RUT.'
                  : 'A nombre de quién sale la factura electrónica de tu suscripción.'}
                extra={suscripcion.facturacion_incompleta && <EtiquetaAjuste tono="aviso">Incompletos</EtiquetaAjuste>}
              >
                <Button asChild size="sm" variant="outline"><Link href={`${RUTA_PAGAR}?modo=facturacion`}>Editar</Link></Button>
              </FilaAjuste>
            )}
          </SeccionAjustes>
        )}

        {!!historial?.length && (
          <SeccionAjustes titulo="Pagos" descripcion="Cobros de tu suscripción a CliniQ.">
            {historial.map(c => (
              <FilaAjuste
                key={c.referencia}
                icono={Receipt}
                titulo={`${c.concepto_label} · ${c.plan_nombre}`}
                descripcion={`${fechaCorta(c.created_at)} · periodo ${fechaCorta(c.periodo_inicio)} a ${fechaCorta(c.periodo_fin)}${c.tarjeta ? ` · ${c.tarjeta}` : ''}${c.mensaje && c.estado !== 'aprobado' ? ` · ${c.mensaje}` : ''}`}
              >
                <div className="flex items-center gap-2">
                  {c.factura?.estado === 'emitida' && (
                    <Button size="sm" variant="ghost" onClick={() => abrirFactura(c.referencia)}>Factura {c.factura.numero}</Button>
                  )}
                  <span className="text-sm font-semibold tabular-nums">{COP.format(Number(c.monto))}</span>
                  <EtiquetaAjuste tono={TONO_COBRO[c.estado]}>{c.estado_label}</EtiquetaAjuste>
                </div>
              </FilaAjuste>
            ))}
          </SeccionAjustes>
        )}

        <SeccionAjustes
          titulo="Consumo"
          descripcion="Lo que llevas usado frente a lo que incluye tu plan."
        >
          {isLoading ? <FilasCargando filas={3} /> : (
            <>
              {clinica?.whatsapp_habilitado && whatsapp ? (
                <FilaConsumo
                  icono={MessageCircle}
                  titulo="Envíos por WhatsApp"
                  descripcion={
                    <>
                      Cotizaciones, firmas, check-in por código y recordatorios. Se reinicia cada mes.{' '}
                      <Link href="/configuracion/whatsapp/consumo" className="font-medium text-primary underline-offset-2 hover:underline">
                        Ver detalle
                      </Link>
                    </>
                  }
                  usado={whatsapp.envios_realizados}
                  incluido={whatsapp.sin_limite ? null : whatsapp.envios_incluidos}
                  unidad="este mes"
                />
              ) : (
                <FilaAjuste
                  icono={MessageCircle}
                  apagada
                  titulo="Envíos por WhatsApp"
                  descripcion="Envía cotizaciones, firmas y recordatorios por WhatsApp, y verifica la llegada del paciente por código. Contáctanos para activarlo en tu plan."
                >
                  <EtiquetaAjuste>No incluido</EtiquetaAjuste>
                </FilaAjuste>
              )}
              {planUsuarios && (
                <FilaConsumo
                  icono={Users}
                  titulo="Usuarios activos"
                  descripcion="Cuentas del equipo que pueden entrar a CliniQ."
                  usado={planUsuarios.usuarios_activos}
                  incluido={planUsuarios.sin_limite ? null : planUsuarios.max_usuarios}
                  unidad="usuarios"
                />
              )}
              {planSedes && typeof planSedes.sedes_activas === 'number' && (
                <FilaConsumo
                  icono={Building2}
                  titulo="Sedes"
                  descripcion="Sucursales activas de la clínica."
                  usado={planSedes.sedes_activas}
                  incluido={planSedes.sin_limite ? null : planSedes.max_sedes}
                  unidad="sedes"
                />
              )}
            </>
          )}
        </SeccionAjustes>

        <SeccionAjustes titulo="Add-ons y módulos" descripcion="Funciones que se suman a tu plan.">
          {isLoading ? <FilasCargando filas={3} /> : (
            <>
              {addons.map((a) => (
                <FilaAjuste key={a.titulo} icono={a.icono} apagada={!a.activo} titulo={a.titulo} descripcion={a.detalle}>
                  <EtiquetaAjuste tono={a.activo ? 'activo' : 'neutro'}>{a.activo ? 'Incluido' : 'No incluido'}</EtiquetaAjuste>
                </FilaAjuste>
              ))}
              <NotaAjuste>Para cambiar de plan o activar un add-on, escríbenos.</NotaAjuste>
            </>
          )}
        </SeccionAjustes>
      </div>
    </div>
  )
}
