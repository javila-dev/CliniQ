'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CalendarPlus, CheckCircle2, MessageCircle, MoreHorizontal, PhoneCall, Plus, Search, UserPlus,
} from 'lucide-react'
import { seguimientoApi } from '@/lib/api/seguimiento'
import { pacientesApi } from '@/lib/api/pacientes'
import { PageHeader } from '@/components/shared/PageHeader'
import { LoadingState } from '@/components/shared/LoadingState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { NuevaCitaModal } from '@/components/agenda/NuevaCitaModal'
import { PacienteForm } from '@/components/pacientes/PacienteForm'
import {
  GestionDialog, NuevoInteresadoDialog, PerderDialog, PosponerDialog,
} from '@/components/seguimiento/SeguimientoDialogs'
import { useDebounce } from '@/hooks/useDebounce'
import { useUserSedes } from '@/hooks/useUserSedes'
import { toast } from '@/hooks/use-toast'
import { useAuthStore } from '@/store/authStore'
import { hasPermission, PERM } from '@/lib/permissions'
import { cn, formatFechaLocal } from '@/lib/utils'
import type { BusquedaPaciente, CreatePacienteRequest } from '@/types/pacientes'
import type { CanalGestion, EtapaOportunidad, Oportunidad, ResultadoGestion } from '@/types/seguimiento'

const TODAS = 'todas'

function abrevCOP(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}k`
  return `$${value.toFixed(0)}`
}

function haceDias(dias: number): string {
  if (dias <= 0) return 'hoy'
  if (dias === 1) return 'ayer'
  return `hace ${dias} días`
}

function diasAtraso(fecha: string | null): number {
  if (!fecha) return 0
  const hoy = new Date(new Date().toLocaleDateString('en-CA') + 'T00:00:00')
  const f = new Date(fecha + 'T00:00:00')
  return Math.round((hoy.getTime() - f.getTime()) / 86_400_000)
}

/** Link de WhatsApp (wa.me). Sin teléfono o enmascarado -> null. */
function linkWhatsapp(op: Oportunidad): string | null {
  if (!op.telefono || op.telefono.includes('•')) return null
  const digitos = op.telefono.replace(/\D/g, '')
  if (digitos.length < 7) return null
  const numero = digitos.length === 10 ? `57${digitos}` : digitos
  const texto = `Hola ${op.nombre.split(' ')[0]}, `
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`
}

function pacienteBusqueda(id: string, nombre: string): BusquedaPaciente {
  return { id, nombre_completo: nombre, numero_documento: '', tipo_documento: 'CC', telefono: '', canal_confirmacion: 'whatsapp' }
}

// ─── Fila de "Para hoy" ──────────────────────────────────────────────────

