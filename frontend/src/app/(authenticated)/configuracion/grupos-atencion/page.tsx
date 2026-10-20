'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { AlertTriangle, Check, ChevronsUpDown, Loader2, Pencil, Plus, Search, Trash2, Users, X } from 'lucide-react'
import { colaboradoresApi } from '@/lib/api/colaboradores'
import { clinicasApi } from '@/lib/api/clinicas'
import { useAuthStore } from '@/store/authStore'
import { hasPermission, PERM } from '@/lib/permissions'
import { toast } from '@/hooks/use-toast'
import { PageHeader } from '@/components/shared/PageHeader'
import { GRUPOS_ATENCION_KEY, useGruposAtencion } from '@/components/colaboradores/GruposAtencionSelect'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EtiquetaAjuste, FilaAjuste, NotaAjuste, SeccionAjustes, VacioAjustes } from '@/components/configuracion/ajustes'
import { cn, scrollWheelFallback, toTitleCase } from '@/lib/utils'
import type { GrupoAtencion } from '@/types/colaboradores'

const COLABORADORES_GESTIONAR = 'colaboradores.gestionar'

function mensajeDeError(err: unknown, porDefecto: string) {
  const data = (err as any)?.response?.data
  if (!data || typeof data !== 'object') return porDefecto
  if (data.error) return String(data.error)
  if (data.detail) return String(data.detail)
  const primero = Object.values(data).flat().find((v) => typeof v === 'string')
  return (primero as string) || porDefecto
}

// ─── Selector múltiple con búsqueda ───────────────────────────

interface Opcion { id: string; nombre: string; nota?: string }

