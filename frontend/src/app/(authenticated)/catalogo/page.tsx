'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { PageHeader } from '@/components/shared/PageHeader'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ProcedimientosCatalogo } from '@/components/catalogo/ProcedimientosCatalogo'
import { TratamientosCatalogo } from '@/components/catalogo/TratamientosCatalogo'
import { useAuthStore } from '@/store/authStore'
import { hasPermission, PERM } from '@/lib/permissions'

type Tab = 'procedimientos' | 'tratamientos'

const HELP_SLUG: Record<Tab, string> = {
  procedimientos: 'configurar-un-procedimiento',
  tratamientos: 'configurar-un-tratamiento-y-sus-sesiones',
}

function CatalogoContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tab: Tab = searchParams.get('tab') === 'tratamientos' ? 'tratamientos' : 'procedimientos'

  const setTab = (t: Tab) => router.replace(`/catalogo?tab=${t}`)
  const { user } = useAuthStore()

  if (!hasPermission(user, PERM.SERVICIOS_VER)) {
    return (
      <div className="space-y-5">
        <PageHeader title="Catálogo" />
        <p className="text-sm text-muted-foreground">No tienes permiso para ver el catálogo.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Catálogo"
        description="Lo que tu clínica vende: procedimientos sueltos y tratamientos por sesiones"
        helpSlug={HELP_SLUG[tab]}
      />

      <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Procedimiento</span>: lo que se ejecuta en una cita, con su
        duración y precio (ej. una sesión de láser). <span className="font-medium text-foreground">Tratamiento</span>:
        {' '}<strong className="font-semibold text-foreground">agrupa varios procedimientos en un paquete de sesiones</strong>{' '}
        que el paciente compra de una vez con una cotización (ej. "6 sesiones de láser + 1 control").
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="h-auto bg-muted rounded-full p-1 gap-1">
          <TabsTrigger
            value="procedimientos"
            className="rounded-full px-3.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors duration-200 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:font-semibold"
          >
            Procedimientos
          </TabsTrigger>
          <TabsTrigger
            value="tratamientos"
            className="rounded-full px-3.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors duration-200 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:font-semibold"
          >
            Tratamientos
          </TabsTrigger>
        </TabsList>
        <TabsContent value="procedimientos" className="mt-5">
          <ProcedimientosCatalogo />
        </TabsContent>
        <TabsContent value="tratamientos" className="mt-5">
          <TratamientosCatalogo />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default function CatalogoPage() {
  return (
    <Suspense>
      <CatalogoContent />
    </Suspense>
  )
}
