'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { authApi } from '@/lib/api/auth'
import { clinicasApi } from '@/lib/api/clinicas'
import type { ProcedimientosSinProfesional } from '@/lib/api/clinicas'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'

const MAX_NOMBRES = 6

interface Props {
  clinicaId: string
  activo: boolean
  puedeEditar: boolean
}

/** Interruptor del parámetro de la clínica que decide si, al agendar, se ofrecen todos los
 *  profesionales o solo los que realizan el procedimiento. Antes de encenderlo avisa de los
 *  procedimientos que quedarían sin profesional y ofrece asignarlos a todos. */
export function FiltroProfesionalesPorProcedimiento({ clinicaId, activo, puedeEditar }: Props) {
  const qc = useQueryClient()
  const { setUser } = useAuthStore()
  const [resumen, setResumen] = useState<ProcedimientosSinProfesional | null>(null)
  const [error, setError] = useState<string | null>(null)

  const actualizar = useMutation({
    mutationFn: async ({ valor, asignar }: { valor: boolean; asignar?: boolean }) => {
      if (asignar) await clinicasApi.asignarProfesionalesAProcedimientos()
      return clinicasApi.update(clinicaId, { filtrar_profesionales_por_procedimiento: valor })
    },
    onSuccess: async (_, { valor, asignar }) => {
      setResumen(null)
      setError(null)
      toast.success(
        valor ? 'Filtro por procedimiento activado' : 'Filtro por procedimiento desactivado',
        asignar ? 'Los procedimientos sin profesional quedaron asignados a todos.' : undefined,
      )
      qc.invalidateQueries({ queryKey: ['clinica', clinicaId] })
      qc.invalidateQueries({ queryKey: ['mi-clinica', clinicaId] })
      qc.invalidateQueries({ queryKey: ['setup-checklist'] })
      qc.invalidateQueries({ queryKey: ['profesionales'] })
      qc.invalidateQueries({ queryKey: ['procedimientos'] })
      // El modal de agenda lee el parámetro del perfil del usuario, no de la configuración.
      try { setUser(await authApi.me()) } catch { /* el perfil se actualiza en el próximo ingreso */ }
    },
    onError: (err: any) => {
      setError(err?.response?.data?.error ?? 'No se pudo guardar el cambio. Intenta de nuevo.')
    },
  })

  const revisar = useMutation({
    mutationFn: () => clinicasApi.procedimientosSinProfesional(),
    onSuccess: (datos) => {
      setError(null)
      if (datos.procedimientos.length === 0) actualizar.mutate({ valor: true })
      else setResumen(datos)
    },
    onError: () => setError('No se pudo revisar los procedimientos. Intenta de nuevo.'),
  })

  const ocupado = actualizar.isPending || revisar.isPending
  const sinAsignar = resumen?.procedimientos ?? []

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-4">
        <Switch
          checked={activo}
          disabled={!puedeEditar || ocupado}
          onCheckedChange={(valor) => (valor ? revisar.mutate() : actualizar.mutate({ valor: false }))}
          aria-label="Filtrar profesionales por procedimiento"
        />
        <div>
          <p className="text-sm font-medium text-gray-700">
            {activo ? 'Solo los profesionales que realizan el procedimiento' : 'Cualquier profesional de la sede'}
          </p>
          <p className="mt-0.5 text-xs text-gray-400">
            {activo
              ? 'Al agendar se elige primero la sede y el procedimiento, y luego el profesional. Un procedimiento sin profesionales asignados no se puede agendar.'
              : 'Cualquier profesional de la sede puede atender cualquier procedimiento.'}
          </p>
        </div>
        {ocupado && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mt-0.5" />}
      </div>

      {error && !resumen && <p className="text-sm text-red-500">{error}</p>}

      <Dialog open={resumen !== null} onOpenChange={(abierto) => { if (!abierto && !actualizar.isPending) setResumen(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Hay procedimientos sin profesionales</DialogTitle>
            <DialogDescription>
              {sinAsignar.length === 1
                ? '1 procedimiento no tiene ningún profesional asignado'
                : `${sinAsignar.length} procedimientos no tienen ningún profesional asignado`}
              {' '}y no se podrían agendar mientras el filtro esté activo.
            </DialogDescription>
          </DialogHeader>

          <ul className="rounded-lg border divide-y text-sm">
            {sinAsignar.slice(0, MAX_NOMBRES).map((p) => (
              <li key={p.id} className="px-3 py-2">{p.nombre}</li>
            ))}
            {sinAsignar.length > MAX_NOMBRES && (
              <li className="px-3 py-2 text-muted-foreground">y {sinAsignar.length - MAX_NOMBRES} más</li>
            )}
          </ul>

          {resumen?.total_profesionales === 0 && (
            <p className="text-xs text-muted-foreground">
              No hay profesionales activos para asignar. Puedes activar el filtro igual y asignarlos después
              desde cada procedimiento o desde el perfil del profesional.
            </p>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}

          <DialogFooter className="gap-2 sm:gap-2 flex-col sm:flex-row">
            <Button variant="outline" onClick={() => setResumen(null)} disabled={actualizar.isPending}>
              Cancelar
            </Button>
            <Button
              variant="outline"
              onClick={() => actualizar.mutate({ valor: true })}
              disabled={actualizar.isPending}
            >
              Activar sin asignar
            </Button>
            {(resumen?.total_profesionales ?? 0) > 0 && (
              <Button onClick={() => actualizar.mutate({ valor: true, asignar: true })} disabled={actualizar.isPending}>
                {actualizar.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Asignar a todos y activar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
