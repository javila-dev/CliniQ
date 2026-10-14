'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { seguimientoApi } from '@/lib/api/seguimiento'
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
          aria-pressed={valor === o.value}
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
  // Puede traer un enlace (p. ej. "Abrir su seguimiento", M5-26).
  error?: React.ReactNode
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
  const sedeInicial = sedes.length > 1 ? (defaultSedeId ?? '') : (sedes[0]?.id ?? '')
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
            <Label htmlFor="interesado-nombre">Nombre</Label>
            <Input id="interesado-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Laura Pérez" autoFocus />
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
            <Label htmlFor="interesado-interes">¿Qué le interesa?</Label>
            <Input id="interesado-interes" value={interes} onChange={(e) => setInteres(e.target.value)} placeholder="Ej. depilación axilas, bótox" />
          </div>
          <div className="space-y-1.5">
            <Label>¿Cómo llegó? <span className="font-normal text-muted-foreground">(opcional)</span></Label>
            <Chips<OrigenOportunidad> opciones={ORIGENES} valor={origen} onChange={setOrigen} size="sm" />
          </div>

          {mas ? (
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3">
              <div className="space-y-1.5">
                <Label htmlFor="interesado-valor" className="text-xs">Valor estimado</Label>
                <Input id="interesado-valor" value={valor ? `$ ${Number(valor).toLocaleString('es-CO')}` : ''} onChange={(e) => setValor(e.target.value.replace(/[^\d]/g, '').slice(0, 12))} placeholder="Ej. $ 1.500.000" inputMode="numeric" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="interesado-fecha" className="text-xs">Contactar el</Label>
                <Input id="interesado-fecha" type="date" value={fecha} min={isoEnDias(0)} onChange={(e) => setFecha(e.target.value)} />
              </div>
            </div>
          ) : (
            <button type="button" className="text-xs text-primary hover:underline" onClick={() => setMas(true)}>
              Más opciones
            </button>
          )}

          {error && <div className="text-sm text-destructive">{error}</div>}
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

// ── Anotar resultado (registrar gestión) ──────────────────────────────────

const CANALES: { value: CanalGestion; label: string }[] = [
  { value: 'llamada', label: 'Llamada' },
  { value: 'whatsapp_manual', label: 'WhatsApp' },
  { value: 'presencial', label: 'En persona' },
  { value: 'nota', label: 'Solo una nota' },
]

/** Últimas gestiones del interesado: quién lo contactó, cuándo y qué pasó. */
function HistorialGestiones({ oportunidadId }: { oportunidadId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['seguimiento', 'gestiones', oportunidadId],
    queryFn: () => seguimientoApi.gestiones(oportunidadId),
  })
  if (isLoading) return <p className="text-xs text-muted-foreground">Cargando contactos anteriores…</p>
  if (isError) return <p className="text-xs text-muted-foreground">No se pudieron cargar los contactos anteriores.</p>
  if (!data?.length) return <p className="text-xs text-muted-foreground">Es el primer contacto.</p>
  return (
    <details className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
      <summary className="cursor-pointer select-none font-medium">
        {data.length} contacto{data.length !== 1 ? 's' : ''} anterior{data.length !== 1 ? 'es' : ''}
      </summary>
      <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto">
        {data.slice(0, 20).map((g) => (
          <li key={g.id}>
            <span className="text-muted-foreground">
              {new Date(g.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}
              {g.usuario_nombre ? ` · ${g.usuario_nombre}` : ''} · {g.canal_nombre}:
            </span>{' '}
            <span className="font-medium">{g.resultado_nombre}</span>
            {g.nota && <span className="text-muted-foreground"> — {g.nota}</span>}
          </li>
        ))}
      </ul>
    </details>
  )
}

