'use client'

import { useMemo, useState } from 'react'
import { useQuery, useMutation, keepPreviousData } from '@tanstack/react-query'
import {
  ArrowLeft, ArrowRight, Check, Search, Plus, Trash2, Loader2, CheckCircle2,
} from 'lucide-react'
import { migracionApi } from '@/lib/api/migracion'
import { pacientesApi } from '@/lib/api/pacientes'
import { clinicasApi } from '@/lib/api/clinicas'
import { useUserSedes } from '@/hooks/useUserSedes'
import { useDebounce } from '@/hooks/useDebounce'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { PacienteEnCursoPayload, CuotaPlanInput } from '@/types/migracion'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const money = (v: string | number) => COP.format(Number(v) || 0)
const today = () => new Date().toLocaleDateString('en-CA')

const PASOS = ['Paciente', 'Tratamiento', 'Sesiones', 'Plan de pago', 'Confirmar']

/** Input de dinero: muestra el valor con separador de miles (1.000.000) y
 *  guarda solo los dígitos. */
function MoneyInput({
  value, onChange, className, ...rest
}: {
  value: string
  onChange: (digits: string) => void
} & Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'>) {
  return (
    <Input
      type="text"
      inputMode="numeric"
      className={cn('text-center tabular-nums', className)}
      value={value ? Number(value).toLocaleString('es-CO') : ''}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
      {...rest}
    />
  )
}

interface SesionRow {
  key: string
  nombre: string
  done: boolean
}