function MultiSelectBuscable({ opciones, value, onChange, placeholder, vacio, unidad }: {
  opciones: Opcion[]
  value: string[]
  onChange: (ids: string[]) => void
  placeholder: string
  vacio: string
  unidad: [string, string]
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const termino = q.trim().toLowerCase()
  const filtradas = termino ? opciones.filter((o) => o.nombre.toLowerCase().includes(termino)) : opciones
  const seleccionadas = opciones.filter((o) => value.includes(o.id))
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQ('') }}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" role="combobox" className="w-full justify-between font-normal">
            <span className={cn(!seleccionadas.length && 'text-muted-foreground')}>
              {seleccionadas.length
                ? `${seleccionadas.length} ${seleccionadas.length === 1 ? unidad[0] : unidad[1]}`
                : placeholder}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
          <div className="flex items-center border-b px-3">
            <Search className="h-4 w-4 shrink-0 opacity-50" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…"
              className="flex h-9 w-full bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground" />
          </div>
          <div className="max-h-60 overflow-y-auto p-1" onWheel={scrollWheelFallback}>
            {opciones.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">{vacio}</p>
            ) : filtradas.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">Sin resultados</p>
            ) : filtradas.map((o) => {
              const marcado = value.includes(o.id)
              return (
                <button key={o.id} type="button" onClick={() => toggle(o.id)}
                  className={cn('flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent', marcado && 'font-medium')}>
                  <Check className={cn('h-4 w-4 shrink-0', marcado ? 'text-primary opacity-100' : 'opacity-0')} />
                  <span className="min-w-0 flex-1 truncate">{o.nombre}</span>
                  {o.nota && <span className="shrink-0 text-xs text-muted-foreground">{o.nota}</span>}
                </button>
              )
            })}
          </div>
        </PopoverContent>
      </Popover>
      {seleccionadas.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {seleccionadas.map((o) => (
            <Badge key={o.id} variant="secondary" className={cn('gap-1 pr-1', o.nota && 'opacity-70')}>
              {o.nombre}{o.nota && <span className="font-normal">· {o.nota}</span>}
              <button type="button" onClick={() => toggle(o.id)} className="rounded-sm hover:bg-muted-foreground/20" aria-label={`Quitar ${o.nombre}`}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Diálogo crear / editar ───────────────────────────────────

function GrupoDialog({ open, onOpenChange, grupo, puedeAsignarProcedimientos }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  grupo: GrupoAtencion | null
  puedeAsignarProcedimientos: boolean
}) {
  const qc = useQueryClient()
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [miembros, setMiembros] = useState<string[]>([])
  const [procedimientos, setProcedimientos] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    setNombre(grupo?.nombre ?? '')
    setDescripcion(grupo?.descripcion ?? '')
    setMiembros(grupo?.miembros ?? [])
    setProcedimientos(grupo?.procedimientos ?? [])
  }, [open, grupo])

  const { data: profesionales = [] } = useQuery({
    queryKey: ['profesionales', 'grupos-atencion'],
    queryFn: () => colaboradoresApi.profesionales(),
    enabled: open,
  })
  const { data: catalogo = [] } = useQuery({
    queryKey: ['procedimientos', 'activos'],
    queryFn: () => clinicasApi.procedimientos.activos(),
    enabled: open && puedeAsignarProcedimientos,
  })
  const { data: tratamientos = [] } = useQuery({
    queryKey: ['tratamientos', 'activos'],
    queryFn: () => clinicasApi.tratamientos.activos(),
    enabled: open && puedeAsignarProcedimientos,
  })

  // Suma de una vez todos los procedimientos de un tratamiento (sin quitar los ya elegidos).
  // Solo los activos del catálogo: un inactivo quedaría elegido sin verse en la lista.
  const activos = new Set(catalogo.map((p) => p.id))
  const procedimientosDe = (tratamientoId: string) => Array.from(new Set(
    (tratamientos.find((t) => t.id === tratamientoId)?.tipos_sesion ?? [])
      .flatMap((tipo) => tipo.procedimientos.map((p) => p.procedimiento))
      .filter((id) => activos.has(id)),
  ))
  const agregarTratamiento = (tratamientoId: string) => {
    const nuevos = procedimientosDe(tratamientoId).filter((id) => !procedimientos.includes(id))
    if (nuevos.length) setProcedimientos([...procedimientos, ...nuevos])
    const nombre = tratamientos.find((t) => t.id === tratamientoId)?.nombre ?? ''
    toast.success(
      nuevos.length ? `Agregados los procedimientos de ${nombre}` : `${nombre} ya estaba completo`,
      nuevos.length ? `${nuevos.length} procedimiento${nuevos.length === 1 ? '' : 's'} más.` : undefined,
    )
  }
  const tratamientosConProcedimientos = tratamientos.filter((t) => procedimientosDe(t.id).length > 0)

  // Quienes atienden pacientes, más los miembros actuales que ya no están disponibles.
  const opcionesMiembros: Opcion[] = [
    ...profesionales
      .filter((p) => p.colaborador_id)
      .map((p) => ({ id: p.colaborador_id as string, nombre: toTitleCase(p.nombre_completo) })),
    ...(grupo?.miembros_detalle ?? [])
      .filter((m) => !m.disponible)
      .map((m) => ({ id: m.id, nombre: toTitleCase(m.nombre), nota: 'no disponible' })),
  ]
  const opcionesProcedimientos: Opcion[] = [
    ...catalogo.map((p) => ({ id: p.id, nombre: p.nombre })),
    // Asignados que ya no están activos en el catálogo: se conservan.
    ...(grupo?.procedimientos_detalle ?? [])
      .filter((p) => !catalogo.some((c) => c.id === p.id))
      .map((p) => ({ id: p.id, nombre: p.nombre, nota: 'inactivo' })),
  ]

  const guardar = useMutation({
    mutationFn: () => {
      const datos = {
        nombre: nombre.trim(),
        descripcion: descripcion.trim(),
        miembros,
        ...(puedeAsignarProcedimientos ? { procedimientos } : {}),
      }
      return grupo ? colaboradoresApi.grupos.update(grupo.id, datos) : colaboradoresApi.grupos.create(datos)
    },
    onSuccess: () => {
      toast.success(grupo ? 'Grupo actualizado' : 'Grupo creado')
      qc.invalidateQueries({ queryKey: GRUPOS_ATENCION_KEY })
      qc.invalidateQueries({ queryKey: ['procedimientos'] })
      qc.invalidateQueries({ queryKey: ['colaboradores'] })
      onOpenChange(false)
    },
  })

  const sinMiembrosConProcedimientos = procedimientos.length > 0 && !opcionesMiembros.some(
    (o) => miembros.includes(o.id) && !o.nota,
  )

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) guardar.reset(); onOpenChange(v) }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{grupo ? 'Editar grupo' : 'Nuevo grupo de atención'}</DialogTitle>
          <DialogDescription>
            Sus miembros realizan todos los procedimientos que le asignes al grupo.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => { e.preventDefault(); guardar.mutate() }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="grupo-nombre">Nombre</Label>
            <Input id="grupo-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Esteticistas" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="grupo-desc">Descripción <span className="font-normal text-muted-foreground">(opcional)</span></Label>
            <Textarea id="grupo-desc" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2}
              placeholder="Ej: Faciales, peelings y limpiezas" />
          </div>
          <div className="space-y-1.5">
            <Label>Miembros</Label>
            <MultiSelectBuscable
              opciones={opcionesMiembros} value={miembros} onChange={setMiembros}
              placeholder="Seleccionar profesionales…" unidad={['miembro', 'miembros']}
              vacio="No hay usuarios que atiendan pacientes. Actívalo en el perfil de cada usuario."
            />
            <p className="text-xs text-muted-foreground">Solo usuarios con «Atiende pacientes» activo.</p>
          </div>
          {puedeAsignarProcedimientos && (
            <div className="space-y-1.5">
              <Label>Procedimientos que realiza el grupo</Label>
              <MultiSelectBuscable
                opciones={opcionesProcedimientos} value={procedimientos} onChange={setProcedimientos}
                placeholder="Seleccionar procedimientos…" unidad={['procedimiento', 'procedimientos']}
                vacio="No hay procedimientos activos."
              />
              {tratamientosConProcedimientos.length > 0 && (
                // value="" fijo: el selector es una acción, vuelve a su texto después de elegir.
                <Select value="" onValueChange={agregarTratamiento}>
                  <SelectTrigger className="h-8 text-xs text-muted-foreground">
                    <SelectValue placeholder="+ Agregar todos los de un tratamiento…" />
                  </SelectTrigger>
                  <SelectContent>
                    {tratamientosConProcedimientos.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.nombre} · {procedimientosDe(t.id).length} proc.
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {sinMiembrosConProcedimientos && (
                <p className="text-xs text-amber-700">Agrega al menos un miembro disponible para poder asignarle procedimientos.</p>
              )}
            </div>
          )}

          {guardar.isError && (
            <p className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {mensajeDeError(guardar.error, 'No se pudo guardar el grupo.')}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={guardar.isPending}>Cancelar</Button>
            <Button type="submit" disabled={!nombre.trim() || sinMiembrosConProcedimientos || guardar.isPending}>
              {guardar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {grupo ? 'Guardar cambios' : 'Crear grupo'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Página ───────────────────────────────────────────────────

const LIMITE_CHIPS = 6

function Chips({ items, vacio }: { items: { id: string; nombre: string; apagado?: boolean }[]; vacio: string }) {
  if (!items.length) return <span className="text-[13px] text-muted-foreground">{vacio}</span>
  return (
    <>
      {items.slice(0, LIMITE_CHIPS).map((i) => (
        <span key={i.id} className={cn('rounded-md bg-muted px-2 py-0.5 text-xs text-foreground/80', i.apagado && 'text-muted-foreground line-through')}>
          {i.nombre}
        </span>
      ))}
      {items.length > LIMITE_CHIPS && <span className="px-1 text-xs text-muted-foreground">+{items.length - LIMITE_CHIPS}</span>}
    </>
  )
}

/** Una línea "Miembros: chips" dentro de la fila del grupo. */
function LineaChips({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-[7.5rem] shrink-0 text-[13px] text-muted-foreground">{titulo}</span>
      {children}
    </div>
  )
}

export default function GruposAtencionPage() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const puedeGestionar = hasPermission(user, COLABORADORES_GESTIONAR)
  const puedeAsignarProcedimientos = hasPermission(user, PERM.SERVICIOS_GESTIONAR)
  const filtroActivo = Boolean(user?.filtrar_profesionales_por_procedimiento)
  const { data: grupos = [], isLoading } = useGruposAtencion()

  const [editando, setEditando] = useState<{ open: boolean; grupo: GrupoAtencion | null }>({ open: false, grupo: null })
  const [eliminando, setEliminando] = useState<GrupoAtencion | null>(null)

  const eliminar = useMutation({
    mutationFn: (g: GrupoAtencion) => colaboradoresApi.grupos.delete(g.id),
    onSuccess: () => {
      toast.success('Grupo eliminado')
      qc.invalidateQueries({ queryKey: GRUPOS_ATENCION_KEY })
      qc.invalidateQueries({ queryKey: ['colaboradores'] })
      setEliminando(null)
    },
    onError: (err) => {
      toast.error('No se pudo eliminar', mensajeDeError(err, 'Intenta de nuevo.'))
      setEliminando(null)
    },
  })

  const nuevo = () => setEditando({ open: true, grupo: null })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Grupos de atención"
        description="Reúne a los profesionales que hacen lo mismo y asígnalos en bloque a los procedimientos. No cambia lo que pueden ver en el sistema: eso lo definen los roles."
      />

      <div className="space-y-7">
        <SeccionAjustes
          titulo="Grupos"
          descripcion="Cuando entre alguien nuevo, basta con agregarlo a su grupo."
          accion={puedeGestionar && grupos.length > 0 ? (
            <Button size="sm" onClick={nuevo}>
              <Plus className="mr-1.5 h-4 w-4" />
              Nuevo grupo
            </Button>
          ) : undefined}
        >
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : grupos.length === 0 ? (
            <VacioAjustes
              titulo="Aún no hay grupos de atención"
              descripcion="Por ejemplo, «Esteticistas» con los faciales y peelings, o «Médicos estéticos» con los inyectables."
              accion={puedeGestionar ? (
                <Button size="sm" onClick={nuevo}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Crear el primero
                </Button>
              ) : undefined}
            />
          ) : (
            grupos.map((g) => {
              const sinMiembros = g.procedimientos.length > 0 && g.miembros_disponibles === 0
              return (
                <FilaAjuste
                  key={g.id}
                  icono={Users}
                  apagada={sinMiembros}
                  titulo={g.nombre}
                  descripcion={g.descripcion || undefined}
                  extra={sinMiembros ? (
                    <span title="Sus procedimientos no se pueden agendar con este grupo.">
                      <EtiquetaAjuste tono="aviso" icono={AlertTriangle}>Sin miembros disponibles</EtiquetaAjuste>
                    </span>
                  ) : undefined}
                  contenido={
                    <div className="space-y-1.5">
                      <LineaChips titulo={`Miembros (${g.miembros_disponibles})`}>
                        <Chips
                          items={g.miembros_detalle.map((m) => ({ id: m.id, nombre: toTitleCase(m.nombre), apagado: !m.disponible }))}
                          vacio="Sin miembros"
                        />
                      </LineaChips>
                      <LineaChips titulo={`Procedimientos (${g.procedimientos.length})`}>
                        <Chips items={g.procedimientos_detalle} vacio="Aún no está asignado a procedimientos" />
                      </LineaChips>
                    </div>
                  }
                >
                  {puedeGestionar && (
                    <>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditando({ open: true, grupo: g })} aria-label={`Editar ${g.nombre}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setEliminando(g)} aria-label={`Eliminar ${g.nombre}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </FilaAjuste>
              )
            })
          )}
          {!filtroActivo && (
            <NotaAjuste>
              Hoy se ofrecen todos los profesionales al agendar. Los grupos se aplican cuando actives
              «Solo profesionales que hacen el procedimiento» en{' '}
              <Link href="/configuracion/agenda" className="font-medium text-foreground underline underline-offset-2 hover:text-primary">
                Agenda y recordatorios
              </Link>.
            </NotaAjuste>
          )}
        </SeccionAjustes>
      </div>

      <GrupoDialog
        open={editando.open}
        onOpenChange={(v) => setEditando((prev) => ({ ...prev, open: v }))}
        grupo={editando.grupo}
        puedeAsignarProcedimientos={puedeAsignarProcedimientos}
      />

      <ConfirmDialog
        open={!!eliminando}
        onOpenChange={(v) => { if (!v) setEliminando(null) }}
        title={`Eliminar «${eliminando?.nombre ?? ''}»`}
        description={
          eliminando?.procedimientos.length
            ? 'Este grupo está asignado a procedimientos: quítalo de ellos antes de eliminarlo.'
            : 'Sus miembros no se eliminan; solo dejan de pertenecer a este grupo.'
        }
        confirmLabel="Eliminar"
        variant="destructive"
        loading={eliminar.isPending}
        onConfirm={() => eliminando && eliminar.mutate(eliminando)}
      />
    </div>
  )
}
