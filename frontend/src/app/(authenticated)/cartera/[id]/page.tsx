'use client'

import { use, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { ArrowLeft, ArrowUpRight, HandCoins, Wallet } from 'lucide-react'
import { carteraApi } from '@/lib/api/cartera'
import { useAuthStore } from '@/store/authStore'
import { hasPermission, PERM } from '@/lib/permissions'
import { NuevoAcuerdoPagoModal } from '@/components/cartera/NuevoAcuerdoPagoModal'
import { CompromisoPagoFirmaContent } from '@/components/consentimientos/CompromisoPagoFirmaContent'
import { AcuerdoPendienteAviso } from '@/components/cartera/detalle/AcuerdoPendienteAviso'
import { AcuerdosHistorial } from '@/components/cartera/detalle/AcuerdosHistorial'
import { CuotasTabla } from '@/components/cartera/detalle/CuotasTabla'
import { RegistrarPagoModal } from '@/components/cartera/detalle/RegistrarPagoModal'
import { ResumenCarteraPanel } from '@/components/cartera/detalle/ResumenCarteraPanel'
import { estadoCartera, saldoCuota, type EstadoCarteraUI } from '@/components/cartera/detalle/utils'
import { HelpButton } from '@/components/ayuda/HelpButton'
import { LoadingState } from '@/components/shared/LoadingState'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn, formatDate } from '@/lib/utils'
import type { CuotaCartera } from '@/types/cartera'