export function PacienteEnCursoWizard({ onClose, onDone }: {
  onClose: () => void
  /** llamado tras cargar el paciente con éxito */
  onDone: () => void
}) {
  const [open, setOpen] = useState(true)
  const cerrar = () => { setOpen(false); onClose() }

  const { sedes, defaultSedeId } = useUserSedes()

  const [step, setStep] = useState(0)
  const [sedeId, setSedeId] = useState<string>('')
  const sede = sedeId || defaultSedeId || sedes[0]?.id || ''

  // ── paso 1: paciente ──────────────────────────────────────
  const [pacienteId, setPacienteId] = useState('')
  const [pacienteNombre, setPacienteNombre] = useState('')
  const [buscar, setBuscar] = useState('')
  const debBuscar = useDebounce(buscar, 300)
  const { data: pacientesData } = useQuery({
    queryKey: ['pac-search', debBuscar],
    queryFn: () => pacientesApi.list({ search: debBuscar }),
    enabled: debBuscar.length >= 2,
    placeholderData: keepPreviousData,
  })

  // ── paso 2: tratamiento ───────────────────────────────────
  const [tipo, setTipo] = useState<'tratamiento' | 'libre'>('tratamiento')
  const [tratamientoId, setTratamientoId] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [numLibre, setNumLibre] = useState('6')
  const [precio, setPrecio] = useState('')
  const [valorPagado, setValorPagado] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')

  const { data: tratamientos } = useQuery({
    queryKey: ['tratamientos-activos'],
    queryFn: () => clinicasApi.tratamientos.activos(),
  })
  const tratListItem = tratamientos?.find((t) => t.id === tratamientoId)

  const { data: tratSel } = useQuery({
    queryKey: ['tratamiento-detalle', tratamientoId],
    queryFn: () => clinicasApi.tratamientos.get(tratamientoId),
    enabled: tipo === 'tratamiento' && !!tratamientoId,
  })

  const numSesionesTotal = tipo === 'tratamiento'
    ? (tratSel?.total_sesiones ?? tratListItem?.total_sesiones ?? 0)
    : Math.max(1, Number(numLibre) || 1)

  const nombreTrat = tratSel?.nombre ?? tratListItem?.nombre ?? ''
  const precioLista = tratSel?.precio_estimado ?? tratListItem?.precio_estimado ?? null

  // ── paso 3: sesiones ──────────────────────────────────────
  const filasBase = useMemo<SesionRow[]>(() => {
    if (tipo === 'tratamiento' && tratSel?.tipos_sesion?.length) {
      const rows: SesionRow[] = []
      const comprometidas = tratSel.tipos_sesion
        .filter((ts) => ts.es_compromiso)
        .sort((a, b) => a.orden - b.orden)
      const total = comprometidas.reduce((s, ts) => s + ts.cantidad, 0)
      let n = 0
      comprometidas.forEach((ts) => {
        for (let i = 1; i <= ts.cantidad; i++) {
          n++
          rows.push({ key: `${ts.id}-${i}`, nombre: `${ts.nombre} · sesión ${n} de ${total}`, done: false })
        }
      })
      if (rows.length) return rows
    }
    return Array.from({ length: numSesionesTotal }, (_, i) => ({
      key: `s-${i}`, nombre: `Sesión ${i + 1} de ${numSesionesTotal}`, done: false,
    }))
  }, [tipo, tratSel, numSesionesTotal])

  const [filas, setFilas] = useState<SesionRow[]>([])
  const entrarSesiones = () => setFilas(filasBase.map((f) => ({ ...f })))

  const hechas = filas.filter((f) => f.done).length
  const setFila = (key: string, patch: Partial<SesionRow>) =>
    setFilas((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)))
  const marcarHasta = (n: number) =>
    setFilas((prev) => prev.map((f, i) => ({ ...f, done: i < n })))

  // ── paso 4: plan de pago ──────────────────────────────────
  const [plan, setPlan] = useState<CuotaPlanInput[]>([])
  const [nota, setNota] = useState('')

  const total = Number(precio) || 0
  const pagado = Number(valorPagado) || 0
  const saldo = total - pagado
  const planSuma = plan.reduce((s, c) => s + (Number(c.valor_esperado) || 0), 0)
  const planCuadra = saldo <= 0 ? plan.length === 0 : Math.abs(planSuma - saldo) < 1

  const mut = useMutation({
    mutationFn: () => {
      const payload: PacienteEnCursoPayload = {
        paciente: pacienteId,
        sede,
        nota: nota || undefined,
        tratamiento: {
          tipo,
          tratamiento: tipo === 'tratamiento' ? tratamientoId : null,
          descripcion: tipo === 'tratamiento' ? (nombreTrat || descripcion) : descripcion,
          num_sesiones_total: numSesionesTotal,
          precio_total_pactado: total.toFixed(2),
          fecha_inicio: fechaInicio || null,
        },
        sesiones_realizadas: filas.filter((f) => f.done).map((f) => ({ nombre: f.nombre })),
        pagos: pagado > 0
          ? [{ valor: pagado.toFixed(2), medio_pago: 'otro' as const, fecha: today() }]
          : [],
        plan_saldo: saldo > 0 ? plan.map((c) => ({ ...c, valor_esperado: (Number(c.valor_esperado) || 0).toFixed(2) })) : [],
      }
      return migracionApi.cargarPacienteEnCurso(payload)
    },
    onSuccess: () => {
      toast.success('Paciente cargado', `${pacienteNombre} quedó registrado como datos previos.`)
      setOpen(false)
      onClose()
      onDone()
    },
    onError: (e: any) => {
      const d = e?.response?.data
      toast.error('No se pudo cargar', typeof d === 'string' ? d : (d?.detail ?? JSON.stringify(d ?? {})))
    },
  })

  const puedeAvanzar = [
    !!pacienteId && !!sede,
    (tipo === 'tratamiento' ? (!!tratamientoId && !!tratSel) : !!descripcion.trim()) && total > 0 && pagado <= total,
    true,
    planCuadra,
    true,
  ][step]

  const next = () => {
    if (step === 1) entrarSesiones()
    setStep((s) => Math.min(PASOS.length - 1, s + 1))
  }
  const prev = () => setStep((s) => Math.max(0, s - 1))

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) cerrar() }}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cargar paciente en curso</DialogTitle>
        </DialogHeader>

        {/* stepper */}
        <div className="flex flex-wrap items-center gap-2">
          {PASOS.map((p, i) => (
            <div key={p} className="flex items-center gap-2">
              <div className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold',
                i < step ? 'bg-primary text-white' : i === step ? 'bg-primary/15 text-primary ring-1 ring-primary' : 'bg-muted text-muted-foreground',
              )}>
                {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span className={cn('text-xs', i === step ? 'font-medium text-foreground' : 'text-muted-foreground')}>{p}</span>
              {i < PASOS.length - 1 && <div className="h-px w-4 bg-border" />}
            </div>
          ))}
        </div>

        <div className="space-y-5 pt-1">
          {/* ── Paso 1: paciente ── */}
          {step === 0 && (
            <div className="space-y-4">
              {sedes.length > 1 && (
                <div className="space-y-1.5">
                  <Label>Sede</Label>
                  <Select value={sede} onValueChange={setSedeId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{sedes.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Paciente</Label>
                {pacienteId ? (
                  <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2.5 text-sm">
                    <span className="font-medium">{pacienteNombre}</span>
                    <Button size="sm" variant="ghost" onClick={() => { setPacienteId(''); setPacienteNombre('') }}>Cambiar</Button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input className="pl-9" placeholder="Buscar por nombre o documento…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
                    </div>
                    {(pacientesData?.results ?? []).length > 0 && (
                      <div className="rounded-lg border divide-y max-h-56 overflow-y-auto">
                        {pacientesData!.results.slice(0, 8).map((p) => (
                          <button key={p.id} type="button"
                            className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-muted/40"
                            onClick={() => { setPacienteId(p.id); setPacienteNombre(p.nombre_completo); setBuscar('') }}>
                            <span>{p.nombre_completo}</span>
                            <span className="text-xs text-muted-foreground">{p.numero_documento}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    <p className="text-[11px] text-muted-foreground">El paciente debe existir. Si no, créalo primero en Pacientes.</p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── Paso 2: tratamiento ── */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button size="sm" variant={tipo === 'tratamiento' ? 'default' : 'outline'} onClick={() => setTipo('tratamiento')}>Del catálogo</Button>
                <Button size="sm" variant={tipo === 'libre' ? 'default' : 'outline'} onClick={() => setTipo('libre')}>Libre</Button>
              </div>

              {tipo === 'tratamiento' ? (
                <div className="space-y-1.5">
                  <Label>Tratamiento</Label>
                  <Select value={tratamientoId} onValueChange={setTratamientoId}>
                    <SelectTrigger><SelectValue placeholder="Elegí el tratamiento…" /></SelectTrigger>
                    <SelectContent>
                      {(tratamientos ?? []).map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.nombre} · {t.total_sesiones} sesiones</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {tratamientoId && (
                    <p className="text-[11px] text-muted-foreground">
                      {numSesionesTotal} sesiones · precio de lista {precioLista ? money(precioLista) : '—'}
                    </p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5 col-span-2">
                    <Label>Descripción</Label>
                    <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej. Paquete láser full body" maxLength={200} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Sesiones en total</Label>
                    <Input type="number" min={1} value={numLibre} onChange={(e) => setNumLibre(e.target.value)} />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>¿Cuánto se pactó en total?</Label>
                  <MoneyInput value={precio} onChange={setPrecio} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label>Valor ya pagado</Label>
                  <MoneyInput value={valorPagado} onChange={setValorPagado} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label>Inicio del tratamiento (aprox.)</Label>
                  <Input type="date" value={fechaInicio} max={today()} onChange={(e) => setFechaInicio(e.target.value)} />
                </div>
              </div>

              {total > 0 && (
                <p className={cn('text-[11px]', pagado > total ? 'text-rose-600' : 'text-muted-foreground')}>
                  {pagado > total
                    ? 'Lo pagado supera el total pactado.'
                    : <>Saldo pendiente: <span className="font-medium tabular-nums text-foreground">{money(saldo)}</span></>}
                  {tipo === 'tratamiento' && precioLista && total !== Number(precioLista) && (
                    <span className="text-muted-foreground">
                      {' · '}precio de lista {money(precioLista)} ({total < Number(precioLista) ? '−' : '+'}{Math.abs(Math.round((1 - total / Number(precioLista)) * 100))}%)
                    </span>
                  )}
                </p>
              )}
            </div>
          )}

          {/* ── Paso 3: sesiones ── */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Sesiones ya realizadas</span>
                  <span className="text-muted-foreground">{hechas} de {filas.length} · {filas.length - hechas} pendientes</span>
                </div>
                <div className="mt-2 flex gap-0.5">
                  {filas.map((f, i) => (
                    <div key={f.key} className={cn('h-1.5 flex-1 rounded-full', i < hechas ? 'bg-primary' : 'bg-muted')} />
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Marcá rápido:</span>
                <Input type="number" min={0} max={filas.length} value={hechas}
                  onChange={(e) => marcarHasta(Math.max(0, Math.min(filas.length, Number(e.target.value) || 0)))}
                  className="h-8 w-20" />
                <span className="text-muted-foreground">de {filas.length}</span>
              </div>

              <div className="rounded-lg border divide-y max-h-72 overflow-y-auto">
                {filas.map((f) => (
                  <label key={f.key} className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={f.done} onChange={(e) => setFila(f.key, { done: e.target.checked })} className="h-4 w-4" />
                    <span className={cn(!f.done && 'text-muted-foreground')}>{f.nombre}</span>
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Las sesiones pendientes se agendan después desde la Agenda.
              </p>
            </div>
          )}

          {/* ── Paso 4: plan de pago ── */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2.5 text-sm">
                <span className="font-semibold">Saldo pendiente</span>
                <span className={cn('tabular-nums font-bold text-base', saldo > 0 ? 'text-foreground' : 'text-emerald-600')}>
                  {money(saldo)}
                </span>
              </div>

              {saldo <= 0 ? (
                <p className="rounded-lg border px-4 py-6 text-center text-sm text-muted-foreground">
                  No queda saldo pendiente.
                </p>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Cuotas pendientes (aún no pagadas)</Label>
                    <Button size="sm" variant="ghost" onClick={() => setPlan((p) => [...p, { valor_esperado: '', fecha_esperada: '', tipo: 'efectivo' }])}>
                      <Plus className="h-4 w-4 mr-1" />Cuota
                    </Button>
                  </div>
                  {plan.map((c, i) => (
                    <div key={i} className="flex gap-2">
                      <MoneyInput placeholder="Valor" value={c.valor_esperado}
                        onChange={(d) => setPlan((x) => x.map((y, j) => j === i ? { ...y, valor_esperado: d } : y))} className="h-9" />
                      <Input type="date" value={c.fecha_esperada ?? ''}
                        onChange={(e) => setPlan((x) => x.map((y, j) => j === i ? { ...y, fecha_esperada: e.target.value } : y))} className="h-9 w-40" />
                      <Button size="icon" variant="ghost" className="h-9 w-9 text-rose-600" onClick={() => setPlan((x) => x.filter((_, j) => j !== i))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {!planCuadra && (
                    <p className="text-[11px] text-amber-600">
                      Las cuotas suman {money(planSuma)}; deben sumar el saldo {money(saldo)}.
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Nota (opcional)</Label>
                <Textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Cualquier aclaración de la carga" />
              </div>
            </div>
          )}

          {/* ── Paso 5: confirmar ── */}
          {step === 4 && (
            <div className="space-y-4 text-sm">
              <p className="font-semibold">{pacienteNombre}</p>
              <ul className="space-y-1.5 text-muted-foreground">
                <li>· Tratamiento <strong className="text-foreground">{tipo === 'tratamiento' ? nombreTrat : descripcion}</strong> — {numSesionesTotal} sesiones — <strong className="text-foreground">{hechas} hechas, {numSesionesTotal - hechas} pendientes</strong></li>
                <li>· Pactado <strong className="text-foreground">{money(total)}</strong> · pagó <strong className="text-foreground">{money(pagado)}</strong> · debe <strong className="text-foreground">{money(saldo)}</strong>{saldo > 0 && plan.length > 0 && ` en ${plan.length} cuota(s)`}</li>
              </ul>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-800 space-y-0.5">
                <p>Se registra como <strong>datos previos</strong>:</p>
                <p>✗ no cuenta en el arqueo de caja ni en los ingresos del mes</p>
                <p>✗ no se le envían recordatorios por lo ya hecho</p>
                <p>✓ la deuda entra a Cartera y se puede cobrar normalmente</p>
                <p>✓ las sesiones pendientes se agendan como cualquier cita</p>
              </div>
            </div>
          )}

          {/* nav */}
          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={step === 0 ? cerrar : prev} disabled={mut.isPending}>
              <ArrowLeft className="h-4 w-4 mr-1.5" />{step === 0 ? 'Cancelar' : 'Atrás'}
            </Button>
            {step < PASOS.length - 1 ? (
              <Button onClick={next} disabled={!puedeAvanzar}>
                Siguiente<ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            ) : (
              <Button onClick={() => mut.mutate()} disabled={mut.isPending || !planCuadra || pagado > total}>
                {mut.isPending ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Cargando…</> : <><CheckCircle2 className="h-4 w-4 mr-1.5" />Confirmar y cargar</>}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
