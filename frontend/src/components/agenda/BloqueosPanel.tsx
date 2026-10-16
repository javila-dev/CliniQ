'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Check, X, Ban } from 'lucide-react'
import { mensajeDeError } from '@/lib/errores'
import { toast } from '@/hooks/use-toast'
import { agendaApi } from '@/lib/api/agenda'
import { colaboradoresApi } from '@/lib/api/colaboradores'
import { useAuthStore } from '@/store/authStore'
import { useUserSedes } from '@/hooks/useUserSedes'
import { hasPermission, PERM } from '@/lib/permissions'
import { cn, todayISO } from '@/lib/utils'
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
import type { BloqueoAgenda, CitaAfectadaBloqueo, EstadoBloqueo } from '@/types/agenda'

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
  // Quien ve la agenda puede solicitar un bloqueo; queda pendiente hasta que
  // alguien con "aprobar bloqueos" lo acepte (quien aprueba lo crea aprobado).
  const canCrear = hasPermission(user, PERM.AGENDA_CREAR_BLOQUEO) || hasPermission(user, PERM.AGENDA_VER)
  const canAprobar = hasPermission(user, PERM.AGENDA_APROBAR_BLOQUEO)
  const canGestionar = hasPermission(user, PERM.AGENDA_GESTIONAR_BLOQUEOS)
  const textoCrear = canAprobar ? 'Nuevo bloqueo' : 'Solicitar bloqueo'

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
  const [citasAfectadas, setCitasAfectadas] = useState<CitaAfectadaBloqueo[] | null>(null)
  // Si cambia el horario, el aviso de citas afectadas ya no aplica.
  useEffect(() => { setCitasAfectadas(null) }, [formInicio, formFin, formSede, formProfesional])

  // Usuario acotado: solo sus sedes, y no puede bloquear toda la clínica.
  const { sedes, isAllSedes } = useUserSedes()

  const { data: profesionales } = useQuery({
    queryKey: ['profesionales', filterSede],
    queryFn: () => colaboradoresApi.profesionales(filterSede || undefined),
    enabled: true,
  })

  const { data: formProfesionales } = useQuery({
    queryKey: ['profesionales', formSede],
    queryFn: () => colaboradoresApi.profesionales(formSede || undefined),
  })

  const { data: bloqueos, isLoading, isError: errorBloqueos, error: errBloqueos, refetch: recargarBloqueos } = useQuery({
    queryKey: ['bloqueos', 'panel', filterSede, filterEstado],
    queryFn: () => agendaApi.bloqueos.list({
      // Vigentes y próximos: los ya terminados no se gestionan.
      desde: todayISO(),
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
    setCitasAfectadas(null)
  }

  const { mutate: crear, isPending: creando } = useMutation({
    mutationFn: (confirmar: boolean = false) => {
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
        ...(confirmar && { confirmar_citas_afectadas: true }),
      })
    },
    onSuccess: (bloqueo) => {
      queryClient.invalidateQueries({ queryKey: ['bloqueos'] })
      setDialogOpen(false)
      resetForm()
      if (bloqueo.estado === 'pendiente') {
        toast.success('Solicitud enviada', 'El bloqueo queda pendiente hasta que lo aprueben.')
      }
    },
    onError: (err: any) => {
      const data = err?.response?.data
      if (data?.code === 'BLOQUEO_CON_CITAS') {
        // El bloqueo no cancela las citas: se muestran para reprogramarlas.
        setCitasAfectadas(data.citas ?? [])
        setFormError(mensajeDeError(err))
        return
      }
      setCitasAfectadas(null)
      setFormError(mensajeDeError(err, 'No se pudo crear el bloqueo.'))
    },
  })

  // Antes un fallo al aprobar, rechazar o eliminar no mostraba nada (AG-08).
  const alFallar = (titulo: string) => (err: unknown) => {
    queryClient.invalidateQueries({ queryKey: ['bloqueos'] })
    toast.error(titulo, mensajeDeError(err))
  }

  // Mientras estuvo pendiente se pudieron agendar citas en ese horario: el
  // backend las devuelve y se confirma antes de aprobar (AG-11).
  const [aprobarConCitas, setAprobarConCitas] = useState<{ id: string; mensaje: string; citas: CitaAfectadaBloqueo[] } | null>(null)

  const { mutate: aprobar, isPending: aprobando } = useMutation({
    mutationFn: ({ id, confirmar = false }: { id: string; confirmar?: boolean }) => agendaApi.bloqueos.aprobar(id, confirmar),
    onSuccess: () => {
      setAprobarConCitas(null)
      queryClient.invalidateQueries({ queryKey: ['bloqueos'] })
    },
    onError: (err: any, { id }) => {
      const data = err?.response?.data
      if (data?.code === 'BLOQUEO_CON_CITAS') {
        setAprobarConCitas({ id, mensaje: mensajeDeError(err), citas: data.citas ?? [] })
        return
      }
      alFallar('No se aprobó el bloqueo')(err)
    },
  })

  const { mutate: rechazar } = useMutation({
    mutationFn: (id: string) => agendaApi.bloqueos.rechazar(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bloqueos'] }),
    onError: alFallar('No se rechazó el bloqueo'),
  })

  const { mutate: eliminar } = useMutation({
    mutationFn: (id: string) => agendaApi.bloqueos.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bloqueos'] }),
    onError: alFallar('No se eliminó el bloqueo'),
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
                  {textoCrear}
                </Button>
              )}
            </SheetTitle>
          </SheetHeader>

          {/* Filters */}
          <div className="flex gap-2 px-6 py-3 border-b shrink-0 flex-wrap">
            <Select
              value={filterSede || 'all'}
              onValueChange={(v) => setFilterSede(v === 'all' ? '' : v)}
              disabled={!isAllSedes && sedes.length <= 1}
            >
              <SelectTrigger className="h-8 text-xs w-36">
                <SelectValue placeholder="Todas las sedes" />
              </SelectTrigger>
              <SelectContent>
                {(isAllSedes || sedes.length > 1) && <SelectItem value="all">Todas las sedes</SelectItem>}
                {sedes.map((s) => (
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
            {!isLoading && errorBloqueos && !bloqueos && (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">{mensajeDeError(errBloqueos, 'No se pudieron cargar los bloqueos.')}</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => recargarBloqueos()}>Reintentar</Button>
              </div>
            )}
            {!isLoading && !errorBloqueos && (!bloqueos || bloqueos.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-8">No hay bloqueos registrados.</p>
            )}
            {bloqueos?.map((b) => (
              <BloqueoRow
                key={b.id}
                bloqueo={b}
                canAprobar={canAprobar}
                // Igual que el backend: quien gestiona bloqueos borra cualquiera;
                // quien lo solicitó, solo mientras sigue pendiente.
                canEliminar={canGestionar || (b.estado === 'pendiente' && b.creado_por === user?.id)}
                onAprobar={() => aprobar({ id: b.id })}
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
            <DialogTitle>{textoCrear}</DialogTitle>
          </DialogHeader>
          {!canAprobar && (
            <p className="text-sm text-muted-foreground -mt-2">
              Quedará pendiente hasta que alguien con permiso lo apruebe. Mientras tanto la agenda sigue abierta.
            </p>
          )}

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Sede</Label>
                <Select value={formSede || 'none'} onValueChange={(v) => { setFormSede(v === 'none' ? '' : v); setFormProfesional('') }}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Todas las sedes" />
                  </SelectTrigger>
                  <SelectContent>
                    {isAllSedes && <SelectItem value="none">Todas las sedes</SelectItem>}
                    {sedes.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Profesional (opcional)</Label>
                <Select value={formProfesional || 'none'} onValueChange={(v) => setFormProfesional(v === 'none' ? '' : v)}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder={formSede ? 'Toda la sede' : 'Toda la clínica'} />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Sin sede el bloqueo es de toda la clínica (M3-28). */}
                    <SelectItem value="none">{formSede ? 'Toda la sede' : 'Toda la clínica'}</SelectItem>
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
            {citasAfectadas && citasAfectadas.length > 0 && (
              <ul className="max-h-36 overflow-y-auto rounded-md border bg-amber-50/60 px-3 py-2 text-xs space-y-1">
                {citasAfectadas.map((c) => (
                  <li key={c.id} className="flex justify-between gap-2">
                    <span className="truncate">{c.paciente}</span>
                    <span className="shrink-0 text-muted-foreground">{formatDT(c.fecha_inicio)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            {citasAfectadas && citasAfectadas.length > 0 ? (
              <Button variant="destructive" onClick={() => crear(true)} disabled={creando}>
                {creando ? 'Guardando...' : 'Crear de todas formas'}
              </Button>
            ) : (
              <Button onClick={() => crear(false)} disabled={creando}>
                {creando ? 'Guardando...' : canAprobar ? 'Crear bloqueo' : 'Enviar solicitud'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={aprobarConCitas !== null} onOpenChange={(o) => { if (!o && !aprobando) setAprobarConCitas(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Hay citas en ese horario</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{aprobarConCitas?.mensaje}</p>
          {aprobarConCitas && aprobarConCitas.citas.length > 0 && (
            <ul className="max-h-36 overflow-y-auto rounded-md border bg-amber-50/60 px-3 py-2 text-xs space-y-1">
              {aprobarConCitas.citas.map((c) => (
                <li key={c.id} className="flex justify-between gap-2">
                  <span className="truncate">{c.paciente}</span>
                  <span className="shrink-0 text-muted-foreground">{formatDT(c.fecha_inicio)}</span>
                </li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAprobarConCitas(null)} disabled={aprobando}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={aprobando}
              onClick={() => aprobarConCitas && aprobar({ id: aprobarConCitas.id, confirmar: true })}
            >
              {aprobando ? 'Aprobando...' : 'Aprobar de todas formas'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function BloqueoRow({
  bloqueo, canAprobar, canEliminar, onAprobar, onRechazar, onEliminar,
}: {
  bloqueo: BloqueoAgenda
  canAprobar: boolean
  canEliminar: boolean
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
              <span className="text-xs text-muted-foreground">{bloqueo.sede ? 'Toda la sede' : 'Toda la clínica'}</span>
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
          {(bloqueo.estado === 'aprobado' || bloqueo.estado === 'pendiente') && canEliminar && (
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
