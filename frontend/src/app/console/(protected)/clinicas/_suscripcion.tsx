'use client'

// Pestaña "Suscripción" del detalle de una clínica en la consola: estado de la
// cuenta (prueba, activa, mora, solo lectura, suspendida), extender la prueba y
// registrar un pago manual. El plan (límites y add-ons) se cambia en General.
// Prefijo `_` para que Next.js no lo trate como ruta.

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarPlus, Receipt } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { suscripcionesApi } from '@/lib/api/suscripciones'
import type { AdminTenant } from '@/types/admin'
import type { EstadoSuscripcion, SuscripcionAdmin } from '@/types/suscripciones'
import { serverErrorMessage } from './_shared'

export const ESTADO_SUSCRIPCION_BADGE: Record<EstadoSuscripcion, 'success' | 'warning' | 'info' | 'muted' | 'destructive'> = {
  prueba: 'info',
  activa: 'success',
  en_gracia: 'warning',
  solo_lectura: 'warning',
  cancelada: 'muted',
  suspendida: 'destructive',
}

const fecha = (iso: string | null) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

/** Resumen corto para el listado: "Prueba · 5 días", "Activa · manual", "Solo lectura". */
export function resumenSuscripcion(s: SuscripcionAdmin | null): string {
  if (!s) return 'Sin suscripción'
  if (s.estado === 'prueba' && s.dias_restantes_prueba !== null) {
    const dias = s.dias_restantes_prueba
    return `${s.estado_label} · ${dias === 0 ? 'termina hoy' : dias === 1 ? '1 día' : `${dias} días`}`
  }
  if (s.estado === 'activa') return `${s.estado_label} · ${s.modo_cobro === 'manual' ? 'manual' : 'tarjeta'}`
  return s.estado_label
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
      <p className="mt-1 text-sm font-medium">{valor}</p>
    </div>
  )
}

function useRefrescarTenant(tenantId: string) {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['admin-tenant', tenantId] })
    qc.invalidateQueries({ queryKey: ['admin-tenants'] })
    qc.invalidateQueries({ queryKey: ['admin-seguimiento'] })
  }
}

