'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { PageHeader } from '@/components/shared/PageHeader'
import { canAccess, hasPermission, PERM } from '@/lib/permissions'
import { useAuthStore } from '@/store/authStore'
import { CompraForm } from '@/components/proveedores/CompraForm'

export default function NuevaCompraPage() {
  return <RoleGuard check={canAccess.compras}><NuevaCompraContent /></RoleGuard>
}

function NuevaCompraContent() {
  const { user } = useAuthStore()
  const puedeRegistrar = hasPermission(user, PERM.PROVEEDORES_ORDENES_GESTIONAR)

  if (!puedeRegistrar) {
    return (
      <div className="space-y-5">
        <PageHeader title="Registrar compra" />
        <p className="text-sm text-muted-foreground">No tienes permiso para registrar compras.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Registrar compra"
        description="Ingresa los datos de la factura y los insumos comprados."
        action={
          <Button variant="outline" size="sm" asChild>
            <Link href="/compras"><ArrowLeft className="h-4 w-4 mr-1.5" />Compras</Link>
          </Button>
        }
      />
      <CompraForm />
    </div>
  )
}