export function GestionDialog({ open, onOpenChange, nombre, oportunidadId, canalInicial = 'llamada', resultadoInicial = null, loading, onConfirm, onPerder, onAgendar }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  nombre: string
  /** Para mostrar las gestiones anteriores (antes no se veían en ningún lado). */
  oportunidadId?: string
  canalInicial?: CanalGestion
  resultadoInicial?: ResultadoGestion | null
  loading?: boolean
  onConfirm: (data: RegistrarGestionRequest) => void
  /** "No le interesa" / "Número errado": la saca de la lista en vez de solo anotar. */
  onPerder: () => void
  /** "Agendó": abre la agenda para crear la cita (si aplica). */
  onAgendar?: () => void
}) {
  const [canal, setCanal] = useState<CanalGestion>(canalInicial)
  const [resultado, setResultado] = useState<ResultadoGestion | null>(resultadoInicial)
  const [fecha, setFecha] = useState('')
  const [nota, setNota] = useState('')

  useEffect(() => {
    if (open) {
      setCanal(canalInicial); setResultado(resultadoInicial); setNota('')
      setFecha(isoEnDias(diasSegun(resultadoInicial)))
    }
  }, [open, canalInicial, resultadoInicial])

  // Siempre queda una fecha para volver a contactar: así nadie se pierde de la
  // lista sin cerrarse. Para sacarla de la lista está "Ya no le interesa".
  function diasSegun(r: ResultadoGestion | null): number {
    return RESULTADOS_GESTION.find((x) => x.value === r)?.dias ?? 1
  }
  function elegirResultado(r: ResultadoGestion | null) {
    setResultado(r)
    setFecha(isoEnDias(diasSegun(r)))
  }
  const sacaDeLaLista = resultado === 'no_interesado' || resultado === 'numero_errado'

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!loading) onOpenChange(v) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>¿Cómo te fue con {nombre.split(' ')[0]}?</DialogTitle>
          <DialogDescription>Anota qué pasó y cuándo volver a contactar.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {open && oportunidadId && <HistorialGestiones oportunidadId={oportunidadId} />}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Por dónde</Label>
            <Chips<CanalGestion> opciones={CANALES} valor={canal} onChange={(v) => v && setCanal(v)} size="sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Qué pasó</Label>
            <Chips<ResultadoGestion> opciones={RESULTADOS_GESTION} valor={resultado} onChange={elegirResultado} />
          </div>

          {sacaDeLaLista ? (
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <p>
                {resultado === 'numero_errado'
                  ? 'Si no hay otro número para contactarle, sácalo de la lista.'
                  : 'Si ya no le interesa, sácalo de la lista para que no vuelva a aparecer.'}
              </p>
              <Button variant="outline" size="sm" className="mt-2" onClick={onPerder}>Sacar de la lista…</Button>
            </div>
          ) : (
            <>
              {resultado === 'agendo' && onAgendar && (
                <div className="rounded-lg bg-primary/5 p-3 text-sm">
                  <p>Si la cita aún no está en la agenda, créala ahora para que quede registrada.</p>
                  <Button size="sm" className="mt-2" onClick={onAgendar}>Agendar ahora</Button>
                </div>
              )}
              {resultado === 'agendo' ? (
                <p className="text-xs text-muted-foreground">Volverá a aparecer el día después de su cita (o mañana, si aún no la tiene en la agenda).</p>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="gestion-fecha" className="text-xs text-muted-foreground">Volver a contactar el</Label>
                  <Input id="gestion-fecha" type="date" value={fecha} min={isoEnDias(0)} onChange={(e) => setFecha(e.target.value)} className="w-44" />
                </div>
              )}
            </>
          )}

          <Textarea value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota (opcional)" rows={2} />
        </div>

        <Botones
          onCancel={() => onOpenChange(false)}
          okLabel="Guardar"
          loading={loading}
          disabled={(!resultado && canal !== 'nota') || sacaDeLaLista || (!fecha && resultado !== 'agendo')}
          onOk={() => onConfirm({
            canal,
            resultado: resultado ?? 'otro',
            nota: nota.trim(),
            // "Agendó": el backend la programa para el día después de la cita.
            ...(resultado === 'agendo' ? {} : { proximo_contacto: fecha }),
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
          <DialogTitle>¿Cuándo volver a contactar?</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          {rapidas.map((r) => (
            <Button key={r.dias} type="button" size="sm" variant={fecha === isoEnDias(r.dias) ? 'default' : 'outline'} onClick={() => setFecha(isoEnDias(r.dias))}>
              {r.label}
            </Button>
          ))}
        </div>
        <Input type="date" value={fecha} min={isoEnDias(0)} onChange={(e) => setFecha(e.target.value)} />
        <Botones onCancel={() => onOpenChange(false)} okLabel="Guardar fecha" loading={loading} disabled={!fecha} onOk={() => onConfirm(fecha)} />
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
          <DialogTitle>Sacar de la lista</DialogTitle>
          <DialogDescription>¿Por qué {nombre.split(' ')[0]} no siguió? (opcional) Sirve para ver por qué se pierden ventas.</DialogDescription>
        </DialogHeader>
        <Chips<MotivoPerdida> opciones={MOTIVOS_PERDIDA} valor={motivo} onChange={setMotivo} />
        <Textarea value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota (opcional)" rows={2} />
        <p className="text-xs text-muted-foreground">Si lo va a pensar, mejor cambia la fecha de contacto: vuelve a aparecer el día que elijas.</p>
        <Botones
          onCancel={() => onOpenChange(false)}
          okLabel="Sacar de la lista"
          destructive
          loading={loading}
          onOk={() => onConfirm({ motivo: motivo ?? undefined, nota: nota.trim() || undefined })}
        />
      </DialogContent>
    </Dialog>
  )
}
