'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Check, X, Ban } from 'lucide-react'
import { agendaApi } from '@/lib/api/agenda'
import { clinicasApi } from '@/lib/api/clinicas'
import { colaboradoresApi } from '@/lib/api/colaboradores'
import { useAuthStore } from '@/store/authStore'
import { hasPermission, PERM } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import type { BloqueoAgenda, EstadoBloqueo } from '@/types/agenda'

interface BloqueosPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultSedeId?: string
}

const ESTADO_CONFIG: Record<EstadoBloqueo, { label: string; cls: string }> = {
  pendiente: { label: 'Pendiente', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  aprobado:  { label: 'Aprobado',  cls: 'bg-green-50 text-green-700 border-green-200' },
  rechazado: { label: 'Rechazado', cls: 'bg-red-50 text-red-600 border-red-200' },
}

function formatDT(iso: string) {
  return new Date(iso).toLocaleString('es-CO', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

// Convert local datetime-local input value to ISO string for submission
function localToISO(localDT: string) {
  if (!localDT) return ''
  return new Date(localDT).toISOString()
}

// Convert ISO to datetime-local input format (YYYY-MM-DDTHH:mm)
function isoToLocal(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function todayDTLocal() {
  return isoToLocal(new Date().toISOString())
}

export function BloqueosPanel({ open, onOpenChange, defaultSedeId }: BloqueosPanelProps) {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const canCrear = hasPermission(user, PERM.AGENDA_CREAR_BLOQUEO) || hasPermission(user, PERM.AGENDA_APROBAR_BLOQUEO)
  const canAprobar = hasPermission(user, PERM.AGENDA_APROBAR_BLOQUEO)

  // Filters
  const [filterSede, setFilterSede] = useState(defaultSedeId ?? '')
  const [filterEstado, setFilterEstado] = useState<EstadoBloqueo | ''>('')

  // New bloqueo dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [formSede, setFormSede] = useState(defaultSedeId ?? '')
  const [formProfesional, setFormProfesional] = useState('')
  const [formInicio, setFormInicio] = useState(todayDTLocal)
  const [formFin, setFormFin] = useState(todayDTLocal)
  const [formMotivo, setFormMotivo] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const { data: sedes } = useQuery({
    queryKey: ['sedes'],
    queryFn: () => clinicasApi.sedes.list({ activa: true }),
  })

  const { data: profesionales } = useQuery({
    queryKey: ['profesionales', filterSede],
    queryFn: () => colaboradoresApi.profesionales(filterSede || undefined),
    enabled: true,
  })

  const { data: formProfesionales } = useQuery({
    queryKey: ['profesionales', formSede],
    queryFn: () => colaboradoresApi.profesionales(formSede || undefined),
  })

  const { data: bloqueos, isLoading } = useQuery({
    queryKey: ['bloqueos', filterSede, filterEstado],
    queryFn: () => agendaApi.bloqueos.list({
      ...(filterSede && { sede: filterSede }),
      ...(filterEstado && { estado: filterEstado }),
    }),
    enabled: open,
  })

  function resetForm() {
    setFormSede(defaultSedeId ?? '')
    setFormProfesional('')
    setFormInicio(todayDTLocal())
    setFormFin(todayDTLocal())
    setFormMotivo('')
    setFormError(null)
  }

  const { mutate: crear, isPending: creando } = useMutation({
    mutationFn: () => {
      if (!formInicio || !formFin) throw new Error('Completa las fechas')
      const inicio = localToISO(formInicio)
      const fin = localToISO(formFin)
      if (new Date(fin) <= new Date(inicio)) throw new Error('La fecha fin debe ser posterior al inicio')
      return agendaApi.bloqueos.create({
        sede: formSede || null,
        profesional: formProfesional || null,
        fecha_inicio: inicio,
        fecha_fin: fin,
        motivo: formMotivo,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bloqueos'] })
      setDialogOpen(false)
      resetForm()
    },
    onError: (err: any) => {
      setFormError(err?.message ?? err?.response?.data?.detail ?? 'Error al crear el bloqueo')
    },
  })

  const { mutate: aprobar } = useMutation({
    mutationFn: (id: string) => agendaApi.bloqueos.aprobar(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bloqueos'] }),
  })

  const { mutate: rechazar } = useMutation({
    mutationFn: (id: string) => agendaApi.bloqueos.rechazar(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bloqueos'] }),
  })

  const { mutate: eliminar } = useMutation({
    mutationFn: (id: string) => agendaApi.bloqueos.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bloqueos'] }),
  })

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto flex flex-col gap-0 p-0">
          <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <SheetTitle className="flex items-center justify-between">
              <span>Bloqueos de agenda</span>
              {canCrear && (
                <Button size="sm" onClick={() => { resetForm(); setDialogOpen(true) }}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  Nuevo bloqueo
                </Button>
              )}
            </SheetTitle>
          </SheetHeader>

          {/* Filters */}
          <div className="flex gap-2 px-6 py-3 border-b shrink-0 flex-wrap">
            <Select value={filterSede || 'all'} onValueChange={(v) => setFilterSede(v === 'all' ? '' : v)}>
              <SelectTrigger className="h-8 text-xs w-36">
                <SelectValue placeholder="Todas las sedes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las sedes</SelectItem>
                {sedes?.results.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterEstado || 'all'} onValueChange={(v) => setFilterEstado(v === 'all' ? '' : v as EstadoBloqueo)}>
              <SelectTrigger className="h-8 text-xs w-32">
                <SelectValue placeholder="Todos los estados" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pendiente">Pendientes</SelectItem>
                <SelectItem value="aprobado">Aprobados</SelectItem>
                <SelectItem value="rechazado">Rechazados</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
            {isLoading && (
              <p className="text-sm text-muted-foreground text-center py-8">Cargando bloqueos...</p>
            )}
            {!isLoading && (!bloqueos || bloqueos.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-8">No hay bloqueos registrados.</p>
            )}
            {bloqueos?.map((b) => (
              <BloqueoRow
                key={b.id}
                bloqueo={b}
                canAprobar={canAprobar}
                onAprobar={() => aprobar(b.id)}
                onRechazar={() => rechazar(b.id)}
                onEliminar={() => eliminar(b.id)}
              />
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* New bloqueo dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) resetForm() }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo bloqueo</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Sede</Label>
                <Select value={formSede || 'none'} onValueChange={(v) => { setFormSede(v === 'none' ? '' : v); setFormProfesional('') }}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Todas las sedes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Todas las sedes</SelectItem>
                    {sedes?.results.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Profesional (opcional)</Label>
                <Select value={formProfesional || 'none'} onValueChange={(v) => setFormProfesional(v === 'none' ? '' : v)}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Toda la sede" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Toda la sede</SelectItem>
                    {formProfesionales?.map((p) => (
                      // El backend BloqueoAgenda.profesional es FK a User → usar p.id (user.id),
                      // NO p.colaborador_id (que es el id del perfil Colaborador).
                      <SelectItem key={p.id} value={p.id}>{p.nombre_completo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Inicio *</Label>
                <Input
                  type="datetime-local"
                  className="h-9 text-sm"
                  value={formInicio}
                  onChange={(e) => setFormInicio(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Fin *</Label>
                <Input
                  type="datetime-local"
                  className="h-9 text-sm"
                  value={formFin}
                  onChange={(e) => setFormFin(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Motivo</Label>
              <Textarea
                rows={2}
                placeholder="Vacaciones, reunión, mantenimiento..."
                value={formMotivo}
                onChange={(e) => setFormMotivo(e.target.value)}
              />
            </div>

            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => crear()} disabled={creando}>
              {creando ? 'Guardando...' : 'Crear bloqueo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function BloqueoRow({
  bloqueo, canAprobar, onAprobar, onRechazar, onEliminar,
}: {
  bloqueo: BloqueoAgenda
  canAprobar: boolean
  onAprobar: () => void
  onRechazar: () => void
  onEliminar: () => void
}) {
  const cfg = ESTADO_CONFIG[bloqueo.estado]

  return (
    <div className="rounded-lg border border-gray-100 bg-white p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('text-[11px] font-medium px-1.5 py-0.5 rounded border', cfg.cls)}>
              {cfg.label}
            </span>
            {bloqueo.profesional_nombre ? (
              <span className="text-xs font-medium text-gray-700 truncate">{bloqueo.profesional_nombre}</span>
            ) : (
              <span className="text-xs text-muted-foreground">Toda la sede</span>
            )}
          </div>
          <p className="text-xs text-gray-600">
            {formatDT(bloqueo.fecha_inicio)} – {formatDT(bloqueo.fecha_fin)}
          </p>
          {bloqueo.motivo && (
            <p className="text-xs text-muted-foreground truncate">{bloqueo.motivo}</p>
          )}
          <p className="text-[11px] text-muted-foreground">Creado por {bloqueo.creado_por_nombre}</p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {bloqueo.estado === 'pendiente' && canAprobar && (
            <>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                title="Aprobar"
                onClick={onAprobar}
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                title="Rechazar"
                onClick={onRechazar}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          {bloqueo.estado === 'rechazado' && (
            <Ban className="h-4 w-4 text-red-400" />
          )}
          {(bloqueo.estado === 'aprobado' || bloqueo.estado === 'pendiente') && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              title="Eliminar"
              onClick={() => {
                if (window.confirm('¿Eliminar este bloqueo?')) onEliminar()
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
