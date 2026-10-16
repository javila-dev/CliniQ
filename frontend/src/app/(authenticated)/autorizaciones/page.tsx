'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BadgeCheck, Inbox } from 'lucide-react'

import { SolicitudAutorizacionCard } from '@/components/cotizaciones/SolicitudAutorizacionCard'
import { ErrorState } from '@/components/shared/ErrorState'
import { LoadingState } from '@/components/shared/LoadingState'
import { PageHeader } from '@/components/shared/PageHeader'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { Paginacion, TablaVacia } from '@/components/shared/TablaDatos'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AUTORIZACIONES_LISTA_KEY, useAutorizacionesPendientes } from '@/hooks/useAutorizacionesPrecio'
import { useUserSedes } from '@/hooks/useUserSedes'
import { autorizacionesPrecioApi } from '@/lib/api/cotizaciones'
import { mensajeDeError } from '@/lib/errores'
import { hasPermission, PERM } from '@/lib/permissions'

const PAGE_SIZE = 25

export default function AutorizacionesPage() {
  return (
    <RoleGuard check={(user) => hasPermission(user, PERM.COTIZACIONES_CAMBIAR_PRECIO)}>
      <AutorizacionesContent />
    </RoleGuard>
  )
}

function AutorizacionesContent() {
  const [tab, setTab] = useState<'pendiente' | 'resueltas'>('pendiente')
  const [sede, setSede] = useState('todas')
  const [page, setPage] = useState(1)
  const { sedes } = useUserSedes()
  const { pendientes } = useAutorizacionesPendientes()

  const params = { estado: tab, page, ...(sede !== 'todas' ? { sede } : {}) }
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: [...AUTORIZACIONES_LISTA_KEY, params],
    queryFn: () => autorizacionesPrecioApi.list(params),
    // Las pendientes llegan mientras la bandeja está abierta.
    refetchInterval: tab === 'pendiente' ? 15_000 : false,
  })

  const total = data?.count ?? 0

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <PageHeader
        title="Autorizaciones de precio"
        // Sin ítem en el menú: se llega desde el dashboard o desde Cotizaciones.
        backHref="/cotizaciones"
        description="Cotizaciones con un precio o descuento por debajo de lo permitido. Mientras esperan, no se pueden enviar ni aceptar."
      />

      <div className="flex flex-wrap items-end gap-3">
        <Tabs value={tab} onValueChange={(v) => { setTab(v as typeof tab); setPage(1) }}>
          <TabsList className="h-9">
            <TabsTrigger value="pendiente" className="text-xs">
              Por decidir{pendientes > 0 && <span className="ml-1.5 rounded-full bg-rose-500 px-1.5 text-[10px] font-bold leading-4 text-white">{pendientes}</span>}
            </TabsTrigger>
            <TabsTrigger value="resueltas" className="text-xs">Resueltas</TabsTrigger>
          </TabsList>
        </Tabs>
        {sedes.length > 1 && (
          <Select value={sede} onValueChange={(v) => { setSede(v); setPage(1) }}>
            <SelectTrigger className="ml-auto h-9 w-44" aria-label="Sede">
              <SelectValue placeholder="Sede" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas las sedes</SelectItem>
              {sedes.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {isLoading ? (
        <LoadingState rows={3} />
      ) : isError ? (
        <ErrorState message={mensajeDeError(error, 'No se pudieron cargar las autorizaciones.')} onRetry={() => refetch()} />
      ) : !data?.results?.length ? (
        <TablaVacia
          icono={tab === 'pendiente' ? <BadgeCheck className="h-5 w-5" /> : <Inbox className="h-5 w-5" />}
          titulo={tab === 'pendiente' ? 'Nada por decidir' : 'Aún no hay solicitudes resueltas'}
          texto={tab === 'pendiente'
            ? 'Cuando alguien del equipo pida autorizar un precio, aparecerá aquí y en el menú.'
            : undefined}
        />
      ) : (
        <>
          <div className="space-y-3">
            {data.results.map((s) => (
              <SolicitudAutorizacionCard key={s.id} solicitud={s} conContexto puedeDecidir />
            ))}
          </div>
          {total > PAGE_SIZE && <Paginacion page={page} total={total} pageSize={PAGE_SIZE} onPage={setPage} />}
        </>
      )}
    </div>
  )
}
