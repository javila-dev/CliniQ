'use client'

// Seguimiento de las pruebas: quién se está activando de verdad, quién se quedó
// y a quién hay que escribirle hoy. Más abajo, el embudo por semana de registro.
// Ver docs/plan-trial-suscripciones-y-facturacion.md (§6).

import { useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarPlus, FlaskConical, Mail, MailCheck, MessageCircle, NotebookPen } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { adminApi } from '@/lib/api/admin'
import { coreApi } from '@/lib/api/core'
import { suscripcionesApi } from '@/lib/api/suscripciones'
import { cn } from '@/lib/utils'
import type { CanalNota, CohorteEmbudo, FiltroSeguimiento, FilaSeguimiento, SemaforoActivacion } from '@/types/suscripciones'
import { serverErrorMessage } from '../clinicas/_shared'
import { ESTADO_SUSCRIPCION_BADGE, ExtenderPruebaDialog, resumenSuscripcion } from '../clinicas/_suscripcion'

const FILTROS: { key: FiltroSeguimiento; label: string }[] = [
  { key: 'pruebas',            label: 'Pruebas' },
  { key: 'por_vencer',         label: 'Por vencer' },
  { key: 'en_riesgo',          label: 'En riesgo' },
  { key: 'activadas',          label: 'Activadas' },
  { key: 'vencidas',           label: 'Vencidas sin pago' },
  { key: 'manuales_sin_fecha', label: 'Manuales sin fecha' },
]

const SEMAFORO: Record<SemaforoActivacion, { label: string; punto: string }> = {
  activada:  { label: 'Activada',  punto: 'bg-emerald-500' },
  en_camino: { label: 'En camino', punto: 'bg-sky-500' },
  en_riesgo: { label: 'En riesgo', punto: 'bg-amber-500' },
  dormida:   { label: 'Dormida',   punto: 'bg-red-500' },
}

const CANALES: { value: CanalNota; label: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'llamada',  label: 'Llamada' },
  { value: 'correo',   label: 'Correo' },
  { value: 'reunion',  label: 'Reunión' },
  { value: 'otro',     label: 'Otro' },
]

const PERFIL_ESPECIALIDAD: Record<string, string> = {
  estetica: 'Estética', obesidad: 'Obesidad y nutrición', dermatologia: 'Dermatología', spa: 'Spa', otra: 'Otra',
}
const PERFIL_PROFESIONALES: Record<string, string> = {
  '1': '1 profesional', '2-3': '2-3 profesionales', '4-10': '4-10 profesionales', mas_10: 'más de 10 profesionales',
}

const PERFIL_CARGO: Record<string, string> = {
  duenio: 'Dueño(a) o socio(a)', director_medico: 'Director(a) médico(a)', administrador: 'Administrador(a) o gerente',
  profesional: 'Profesional', recepcion: 'Recepción', otro: 'Otro rol',
}

const fechaCorta = (iso: string | null) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) : '—'

function hace(iso: string | null): string {
  if (!iso) return 'Nunca'
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (dias <= 0) return 'Hoy'
  if (dias === 1) return 'Ayer'
  return `Hace ${dias} días`
}

/** Los diez hitos como puntos: lleno = alcanzado. */
function Avance({ fila }: { fila: FilaSeguimiento }) {
  const alcanzados = fila.hitos.filter(h => h.alcanzado_el).length
  return (
    <div>
      <div className="flex gap-1">
        {fila.hitos.map(h => (
          <span
            key={h.clave}
            title={`${h.etiqueta}${h.alcanzado_el ? ` · ${fechaCorta(h.alcanzado_el)}` : ' · pendiente'}`}
            className={cn('h-2.5 w-2.5 rounded-full', h.alcanzado_el ? 'bg-primary' : 'bg-gray-200')}
          />
        ))}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {alcanzados}/{fila.hitos.length} · {fila.atenciones_completadas} atenciones
      </p>
      {fila.numero_propio_conectado && <p className="text-xs font-medium text-emerald-700">Conectó su WhatsApp</p>}
    </div>
  )
}

