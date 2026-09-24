'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown, Pencil, X } from 'lucide-react'
import { carteraApi } from '@/lib/api/cartera'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { cn, formatDate } from '@/lib/utils'
import type { CuotaCartera } from '@/types/cartera'
import { estadoCuota, formatCOP, saldoCuota, type EstadoCuotaUI } from './utils'

const ESTADO: Record<EstadoCuotaUI, { label: string; dot: string; text: string }> = {
  pagada: { label: 'Pagada', dot: 'bg-emerald-500', text: 'text-foreground' },
  vencida: { label: 'Vencida', dot: 'bg-rose-500', text: 'text-rose-600 font-medium' },
  parcial: { label: 'Abono parcial', dot: 'bg-amber-500', text: 'text-foreground' },
  pendiente: { label: 'Pendiente', dot: 'bg-muted-foreground/40', text: 'text-muted-foreground' },
}

function EstadoCuota({ estado }: { estado: EstadoCuotaUI }) {
  const e = ESTADO[estado]
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs whitespace-nowrap', e.text)}>
      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', e.dot)} />
      {e.label}
    </span>
  )
}

function FechaVencimiento({
  cuota,
  carteraId,
  editable,
}: {
  cuota: CuotaCartera
  carteraId: string
  editable: boolean
}) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(cuota.fecha_esperada ?? '')

  const { mutate, isPending } = useMutation({
    mutationFn: (fecha: string) => carteraApi.patchCuota(cuota.id, { fecha_vencimiento: fecha }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cartera', carteraId] })
      toast.success('Fecha actualizada')
      setEditing(false)
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail ?? err?.response?.data?.error ?? 'No se pudo actualizar la fecha'
      toast.error('Error', msg)
      setEditing(false)
      setDraft(cuota.fecha_esperada ?? '')
    },
  })

  function cancelar() {
    setEditing(false)
    setDraft(cuota.fecha_esperada ?? '')
  }

  function guardar() {
    if (!draft || draft === cuota.fecha_esperada) { cancelar(); return }
    mutate(draft)
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          type="date"
          value={draft}
          disabled={isPending}
          aria-label="Nueva fecha de vencimiento"
          className="h-7 w-[8.5rem] rounded-md border border-input bg-background px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); guardar() }
            if (e.key === 'Escape') cancelar()
          }}
          autoFocus
        />
        <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={guardar} disabled={isPending} aria-label="Guardar fecha">
          <Check className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={cancelar} disabled={isPending} aria-label="Cancelar">
          <X className="h-3.5 w-3.5" />
        </Button>
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 tabular-nums">
      {cuota.fecha_esperada ? formatDate(cuota.fecha_esperada) : 'Sin fecha'}
      {editable && (
        <button
          type="button"
          onClick={() => { setDraft(cuota.fecha_esperada ?? ''); setEditing(true) }}
          className="rounded p-1 text-muted-foreground/70 hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Cambiar fecha de vencimiento"
          title="Cambiar fecha de vencimiento"
        >
          <Pencil className="h-3 w-3" />
        </button>
      )}
    </span>
  )
}

function HistorialAbonos({ cuota }: { cuota: CuotaCartera }) {
  const abonos = cuota.abonos ?? []

  // Pagos registrados antes de que existiera el historial: solo se conoce el acumulado.
  if (abonos.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {formatCOP(cuota.valor_pagado ?? 0)} abonado
        {cuota.fecha_pago ? ` · último pago el ${formatDate(cuota.fecha_pago)}` : ''}
        {cuota.medio_pago_nombre ? ` · ${cuota.medio_pago_nombre}` : ''}
      </p>
    )
  }

  return (
    <ul className="space-y-1.5">
      {abonos.map((a) => (
        <li key={a.id} className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] gap-3 text-xs">
          <span className="tabular-nums text-muted-foreground">{formatDate(a.fecha)}</span>
          <span className="min-w-0 truncate">
            {a.medio_pago_nombre}
            {a.registrado_por_nombre && <span className="text-muted-foreground"> · {a.registrado_por_nombre}</span>}
            {a.observaciones && <span className="text-muted-foreground"> · {a.observaciones}</span>}
          </span>
          <span className="tabular-nums font-medium">{formatCOP(a.valor)}</span>
        </li>
      ))}
    </ul>
  )
}

const COLS = 'md:grid md:grid-cols-[2rem_minmax(0,1fr)_9.5rem_7.5rem_7rem_7rem_7.5rem] md:items-center md:gap-4'

