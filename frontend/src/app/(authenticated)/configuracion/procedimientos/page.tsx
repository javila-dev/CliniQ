'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, MoreHorizontal, Pencil, Power, Clock, FileText, ShieldCheck, Loader2, ListOrdered } from 'lucide-react'
import { clinicasApi } from '@/lib/api/clinicas'
import { PageHeader } from '@/components/shared/PageHeader'
import { ProcedimientoDialog } from '@/components/configuracion/ProcedimientoDialog'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Servicio } from '@/types/clinicas'

function ProcedimientosTable({
  servicios, onEdit, onToggle,
}: {
  servicios: Servicio[]
  onEdit: (s: Servicio) => void
  onToggle: (s: Servicio) => void
}) {
  return (
    <div className="rounded-xl border bg-white overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50/60">
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Procedimiento</th>
            <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide w-24">Duración</th>
            <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32 hidden md:table-cell">Precio ref.</th>
            <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32 hidden sm:table-cell">Consentimiento</th>
            <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide w-24">Estado</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {servicios.map((s) => (
            <tr key={s.id} className={cn('hover:bg-gray-50/50 transition-colors', !s.activo && 'opacity-55')}>
              <td className="px-4 py-3">
                <p className="font-medium text-gray-900">{s.nombre}</p>
                {s.descripcion && <p className="text-xs text-muted-foreground truncate max-w-xs mt-0.5">{s.descripcion}</p>}
                {s.tiene_protocolo && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                    <ListOrdered className="h-3 w-3" />
                    {s.pasos_protocolo?.length ?? '—'} pasos
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-center">
                <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />{s.duracion_min} min
                </span>
              </td>
              <td className="px-4 py-3 text-right hidden md:table-cell">
                {s.precio
                  ? <span className="text-sm font-medium tabular-nums">{new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(parseFloat(s.precio))}</span>
                  : <span className="text-xs text-muted-foreground">—</span>}
              </td>
              <td className="px-4 py-3 text-center hidden sm:table-cell">
                {(s.consentimientos_requeridos?.length ?? 0) > 0
                  ? (
                    <div className="flex flex-col items-center gap-0.5">
                      <Badge variant="outline" className="text-[10px] gap-1">
                        <ShieldCheck className="h-3 w-3" />
                        {s.consentimientos_requeridos![0].template_nombre ?? 'Sin plantilla'}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">Vigencia: {s.vigencia_meses ?? 12} meses</span>
                    </div>
                  )
                  : <span className="text-xs text-muted-foreground">—</span>}
              </td>
              <td className="px-4 py-3 text-center">
                <Badge variant={s.activo ? 'default' : 'secondary'} className="text-[10px]">
                  {s.activo ? 'Activo' : 'Inactivo'}
                </Badge>
              </td>
              <td className="px-2 py-3">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(s)}>
                      <Pencil className="h-4 w-4 mr-2" />Editar
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onToggle(s)}>
                      <Power className="h-4 w-4 mr-2" />
                      {s.activo ? 'Desactivar' : 'Activar'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function ProcedimientosPage() {
  const qc = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Servicio | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['procedimientos', 'all'],
    queryFn: () => clinicasApi.procedimientos.list(),
  })

  const toggleMut = useMutation({
    mutationFn: ({ id, activo }: { id: string; activo: boolean }) =>
      clinicasApi.procedimientos.update(id, { activo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['procedimientos', 'all'] }),
  })

  const servicios = data?.results ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Procedimientos"
        description="Configura los procedimientos clínicos: duración, protocolo de pasos y consentimientos"
        backHref="/configuracion"
        action={
          <Button onClick={() => { setEditTarget(null); setDialogOpen(true) }}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo procedimiento
          </Button>
        }
      />

      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && servicios.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No hay procedimientos configurados</p>
          <p className="text-xs text-muted-foreground mt-1">Crea el primer procedimiento para empezar a agendar citas</p>
          <Button className="mt-4" onClick={() => { setEditTarget(null); setDialogOpen(true) }}>
            <Plus className="h-4 w-4 mr-2" />Nuevo procedimiento
          </Button>
        </div>
      )}

      {!isLoading && servicios.length > 0 && (
        <ProcedimientosTable
          servicios={servicios}
          onEdit={(s) => { setEditTarget(s); setDialogOpen(true) }}
          onToggle={(s) => toggleMut.mutate({ id: s.id, activo: !s.activo })}
        />
      )}

      <ProcedimientoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        servicio={editTarget}
      />
    </div>
  )
}