function FilaOportunidad({
  op, canGestionar, onWhatsapp, onAgendar, onGestion, onPosponer, onPerder,
}: {
  op: Oportunidad
  canGestionar: boolean
  onWhatsapp: () => void
  onAgendar: () => void
  onGestion: () => void
  onPosponer: () => void
  onPerder: () => void
}) {
  const atraso = diasAtraso(op.proximo_contacto)
  const wa = linkWhatsapp(op)
  const g = op.ultima_gestion
  return (
    <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{op.nombre}</p>
          {op.tipo !== 'nueva' && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{op.tipo_nombre}</span>
          )}
          {!op.paciente && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">Sin ficha</span>
          )}
          {atraso > 0 && (
            <span className="text-xs text-amber-700">{atraso === 1 ? 'desde ayer' : `atrasada ${atraso} días`}</span>
          )}
        </div>
        <p className="text-sm text-muted-foreground truncate">{op.frase}</p>
        <p className="text-xs text-muted-foreground/80 mt-0.5">
          {g
            ? `${g.canal_nombre} · ${g.resultado_nombre} · ${haceDias(op.dias_sin_movimiento)}${g.usuario_nombre ? ` · ${g.usuario_nombre}` : ''}`
            : `Sin contactar · registrado ${haceDias(op.dias_sin_movimiento)}`}
        </p>
      </div>

      <div className="flex items-center gap-2 sm:shrink-0">
        {op.valor_estimado && Number(op.valor_estimado) > 0 && (
          <span className="mr-1 text-sm font-semibold tabular-nums">{abrevCOP(Number(op.valor_estimado))}</span>
        )}
        {canGestionar && (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={!wa}
              title={wa ? 'Escribir por WhatsApp' : 'Sin teléfono disponible'}
              onClick={onWhatsapp}
            >
              <MessageCircle className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">WhatsApp</span>
            </Button>
            {op.es_venta && op.etapa === 'nuevo' && (
              <Button size="sm" variant="outline" className="h-8" onClick={onAgendar}>
                <CalendarPlus className="h-3.5 w-3.5 sm:mr-1.5" />
                <span className="hidden sm:inline">Agendar</span>
              </Button>
            )}
            <Button size="sm" className="h-8" onClick={onGestion}>
              <PhoneCall className="h-3.5 w-3.5 mr-1.5" />
              Ya lo llamé
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Más opciones">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onPosponer}>Posponer…</DropdownMenuItem>
                {op.paciente && (
                  <DropdownMenuItem asChild><Link href={`/pacientes/${op.paciente}`}>Ver ficha del paciente</Link></DropdownMenuItem>
                )}
                {op.cotizacion && (
                  <DropdownMenuItem asChild><Link href={`/cotizaciones/${op.cotizacion}`}>Ver cotización</Link></DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={onPerder}>Cerrar como perdida…</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Embudo ──────────────────────────────────────────────────────────────

const COLUMNAS: { etapa: EtapaOportunidad; titulo: string; ayuda: string }[] = [
  { etapa: 'nuevo', titulo: 'Nuevo', ayuda: 'Preguntaron y aún no tienen cita' },
  { etapa: 'valoracion', titulo: 'Valoración', ayuda: 'Tienen o tuvieron cita de valoración' },
  { etapa: 'cotizado', titulo: 'Cotizado', ayuda: 'Ya recibieron la cotización' },
]

function Embudo({ sede }: { sede: string | undefined }) {
  const { data: resumen } = useQuery({
    queryKey: ['seguimiento', 'embudo', sede],
    queryFn: () => seguimientoApi.embudo({ sede }),
  })
  const { data: abiertas, isLoading } = useQuery({
    queryKey: ['seguimiento', 'oportunidades', 'embudo', sede],
    queryFn: () => seguimientoApi.list({ tipo: 'venta', sede, page_size: 200 }),
  })

  const porEtapa = useMemo(() => {
    const m: Record<string, Oportunidad[]> = { nuevo: [], valoracion: [], cotizado: [] }
    for (const op of abiertas?.results ?? []) if (op.etapa) m[op.etapa]?.push(op)
    return m
  }, [abiertas])

  if (isLoading) return <LoadingState rows={3} />

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {COLUMNAS.map((col) => {
          const res = resumen?.etapas.find((e) => e.etapa === col.etapa)
          const items = porEtapa[col.etapa] ?? []
          return (
            <div key={col.etapa} className="rounded-xl border bg-white">
              <div className="border-b px-4 py-3" title={col.ayuda}>
                <div className="flex items-baseline justify-between">
                  <p className="text-sm font-semibold">{col.titulo}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">{res?.cantidad ?? items.length}</p>
                </div>
                <p className="text-lg font-semibold tabular-nums text-primary">{abrevCOP(Number(res?.valor ?? 0))}</p>
              </div>
              <div className="max-h-[28rem] space-y-2 overflow-y-auto p-3">
                {items.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">Nadie en esta etapa</p>
                ) : items.map((op) => (
                  <div key={op.id} className="rounded-lg border bg-white px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{op.nombre}</p>
                      {op.valor_estimado && Number(op.valor_estimado) > 0 && (
                        <span className="text-xs font-medium tabular-nums">{abrevCOP(Number(op.valor_estimado))}</span>
                      )}
                    </div>
                    {op.interes && <p className="truncate text-xs text-muted-foreground">{op.interes}</p>}
                    <p className="text-xs text-muted-foreground/80">
                      {op.origen_nombre ? `${op.origen_nombre} · ` : ''}{haceDias(op.dias_sin_movimiento)} sin movimiento
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {resumen && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border bg-white px-4 py-3">
            <p className="text-xs text-muted-foreground">Ganadas este mes</p>
            <p className="text-lg font-semibold tabular-nums text-center">{resumen.ganadas.cantidad}</p>
            <p className="text-xs text-muted-foreground text-center">{abrevCOP(Number(resumen.ganadas.valor))}</p>
          </div>
          <div className="rounded-xl border bg-white px-4 py-3">
            <p className="text-xs text-muted-foreground">Perdidas este mes</p>
            <p className="text-lg font-semibold tabular-nums text-center">{resumen.perdidas.cantidad}</p>
            <p className="text-xs text-muted-foreground text-center truncate">
              {resumen.perdidas.por_motivo.length
                ? resumen.perdidas.por_motivo.slice(0, 2).map((m) => `${m.nombre} (${m.cantidad})`).join(' · ')
                : 'sin motivo registrado'}
            </p>
          </div>
          <div className="rounded-xl border bg-white px-4 py-3">
            <p className="text-xs text-muted-foreground">Cómo llegan este mes</p>
            {resumen.por_origen.length ? (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {resumen.por_origen.slice(0, 4).map((o) => (
                  <span key={o.origen} className="rounded-full bg-muted px-2 py-0.5 text-xs" title={`${o.ganadas} ganadas`}>
                    {o.nombre} <span className="font-medium tabular-nums">{o.cantidad}</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-1.5 text-xs text-muted-foreground">Registra cómo llegó cada interesado para verlo aquí.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Página ──────────────────────────────────────────────────────────────

export default function SeguimientoPage() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const canGestionar = hasPermission(user, PERM.SEGUIMIENTO_GESTIONAR)
  const { sedes } = useUserSedes()

  const [tab, setTab] = useState<'hoy' | 'embudo'>('hoy')
  const [mias, setMias] = useState(false)
  const [sede, setSede] = useState(TODAS)
  const [busqueda, setBusqueda] = useState('')
  const q = useDebounce(busqueda, 350)
  const sedeParam = sede !== TODAS ? sede : undefined

  const [nuevoOpen, setNuevoOpen] = useState(false)
  const [nuevoError, setNuevoError] = useState<string | null>(null)
  const [gestion, setGestion] = useState<{ op: Oportunidad; canal: CanalGestion; resultado: ResultadoGestion | null } | null>(null)
  const [posponer, setPosponer] = useState<Oportunidad | null>(null)
  const [perder, setPerder] = useState<Oportunidad | null>(null)
  const [fichaPara, setFichaPara] = useState<Oportunidad | null>(null)
  const [citaPara, setCitaPara] = useState<BusquedaPaciente | null>(null)

  const params = { para_hoy: '1' as const, sede: sedeParam, ...(mias ? { mias: '1' as const } : {}), ...(q ? { q } : {}) }
  const { data, isLoading } = useQuery({
    queryKey: ['seguimiento', 'oportunidades', 'hoy', params],
    queryFn: () => seguimientoApi.list({ ...params, page_size: 100 }),
    enabled: tab === 'hoy',
  })
  const { data: resumen } = useQuery({
    queryKey: ['seguimiento', 'embudo', sedeParam],
    queryFn: () => seguimientoApi.embudo({ sede: sedeParam }),
  })

  function refrescar() {
    qc.invalidateQueries({ queryKey: ['seguimiento'] })
  }
  function errorDe(err: unknown, titulo: string) {
    const data = (err as { response?: { data?: { error?: string; detail?: string } } })?.response?.data
    toast.error(titulo, data?.error ?? data?.detail ?? 'Vuelve a intentarlo en un momento.')
  }

  const crear = useMutation({
    mutationFn: seguimientoApi.crear,
    onSuccess: (op) => {
      refrescar()
      setNuevoOpen(false)
      toast.success('Interesado registrado', op.paciente ? `Ya era paciente: quedó vinculado a ${op.nombre}.` : 'Aparece en "Para hoy".')
    },
    onError: (err: unknown) => {
      const data = (err as { response?: { data?: { error?: string } } })?.response?.data
      setNuevoError(data?.error ?? 'No se pudo guardar. Revisa los datos.')
    },
  })
  const registrar = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof seguimientoApi.registrarGestion>[1] }) =>
      seguimientoApi.registrarGestion(id, data),
    onSuccess: () => { refrescar(); setGestion(null) },
    onError: (err) => errorDe(err, 'No se pudo guardar'),
  })
  const pospone = useMutation({
    mutationFn: ({ id, fecha }: { id: string; fecha: string }) => seguimientoApi.actualizar(id, { proximo_contacto: fecha }),
    onSuccess: (op) => { refrescar(); setPosponer(null); toast.success('Pospuesta', `Vuelve a aparecer el ${formatFechaLocal(op.proximo_contacto)}.`) },
    onError: (err) => errorDe(err, 'No se pudo posponer'),
  })
  const pierde = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof seguimientoApi.perder>[1] }) => seguimientoApi.perder(id, data),
    onSuccess: () => { refrescar(); setPerder(null); setGestion(null) },
    onError: (err) => errorDe(err, 'No se pudo cerrar'),
  })
  const [creandoFicha, setCreandoFicha] = useState(false)

  async function crearFicha(datos: CreatePacienteRequest) {
    if (!fichaPara) return
    setCreandoFicha(true)
    try {
      const paciente = await pacientesApi.create(datos)
      await seguimientoApi.vincularPaciente(fichaPara.id, paciente.id)
      refrescar()
      setFichaPara(null)
      setCitaPara(pacienteBusqueda(paciente.id, paciente.nombre_completo))
    } catch (err) {
      errorDe(err, 'No se pudo crear la ficha')
    } finally {
      setCreandoFicha(false)
    }
  }

  function agendar(op: Oportunidad) {
    if (op.paciente) setCitaPara(pacienteBusqueda(op.paciente, op.nombre))
    else setFichaPara(op)
  }

  function whatsapp(op: Oportunidad) {
    const url = linkWhatsapp(op)
    if (!url) return
    window.open(url, '_blank', 'noopener,noreferrer')
    setGestion({ op, canal: 'whatsapp_manual', resultado: 'enviado' })
  }

  const lista = data?.results ?? []

  return (
    <div className="space-y-4">
      <PageHeader
        title="Seguimiento"
        description="A quién contactar hoy y cómo va cada interesado."
        action={canGestionar ? (
          <Button onClick={() => { setNuevoError(null); setNuevoOpen(true) }}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo interesado
          </Button>
        ) : undefined}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'hoy' | 'embudo')}>
          <TabsList className="h-9">
            <TabsTrigger value="hoy" className="text-sm">
              Para hoy{resumen ? <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 text-xs text-primary tabular-nums">{resumen.para_hoy}</span> : null}
            </TabsTrigger>
            <TabsTrigger value="embudo" className="text-sm">Embudo</TabsTrigger>
          </TabsList>
        </Tabs>

        {tab === 'hoy' && (
          <>
            <div className="inline-flex rounded-lg border bg-white p-0.5 text-sm">
              {[{ v: false, l: 'Todas' }, { v: true, l: 'Mías' }].map((o) => (
                <button
                  key={o.l}
                  type="button"
                  onClick={() => setMias(o.v)}
                  className={cn('rounded-md px-3 py-1 transition-colors', mias === o.v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
                >
                  {o.l}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre o teléfono…" className="h-9 w-56 pl-8" />
            </div>
          </>
        )}
        {sedes.length > 1 && (
          <Select value={sede} onValueChange={setSede}>
            <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODAS}>Todas las sedes</SelectItem>
              {sedes.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {tab === 'embudo' ? (
        <Embudo sede={sedeParam} />
      ) : isLoading ? (
        <LoadingState rows={4} />
      ) : lista.length === 0 ? (
        <div className="rounded-xl border bg-white py-16 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-green-500/70" />
          <p className="font-medium">{q || mias ? 'Nadie con esos filtros' : 'Listo por hoy'}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {q || mias ? 'Prueba quitando los filtros.' : 'No hay a quién contactar. Cuando alguien pregunte, regístralo con "Nuevo interesado".'}
          </p>
          {canGestionar && !q && !mias && (
            <Button variant="outline" size="sm" className="mt-4" onClick={() => { setNuevoError(null); setNuevoOpen(true) }}>
              <UserPlus className="h-3.5 w-3.5 mr-1.5" />
              Nuevo interesado
            </Button>
          )}
        </div>
      ) : (
        <div className="divide-y rounded-xl border bg-white">
          {lista.map((op) => (
            <FilaOportunidad
              key={op.id}
              op={op}
              canGestionar={canGestionar}
              onWhatsapp={() => whatsapp(op)}
              onAgendar={() => agendar(op)}
              onGestion={() => setGestion({ op, canal: 'llamada', resultado: null })}
              onPosponer={() => setPosponer(op)}
              onPerder={() => setPerder(op)}
            />
          ))}
        </div>
      )}

      <NuevoInteresadoDialog
        open={nuevoOpen}
        onOpenChange={setNuevoOpen}
        loading={crear.isPending}
        error={nuevoError}
        onConfirm={(d) => { setNuevoError(null); crear.mutate(d) }}
      />
      <GestionDialog
        open={gestion !== null}
        onOpenChange={(v) => { if (!v) setGestion(null) }}
        nombre={gestion?.op.nombre ?? ''}
        canalInicial={gestion?.canal}
        resultadoInicial={gestion?.resultado ?? null}
        loading={registrar.isPending}
        onConfirm={(d) => gestion && registrar.mutate({ id: gestion.op.id, data: d })}
        onPerder={() => { if (gestion) { setPerder(gestion.op); setGestion(null) } }}
      />
      <PosponerDialog
        open={posponer !== null}
        onOpenChange={(v) => { if (!v) setPosponer(null) }}
        loading={pospone.isPending}
        onConfirm={(fecha) => posponer && pospone.mutate({ id: posponer.id, fecha })}
      />
      <PerderDialog
        open={perder !== null}
        onOpenChange={(v) => { if (!v) setPerder(null) }}
        nombre={perder?.nombre ?? ''}
        loading={pierde.isPending}
        onConfirm={(d) => perder && pierde.mutate({ id: perder.id, data: d })}
      />

      {/* Interesado sin ficha: se completa antes de agendar la valoración */}
      <Dialog open={fichaPara !== null} onOpenChange={(v) => { if (!v && !creandoFicha) setFichaPara(null) }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Completa la ficha para agendar</DialogTitle>
            <DialogDescription>
              Para darle una cita, {fichaPara?.nombre.split(' ')[0]} necesita ficha de paciente. Después eliges el horario.
            </DialogDescription>
          </DialogHeader>
          {fichaPara && (
            <PacienteForm
              onSubmit={crearFicha}
              isLoading={creandoFicha}
              submitLabel="Crear ficha y agendar"
              initialNombre={fichaPara.contacto_nombre}
              initialTelefono={fichaPara.telefono.includes('•') ? undefined : fichaPara.telefono}
              compact
            />
          )}
        </DialogContent>
      </Dialog>

      <NuevaCitaModal
        open={citaPara !== null}
        onOpenChange={(v) => { if (!v) setCitaPara(null) }}
        defaultPaciente={citaPara}
        onCreated={() => {
          refrescar()
          toast.success('Valoración agendada', 'Pasó a la etapa Valoración.')
        }}
      />
    </div>
  )
}
