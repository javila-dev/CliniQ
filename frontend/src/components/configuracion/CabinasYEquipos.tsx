'use client'

/*
 * Configuración → Clínica → Cabinas y equipos (docs/plan-salas-y-equipos.md).
 * Dos listas simples:
 * - Cabinas y consultorios: una fila por sede con sus cabinas como fichas.
 * - Equipos: una fila por equipo (por nombre: el "Soprano" de todas las sedes
 *   que lo tienen), con dónde está y qué procedimientos lo usan.
 * Lo demás (días, no disponible, desactivar) va en el menú de cada uno.
 */

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MoreHorizontal, Plus } from 'lucide-react'
import { clinicasApi } from '@/lib/api/clinicas'
import { mensajeDeError } from '@/lib/errores'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EtiquetaAjuste, SeccionAjustes } from '@/components/configuracion/ajustes'
import {
  AvisoCitasAfectadas, DiasEditor, NoDisponibleDialog, ProcedimientosDelEquipo, RecursoSheet,
  diasQueViene, listaDias, mismoNombre,
} from '@/components/configuracion/SalasYEquipos'
import type { HorarioRecurso, PrevisualizacionRecursos, Recurso, Sede } from '@/types/clinicas'

const CLAVE_TODOS = ['recursos', 'todos'] as const

function normalizar(t: string): string {
  return t.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** "mar y jue" si no viene todos los días; '' si viene todos. */
function diasCortos(horarios: HorarioRecurso[]): string {
  const dias = diasQueViene(horarios)
  if (dias.length === 7) return ''
  if (!dias.length) return 'ningún día'
  return listaDias(dias).replace(/(lunes|martes|miércoles|jueves|viernes|sábado|domingo)/g, (d) => d.slice(0, 3))
}

interface GrupoEquipo {
  clave: string
  nombre: string
  unidades: Recurso[]
}

function agruparEquipos(equipos: Recurso[]): GrupoEquipo[] {
  const grupos = new Map<string, GrupoEquipo>()
  for (const e of equipos) {
    const clave = normalizar(e.nombre)
    const g = grupos.get(clave) ?? { clave, nombre: e.nombre, unidades: [] }
    g.unidades.push(e)
    grupos.set(clave, g)
  }
  return Array.from(grupos.values()).sort((a, b) => a.nombre.localeCompare(b.nombre))
}

export function CabinasYEquipos({ puedeGestionar }: { puedeGestionar: boolean }) {
  const { data: sedesData } = useQuery({
    queryKey: ['sedes'],
    queryFn: () => clinicasApi.sedes.list({ activa: true }),
  })
  const sedes = useMemo(() => (sedesData?.results ?? []).filter((s) => s.activo), [sedesData])
  const { data: todos = [], isLoading } = useQuery({
    queryKey: CLAVE_TODOS,
    queryFn: () => clinicasApi.recursos.list(),
  })
  const { data: procedimientos = [] } = useQuery({
    queryKey: ['procedimientos-activos'],
    queryFn: () => clinicasApi.procedimientos.activos(),
  })
  const nombreProc = useMemo(() => new Map(procedimientos.map((p) => [p.id, p.nombre])), [procedimientos])

  const [cabina, setCabina] = useState<{ sede: Sede; recurso: Recurso } | null>(null)
  const [equipo, setEquipo] = useState<GrupoEquipo | 'nuevo' | null>(null)
  const [noDisponible, setNoDisponible] = useState<Recurso | null>(null)

  const cabinas = todos.filter((r) => r.tipo === 'sala')
  const grupos = agruparEquipos(todos.filter((r) => r.tipo === 'equipo'))

  if (isLoading || !sedesData) {
    return <div className="rounded-xl border bg-white px-4 py-5 text-sm text-muted-foreground">Cargando…</div>
  }

  return (
    <div className="space-y-6">
      <SeccionAjustes
        titulo="Cabinas y consultorios"
        descripcion="Ponen un límite a la agenda: cada cabina o consultorio recibe una cita a la vez. Si una sede tiene 2, no se pueden agendar más de 2 citas a la misma hora que los necesiten. Solo cuentan los procedimientos que piden cabina o consultorio."
      >
        {sedes.map((s) => (
          <FilaCabinas
            key={s.id}
            sede={s}
            cabinas={cabinas.filter((c) => c.sede === s.id)}
            todos={todos}
            conNombreDeSede={sedes.length > 1}
            puedeGestionar={puedeGestionar}
            onEditar={(recurso) => setCabina({ sede: s, recurso })}
            onNoDisponible={setNoDisponible}
          />
        ))}
      </SeccionAjustes>

      <SeccionAjustes
        titulo="Equipos"
        descripcion="También ponen un límite: cada equipo se usa en una cita a la vez. Si el láser ya está ocupado a las 10:00, la agenda ofrece otra hora a los procedimientos que lo usan."
        accion={puedeGestionar && grupos.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => setEquipo('nuevo')}>
            <Plus className="mr-1.5 h-4 w-4" />Agregar equipo
          </Button>
        )}
      >
        {grupos.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
            <p className="text-sm text-muted-foreground">Aún no hay equipos. Agrégalos si un aparato no puede estar en dos citas a la vez.</p>
            {puedeGestionar && (
              <Button size="sm" variant="outline" onClick={() => setEquipo('nuevo')}>
                <Plus className="mr-1.5 h-4 w-4" />Agregar equipo
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_2rem] gap-3 bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground sm:grid">
              <span>Equipo</span><span>Dónde está</span><span>Lo usan</span><span />
            </div>
            {grupos.map((g) => (
              <FilaEquipo
                key={g.clave}
                grupo={g}
                todasLasSedes={sedes.length > 1 && g.unidades.length === sedes.length}
                nombreProc={nombreProc}
                puedeGestionar={puedeGestionar}
                onEditar={() => setEquipo(g)}
                onNoDisponible={setNoDisponible}
              />
            ))}
          </>
        )}
      </SeccionAjustes>

      {cabina && (
        <RecursoSheet
          sede={cabina.sede}
          sedes={sedes}
          existentes={todos}
          tipo="sala"
          recurso={cabina.recurso}
          open={!!cabina}
          onClose={() => setCabina(null)}
        />
      )}
      {equipo && (
        <EquipoSheet
          grupo={equipo === 'nuevo' ? null : equipo}
          sedes={sedes}
          grupos={grupos}
          cabinas={cabinas}
          onClose={() => setEquipo(null)}
        />
      )}
      <NoDisponibleDialog recurso={noDisponible} onClose={() => setNoDisponible(null)} />
    </div>
  )
}

