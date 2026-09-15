'use client'

import { use } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { proveedoresApi } from '@/lib/api/proveedores'
import { Button } from '@/components/ui/button'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { PageHeader } from '@/components/shared/PageHeader'
import { canAccess } from '@/lib/permissions'
import { CompraForm } from '@/components/proveedores/CompraForm'

interface Props { params: Promise<{ id: string }> }

export default function CompraDetallePage({ params }: Props) {
  const { id } = use(params)
  return <RoleGuard check={canAccess.compras}><CompraDetalleContent id={id} /></RoleGuard>
}

function CompraDetalleContent({ id }: { id: string }) {
  const { data: compra, isLoading, isError, refetch } = useQuery({
    queryKey: ['compras', id],
    queryFn: () => proveedoresApi.getOrden(id),
  })

  if (isLoading) return <LoadingState rows={4} />
  if (isError || !compra) return <ErrorState onRetry={refetch} />

  return (
    <div className="space-y-5">
      <PageHeader
        title={compra.numero_factura_proveedor || compra.numero}
        description={compra.estado === 'borrador' ? 'Borrador — puedes seguir editándola.' : 'Compra recibida — no se puede modificar.'}
        action={
          <Button variant="outline" size="sm" asChild>
            <Link href="/compras"><ArrowLeft className="h-4 w-4 mr-1.5" />Compras</Link>
          </Button>
        }
      />
      <CompraForm compraExistente={compra} />
    </div>
  )
}