export function ExtenderPruebaDialog({ clinicaId, open, onClose }: { clinicaId: string; open: boolean; onClose: () => void }) {
  const refrescar = useRefrescarTenant(clinicaId)
  const [dias, setDias] = useState('7')
  const [motivo, setMotivo] = useState('')
  const mutation = useMutation({
    mutationFn: () => suscripcionesApi.extenderPrueba(clinicaId, { dias: Number(dias), motivo: motivo.trim() }),
    onSuccess: () => { refrescar(); onClose() },
  })
  const valido = Number(dias) >= 1 && Number(dias) <= 90 && motivo.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !mutation.isPending) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Extender prueba</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Si la prueba sigue vigente se suman los días a su fin; si ya venció y la clínica nunca pagó, se reabre desde hoy.
        </p>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="dias-prueba">Días</Label>
            <Input id="dias-prueba" type="number" min={1} max={90} value={dias} onChange={(e) => setDias(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="motivo-prueba">Motivo</Label>
            <Input id="motivo-prueba" placeholder="Ej.: pidió más tiempo para migrar pacientes" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
        </div>
        {mutation.isError && (
          <p className="text-sm text-destructive">{serverErrorMessage(mutation.error) ?? 'No se pudo extender la prueba.'}</p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} disabled={!valido || mutation.isPending}>
            {mutation.isPending ? 'Guardando…' : 'Extender'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function PagoManualDialog({ tenant, open, onClose }: { tenant: AdminTenant; open: boolean; onClose: () => void }) {
  const refrescar = useRefrescarTenant(tenant.id)
  const [sinVencimiento, setSinVencimiento] = useState(false)
  const [pagadoHasta, setPagadoHasta] = useState('')
  const [ciclo, setCiclo] = useState<'mensual' | 'anual'>('mensual')
  const [nota, setNota] = useState('')
  const mutation = useMutation({
    mutationFn: () => suscripcionesApi.pagoManual(tenant.id, {
      pagado_hasta: sinVencimiento ? null : pagadoHasta,
      ciclo,
      nota: nota.trim(),
    }),
    onSuccess: () => { refrescar(); onClose() },
  })
  const valido = sinVencimiento || !!pagadoHasta

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !mutation.isPending) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar pago manual</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          La cuenta queda activa con cobro manual. Al pasar la fecha de pagado hasta entra en mora y, 7 días después, en solo lectura.
        </p>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
            <Label htmlFor="sin-vencimiento" className="font-normal">Sin fecha de vencimiento</Label>
            <Switch id="sin-vencimiento" checked={sinVencimiento} onCheckedChange={setSinVencimiento} />
          </div>
          {!sinVencimiento && (
            <div className="space-y-1.5">
              <Label htmlFor="pagado-hasta">Pagado hasta (inclusive)</Label>
              <Input id="pagado-hasta" type="date" value={pagadoHasta} onChange={(e) => setPagadoHasta(e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Ciclo</Label>
            <Select value={ciclo} onValueChange={(v) => setCiclo(v as 'mensual' | 'anual')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mensual">Mensual</SelectItem>
                <SelectItem value="anual">Anual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nota-pago">Nota interna</Label>
            <Input id="nota-pago" placeholder="Ej.: transferencia Bancolombia del 21/10" value={nota} onChange={(e) => setNota(e.target.value)} />
          </div>
        </div>
        {mutation.isError && (
          <p className="text-sm text-destructive">{serverErrorMessage(mutation.error) ?? 'No se pudo registrar el pago.'}</p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} disabled={!valido || mutation.isPending}>
            {mutation.isPending ? 'Guardando…' : 'Registrar pago'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
export const BADGE_COBRO = { aprobado: 'success', pendiente: 'info', rechazado: 'warning', error: 'warning', anulado: 'muted' } as const

/** Cobros con tarjeta (Wompi) de la clínica, del más reciente al más antiguo. */
export async function abrirFacturaAdmin(referencia: string) {
  const ventana = window.open('', '_blank')
  try {
    const { url } = await suscripcionesApi.facturaPdfAdmin(referencia)
    if (ventana) ventana.location.href = url
  } catch {
    ventana?.close()
    window.alert('Alegra no devolvió el PDF de esta factura.')
  }
}

function CobrosClinica({ clinicaId }: { clinicaId: string }) {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['admin-cobros', clinicaId], queryFn: () => suscripcionesApi.cobrosClinica(clinicaId) })
  const reintentar = useMutation({
    mutationFn: (referencia: string) => suscripcionesApi.reintentarFactura(referencia),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin-cobros', clinicaId] }),
  })
  if (!data?.length) return null
  return (
    <div className="rounded-xl border bg-white">
      <p className="border-b px-5 py-3 text-sm font-semibold">Cobros con tarjeta</p>
      <div className="divide-y">
        {data.map(c => (
          <div key={c.referencia} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm">
            <div className="min-w-0">
              <p className="font-medium">{c.concepto_label} · {c.plan_nombre} · {c.ciclo}</p>
              <p className="text-xs text-muted-foreground">
                {fecha(c.created_at)} · periodo {fecha(c.periodo_inicio)} a {fecha(c.periodo_fin)} · {c.referencia}
                {c.tarjeta && ` · ${c.tarjeta}`}{c.mensaje && ` · ${c.mensaje}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {c.factura && (
                c.factura.estado === 'emitida' ? (
                  <Button size="sm" variant="ghost" onClick={() => abrirFacturaAdmin(c.referencia)}>Factura {c.factura.numero}</Button>
                ) : (
                  <Button size="sm" variant="outline" title={c.factura.ultimo_error} disabled={reintentar.isPending}
                    onClick={() => reintentar.mutate(c.referencia)}>
                    Factura {c.factura.estado_label.toLowerCase()} · reintentar
                  </Button>
                )
              )}
              <span className="font-semibold tabular-nums">{COP.format(Number(c.monto))}</span>
              <Badge variant={BADGE_COBRO[c.estado]}>{c.estado_label}</Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function SuscripcionConsola({ tenant }: { tenant: AdminTenant }) {
  const [extenderOpen, setExtenderOpen] = useState(false)
  const [pagoOpen, setPagoOpen] = useState(false)
  const s = tenant.suscripcion

  if (!s) {
    return (
      <div className="rounded-xl border bg-white p-5 text-sm text-muted-foreground">
        Esta clínica no tiene suscripción: no tiene ninguna restricción de acceso.
      </div>
    )
  }

  const nuncaPago = s.periodo_inicio === null
  const puedeExtender = s.estado === 'prueba' || (nuncaPago && (s.estado === 'solo_lectura' || s.estado === 'suspendida'))

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Badge variant={ESTADO_SUSCRIPCION_BADGE[s.estado]}>{s.estado_label}</Badge>
            <span className="text-sm text-muted-foreground">
              {s.modo_cobro === 'manual' ? 'Cobro manual' : 'Cobro automático'} · {s.ciclo}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {puedeExtender && (
              <Button size="sm" variant="outline" onClick={() => setExtenderOpen(true)}>
                <CalendarPlus className="mr-1.5 h-4 w-4" />
                Extender prueba
              </Button>
            )}
            <Button size="sm" onClick={() => setPagoOpen(true)}>
              <Receipt className="mr-1.5 h-4 w-4" />
              Registrar pago manual
            </Button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {s.prueba_termina_el && (
            <Dato
              etiqueta="Fin de la prueba"
              valor={<>{fecha(s.prueba_termina_el)}{s.dias_restantes_prueba !== null && <span className="text-muted-foreground"> · {s.dias_restantes_prueba} d</span>}</>}
            />
          )}
          {s.periodo_inicio && <Dato etiqueta="Periodo desde" valor={fecha(s.periodo_inicio)} />}
          {s.periodo_inicio && <Dato etiqueta="Pagado hasta" valor={s.periodo_fin ? fecha(s.periodo_fin) : 'Sin vencimiento'} />}
          <Dato etiqueta="En este estado desde" valor={fecha(s.estado_desde)} />
          {s.solo_lectura_el && <Dato etiqueta="Pasa a solo lectura" valor={fecha(s.solo_lectura_el)} />}
          {s.tarjeta && <Dato etiqueta="Tarjeta" valor={`${s.tarjeta.marca} •••• ${s.tarjeta.ultimos4}`} />}
          {s.proximo_cobro_el && (
            <Dato etiqueta="Próximo cobro" valor={`${fecha(s.proximo_cobro_el)}${s.precio_periodo ? ` · ${COP.format(Number(s.precio_periodo))}` : ''}`} />
          )}
          {s.cancelar_al_terminar_periodo && <Dato etiqueta="Renovación" valor="Cancelada al terminar el periodo" />}
          {s.intentos_fallidos > 0 && <Dato etiqueta="Cobros fallidos seguidos" valor={s.intentos_fallidos} />}
          {s.suspension_el && <Dato etiqueta="Se suspende" valor={fecha(s.suspension_el)} />}
        </div>

        {s.nota_interna && (
          <p className="mt-5 whitespace-pre-line rounded-lg bg-muted/60 px-3 py-2.5 text-sm text-muted-foreground">{s.nota_interna}</p>
        )}
      </div>

      <CobrosClinica clinicaId={tenant.id} />

      <p className="px-0.5 text-xs text-muted-foreground">
        El plan (límites y add-ons) se cambia en la pestaña General. Asignar un plan ya no activa la cuenta: registra el pago aquí.
      </p>

      <ExtenderPruebaDialog clinicaId={tenant.id} open={extenderOpen} onClose={() => setExtenderOpen(false)} />
      <PagoManualDialog tenant={tenant} open={pagoOpen} onClose={() => setPagoOpen(false)} />
    </div>
  )
}