// ── Cabinas de una sede ────────────────────────────────────────

function FilaCabinas({
  sede, cabinas, todos, conNombreDeSede, puedeGestionar, onEditar, onNoDisponible,
}: {
  sede: Sede
  cabinas: Recurso[]
  todos: Recurso[]
  conNombreDeSede: boolean
  puedeGestionar: boolean
  onEditar: (r: Recurso) => void
  onNoDisponible: (r: Recurso) => void
}) {
  const qc = useQueryClient()
  const ordenadas = [...cabinas].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
  const cambiar = useMutation({
    mutationFn: (r: Recurso) => clinicasApi.recursos.update(r.id, { activo: !r.activo }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recursos'] }); qc.invalidateQueries({ queryKey: ['citas'] }) },
    onError: (err) => toast.error('No se pudo guardar', mensajeDeError(err)),
  })
  const quitar = useMutation({
    mutationFn: (r: Recurso) => clinicasApi.recursos.delete(r.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recursos'] }),
    onError: (err) => toast.error('No se pudo quitar', mensajeDeError(err)),
  })

  return (
    <div className={cn('flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4', !conNombreDeSede && 'sm:flex-row')}>
      {conNombreDeSede && <span className="w-40 shrink-0 truncate text-sm font-medium">{sede.nombre}</span>}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {ordenadas.length === 0 && (
          <span className="mr-1 text-sm text-amber-700">Ninguna todavía</span>
        )}
        {ordenadas.map((c) => {
          const dias = diasCortos(c.horarios)
          const ficha = (
            <span className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm',
              c.activo ? 'bg-white' : 'border-dashed text-muted-foreground',
              puedeGestionar && 'cursor-pointer hover:bg-muted',
            )}>
              {c.nombre}
              {!c.activo && <span className="text-xs">· no se usa</span>}
              {c.activo && dias && <span className="text-xs text-muted-foreground">· {dias}</span>}
            </span>
          )
          if (!puedeGestionar) return <span key={c.id}>{ficha}</span>
          return (
            <DropdownMenu key={c.id}>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label={`Opciones de ${c.nombre}`}>{ficha}</button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => onEditar(c)}>Cambiar nombre o días…</DropdownMenuItem>
                {c.activo && <DropdownMenuItem onClick={() => onNoDisponible(c)}>No disponible…</DropdownMenuItem>}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => cambiar.mutate(c)}>{c.activo ? 'Desactivar' : 'Activar'}</DropdownMenuItem>
                <DropdownMenuItem
                  className="text-red-600 focus:text-red-600"
                  onClick={() => { if (window.confirm(`¿Quitar ${c.nombre}? Si ya tiene citas, usa Desactivar.`)) quitar.mutate(c) }}
                >
                  Quitar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        })}
        {puedeGestionar && <AgregarCabina sede={sede} cabinas={cabinas} todos={todos} />}
      </div>
    </div>
  )
}

