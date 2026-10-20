'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  ArrowLeftRight, Banknote, CalendarClock, CreditCard, HandCoins, Landmark, Lock, MoreHorizontal,
  Pencil, Plus, Power, Trash2, Wallet,
} from 'lucide-react'
import { formasPagoApi } from '@/lib/api/formasPago'
import { useAuthStore } from '@/store/authStore'
import { hasPermission, PERM } from '@/lib/permissions'
import { toast } from '@/hooks/use-toast'
import { PageHeader } from '@/components/shared/PageHeader'
import {
  avisarGuardado, EtiquetaAjuste, FilaAjuste, SeccionAjustes, VacioAjustes,
} from '@/components/configuracion/ajustes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { TIPOS_BASE_NO_MEDIO_REAL, type FormaDePago, type TipoBaseFormaPago } from '@/types/formasPago'

const TIPO_BASE_OPTIONS: { value: TipoBaseFormaPago; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'tarjeta_debito', label: 'Tarjeta débito' },
  { value: 'tarjeta_credito', label: 'Tarjeta crédito' },
  { value: 'credito', label: 'Crédito' },
  { value: 'cuotas', label: 'Cuotas' },
  { value: 'financiamiento', label: 'Financiamiento' },
  { value: 'otro', label: 'Otro' },
]

const ICONO_TIPO: Record<TipoBaseFormaPago, React.ElementType> = {
  efectivo: Banknote,
  transferencia: ArrowLeftRight,
  tarjeta_debito: CreditCard,
  tarjeta_credito: CreditCard,
  credito: HandCoins,
  cuotas: CalendarClock,
  financiamiento: Landmark,
  otro: Wallet,
}

/** Quita tildes y mayúsculas para comparar el nombre con el tipo. */
const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

const formaSchema = z.object({
  nombre: z.string().min(2, 'Mínimo 2 caracteres'),
  tipo_base: z.string().min(1, 'Selecciona un tipo'),
})

type FormaFormValues = z.infer<typeof formaSchema>