const ESTADO_CARTERA: Record<EstadoCarteraUI, { label: string; className: string }> = {
  saldada: { label: 'Saldada', className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950/30 dark:text-emerald-300' },
  mora: { label: 'En mora', className: 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-950/30 dark:text-rose-300' },
  al_dia: { label: 'Al día', className: 'bg-muted text-foreground ring-border' },
}

export default function DetalleCarteraPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const canModificarPlazo = hasPermission(user, PERM.CARTERA_MODIFICAR_PLAZO)
  const [cuotaSeleccionada, setCuotaSeleccionada] = useState<CuotaCartera | null>(null)
  const [showNuevoAcuerdo, setShowNuevoAcuerdo] = useState(false)
  const [showFirmaAcuerdo, setShowFirmaAcuerdo] = useState(false)

  const { data: cartera, isLoading } = useQuery({
    queryKey: ['cartera', id],
    queryFn: () => carteraApi.get(id),
  })

  if (isLoading) return <div className="p-8"><LoadingState rows={8} /></div>
  if (!cartera) return null

  const acuerdoPendiente = cartera.acuerdo_pendiente ?? null
  const cuotas = cartera.cuotas ?? []
  const estado = estadoCartera(cartera)
  // La acción principal cobra la cuota más antigua con saldo (las cuotas vienen ordenadas por fecha).
  const proximaACobrar = cuotas.find((c) => saldoCuota(c) > 0) ?? null
  const puedeCrearAcuerdo = canModificarPlazo && Number(cartera.saldo_pendiente) > 0 && !acuerdoPendiente
  const acuerdos = cartera.acuerdos ?? []

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="space-y-3">
        <Link
          href="/cartera"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Cartera
        </Link>

        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-foreground truncate">{cartera.paciente_nombre}</h1>
              <span className={cn(
                'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
                ESTADO_CARTERA[estado].className,
              )}>
                {ESTADO_CARTERA[estado].label}
                {estado === 'mora' && ` · ${cartera.mora_dias} día${cartera.mora_dias !== 1 ? 's' : ''}`}
              </span>
              <HelpButton slug="como-leer-la-cartera-de-un-paciente" />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <Link href={`/pacientes/${cartera.paciente_id}`} className="inline-flex items-center gap-0.5 hover:text-foreground hover:underline underline-offset-4">
                Ver paciente <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
              <span aria-hidden className="text-border">|</span>
              <Link href={`/cotizaciones/${cartera.cotizacion_id}`} className="inline-flex items-center gap-0.5 hover:text-foreground hover:underline underline-offset-4">
                Ver cotización <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
              {cartera.profesional_nombre && (
                <>
                  <span aria-hidden className="text-border">|</span>
                  <span>{cartera.profesional_nombre}</span>
                </>
              )}
              <span aria-hidden className="text-border">|</span>
              <span>Desde {formatDate(cartera.created_at)}</span>
              {cartera.es_migracion && (
                <>
                  <span aria-hidden className="text-border">|</span>
                  <span>Migrada</span>
                </>
              )}
            </div>
          </div>

          {(proximaACobrar || puedeCrearAcuerdo) && (
            <div className="flex flex-wrap gap-2 shrink-0">
              {puedeCrearAcuerdo && (
                <Button variant="outline" onClick={() => setShowNuevoAcuerdo(true)}>
                  <HandCoins className="h-4 w-4 mr-1.5" /> Nuevo acuerdo
                </Button>
              )}
              {proximaACobrar && (
                <Button
                  onClick={() => setCuotaSeleccionada(proximaACobrar)}
                  disabled={Boolean(acuerdoPendiente)}
                  title={acuerdoPendiente ? 'Bloqueado: hay un acuerdo de pago pendiente de firma' : undefined}
                >
                  <Wallet className="h-4 w-4 mr-1.5" /> Registrar pago
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {acuerdoPendiente && (
        <AcuerdoPendienteAviso
          acuerdo={acuerdoPendiente}
          carteraId={id}
          onFirmar={() => setShowFirmaAcuerdo(true)}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        {/* Resumen primero en móvil, a la derecha en escritorio */}
        <div className="space-y-6 lg:order-2 lg:sticky lg:top-6">
          <ResumenCarteraPanel cartera={cartera} />
          {acuerdos.length > 0 && <div className="hidden lg:block"><AcuerdosHistorial acuerdos={acuerdos} /></div>}
        </div>

        <Card className="lg:order-1 overflow-hidden">
          <CardHeader className="pb-3 flex-row items-baseline justify-between space-y-0">
            <CardTitle className="text-base">Plan de pagos</CardTitle>
            <span className="text-xs text-muted-foreground">
              {cuotas.length} cuota{cuotas.length !== 1 ? 's' : ''}
            </span>
          </CardHeader>
          <CardContent className="p-0 border-t">
            <CuotasTabla
              cuotas={cuotas}
              carteraId={id}
              puedeEditarFecha={canModificarPlazo}
              bloqueado={Boolean(acuerdoPendiente)}
              onCobrar={setCuotaSeleccionada}
            />
          </CardContent>
        </Card>

        {acuerdos.length > 0 && <div className="lg:hidden"><AcuerdosHistorial acuerdos={acuerdos} /></div>}
      </div>

      {cuotaSeleccionada && (
        <RegistrarPagoModal
          cuota={cuotaSeleccionada}
          open={Boolean(cuotaSeleccionada)}
          onOpenChange={(v) => { if (!v) setCuotaSeleccionada(null) }}
          carteraId={id}
        />
      )}

      {showNuevoAcuerdo && (
        <NuevoAcuerdoPagoModal
          cartera={cartera}
          open={showNuevoAcuerdo}
          onOpenChange={setShowNuevoAcuerdo}
          onCreado={() => queryClient.invalidateQueries({ queryKey: ['cartera', id] })}
        />
      )}

      {showFirmaAcuerdo && acuerdoPendiente?.documento && (
        <Dialog open={showFirmaAcuerdo} onOpenChange={setShowFirmaAcuerdo}>
          <DialogContent className="max-w-4xl w-[95vw]">
            <DialogHeader>
              <DialogTitle>Acta de acuerdo de pago N.° {acuerdoPendiente.numero}</DialogTitle>
            </DialogHeader>
            <CompromisoPagoFirmaContent
              consentimientoId={acuerdoPendiente.documento.id}
              initialSigningToken={acuerdoPendiente.documento.documenso_signing_token || undefined}
              documentoLabel="Acta de acuerdo de pago"
              onFirmado={() => {
                queryClient.invalidateQueries({ queryKey: ['cartera', id] })
                setShowFirmaAcuerdo(false)
              }}
              onCancel={() => setShowFirmaAcuerdo(false)}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