function AgregarCabina({ sede, cabinas, todos }: { sede: Sede; cabinas: Recurso[]; todos: Recurso[] }) {
  const qc = useQueryClient()
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState('')
  // El nombre es único en toda la clínica (cabinas de otras sedes y equipos).
  const usados = new Map(todos.map((r) => [normalizar(r.nombre), r]))
  const sugerido = (extra: string[] = []) => {
    const ocupados = new Set([...usados.keys(), ...extra.map(normalizar)])
    let n = cabinas.length + 1
    while (ocupados.has(normalizar(`Cabina ${n}`))) n += 1
    return `Cabina ${n}`
  }
  const choca = nombre.trim() ? usados.get(normalizar(nombre)) : undefined
  const crear = useMutation({
    mutationFn: () => clinicasApi.recursos.create({
      sede: sede.id, nombre: nombre.trim(), tipo: 'sala', orden: cabinas.length + 1,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recursos'] })
      qc.invalidateQueries({ queryKey: ['citas'] })
      // Queda abierto con el siguiente nombre: agregar varias seguidas es rápido.
      setNombre(sugerido([nombre]))
    },
    onError: (err) => toast.error('No se pudo agregar', mensajeDeError(err)),
  })

  return (
    <Popover open={abierto} onOpenChange={(v) => { setAbierto(v); if (v) setNombre(sugerido()) }}>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-medium text-primary hover:bg-primary/5">
          <Plus className="h-4 w-4" />Agregar
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3">
        <form
          className="space-y-2"
          onSubmit={(e) => { e.preventDefault(); if (nombre.trim() && !choca) crear.mutate() }}
        >
          <Label htmlFor={`cabina-${sede.id}`}>Nombre</Label>
          <div className="flex gap-2">
            <Input
              id={`cabina-${sede.id}`}
              autoFocus
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Cabina 3, Consultorio 2…"
              className="h-9"
            />
            <Button type="submit" size="sm" className="h-9" disabled={crear.isPending || !nombre.trim() || !!choca}>
              Agregar
            </Button>
          </div>
          {choca ? (
            <p className="text-xs text-amber-700">
              {choca.tipo === 'equipo'
                ? `Ya hay un equipo llamado ${choca.nombre}.`
                : `Ya hay ${choca.nombre} en ${choca.sede_nombre}. Prueba «${choca.nombre} ${sede.nombre}».`}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Puedes agregar varias seguidas.</p>
          )}
        </form>
      </PopoverContent>
    </Popover>
  )
}

// ── Equipos ────────────────────────────────────────────────────

function FilaEquipo({
  grupo, todasLasSedes, nombreProc, puedeGestionar, onEditar, onNoDisponible,
}: {
  grupo: GrupoEquipo
  todasLasSedes: boolean
  nombreProc: Map<string, string>
  puedeGestionar: boolean
  onEditar: () => void
  onNoDisponible: (r: Recurso) => void
}) {
  const qc = useQueryClient()
  const activas = grupo.unidades.filter((u) => u.activo)
  const inactivo = activas.length === 0
  const procs = Array.from(new Set(grupo.unidades.flatMap((u) => u.procedimientos)))
    .map((id) => nombreProc.get(id)).filter((n): n is string => !!n)
  const sedesTexto = todasLasSedes
    ? 'Todas las sedes'
    : grupo.unidades.map((u) => u.sede_nombre).join(', ')
  // Días: los mismos en todas sus sedes, o se avisa que cambian por sede.
  const porSede = new Set(grupo.unidades.map((u) => diasCortos(u.horarios)))
  const dias = porSede.size > 1 ? 'días según la sede' : diasCortos(grupo.unidades[0].horarios)

  const alternar = useMutation({
    mutationFn: () => Promise.all(grupo.unidades.map((u) => clinicasApi.recursos.update(u.id, { activo: inactivo }))),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recursos'] }); qc.invalidateQueries({ queryKey: ['citas'] }) },
    onError: (err) => toast.error('No se pudo guardar', mensajeDeError(err)),
  })
  const quitar = useMutation({
    mutationFn: () => Promise.all(grupo.unidades.map((u) => clinicasApi.recursos.delete(u.id))),
    onSettled: () => qc.invalidateQueries({ queryKey: ['recursos'] }),
    onError: (err) => toast.error('No se pudo quitar', mensajeDeError(err)),
  })

  return (
    <div className={cn(
      'grid grid-cols-[minmax(0,1fr)_2rem] items-center gap-x-3 gap-y-0.5 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_2rem]',
      inactivo && 'opacity-60',
    )}>
      <button
        type="button"
        onClick={puedeGestionar ? onEditar : undefined}
        className={cn('min-w-0 truncate text-left text-sm font-medium', puedeGestionar && 'hover:text-primary')}
      >
        {grupo.nombre}
        {inactivo && <EtiquetaAjuste>Inactivo</EtiquetaAjuste>}
      </button>
      <span className="col-start-1 truncate text-[13px] text-muted-foreground sm:col-start-auto sm:text-sm">
        {sedesTexto}{dias && ` · ${dias}`}
      </span>
      <span className={cn(
        'col-start-1 truncate text-[13px] sm:col-start-auto sm:text-sm',
        procs.length ? 'text-muted-foreground' : 'text-amber-700',
      )}>
        {procs.length ? procs.join(', ') : 'Ningún procedimiento'}
      </span>
      <div className="col-start-2 row-span-3 row-start-1 flex justify-end sm:col-start-auto sm:row-span-1 sm:row-start-auto">
        {puedeGestionar && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Opciones de ${grupo.nombre}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEditar}>Editar…</DropdownMenuItem>
              {activas.map((u) => (
                <DropdownMenuItem key={u.id} onClick={() => onNoDisponible(u)}>
                  {activas.length > 1 ? `No disponible en ${u.sede_nombre}…` : 'No disponible…'}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => alternar.mutate()}>{inactivo ? 'Activar' : 'Desactivar'}</DropdownMenuItem>
              <DropdownMenuItem
                className="text-red-600 focus:text-red-600"
                onClick={() => { if (window.confirm(`¿Quitar ${grupo.nombre}${grupo.unidades.length > 1 ? ' de todas sus sedes' : ''}? Si ya tiene citas, desactívalo en su lugar.`)) quitar.mutate() }}
              >
                Quitar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}

/**
 * Un equipo con todas sus sedes: nombre, en qué sedes hay uno (cada uno es un
 * aparato aparte en la agenda), qué días viene y qué procedimientos lo usan.
 * Al guardar: se actualiza el de cada sede, se crea en las sedes nuevas y se
 * quita de las que se desmarcan (si ya tiene citas, se desactiva).
 */
function EquipoSheet({
  grupo, sedes, grupos, cabinas, onClose,
}: {
  grupo: GrupoEquipo | null
  sedes: Sede[]
  grupos: GrupoEquipo[]
  cabinas: Recurso[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const unidades = grupo?.unidades ?? []
  const [nombre, setNombre] = useState(grupo?.nombre ?? '')
  const [horarios, setHorarios] = useState<HorarioRecurso[]>(unidades[0]?.horarios ?? [])
  const [procedimientos, setProcedimientos] = useState<string[]>(
    Array.from(new Set(unidades.flatMap((u) => u.procedimientos))),
  )
  const [enSedes, setEnSedes] = useState<string[]>(
    grupo ? unidades.map((u) => u.sede) : sedes.length ? [sedes[0].id] : [],
  )
  const [previa, setPrevia] = useState<PrevisualizacionRecursos | null>(null)
  useEffect(() => { setPrevia(null) }, [horarios, procedimientos, enSedes, nombre])

  const diasDistintos = unidades.length > 1
    && new Set(unidades.map((u) => diasQueViene(u.horarios).join(','))).size > 1
  const repetido = nombre.trim()
    ? grupos.find((g) => g.clave !== grupo?.clave && mismoNombre(g.nombre, nombre))
    : undefined
  const comoCabina = nombre.trim() ? cabinas.find((c) => mismoNombre(c.nombre, nombre)) : undefined

  type Paso =
    | { tipo: 'actualizar'; recurso: Recurso; sede: string }
    | { tipo: 'crear'; sede: string }
    | { tipo: 'quitar'; recurso: Recurso }
  const pasos: Paso[] = [
    ...enSedes.map((sede): Paso => {
      const recurso = unidades.find((u) => u.sede === sede)
      return recurso ? { tipo: 'actualizar', recurso, sede } : { tipo: 'crear', sede }
    }),
    ...unidades.filter((u) => !enSedes.includes(u.sede)).map((recurso): Paso => ({ tipo: 'quitar', recurso })),
  ]
  const datos = (sede: string) => ({ sede, nombre: nombre.trim(), tipo: 'equipo' as const, horarios, procedimientos })

  const guardar = useMutation({
    mutationFn: async (forzar: boolean) => {
      if (!forzar) {
        const previas = await Promise.all(pasos.map((p) => clinicasApi.recursos.previsualizar(
          p.tipo === 'crear' ? { recurso: datos(p.sede) }
            : p.tipo === 'actualizar' ? { recurso_id: p.recurso.id, recurso: datos(p.sede) }
            : { recurso_id: p.recurso.id, recurso: { activo: false } },
        )))
        const total = previas.reduce((n, p) => n + p.total_sin_lugar, 0)
        if (total > 0) {
          setPrevia({
            citas_revisadas: previas.reduce((n, p) => n + p.citas_revisadas, 0),
            total_sin_lugar: total,
            sin_lugar: previas.flatMap((p) => p.sin_lugar),
          })
          return false
        }
      }
      let desactivados = 0
      for (const p of pasos) {
        if (p.tipo === 'actualizar') await clinicasApi.recursos.update(p.recurso.id, datos(p.sede))
        else if (p.tipo === 'crear') await clinicasApi.recursos.create(datos(p.sede))
        else {
          try {
            await clinicasApi.recursos.delete(p.recurso.id)
          } catch {
            // Con citas no se puede quitar: queda desactivado en esa sede.
            await clinicasApi.recursos.update(p.recurso.id, { activo: false })
            desactivados += 1
          }
        }
      }
      return { desactivados }
    },
    onSuccess: (r) => {
      if (!r) return
      qc.invalidateQueries({ queryKey: ['recursos'] })
      qc.invalidateQueries({ queryKey: ['procedimiento'] })
      qc.invalidateQueries({ queryKey: ['citas'] })
      toast.success(
        grupo ? 'Guardado' : enSedes.length > 1 ? `Equipo agregado en ${enSedes.length} sedes` : 'Equipo agregado',
        r.desactivados ? 'Donde ya tenía citas quedó desactivado en lugar de quitarse.' : undefined,
      )
      onClose()
    },
    onError: (err) => {
      qc.invalidateQueries({ queryKey: ['recursos'] })
      toast.error('No se pudo guardar', mensajeDeError(err))
    },
  })

  return (
    <Sheet open onOpenChange={(v) => { if (!v) onClose() }}>
      <SheetContent className="w-full overflow-y-auto p-6 sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{grupo ? `Editar ${grupo.nombre}` : 'Agregar equipo'}</SheetTitle>
        </SheetHeader>
        <form className="mt-6 space-y-5" onSubmit={(e) => { e.preventDefault(); guardar.mutate(Boolean(previa)) }}>
          <div className="space-y-1.5">
            <Label htmlFor="equipo-nombre">Nombre</Label>
            <Input
              id="equipo-nombre"
              autoFocus={!grupo}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Soprano, láser diodo, HIFU…"
            />
            {repetido && (
              <p className="text-xs text-amber-700">Ya hay un equipo llamado {repetido.nombre}. Edítalo para agregarlo a otra sede.</p>
            )}
            {comoCabina && (
              <p className="text-xs text-amber-700">Ya hay una cabina o consultorio llamado {comoCabina.nombre} en {comoCabina.sede_nombre}. Usa otro nombre.</p>
            )}
          </div>

          {sedes.length > 1 && (
            <div className="space-y-2">
              <Label>¿En qué sedes hay uno?</Label>
              <div className="space-y-1.5">
                {sedes.map((s) => (
                  <label key={s.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={enSedes.includes(s.id)}
                      onChange={() => setEnSedes((a) => (a.includes(s.id) ? a.filter((x) => x !== s.id) : [...a, s.id]))}
                    />
                    {s.nombre}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {enSedes.length > 1
                  ? `Son ${enSedes.length} aparatos, uno por sede: cada uno se agenda por su lado.`
                  : 'Si el mismo equipo está en otra sede, márcala también.'}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Disponible</Label>
            <DiasEditor horarios={horarios} onChange={setHorarios} />
            {diasDistintos && (
              <p className="text-xs text-amber-700">Tenía días distintos en cada sede; al guardar quedan estos en todas.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>¿Qué procedimientos lo usan?</Label>
            <ProcedimientosDelEquipo value={procedimientos} onChange={setProcedimientos} />
          </div>

          {previa && <AvisoCitasAfectadas previa={previa} />}

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={guardar.isPending || !nombre.trim() || !!repetido || !!comoCabina || enSedes.length === 0}
            >
              {guardar.isPending ? 'Guardando…' : previa ? 'Guardar igual' : grupo ? 'Guardar cambios' : 'Agregar equipo'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