function FormaDialog({
  forma,
  open,
  onClose,
}: {
  forma: FormaDePago | null
  open: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()
  const isEdit = !!forma

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormaFormValues>({
    resolver: zodResolver(formaSchema),
    values: forma ? { nombre: forma.nombre, tipo_base: forma.tipo_base } : { nombre: '', tipo_base: '' },
  })

  const mutation = useMutation({
    mutationFn: (data: FormaFormValues) =>
      isEdit
        ? formasPagoApi.patch(forma!.id, { nombre: data.nombre })
        : formasPagoApi.create({ nombre: data.nombre, tipo_base: data.tipo_base as TipoBaseFormaPago }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['formas-pago'] })
      toast.success(isEdit ? 'Forma de pago actualizada' : 'Forma de pago creada')
      handleClose()
    },
    onError: (err: any) => {
      const data = err?.response?.data
      toast.error('No se pudo guardar', data?.error ?? data?.nombre?.[0] ?? data?.tipo_base?.[0] ?? 'Intenta de nuevo.')
    },
  })

  function handleClose() {
    reset()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar forma de pago' : 'Nueva forma de pago'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Nombre *</Label>
            <Input
              placeholder="Ej: Nequi, Bono regalo"
              {...register('nombre')}
              className={cn(errors.nombre && 'border-red-400')}
            />
            {errors.nombre && <p className="text-xs text-red-500">{errors.nombre.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Tipo *</Label>
            <Select
              value={watch('tipo_base')}
              onValueChange={(v) => setValue('tipo_base', v)}
              disabled={isEdit}
            >
              <SelectTrigger className={cn(errors.tipo_base && 'border-red-400')}>
                <SelectValue placeholder="Seleccionar…" />
              </SelectTrigger>
              <SelectContent>
                {TIPO_BASE_OPTIONS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.tipo_base && <p className="text-xs text-red-500">{errors.tipo_base.message}</p>}
            {isEdit && (
              <p className="text-xs text-muted-foreground">El tipo no se puede cambiar después de creada.</p>
            )}
          </div>

          {mutation.isError && !errors.nombre && !errors.tipo_base && (
            <p className="text-sm text-red-500">Error al guardar. Intenta de nuevo.</p>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={handleClose}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear forma de pago'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DeleteFormaDialog({
  forma,
  open,
  onClose,
}: {
  forma: FormaDePago | null
  open: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => formasPagoApi.delete(forma!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['formas-pago'] })
      toast.success('Forma de pago eliminada')
      onClose()
    },
    onError: (err: any) => {
      toast.error('No se pudo eliminar', err?.response?.data?.error ?? 'Puede tener pagos o cuotas registrados.')
    },
  })

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>¿Eliminar forma de pago?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground py-2">
          Se eliminará <span className="font-semibold">{forma?.nombre}</span>. Si ya tiene pagos o cuotas
          registrados, no se podrá eliminar: desactívala en su lugar.
        </p>
        {mutation.isError && (
          <p className="text-sm text-red-500">No se pudo eliminar. Ya está en uso.</p>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button variant="destructive" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? 'Eliminando…' : 'Eliminar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function FormasPagoPage() {
  const { user } = useAuthStore()
  const puedeGestionar = hasPermission(user, PERM.FORMAS_PAGO_GESTIONAR)

  const qc = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editando, setEditando] = useState<FormaDePago | null>(null)
  const [eliminando, setEliminando] = useState<FormaDePago | null>(null)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['formas-pago', 'admin'],
    queryFn: () => formasPagoApi.list(),
  })
  const formas = data?.results ?? []
  const medios = formas.filter((f) => !TIPOS_BASE_NO_MEDIO_REAL.includes(f.tipo_base))
  const planes = formas.filter((f) => TIPOS_BASE_NO_MEDIO_REAL.includes(f.tipo_base))

  const toggleMutation = useMutation({
    mutationFn: ({ id, activo }: { id: string; activo: boolean }) => formasPagoApi.patch(id, { activo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['formas-pago'] }),
    onError: () => toast.error('No se pudo guardar', 'Intenta de nuevo.'),
  })

  function cambiarActivo(f: FormaDePago, activo: boolean, conDeshacer = true) {
    toggleMutation.mutate(
      { id: f.id, activo },
      {
        onSuccess: () => avisarGuardado(
          conDeshacer ? () => cambiarActivo(f, !activo, false) : undefined,
          activo ? `${f.nombre} activada` : `${f.nombre} desactivada`,
        ),
      },
    )
  }

  function handleEdit(f: FormaDePago) { setEditando(f); setDialogOpen(true) }
  function handleDelete(f: FormaDePago) { setEliminando(f); setDeleteOpen(true) }
  function closeDialog() { setDialogOpen(false); setEditando(null) }
  function closeDelete() { setDeleteOpen(false); setEliminando(null) }

  const botonNueva = puedeGestionar && (
    <Button size="sm" onClick={() => setDialogOpen(true)}>
      <Plus className="mr-1.5 h-3.5 w-3.5" />
      Nueva forma de pago
    </Button>
  )

  function fila(f: FormaDePago) {
    // El tipo solo se menciona si el nombre no lo dice ya ("Nequi" → Transferencia).
    const tipoDistinto = normalizar(f.nombre) !== normalizar(f.tipo_base_display)
    return (
      <FilaAjuste
        key={f.id}
        icono={ICONO_TIPO[f.tipo_base] ?? Wallet}
        apagada={!f.activo}
        titulo={f.nombre}
        descripcion={tipoDistinto ? f.tipo_base_display : undefined}
        extra={!f.activo ? <EtiquetaAjuste tono="aviso">Inactiva</EtiquetaAjuste> : undefined}
      >
        {puedeGestionar && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Acciones de ${f.nombre}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleEdit(f)}>
                <Pencil className="mr-2 h-3.5 w-3.5" />Editar nombre
              </DropdownMenuItem>
              <DropdownMenuItem disabled={toggleMutation.isPending} onClick={() => cambiarActivo(f, !f.activo)}>
                <Power className="mr-2 h-3.5 w-3.5" />{f.activo ? 'Desactivar' : 'Activar'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {f.es_sistema ? (
                // Antes era un candado sin explicación junto al nombre.
                <p className="flex max-w-[15rem] items-start gap-2 px-2 py-1.5 text-xs text-muted-foreground">
                  <Lock className="mt-px h-3.5 w-3.5 shrink-0" />
                  Viene con CliniQ: no se puede eliminar, pero sí renombrar o desactivar.
                </p>
              ) : (
                <DropdownMenuItem
                  onClick={() => handleDelete(f)}
                  className="text-red-600 focus:text-red-600"
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />Eliminar
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </FilaAjuste>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Formas de pago"
        description="Los medios de pago y planes que usa tu clínica al cobrar o al declarar el plan de pagos de una cotización."
      />

      <div className="space-y-7">
        <SeccionAjustes
          titulo="Medios de pago"
          accion={botonNueva}
        >
          {isLoading ? <FilasCargando filas={5} /> : isError ? (
            <FilaAjuste titulo="No se pudieron cargar las formas de pago.">
              <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>Reintentar</Button>
            </FilaAjuste>
          ) : formas.length === 0 ? (
            <VacioAjustes
              titulo="No hay formas de pago creadas"
              descripcion="Crea los medios con los que cobras (efectivo, transferencia, tarjeta…)."
              accion={botonNueva}
            />
          ) : medios.length === 0 ? (
            <VacioAjustes titulo="No hay medios de pago" descripcion="Crea al menos uno para poder registrar cobros." />
          ) : (
            medios.map(fila)
          )}
        </SeccionAjustes>

        {!isLoading && !isError && planes.length > 0 && (
          <SeccionAjustes
            titulo="Planes de pago"
            descripcion="Cómo se reparte el pago de una cotización. No son un cobro por sí mismos."
          >
            {planes.map(fila)}
          </SeccionAjustes>
        )}
      </div>

      <FormaDialog forma={editando} open={dialogOpen} onClose={closeDialog} />
      <DeleteFormaDialog forma={eliminando} open={deleteOpen} onClose={closeDelete} />
    </div>
  )
}

/** Filas grises mientras cargan los datos (igual que en ClinicaConfig). */
function FilasCargando({ filas }: { filas: number }) {
  return (
    <>
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5">
          <div className="h-8 w-8 shrink-0 animate-pulse rounded-lg bg-muted" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-40 animate-pulse rounded bg-muted" />
            <div className="h-2.5 w-64 max-w-full animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </>
  )
}