export function CuotasTabla({
  cuotas,
  carteraId,
  puedeEditarFecha,
  bloqueado,
  onCobrar,
}: {
  cuotas: CuotaCartera[]
  carteraId: string
  puedeEditarFecha: boolean
  /** Hay un acuerdo pendiente de firma: no se cobra ni se mueven fechas. */
  bloqueado: boolean
  onCobrar: (cuota: CuotaCartera) => void
}) {
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setAbiertas((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (!cuotas.length) {
    return <p className="px-6 py-10 text-center text-sm text-muted-foreground">Sin cuotas registradas</p>
  }

  return (
    <div role="table" aria-label="Cuotas">
      <div
        role="row"
        className={cn(
          'hidden px-6 py-2.5 border-b bg-muted/40 text-xs font-medium text-muted-foreground',
          COLS,
        )}
      >
        <span role="columnheader">#</span>
        <span role="columnheader">Concepto</span>
        <span role="columnheader">Vence</span>
        <span role="columnheader">Estado</span>
        <span role="columnheader" className="text-right">Valor</span>
        <span role="columnheader" className="text-right">Saldo</span>
        <span role="columnheader" className="sr-only">Acciones</span>
      </div>

      <div className="divide-y">
        {cuotas.map((cuota, i) => {
          const estado = estadoCuota(cuota)
          const saldo = saldoCuota(cuota)
          const tienePagos = Number(cuota.valor_pagado ?? 0) > 0
          const abierta = abiertas.has(cuota.id)
          const nombre = cuota.descripcion || cuota.tipo_nombre || `Cuota ${i + 1}`
          const editable = puedeEditarFecha && !bloqueado && estado === 'pendiente'

          return (
            <div
              key={cuota.id}
              role="row"
              className={cn(
                'relative',
                estado === 'vencida' && 'bg-rose-50/40 dark:bg-rose-950/10 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-rose-500',
              )}
            >
              <div className={cn('px-6 py-3.5 flex flex-wrap items-center gap-x-4 gap-y-1.5', COLS)}>
                <span role="cell" className="hidden md:block text-xs tabular-nums text-muted-foreground">{i + 1}</span>

                <div role="cell" className="min-w-0 basis-full md:basis-auto flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{nombre}</p>
                    {(cuota.acuerdo_numero != null || (cuota.descripcion && cuota.tipo_nombre)) && (
                      <p className="text-xs text-muted-foreground truncate">
                        {cuota.descripcion && cuota.tipo_nombre ? cuota.tipo_nombre : ''}
                        {cuota.descripcion && cuota.tipo_nombre && cuota.acuerdo_numero != null ? ' · ' : ''}
                        {cuota.acuerdo_numero != null ? `Acuerdo N.° ${cuota.acuerdo_numero}` : ''}
                      </p>
                    )}
                  </div>
                  <span className="md:hidden"><EstadoCuota estado={estado} /></span>
                </div>

                <span role="cell" className="text-xs md:text-sm text-muted-foreground md:text-foreground">
                  <span className="md:hidden">Vence </span>
                  <FechaVencimiento cuota={cuota} carteraId={carteraId} editable={editable} />
                </span>

                <span role="cell" className="hidden md:block"><EstadoCuota estado={estado} /></span>

                <span role="cell" className="hidden md:block text-sm tabular-nums text-right">
                  {formatCOP(cuota.valor_esperado)}
                </span>

                <span role="cell" className="ml-auto md:ml-0 text-sm tabular-nums text-right font-medium">
                  {saldo > 0 ? formatCOP(saldo) : <span className="text-muted-foreground font-normal">—</span>}
                </span>

                <div role="cell" className="basis-full md:basis-auto flex items-center justify-end gap-1">
                  {tienePagos && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-xs text-muted-foreground"
                      onClick={() => toggle(cuota.id)}
                      aria-expanded={abierta}
                      aria-label={abierta ? 'Ocultar pagos' : 'Ver pagos'}
                      title={abierta ? 'Ocultar pagos' : 'Ver pagos'}
                    >
                      <span className="md:sr-only">Pagos</span>
                      <ChevronDown className={cn('h-4 w-4 transition-transform', abierta && 'rotate-180')} />
                    </Button>
                  )}
                  {saldo > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      variant={estado === 'vencida' ? 'default' : 'outline'}
                      className="h-8 text-xs"
                      onClick={() => onCobrar(cuota)}
                      disabled={bloqueado}
                      title={bloqueado ? 'Bloqueado: hay un acuerdo de pago pendiente de firma' : undefined}
                    >
                      Cobrar
                    </Button>
                  )}
                </div>
              </div>

              {abierta && (
                <div className="px-6 pb-4 md:pl-[4.5rem]">
                  <div className="rounded-md border bg-muted/30 px-3 py-2.5">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-2">Pagos recibidos</p>
                    <HistorialAbonos cuota={cuota} />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
