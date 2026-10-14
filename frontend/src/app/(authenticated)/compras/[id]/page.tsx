'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, XCircle } from 'lucide-react'
import { proveedoresApi } from '@/lib/api/proveedores'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { PageHeader } from '@/components/shared/PageHeader'
import { canAccess, hasPermission, PERM } from '@/lib/permissions'
import { useAuthStore } from '@/store/authStore'
import { mensajeDeError } from '@/lib/errores'
import { toast } from '@/hooks/use-toast'
import { CompraForm } from '@/components/proveedores/CompraForm'
import type { EstadoOrdenCompra } from '@/types/proveedores'

// El backend cancela en cualquier estado, pero una compra ya recibida (total o
// parcial) movió stock y cancelarla no lo revierte: solo se ofrece antes de recibir.
const ESTADOS_CANCELABLES: EstadoOrdenCompra[] = ['borrador', 'enviada']

interface Props { params: Promise<{ id: string }> }

export default function CompraDetallePage({ params }: Props) {
  const { id } = use(params)
  return <RoleGuard check={canAccess.compras}><CompraDetalleContent id={id} /></RoleGuard>
}

function CompraDetalleContent({ id }: { id: string }) {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const puedeGestionar = hasPermission(user, PERM.PROVEEDORES_ORDENES_GESTIONAR)
  const [confirmarCancelar, setConfirmarCancelar] = useState(false)

  const { data: compra, isLoading, isError, refetch } = useQuery({
    queryKey: ['compras', id],
    queryFn: () => proveedoresApi.getOrden(id),
  })

  const cancelarMut = useMutation({
    mutationFn: () => proveedoresApi.cancelarOrden(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compras'] })
      setConfirmarCancelar(false)
      toast.success('Compra cancelada')
    },
    onError: (err) => toast.error('No se pudo cancelar la compra', mensajeDeError(err)),
  })

  if (isLoading) return <LoadingState rows={4} />
  if (isError || !compra) return <ErrorState onRetry={refetch} />

  const puedeCancelar = puedeGestionar && ESTADOS_CANCELABLES.includes(compra.estado)
  const descripcion =
    compra.estado === 'borrador' ? 'Borrador — puedes seguir editándola.'
    : compra.estado === 'cancelada' ? 'Compra cancelada — no se puede modificar.'
    : 'Compra recibida — no se puede modificar.'

  return (
    <div className="space-y-5">
      <PageHeader
        title={compra.numero_factura_proveedor || compra.numero}
        description={descripcion}
        action={
          <div className="flex items-center gap-2">
            {puedeCancelar && (
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 hover:text-red-600"
                onClick={() => setConfirmarCancelar(true)}
              >
                <XCircle className="h-4 w-4 mr-1.5" />Cancelar compra
              </Button>
            )}
            <Button variant="outline" size="sm" asChild>
              <Link href="/compras"><ArrowLeft className="h-4 w-4 mr-1.5" />Compras</Link>
            </Button>
          </div>
        }
      />
      {/* key: al cancelar, el formulario se vuelve a montar ya en modo solo lectura. */}
      <CompraForm key={compra.estado} compraExistente={compra} />

      <ConfirmDialog
        open={confirmarCancelar}
        onOpenChange={(v) => { if (!v && !cancelarMut.isPending) setConfirmarCancelar(false) }}
        title="Cancelar compra"
        description="La compra quedará cancelada y ya no se podrá editar ni recibir. No afecta el stock, porque todavía no se ha recibido. Esta acción no se puede deshacer."
        confirmLabel="Cancelar compra"
        cancelLabel="Volver"
        variant="destructive"
        loading={cancelarMut.isPending}
        onConfirm={() => cancelarMut.mutate()}
      />
    </div>
  )
}
