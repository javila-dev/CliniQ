'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { Lock, LockOpen, CheckCircle2 } from 'lucide-react'
import { cajaApi } from '@/lib/api/caja'
import { useAuthStore } from '@/store/authStore'
import { hasPermission, PERM } from '@/lib/permissions'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { LoadingState } from '@/components/shared/LoadingState'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { SesionCaja } from '@/types/caja'
import { useResultadosSede } from '../context'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

function fmtDateTime(v: string | null): string {
  if (!v) return '—'
  const d = new Date(v)
  return d.toLocaleDateString('es-CO') + ' ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}

export default function CajaPage() {
  return (
    <RoleGuard check={(u) => hasPermission(u, PERM.CAJA_CIERRE_VER)}>
      <CajaContent />
    </RoleGuard>
  )
}

function CajaContent() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const { sede: sedeCtx, sedes } = useResultadosSede()
  const puedeOperar = hasPermission(user, PERM.CAJA_CIERRE_REALIZAR)

  // La caja es de UNA sede; si el filtro está en "Todas", cae en la 1ª.
  const sede = sedeCtx ?? sedes[0]?.id
  const sedeNombre = sedes.find((s) => s.id === sede)?.nombre ?? '—'

  const [abrirOpen, setAbrirOpen] = useState(false)
  const [cerrarOpen, setCerrarOpen] = useState(false)

  const { data: estado, isLoading } = useQuery({
    queryKey: ['caja-actual', sede],
    queryFn: () => cajaApi.sesiones.actual(sede!),
    enabled: !!sede,
    placeholderData: keepPreviousData,
  })

  const caja = estado?.caja ?? null
  const sesion = estado?.sesion ?? null

  const { data: historialData } = useQuery({
    queryKey: ['caja-sesiones', caja?.id],
    queryFn: () => cajaApi.sesiones.list({ caja: caja!.id, ordering: '-abierta_en' }),
    enabled: !!caja?.id,
  })
  const historial = historialData?.results ?? []

  const { data: movsData } = useQuery({
    queryKey: ['caja-movs', sesion?.id],
    queryFn: () => cajaApi.gastos.list({ sesion: sesion!.id, ordering: '-created_at', page_size: 100 }),
    enabled: !!sesion?.id,
  })
  const movimientos = movsData?.results ?? []

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['caja-actual'] })
    qc.invalidateQueries({ queryKey: ['caja-sesiones'] })
    qc.invalidateQueries({ queryKey: ['caja-movs'] })
  }

  if (!sede) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No hay sedes disponibles.</p>
  }
  if (isLoading && !estado) return <LoadingState rows={5} />

  if (!caja) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-1">
          <p className="text-sm font-medium">La sede {sedeNombre} no tiene una caja configurada.</p>
          <p className="text-xs text-muted-foreground">Un administrador puede crearla en Configuración → Cajas.</p>
        </CardContent>
      </Card>
    )
  }

  const abierta = !!sesion

  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
            abierta ? 'bg-emerald-50 text-emerald-700' : 'bg-muted text-muted-foreground',
          )}>
            {abierta ? <LockOpen className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            {abierta ? 'Caja abierta' : 'Caja cerrada'}
          </span>
          <span className="text-sm text-muted-foreground">
            {sedeNombre}
            {caja.responsable_nombre && <span> · resp. {caja.responsable_nombre}</span>}
          </span>
        </div>

        {puedeOperar && (
          abierta
            ? <Button size="sm" variant="outline" onClick={() => setCerrarOpen(true)}><Lock className="h-4 w-4 mr-1.5" />Cerrar caja</Button>
            : <Button size="sm" onClick={() => setAbrirOpen(true)}><LockOpen className="h-4 w-4 mr-1.5" />Abrir caja</Button>
        )}
      </div>

      {abierta ? (
        <>
          {/* Balance de la sesión */}
          <Card>
            <CardContent className="pt-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Balance de la sesión</h2>
                <span className="text-xs text-muted-foreground">
                  Abierta {fmtDateTime(sesion!.abierta_en)}
                  {sesion!.abierta_por_nombre && ` · ${sesion!.abierta_por_nombre}`}
                </span>
              </div>
              <div className="rounded-lg border bg-muted/30 divide-y text-sm">
                <Row label="Fondo de apertura" value={COP.format(Number(sesion!.monto_apertura))} />
                <Row label="Ingresos en efectivo" value={`+ ${COP.format(Number(sesion!.total_ingresos))}`} className="text-emerald-600" />
                <Row label="Egresos" value={`− ${COP.format(Number(sesion!.total_egresos))}`} className="text-rose-600" />
                <Row label="Esperado en caja" value={COP.format(Number(sesion!.esperado))} bold />
              </div>
            </CardContent>
          </Card>

          {/* Egresos de la sesión */}
          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-2.5 bg-muted/60 border-b text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              Egresos de la sesión
            </div>
            {!movimientos.length ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">Sin egresos en esta sesión</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    <th className="text-left px-5 py-2">Fecha</th>
                    <th className="text-left px-5 py-2">Descripción</th>
                    <th className="text-left px-5 py-2 hidden sm:table-cell">Categoría</th>
                    <th className="text-right px-5 py-2">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {movimientos.map((m) => (
                    <tr key={m.id} className="border-b border-gray-100 last:border-0 hover:bg-muted/30">
                      <td className="px-5 py-2.5 tabular-nums text-muted-foreground">{m.fecha}</td>
                      <td className="px-5 py-2.5">{m.descripcion}</td>
                      <td className="px-5 py-2.5 hidden sm:table-cell text-muted-foreground">{m.categoria_nombre ?? '—'}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-rose-600">− {COP.format(Number(m.valor))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : (
        <Card>
          <CardContent className="py-12 flex flex-col items-center text-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Lock className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">La caja de {sedeNombre} está cerrada</p>
              <p className="text-xs text-muted-foreground">
                Fondo sugerido para la próxima apertura:{' '}
                <span className="font-medium tabular-nums text-foreground">{COP.format(Number(caja.monto_apertura_sugerido))}</span>
              </p>
            </div>
            {puedeOperar
              ? <Button size="sm" onClick={() => setAbrirOpen(true)}><LockOpen className="h-4 w-4 mr-1.5" />Abrir caja</Button>
              : <p className="text-xs text-muted-foreground">No tienes permiso para abrir caja.</p>}
          </CardContent>
        </Card>
      )}

      {/* Historial de sesiones */}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-2.5 bg-muted/60 border-b text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          Sesiones anteriores
        </div>
        {!historial.length ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">Sin sesiones registradas</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  <th className="text-left px-5 py-2">Apertura</th>
                  <th className="text-left px-5 py-2">Cierre</th>
                  <th className="text-right px-5 py-2 hidden sm:table-cell">Apertura</th>
                  <th className="text-right px-5 py-2 hidden md:table-cell">Ingresos</th>
                  <th className="text-right px-5 py-2 hidden md:table-cell">Egresos</th>
                  <th className="text-right px-5 py-2 hidden sm:table-cell">Contado</th>
                  <th className="text-right px-5 py-2">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((s) => {
                  const dif = Number(s.diferencia)
                  const cerrada = s.estado === 'cerrada'
                  return (
                    <tr key={s.id} className="border-b border-gray-100 last:border-0 hover:bg-muted/30">
                      <td className="px-5 py-2.5 tabular-nums whitespace-nowrap">{fmtDateTime(s.abierta_en)}</td>
                      <td className="px-5 py-2.5 tabular-nums whitespace-nowrap">
                        {cerrada ? fmtDateTime(s.cerrada_en)
                          : <span className="inline-flex items-center gap-1 text-emerald-600 text-xs"><CheckCircle2 className="h-3.5 w-3.5" />En curso</span>}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums hidden sm:table-cell">{COP.format(Number(s.monto_apertura))}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums hidden md:table-cell text-emerald-600">{cerrada ? COP.format(Number(s.total_ingresos)) : '—'}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums hidden md:table-cell text-rose-600">{cerrada ? COP.format(Number(s.total_egresos)) : '—'}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums hidden sm:table-cell">{s.efectivo_contado != null ? COP.format(Number(s.efectivo_contado)) : '—'}</td>
                      <td className={cn('px-5 py-2.5 text-right tabular-nums font-semibold',
                        !cerrada ? 'text-muted-foreground'
                          : Math.abs(dif) < 1 ? 'text-emerald-600' : dif > 0 ? 'text-amber-600' : 'text-rose-600')}>
                        {!cerrada ? '—' : <>{dif >= 0 ? '' : '−'}{COP.format(Math.abs(dif))}</>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AbrirCajaDialog
        open={abrirOpen}
        onClose={() => setAbrirOpen(false)}
        cajaId={caja.id}
        sedeNombre={sedeNombre}
        sugerido={caja.monto_apertura_sugerido}
        onDone={invalidate}
      />
      {sesion && (
        <CerrarCajaDialog
          open={cerrarOpen}
          onClose={() => setCerrarOpen(false)}
          sesion={sesion}
          onDone={invalidate}
        />
      )}
    </div>
  )
}

function Row({ label, value, className, bold }: { label: string; value: string; className?: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('tabular-nums', bold && 'font-bold text-foreground text-base', className)}>{value}</span>
    </div>
  )
}

// ─── Abrir caja ───────────────────────────────────────────────

function AbrirCajaDialog({ open, onClose, cajaId, sedeNombre, sugerido, onDone }: {
  open: boolean
  onClose: () => void
  cajaId: string
  sedeNombre: string
  sugerido: string
  onDone: () => void
}) {
  const sugeridoNum = Number(sugerido)
  // Sin arrastre previo (primera apertura de esta caja): hay que contar el efectivo real.
  const primeraVez = sugeridoNum === 0
  const [ajustando, setAjustando] = useState(primeraVez)
  const [monto, setMonto] = useState(primeraVez ? '' : String(sugeridoNum))

  // El fondo arrastra: al abrir el modal parte del sugerido (y sin ajustar), salvo
  // la primera vez, donde se pide teclear el efectivo con el que arranca.
  useEffect(() => {
    if (open) {
      setMonto(primeraVez ? '' : String(sugeridoNum))
      setAjustando(primeraVez)
    }
  }, [open, sugeridoNum, primeraVez])

  const montoNum = Number(monto || 0)
  const rompeContinuidad = !primeraVez && ajustando && monto !== '' && Math.abs(montoNum - sugeridoNum) >= 1

  const abrir = useMutation({
    mutationFn: () => cajaApi.sesiones.abrir({
      caja: cajaId,
      // Sin ajuste => que el backend use el arrastre; con ajuste => el valor tecleado.
      monto_apertura: ajustando ? montoNum : undefined,
    }),
    onSuccess: () => {
      onDone()
      toast.success('Caja abierta')
      onClose()
    },
    onError: (e: any) => toast.error(
      'No se pudo abrir',
      e?.response?.data?.caja ?? e?.response?.data?.error ?? 'Intenta de nuevo.',
    ),
  })

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Abrir caja · {sedeNombre}</DialogTitle>
          <DialogDescription>
            {primeraVez
              ? 'Es la primera apertura de esta caja. Cuenta el efectivo con el que arranca.'
              : 'El fondo arrastra del último cierre. Ajústalo solo si hubo un conteo errado.'}
          </DialogDescription>
        </DialogHeader>

        {!ajustando ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2.5 text-sm">
              <span className="text-muted-foreground">Fondo de apertura</span>
              <span className="tabular-nums font-semibold">{COP.format(sugeridoNum)}</span>
            </div>
            <button type="button" onClick={() => setAjustando(true)}
              className="text-xs text-primary hover:underline">
              Ajustar el fondo
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label>Fondo de apertura</Label>
            <Input
              type="number" min={0} step="1" autoFocus
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
            />
            {!primeraVez && (
              <div className="flex items-center justify-between text-[11px]">
                <button type="button" onClick={() => { setAjustando(false); setMonto(String(sugeridoNum)) }}
                  className="text-primary hover:underline">
                  Usar el arrastre ({COP.format(sugeridoNum)})
                </button>
              </div>
            )}
            {rompeContinuidad && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
                Rompe la continuidad con el último cierre ({COP.format(sugeridoNum)}). La diferencia
                se verá reflejada en el próximo arqueo.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={abrir.isPending || (ajustando && monto === '')} onClick={() => abrir.mutate()}>
            {abrir.isPending ? 'Abriendo…' : 'Abrir caja'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Cerrar caja ──────────────────────────────────────────────

function CerrarCajaDialog({ open, onClose, sesion, onDone }: {
  open: boolean
  onClose: () => void
  sesion: SesionCaja
  onDone: () => void
}) {
  const [efectivo, setEfectivo] = useState('')
  const [obs, setObs] = useState('')

  const reset = () => { setEfectivo(''); setObs('') }

  const cerrar = useMutation({
    mutationFn: () => cajaApi.sesiones.cerrar(sesion.id, {
      efectivo_contado: Number(efectivo || 0),
      observaciones: obs || undefined,
    }),
    onSuccess: () => {
      onDone()
      toast.success('Caja cerrada')
      reset()
      onClose()
    },
    onError: (e: any) => toast.error('No se pudo cerrar', e?.response?.data?.error ?? 'Intenta de nuevo.'),
  })

  const dif = useMemo(() => {
    if (efectivo === '') return null
    return Number(efectivo) - Number(sesion.esperado)
  }, [efectivo, sesion.esperado])

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose() } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Cerrar caja</DialogTitle>
          <DialogDescription>
            Cuenta el efectivo en caja y regístralo. La diferencia queda en el arqueo.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/30 divide-y text-sm">
          <Row label="Fondo de apertura" value={COP.format(Number(sesion.monto_apertura))} />
          <Row label="Ingresos en efectivo" value={`+ ${COP.format(Number(sesion.total_ingresos))}`} className="text-emerald-600" />
          <Row label="Egresos" value={`− ${COP.format(Number(sesion.total_egresos))}`} className="text-rose-600" />
          <Row label="Esperado en caja" value={COP.format(Number(sesion.esperado))} bold />
        </div>

        <div className="space-y-1.5">
          <Label>Efectivo contado</Label>
          <Input type="number" min={0} step="1" autoFocus value={efectivo}
            onChange={(e) => setEfectivo(e.target.value)} placeholder="0" />
        </div>

        {dif !== null && (
          <div className="flex items-center justify-between rounded-lg bg-muted/40 border px-3 py-2 text-sm font-semibold">
            <span>Diferencia</span>
            <span className={cn('tabular-nums', Math.abs(dif) < 1 ? 'text-emerald-600' : dif > 0 ? 'text-amber-600' : 'text-rose-600')}>
              {dif >= 0 ? '' : '−'}{COP.format(Math.abs(dif))}
            </span>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Observaciones</Label>
          <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Opcional" />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose() }}>Cancelar</Button>
          <Button disabled={cerrar.isPending || efectivo === ''} onClick={() => cerrar.mutate()}>
            {cerrar.isPending ? 'Cerrando…' : 'Cerrar caja'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
