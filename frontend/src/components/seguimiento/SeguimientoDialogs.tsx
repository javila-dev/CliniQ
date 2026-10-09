'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { PhoneInput } from '@/components/ui/phone-input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useUserSedes } from '@/hooks/useUserSedes'
import { cn } from '@/lib/utils'
import {
  MOTIVOS_PERDIDA,
  ORIGENES,
  RESULTADOS_GESTION,
  type CanalGestion,
  type CrearInteresadoRequest,
  type MotivoPerdida,
  type OrigenOportunidad,
  type RegistrarGestionRequest,
  type ResultadoGestion,
} from '@/types/seguimiento'

// ── Utilidades ────────────────────────────────────────────────────────────

export function isoEnDias(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return d.toLocaleDateString('en-CA')
}

/** Chips de un toque (selección única, se puede quitar con otro toque). */
export function Chips<T extends string>({
  opciones, valor, onChange, size = 'md',
}: {
  opciones: { value: T; label: string }[]
  valor: T | null
  onChange: (v: T | null) => void
  size?: 'sm' | 'md'
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {opciones.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(valor === o.value ? null : o.value)}
          className={cn(
            'rounded-full border transition-colors',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
            valor === o.value
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-white text-foreground hover:bg-muted',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Botones({ onCancel, onOk, okLabel, loading, disabled, destructive }: {
  onCancel: () => void
  onOk: () => void
  okLabel: string
  loading?: boolean
  disabled?: boolean
  destructive?: boolean
}) {
  return (
    <div className="flex gap-2 pt-1">
      <Button variant="outline" className="flex-1" onClick={onCancel} disabled={loading}>Cancelar</Button>
      <Button
        className="flex-1"
        variant={destructive ? 'destructive' : 'default'}
        onClick={onOk}
        disabled={loading || disabled}
      >
        {loading ? 'Guardando…' : okLabel}
      </Button>
    </div>
  )
}

// ── + Nuevo interesado ────────────────────────────────────────────────────

export function NuevoInteresadoDialog({ open, onOpenChange, loading, error, onConfirm }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  loading?: boolean
  error?: string | null
  onConfirm: (data: CrearInteresadoRequest) => void
}) {
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [interes, setInteres] = useState('')
  const [origen, setOrigen] = useState<OrigenOportunidad | null>(null)
  const [mas, setMas] = useState(false)
  const [valor, setValor] = useState('')
  const [fecha, setFecha] = useState(isoEnDias(0))
  // Sedes del usuario (/me); con una sola se asigna sola y no se muestra.
  const { sedes, defaultSedeId } = useUserSedes()
  const sedeInicial = defaultSedeId ?? sedes[0]?.id ?? ''
  const [sede, setSede] = useState(sedeInicial)

  useEffect(() => {
    if (!open) {
      setNombre(''); setTelefono(''); setInteres(''); setOrigen(null)
      setMas(false); setValor(''); setFecha(isoEnDias(0))
    } else {
      setSede(sedeInicial)
    }
  }, [open, sedeInicial])

  // PhoneInput entrega "+57 3001234567": se valida el número sin el indicativo.
  const numeroLocal = telefono.split(' ').slice(1).join('')
  const valido = nombre.trim().length > 1 && numeroLocal.length >= 7 && (sedes.length <= 1 || !!sede)

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!loading) onOpenChange(v) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo interesado</DialogTitle>
          <DialogDescription>Alguien que preguntó y todavía no es paciente. Si el teléfono ya es de un paciente, lo vinculamos.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nombre</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Laura Pérez" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Teléfono</Label>
            <PhoneInput key={open ? 'abierto' : 'cerrado'} value={telefono} onChange={setTelefono} placeholder="3001234567" />
          </div>
          {sedes.length > 1 && (
            <div className="space-y-1.5">
              <Label>Sede</Label>
              <Select value={sede} onValueChange={setSede}>
                <SelectTrigger><SelectValue placeholder="Elige la sede" /></SelectTrigger>
                <SelectContent>
                  {sedes.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>¿Qué le interesa?</Label>
            <Input value={interes} onChange={(e) => setInteres(e.target.value)} placeholder="Ej. depilación axilas, bótox" />
          </div>
          <div className="space-y-1.5">
            <Label>¿Cómo llegó? <span className="font-normal text-muted-foreground">(opcional)</span></Label>
            <Chips<OrigenOportunidad> opciones={ORIGENES} valor={origen} onChange={setOrigen} size="sm" />
          </div>

          {mas ? (
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Valor estimado</Label>
                <Input value={valor} onChange={(e) => setValor(e.target.value.replace(/[^\d]/g, ''))} placeholder="$" inputMode="numeric" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Llamar el</Label>
                <Input type="date" value={fecha} min={isoEnDias(0)} onChange={(e) => setFecha(e.target.value)} />
              </div>
            </div>
          ) : (
            <button type="button" className="text-xs text-primary hover:underline" onClick={() => setMas(true)}>
              Más opciones
            </button>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <Botones
          onCancel={() => onOpenChange(false)}
          okLabel="Guardar"
          loading={loading}
          disabled={!valido}
          onOk={() => onConfirm({
            nombre: nombre.trim(),
            telefono: telefono.trim(),
            interes: interes.trim(),
            origen: origen ?? '',
            valor_estimado: valor ? valor : null,
            proximo_contacto: fecha || null,
            sede: sede || null,
          })}
        />
      </DialogContent>
    </Dialog>
  )
}

// ── Ya lo llamé (registrar gestión) ───────────────────────────────────────

const CANALES: { value: CanalGestion; label: string }[] = [
  { value: 'llamada', label: 'Llamada' },
  { value: 'whatsapp_manual', label: 'WhatsApp' },
  { value: 'presencial', label: 'En persona' },
  { value: 'nota', label: 'Solo una nota' },
]

export function GestionDialog({ open, onOpenChange, nombre, canalInicial = 'llamada', resultadoInicial = null, loading, onConfirm, onPerder }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  nombre: string
  canalInicial?: CanalGestion
  resultadoInicial?: ResultadoGestion | null
  loading?: boolean
  onConfirm: (data: RegistrarGestionRequest) => void
  /** "No le interesa": ofrece cerrar como perdida en vez de solo anotar. */
  onPerder: () => void
}) {
  const [canal, setCanal] = useState<CanalGestion>(canalInicial)
  const [resultado, setResultado] = useState<ResultadoGestion | null>(resultadoInicial)
  const [fecha, setFecha] = useState('')
  const [nota, setNota] = useState('')

  useEffect(() => {
    if (open) {
      setCanal(canalInicial); setResultado(resultadoInicial); setNota('')
      const dias = RESULTADOS_GESTION.find((r) => r.value === resultadoInicial)?.dias
      setFecha(dias == null ? '' : isoEnDias(dias))
    }
  }, [open, canalInicial, resultadoInicial])

  function elegirResultado(r: ResultadoGestion | null) {
    setResultado(r)
    const dias = RESULTADOS_GESTION.find((x) => x.value === r)?.dias
    setFecha(dias == null ? '' : isoEnDias(dias))
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!loading) onOpenChange(v) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>¿Cómo te fue con {nombre.split(' ')[0]}?</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Por dónde</Label>
            <Chips<CanalGestion> opciones={CANALES} valor={canal} onChange={(v) => v && setCanal(v)} size="sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Qué pasó</Label>
            <Chips<ResultadoGestion> opciones={RESULTADOS_GESTION} valor={resultado} onChange={elegirResultado} />
          </div>

          {resultado === 'no_interesado' ? (
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <p>Si ya no le interesa, ciérrala como perdida para que no vuelva a aparecer.</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={onPerder}>Cerrar como perdida</Button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Volver a contactar</Label>
              <div className="flex items-center gap-2">
                <Input type="date" value={fecha} min={isoEnDias(0)} onChange={(e) => setFecha(e.target.value)} className="w-44" />
                {fecha ? (
                  <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => setFecha('')}>
                    Sin fecha
                  </button>
                ) : (
                  <span className="text-xs text-muted-foreground">Sin fecha: sale de &quot;Para hoy&quot;</span>
                )}
              </div>
            </div>
          )}

          <Textarea value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota (opcional)" rows={2} />
        </div>

        <Botones
          onCancel={() => onOpenChange(false)}
          okLabel="Guardar"
          loading={loading}
          disabled={!resultado && canal !== 'nota'}
          onOk={() => onConfirm({
            canal,
            resultado: resultado ?? 'otro',
            nota: nota.trim(),
            ...(fecha ? { proximo_contacto: fecha } : { sin_fecha: true }),
          })}
        />
      </DialogContent>
    </Dialog>
  )
}

// ── Posponer ──────────────────────────────────────────────────────────────

export function PosponerDialog({ open, onOpenChange, loading, onConfirm }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  loading?: boolean
  onConfirm: (fecha: string) => void
}) {
  const [fecha, setFecha] = useState(isoEnDias(1))
  useEffect(() => { if (open) setFecha(isoEnDias(1)) }, [open])
  const rapidas = [
    { dias: 1, label: 'Mañana' },
    { dias: 3, label: 'En 3 días' },
    { dias: 7, label: 'En una semana' },
    { dias: 30, label: 'En un mes' },
  ]
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!loading) onOpenChange(v) }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Volver a contactar el…</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          {rapidas.map((r) => (
            <Button key={r.dias} type="button" size="sm" variant={fecha === isoEnDias(r.dias) ? 'default' : 'outline'} onClick={() => setFecha(isoEnDias(r.dias))}>
              {r.label}
            </Button>
          ))}
        </div>
        <Input type="date" value={fecha} min={isoEnDias(0)} onChange={(e) => setFecha(e.target.value)} />
        <Botones onCancel={() => onOpenChange(false)} okLabel="Posponer" loading={loading} disabled={!fecha} onOk={() => onConfirm(fecha)} />
      </DialogContent>
    </Dialog>
  )
}

