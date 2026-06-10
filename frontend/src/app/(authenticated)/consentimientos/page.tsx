'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, Plus, ExternalLink, XCircle, Clock } from 'lucide-react'
import { consentimientosApi } from '@/lib/api/consentimientos'
import { PageHeader } from '@/components/shared/PageHeader'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import { ConsentimientoStatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GenerarConsentimientoModal } from '@/components/consentimientos/GenerarConsentimientoModal'
import { formatDateTime, formatDate } from '@/lib/utils'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { canAccess } from '@/lib/permissions'

export default function ConsentimientosPage() {
  return <RoleGuard check={canAccess.consentimientos}><ConsentimientosContent /></RoleGuard>
}

function ConsentimientosContent() {
  const queryClient = useQueryClient()
  const [showGenerar, setShowGenerar] = useState(false)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['consentimientos'],
    queryFn: consentimientosApi.list,
  })

  const { data: plantillasData } = useQuery({
    queryKey: ['plantillas-consentimiento'],
    queryFn: consentimientosApi.plantillas.list,
  })

  const { mutate: revocar } = useMutation({
    mutationFn: (id: string) => consentimientosApi.revocar(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['consentimientos'] }),
  })

  const consentimientos = data?.results ?? []
  const pendientes = consentimientos.filter((c) => c.estado === 'pendiente')
  const firmados = consentimientos.filter((c) => c.estado === 'firmado')
  const revocados = consentimientos.filter((c) => c.estado === 'revocado')

  return (
    <div>
      <PageHeader
        title="Consentimientos"
        description={`${consentimientos.length} consentimiento${consentimientos.length !== 1 ? 's' : ''} en total`}
        action={
          <Button onClick={() => setShowGenerar(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Generar consentimiento
          </Button>
        }
      />

      {isLoading ? (
        <LoadingState rows={4} />
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : (
        <Tabs defaultValue="pendientes">
          <TabsList className="mb-4">
            <TabsTrigger value="pendientes">
              Pendientes
              {pendientes.length > 0 && (
                <Badge variant="warning" className="ml-2 text-xs">{pendientes.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="firmados">
              Firmados
              {firmados.length > 0 && (
                <Badge variant="success" className="ml-2 text-xs">{firmados.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="revocados">Revocados</TabsTrigger>
          </TabsList>

          <TabsContent value="pendientes">
            <ConsentimientoList
              items={pendientes}
              emptyText="Sin consentimientos pendientes de firma"
              onRevocar={(id) => {
                if (confirm('¿Revocar este consentimiento?')) revocar(id)
              }}
            />
          </TabsContent>

          <TabsContent value="firmados">
            <ConsentimientoList
              items={firmados}
              emptyText="Sin consentimientos firmados"
              onRevocar={(id) => {
                if (confirm('¿Revocar este consentimiento firmado?')) revocar(id)
              }}
            />
          </TabsContent>

          <TabsContent value="revocados">
            <ConsentimientoList
              items={revocados}
              emptyText="Sin consentimientos revocados"
              readOnly
            />
          </TabsContent>
        </Tabs>
      )}

      <GenerarConsentimientoModal
        open={showGenerar}
        onOpenChange={setShowGenerar}
      />
    </div>
  )
}

function ConsentimientoList({
  items,
  emptyText,
  onRevocar,
  readOnly,
}: {
  items: ReturnType<typeof consentimientosApi.list> extends Promise<infer T> ? (T extends { results: infer R } ? R : never) : never
  emptyText: string
  onRevocar?: (id: string) => void
  readOnly?: boolean
}) {
  if (!items.length) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">{emptyText}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((c) => (
        <Card key={c.id} className={c.estado === 'revocado' ? 'opacity-60' : ''}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <p className="font-medium text-sm">{c.paciente_nombre}</p>
                  <ConsentimientoStatusBadge estado={c.estado} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {c.template_nombre ?? c.plantilla_nombre} · Generado: {formatDate(c.created_at)}
                </p>
                {c.firmado_en && (
                  <p className="text-xs text-green-600 mt-0.5">
                    Firmado: {formatDateTime(c.firmado_en)}
                  </p>
                )}
                {c.estado === 'pendiente' && (
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Expira: {formatDateTime(c.token_expira)}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {c.pdf_url && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={c.pdf_url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                      PDF
                    </a>
                  </Button>
                )}
                {!readOnly && c.estado !== 'revocado' && onRevocar && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/5"
                    onClick={() => onRevocar(c.id)}
                  >
                    <XCircle className="h-3.5 w-3.5 mr-1.5" />
                    Revocar
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