function NotasDialog({ fila, onClose }: { fila: FilaSeguimiento | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [canal, setCanal] = useState<CanalNota>('whatsapp')
  const [texto, setTexto] = useState('')
  const [proximo, setProximo] = useState('')
  const clinicaId = fila?.clinica_id ?? ''

  const { data: notas } = useQuery({
    queryKey: ['admin-notas-seguimiento', clinicaId],
    queryFn: () => suscripcionesApi.notas(clinicaId),
    enabled: !!fila,
  })
  const mutation = useMutation({
    mutationFn: () => suscripcionesApi.crearNota(clinicaId, { canal, texto: texto.trim(), proximo_contacto: proximo || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-notas-seguimiento', clinicaId] })
      qc.invalidateQueries({ queryKey: ['admin-seguimiento'] })
      setTexto('')
      setProximo('')
    },
  })

  return (
    <Dialog open={!!fila} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Seguimiento · {fila?.clinica_nombre}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Canal</Label>
              <Select value={canal} onValueChange={v => setCanal(v as CanalNota)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CANALES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proximo-contacto">Próximo contacto</Label>
              <Input id="proximo-contacto" type="date" value={proximo} onChange={e => setProximo(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="texto-nota">Qué pasó</Label>
            <Textarea id="texto-nota" rows={3} placeholder="Ej.: le escribí, no ha creado procedimientos; agendamos llamada el jueves" value={texto} onChange={e => setTexto(e.target.value)} />
          </div>
          {mutation.isError && (
            <p className="text-sm text-destructive">{serverErrorMessage(mutation.error) ?? 'No se pudo guardar la nota.'}</p>
          )}
          <div className="flex justify-end">
            <Button onClick={() => mutation.mutate()} disabled={!texto.trim() || mutation.isPending}>
              {mutation.isPending ? 'Guardando…' : 'Guardar nota'}
            </Button>
          </div>
        </div>

        <div className="max-h-64 space-y-2 overflow-y-auto border-t pt-3">
          {notas?.length ? notas.map(n => (
            <div key={n.id} className="rounded-lg bg-muted/50 px-3 py-2">
              <p className="text-xs text-muted-foreground">
                {fechaCorta(n.created_at)} · {CANALES.find(c => c.value === n.canal)?.label}
                {n.autor_nombre && ` · ${n.autor_nombre}`}
                {n.proximo_contacto && ` · volver a contactar el ${fechaCorta(n.proximo_contacto)}`}
              </p>
              <p className="mt-0.5 whitespace-pre-line text-sm">{n.texto}</p>
            </div>
          )) : (
            <p className="text-sm text-muted-foreground">Aún no hay notas de seguimiento.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Enciende o apaga los correos automáticos de la prueba para todas las clínicas. */
function CorreosToggle() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'configuracion-global'],
    queryFn: coreApi.configuracionGlobal.get,
  })
  const mutation = useMutation({
    mutationFn: (correos_ciclo_vida_habilitados: boolean) =>
      coreApi.configuracionGlobal.update({ correos_ciclo_vida_habilitados }),
    onSuccess: (nuevo) => {
      qc.setQueryData(['admin', 'configuracion-global'], nuevo)
      toast({ title: nuevo.correos_ciclo_vida_habilitados ? 'Correos de la prueba activados' : 'Correos de la prueba desactivados' })
    },
    onError: () => toast({ title: 'No se pudo guardar el cambio', variant: 'destructive' }),
  })

  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-500">
        <MailCheck className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">Correos automáticos de la prueba</p>
        <p className="text-xs text-muted-foreground">
          Bienvenida, recordatorios de configuración y avisos de vencimiento a los administradores de cada clínica.
          Salen cada hora, como mucho uno al día por clínica.
        </p>
      </div>
      <Switch
        checked={data?.correos_ciclo_vida_habilitados ?? false}
        onCheckedChange={(v) => mutation.mutate(v)}
        disabled={isLoading || mutation.isPending}
      />
    </div>
  )
}

const SIN_PLAN = 'ninguno'

/** Qué recibe una clínica nueva: cuántos días, con qué plan y cuántos WhatsApp. */
function ConfiguracionPrueba() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { data } = useQuery({ queryKey: ['admin', 'configuracion-global'], queryFn: coreApi.configuracionGlobal.get })
  const { data: planes } = useQuery({ queryKey: ['admin-planes'], queryFn: adminApi.planes.list })
  const [form, setForm] = useState<{ dias: string; plan: string; envios: string } | null>(null)

  const actual = data && { dias: String(data.dias_prueba), plan: data.plan_prueba ?? SIN_PLAN, envios: String(data.whatsapp_envios_prueba) }
  const valores = form ?? actual
  const cambio = !!form && !!actual && (form.dias !== actual.dias || form.plan !== actual.plan || form.envios !== actual.envios)
  const dias = Number(valores?.dias)
  const envios = Number(valores?.envios)
  const valido = Number.isInteger(dias) && dias >= 1 && dias <= 90 && Number.isInteger(envios) && envios >= 0

  const mutation = useMutation({
    mutationFn: () => coreApi.configuracionGlobal.update({
      dias_prueba: dias,
      plan_prueba: valores!.plan === SIN_PLAN ? null : valores!.plan,
      whatsapp_envios_prueba: envios,
    }),
    onSuccess: (nuevo) => {
      qc.setQueryData(['admin', 'configuracion-global'], nuevo)
      setForm(null)
      toast({ title: 'Configuración de la prueba guardada' })
    },
    onError: (err) => toast({ title: 'No se pudo guardar', description: serverErrorMessage(err), variant: 'destructive' }),
  })

  const set = (campo: 'dias' | 'plan' | 'envios', v: string) => valores && setForm({ ...valores, [campo]: v })
  const activos = (planes?.results ?? []).filter(p => p.activo || p.id === data?.plan_prueba)

  return (
    <div className="space-y-3 rounded-xl border bg-card px-4 py-3">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-500">
          <FlaskConical className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Así empieza una prueba</p>
          <p className="text-xs text-muted-foreground">
            Mientras dura, la clínica tiene los límites y funciones del plan de prueba; al pagar queda con el plan que elija.
            Los días aplican a las clínicas que se registren desde ahora.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:ml-12 sm:grid-cols-[6rem_minmax(0,14rem)_8rem_auto] sm:items-end">
        <div className="space-y-1">
          <Label htmlFor="dias-prueba" className="text-xs">Días</Label>
          <Input id="dias-prueba" type="number" min={1} max={90} className="h-9" value={valores?.dias ?? ''} onChange={e => set('dias', e.target.value)} />
        </div>
        <div className="col-span-2 space-y-1 sm:col-span-1">
          <Label className="text-xs">Plan de prueba</Label>
          <Select value={valores?.plan ?? SIN_PLAN} onValueChange={v => set('plan', v)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={SIN_PLAN}>El de la clínica</SelectItem>
              {activos.map(p => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="envios-prueba" className="text-xs">WhatsApp</Label>
          <Input id="envios-prueba" type="number" min={0} className="h-9" title="Envíos por el número de CliniQ en toda la prueba; 0 = sin límite" value={valores?.envios ?? ''} onChange={e => set('envios', e.target.value)} />
        </div>
        <Button size="sm" className="h-9 self-end justify-self-start" disabled={!cambio || !valido || mutation.isPending} onClick={() => mutation.mutate()}>
          Guardar
        </Button>
      </div>
    </div>
  )
}

function porcentaje(parte: number, total: number) {
  return total ? `${Math.round((parte / total) * 100)} %` : '—'
}

function Embudo() {
  const { data, isLoading } = useQuery({ queryKey: ['admin-embudo'], queryFn: () => suscripcionesApi.embudo(12) })
  if (isLoading || !data) return null
  const filas: CohorteEmbudo[] = [data.total, ...data.cohortes]

  return (
    <section className="space-y-2.5">
      <div>
        <h2 className="text-base font-semibold">Embudo de activación</h2>
        <p className="text-sm text-muted-foreground">
          Clínicas que empezaron en prueba en las últimas 12 semanas, por semana de registro. Debajo de cada porcentaje, la mediana de días hasta llegar.
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Semana</TableHead>
              <TableHead className="text-right">Clínicas</TableHead>
              {data.total.hitos.map(h => <TableHead key={h.clave} className="whitespace-nowrap text-right">{h.etiqueta}</TableHead>)}
              <TableHead className="text-right">Activadas</TableHead>
              <TableHead className="text-right">Pagaron</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((c, i) => (
              <TableRow key={c.semana ?? 'total'} className={cn(i === 0 && 'bg-muted/40 font-medium')}>
                <TableCell className="whitespace-nowrap">{c.semana ? `Desde el ${fechaCorta(c.semana)}` : 'Total'}</TableCell>
                <TableCell className="text-right tabular-nums">{c.clinicas}</TableCell>
                {c.hitos.map(h => (
                  <TableCell key={h.clave} className="text-right tabular-nums">
                    {porcentaje(h.alcanzaron, c.clinicas)}
                    {h.mediana_dias !== null && <span className="block text-xs text-muted-foreground">{h.mediana_dias} d</span>}
                  </TableCell>
                ))}
                <TableCell className="text-right tabular-nums">{porcentaje(c.activadas, c.clinicas)}</TableCell>
                <TableCell className="text-right tabular-nums">{porcentaje(c.pagaron, c.clinicas)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}

export default function PruebasPage() {
  const [filtro, setFiltro] = useState<FiltroSeguimiento>('pruebas')
  const [notasDe, setNotasDe] = useState<FilaSeguimiento | null>(null)
  const [extenderDe, setExtenderDe] = useState<string | null>(null)

  const { data: filas, isLoading } = useQuery({
    queryKey: ['admin-seguimiento', filtro],
    queryFn: () => suscripcionesApi.seguimiento(filtro),
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Pruebas</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Activación real de cada clínica: se considera activada con 3 atenciones completadas y uso en 3 días distintos.
        </p>
      </div>

      <ConfiguracionPrueba />
      <CorreosToggle />

      <div className="flex flex-wrap overflow-hidden rounded-lg border bg-white sm:w-fit">
        {FILTROS.map(f => (
          <button
            key={f.key}
            onClick={() => setFiltro(f.key)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium transition-colors',
              filtro === f.key ? 'bg-rose-500 text-white' : 'text-muted-foreground hover:bg-gray-50 hover:text-foreground',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Clínica</TableHead>
              <TableHead>Cuenta</TableHead>
              <TableHead>Activación</TableHead>
              <TableHead>Avance</TableHead>
              <TableHead>Uso</TableHead>
              <TableHead>Seguimiento</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">Cargando…</TableCell></TableRow>
            ) : !filas?.length ? (
              <TableRow><TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">No hay clínicas en este filtro.</TableCell></TableRow>
            ) : filas.map(f => {
              const semaforo = SEMAFORO[f.semaforo]
              const puedeExtender = f.suscripcion.estado === 'prueba' || (f.suscripcion.periodo_inicio === null && f.suscripcion.estado !== 'activa')
              return (
                <TableRow key={f.clinica_id} className="align-top">
                  <TableCell className="min-w-[180px]">
                    <Link href={`/console/clinicas/${f.clinica_id}`} className="font-medium hover:underline">{f.clinica_nombre}</Link>
                    <p className="text-xs text-muted-foreground">Registro: {fechaCorta(f.registrada_el)}</p>
                    {f.contacto.nombre && (
                      <p className="text-xs text-muted-foreground">
                        {f.contacto.nombre}
                        {f.suscripcion.perfil.cargo && ` · ${PERFIL_CARGO[f.suscripcion.perfil.cargo] ?? f.suscripcion.perfil.cargo}`}
                      </p>
                    )}
                    {(f.suscripcion.perfil.especialidad || f.suscripcion.perfil.profesionales) && (
                      <p className="text-xs text-muted-foreground">
                        {[
                          f.suscripcion.perfil.especialidad && PERFIL_ESPECIALIDAD[f.suscripcion.perfil.especialidad],
                          f.suscripcion.perfil.profesionales && PERFIL_PROFESIONALES[f.suscripcion.perfil.profesionales],
                        ].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={ESTADO_SUSCRIPCION_BADGE[f.suscripcion.estado]} className="whitespace-nowrap">
                      {resumenSuscripcion(f.suscripcion)}
                    </Badge>
                  </TableCell>
                  <TableCell className="min-w-[200px] max-w-[260px]">
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      <span className={cn('h-2 w-2 shrink-0 rounded-full', semaforo.punto)} />
                      {semaforo.label}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{f.motivo}</p>
                  </TableCell>
                  <TableCell><Avance fila={f} /></TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {hace(f.ultima_actividad)}
                    <p className="text-xs text-muted-foreground">
                      {f.dias_activos} {f.dias_activos === 1 ? 'día' : 'días'} de uso · {f.usuarios_activos_7d} en 7 d
                    </p>
                  </TableCell>
                  <TableCell className="min-w-[180px] max-w-[240px]">
                    {f.ultima_nota ? (
                      <>
                        <p className="line-clamp-2 text-sm">{f.ultima_nota.texto}</p>
                        <p className="text-xs text-muted-foreground">{fechaCorta(f.ultima_nota.created_at)}</p>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">Sin contacto</p>
                    )}
                    {f.proximo_contacto && (
                      <p className="text-xs font-medium text-amber-700">Volver a contactar: {fechaCorta(f.proximo_contacto)}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {f.contacto.whatsapp_url && (
                        <Button
                          asChild size="icon" variant="ghost"
                          title={f.suscripcion.whatsapp_autorizado_at ? 'Escribir por WhatsApp (autorizó en el registro)' : 'Escribir por WhatsApp (no lo autorizó en el registro)'}
                        >
                          <a href={f.contacto.whatsapp_url} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4" /></a>
                        </Button>
                      )}
                      {f.contacto.email && (
                        <Button asChild size="icon" variant="ghost" title={`Escribir a ${f.contacto.email}`}>
                          <a href={`mailto:${f.contacto.email}`}><Mail className="h-4 w-4" /></a>
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" title="Notas de seguimiento" onClick={() => setNotasDe(f)}>
                        <NotebookPen className="h-4 w-4" />
                      </Button>
                      {puedeExtender && (
                        <Button size="icon" variant="ghost" title="Extender prueba" onClick={() => setExtenderDe(f.clinica_id)}>
                          <CalendarPlus className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <Embudo />

      <NotasDialog fila={notasDe} onClose={() => setNotasDe(null)} />
      {extenderDe && <ExtenderPruebaDialog clinicaId={extenderDe} open onClose={() => setExtenderDe(null)} />}
    </div>
  )
}