// ── Perdida ───────────────────────────────────────────────────────────────

export function PerderDialog({ open, onOpenChange, nombre, loading, onConfirm }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  nombre: string
  loading?: boolean
  onConfirm: (data: { motivo?: MotivoPerdida; nota?: string }) => void
}) {
  const [motivo, setMotivo] = useState<MotivoPerdida | null>(null)
  const [nota, setNota] = useState('')
  useEffect(() => { if (open) { setMotivo(null); setNota('') } }, [open])
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!loading) onOpenChange(v) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cerrar como perdida</DialogTitle>
          <DialogDescription>¿Por qué {nombre.split(' ')[0]} no siguió? Ayuda a ver dónde se pierden las ventas.</DialogDescription>
        </DialogHeader>
        <Chips<MotivoPerdida> opciones={MOTIVOS_PERDIDA} valor={motivo} onChange={setMotivo} />
        <Textarea value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota (opcional)" rows={2} />
        <p className="text-xs text-muted-foreground">Si lo va a pensar, mejor posponla: vuelve a aparecer el día que elijas.</p>
        <Botones
          onCancel={() => onOpenChange(false)}
          okLabel="Cerrar como perdida"
          destructive
          loading={loading}
          onOk={() => onConfirm({ motivo: motivo ?? undefined, nota: nota.trim() || undefined })}
        />
      </DialogContent>
    </Dialog>
  )
}
