'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, ArrowRight, Check, Loader2, Plus, Trash2, X,
} from 'lucide-react'
import { carteraApi } from '@/lib/api/cartera'
import { toast } from '@/hooks/use-toast'
import { formatDate, todayISO } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CompromisoPagoFirmaContent } from '@/components/consentimientos/CompromisoPagoFirmaContent'
import type { AcuerdoPago, Cartera } from '@/types/cartera'

function cop(value: string | number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0,
  }).format(Number(value) || 0)
}

const TIPOS = [
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'cuotas', label: 'Cuotas' },
  { value: 'financiamiento', label: 'Financiamiento' },
]

type Fila = { tipo: string; descripcion: string; monto: string; fecha: string }
type Paso = 'situacion' | 'plan' | 'confirmar' | 'firma'

interface Props {
  cartera: Cartera
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreado?: () => void
}

export function NuevoAcuerdoPagoModal({ cartera, open, onOpenChange, onCreado }: Props) {
  const queryClient = useQueryClient()
  const saldo = Number(cartera.saldo_pendiente)

  // Cuotas del plan actual que se reemplazan (pendientes, no anuladas).
  const cuotasAReemplazar = useMemo(
    () => (cartera.cuotas ?? []).filter((c) => !c.anulada && !c.pagada),
    [cartera.cuotas],
  )
  const conAbonoParcial = cuotasAReemplazar.filter((c) => Number(c.valor_pagado ?? 0) > 0)

  const [paso, setPaso] = useState<Paso>('situacion')
  const [motivo, setMotivo] = useState('')
  const [filas, setFilas] = useState<Fila[]>([
    { tipo: 'transferencia', descripcion: 'Cuota 1', monto: '', fecha: '' },
  ])
  const [acuerdo, setAcuerdo] = useState<AcuerdoPago | null>(null)

  const sumaFilas = filas.reduce((acc, f) => acc + (Number(f.monto) || 0), 0)
  const diferencia = Math.round((sumaFilas - saldo) * 100) / 100
  const sumaCuadra = Math.abs(diferencia) < 0.01
  const hoy = todayISO()
  const fechasOk = filas.every((f) => f.fecha && f.fecha >= hoy)
  const montosOk = filas.every((f) => Number(f.monto) > 0)
  const planValido = filas.length > 0 && sumaCuadra && fechasOk && montosOk && motivo.trim().length > 0

  function resetear() {
    setPaso('situacion')
    setMotivo('')
    setFilas([{ tipo: 'transferencia', descripcion: 'Cuota 1', monto: '', fecha: '' }])
    setAcuerdo(null)
  }

  function cerrar() {
    onOpenChange(false)
    setTimeout(resetear, 200)
  }

  function setFila(i: number, patch: Partial<Fila>) {
    setFilas((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)))
  }
  function agregarFila() {
    setFilas((prev) => [
      ...prev,
      { tipo: 'transferencia', descripcion: `Cuota ${prev.length + 1}`, monto: '', fecha: '' },
    ])
  }
  function quitarFila(i: number) {
    setFilas((prev) => prev.filter((_, idx) => idx !== i))
  }
  function repartirIgual(n: number) {
    if (n < 1) return
    const base = Math.floor(saldo / n)
    const resto = Math.round(saldo - base * n)
    setFilas(
      Array.from({ length: n }, (_, i) => ({
        tipo: 'transferencia',
        descripcion: `Cuota ${i + 1} de ${n}`,
        monto: String(i === n - 1 ? base + resto : base),
        fecha: '',
      })),
    )
  }

  const crear = useMutation({
    mutationFn: () =>
      carteraApi.crearAcuerdo({
        cartera: cartera.id,
        motivo: motivo.trim(),
        cuotas: filas.map((f) => ({
          tipo: f.tipo,
          descripcion: f.descripcion.trim() || 'Cuota (acuerdo de pago)',
          valor_esperado: String(Number(f.monto)),
          fecha_esperada: f.fecha,
        })),
      }),
    onSuccess: (a) => {
      setAcuerdo(a)
      setPaso('firma')
      queryClient.invalidateQueries({ queryKey: ['cartera', cartera.id] })
    },
    onError: (err: any) => {
      const data = err?.response?.data
      const code = data?.code
      if (code === 'SUMA_NO_CUADRA') {
        toast.error('La suma no cuadra', `Diferencia de ${cop(data.detalle?.diferencia ?? 0)} contra el saldo.`)
      } else {
        toast.error('No se pudo crear el acuerdo', data?.error ?? 'Intenta de nuevo.')
      }
    },
  })

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) cerrar() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Nuevo acuerdo de pago</span>
            <span className="text-xs font-normal text-muted-foreground">
              {paso === 'situacion' && 'Paso 1 de 3 · Situación actual'}
              {paso === 'plan' && 'Paso 2 de 3 · Nuevo plan'}
              {paso === 'confirmar' && 'Paso 3 de 3 · Confirmar'}
              {paso === 'firma' && 'Firma del acta'}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* ── Paso 1: situación ───────────────────────────────────────────── */}
        {paso === 'situacion' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Total cotizado</p>
                <p className="text-lg font-bold tabular-nums">{cop(cartera.total)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Ya pagado</p>
                <p className="text-lg font-bold tabular-nums text-emerald-600">{cop(cartera.total_pagado)}</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs text-amber-700">Saldo a reprogramar</p>
                <p className="text-lg font-bold tabular-nums text-amber-900">{cop(saldo)}</p>
              </div>
            </div>

            <div className="rounded-lg border p-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Al firmarse el acuerdo, estas {cuotasAReemplazar.length}{' '}
                {cuotasAReemplazar.length === 1 ? 'cuota pendiente se anula' : 'cuotas pendientes se anulan'}:
              </p>
              <div className="divide-y text-sm">
                {cuotasAReemplazar.map((c) => (
                  <div key={c.id} className="flex items-center justify-between py-1.5">
                    <span className="text-muted-foreground">
                      {c.fecha_esperada ? formatDate(c.fecha_esperada) : 'Sin fecha'} · {c.descripcion || c.tipo}
                    </span>
                    <span className="tabular-nums line-through text-muted-foreground">{cop(c.valor_esperado)}</span>
                  </div>
                ))}
              </div>
            </div>

            {conAbonoParcial.length > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2">
                <AlertTriangle className="h-3.5 w-3.5 text-blue-600 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-800">
                  {conAbonoParcial.length === 1 ? 'Una cuota tiene' : `${conAbonoParcial.length} cuotas tienen`}{' '}
                  un abono parcial: se cerrará con el valor ya abonado y el resto queda incluido en el saldo del nuevo plan.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={cerrar}>Cancelar</Button>
              <Button onClick={() => setPaso('plan')}>
                Continuar <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Paso 2: plan ────────────────────────────────────────────────── */}
        {paso === 'plan' && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Motivo del acuerdo *</Label>
              <Textarea
                rows={2}
                placeholder="Ej: El paciente solicita reprogramar por dificultad económica; se acuerdan 4 cuotas mensuales."
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              />
            </div>

            <div
              className={`sticky top-0 z-10 flex items-center justify-between rounded-md border px-3 py-2 text-sm ${
                sumaCuadra ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'
              }`}
            >
              <span className="text-muted-foreground">
                Objetivo <span className="font-semibold text-foreground tabular-nums">{cop(saldo)}</span>
                {'  ·  '}
                Suma <span className="font-semibold text-foreground tabular-nums">{cop(sumaFilas)}</span>
              </span>
              <span className={`font-medium ${sumaCuadra ? 'text-emerald-700' : 'text-amber-800'}`}>
                {sumaCuadra ? (
                  <span className="flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Cuadra</span>
                ) : diferencia < 0 ? (
                  `Faltan ${cop(-diferencia)}`
                ) : (
                  `Sobran ${cop(diferencia)}`
                )}
              </span>
            </div>

            <div className="space-y-2">
              {filas.map((f, i) => {
                const fechaMala = f.fecha !== '' && f.fecha < hoy
                return (
                  <div key={i} className="flex items-start gap-2">
                    <Input
                      type="date"
                      className={`h-9 w-[140px] shrink-0 ${fechaMala ? 'border-destructive' : ''}`}
                      value={f.fecha}
                      min={hoy}
                      onChange={(e) => setFila(i, { fecha: e.target.value })}
                    />
                    <Select value={f.tipo} onValueChange={(v) => setFila(i, { tipo: v })}>
                      <SelectTrigger className="h-9 w-[130px] shrink-0 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input
                      className="h-9 flex-1 min-w-0"
                      placeholder="Concepto"
                      value={f.descripcion}
                      onChange={(e) => setFila(i, { descripcion: e.target.value })}
                    />
                    <Input
                      type="number"
                      inputMode="numeric"
                      className="h-9 w-[130px] shrink-0 text-right"
                      placeholder="0"
                      value={f.monto}
                      onChange={(e) => setFila(i, { monto: e.target.value })}
                    />
                    <Button
                      type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0"
                      onClick={() => quitarFila(i)}
                      disabled={filas.length === 1}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                )
              })}
            </div>

            <div className="flex items-center justify-between">
              <Button type="button" variant="outline" size="sm" onClick={agregarFila}>
                <Plus className="h-4 w-4 mr-1.5" /> Agregar cuota
              </Button>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                Repartir en
                {[2, 3, 4, 6].map((n) => (
                  <button
                    key={n} type="button"
                    className="rounded border px-2 py-0.5 hover:bg-muted"
                    onClick={() => repartirIgual(n)}
                  >{n}</button>
                ))}
                cuotas iguales
              </div>
            </div>

            {!fechasOk && filas.some((f) => f.fecha) && (
              <p className="text-xs text-destructive">Todas las fechas deben ser hoy o posteriores.</p>
            )}

            <div className="flex justify-between gap-2 pt-1">
              <Button variant="ghost" onClick={() => setPaso('situacion')}>Atrás</Button>
              <Button disabled={!planValido} onClick={() => setPaso('confirmar')}>
                Continuar <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Paso 3: confirmar ───────────────────────────────────────────── */}
        {paso === 'confirmar' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Plan actual (se reemplaza)</p>
                <div className="divide-y rounded-lg border text-sm">
                  {cuotasAReemplazar.map((c) => (
                    <div key={c.id} className="flex justify-between px-3 py-1.5 text-muted-foreground line-through">
                      <span>{c.fecha_esperada ? formatDate(c.fecha_esperada) : 'Sin fecha'}</span>
                      <span className="tabular-nums">{cop(c.valor_esperado)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Plan nuevo</p>
                <div className="divide-y rounded-lg border text-sm">
                  {filas.map((f, i) => (
                    <div key={i} className="flex justify-between px-3 py-1.5">
                      <span>{f.fecha ? formatDate(f.fecha) : '—'}</span>
                      <span className="tabular-nums font-medium">{cop(f.monto)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between px-3 py-1.5 bg-muted/40">
                    <span className="font-medium">Total</span>
                    <span className="tabular-nums font-bold">{cop(sumaFilas)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-1.5">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
                <AlertTriangle className="h-4 w-4" /> El acuerdo NO entra en vigencia todavía
              </p>
              <ol className="list-decimal list-inside text-xs text-amber-800 space-y-0.5">
                <li>Al confirmar se genera el acta de acuerdo de pago.</li>
                <li>El paciente debe firmarla (en pantalla o por link de WhatsApp).</li>
                <li>Solo cuando Documenso confirme la firma, el plan nuevo reemplaza al actual y se levanta la mora.</li>
              </ol>
              <p className="text-xs text-amber-800">
                Mientras tanto el plan actual sigue vigente y los pagos en esta cartera quedan bloqueados.
              </p>
            </div>

            <div className="flex justify-between gap-2 pt-1">
              <Button variant="ghost" onClick={() => setPaso('plan')} disabled={crear.isPending}>Atrás</Button>
              <Button onClick={() => crear.mutate()} disabled={crear.isPending}>
                {crear.isPending
                  ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Generando…</>
                  : 'Generar acta y enviar a firma'}
              </Button>
            </div>
          </div>
        )}

        {/* ── Paso 4: firma ───────────────────────────────────────────────── */}
        {paso === 'firma' && acuerdo?.documento && (
          <div>
            <CompromisoPagoFirmaContent
              consentimientoId={acuerdo.documento.id}
              documentoLabel="Acta de acuerdo de pago"
              onFirmado={() => {
                queryClient.invalidateQueries({ queryKey: ['cartera', cartera.id] })
                onCreado?.()
                toast.success('Acuerdo de pago vigente', 'El plan de cartera fue actualizado.')
              }}
              onCancel={cerrar}
            />
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Puedes cerrar esta ventana; el acuerdo queda pendiente de firma y podrás retomarlo desde la cartera.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
