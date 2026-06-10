'use client'

import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { agendaApi } from '@/lib/api/agenda'
import { PacienteActivo } from '@/components/atenciones/PacienteActivo'
import { ColaEspera } from '@/components/atenciones/ColaEspera'
import { ResumenDia } from '@/components/atenciones/ResumenDia'
import { LoadingState } from '@/components/shared/LoadingState'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { canAccess } from '@/lib/permissions'
import { Card, CardContent } from '@/components/ui/card'
import { Stethoscope, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { formatDate, formatTime } from '@/lib/utils'

const hoy = new Date().toISOString().split('T')[0]

export default function AtencionesPage() {
  return <RoleGuard check={canAccess.atenciones}><AtencionesContent /></RoleGuard>
}

function AtencionesContent() {
  const { user } = useAuthStore()

  // Citas de hoy — polling cada 30s
  const { data: citasData, isLoading: loadingCitas } = useQuery({
    queryKey: ['citas', 'atenciones', user?.id, hoy],
    queryFn: () => agendaApi.citas.list({
      profesional: user!.id,
      fecha_inicio__date: hoy,
      page_size: 50,
    }),
    enabled: Boolean(user?.id && user.es_profesional),
    refetchInterval: 30_000,
  })

  // Citas en_curso de días anteriores (sin cerrar)
  const { data: enCursoData } = useQuery({
    queryKey: ['citas', 'en-curso-abiertas', user?.id],
    queryFn: () => agendaApi.citas.list({
      profesional: user!.id,
      estado: 'en_curso',
      fecha_inicio__date__lte: hoy,
      page_size: 10,
    }),
    enabled: Boolean(user?.id && user.es_profesional),
    refetchInterval: 30_000,
  })

  const citas = citasData?.results ?? []
  const citasEnCursoHoy = citas.filter(c => c.estado === 'en_curso')
  const citasAbiertasAnteriores = (enCursoData?.results ?? [])
    .filter(c => c.fecha_inicio.split('T')[0] < hoy)
  const citasActivas = [
    ...citasEnCursoHoy,
    ...citasAbiertasAnteriores.filter(c => !citasEnCursoHoy.find(h => h.id === c.id)),
  ]
  const cola = citas
    .filter(c => ['pendiente', 'confirmada', 'en_espera'].includes(c.estado))
    .sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio))

  if (loadingCitas) return <LoadingState rows={4} />

  if (!user?.es_profesional) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <Stethoscope className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">
            Tu cuenta no está vinculada a un perfil profesional.
            Contacta al administrador.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Mis atenciones</h1>
          <p className="text-sm text-muted-foreground mt-0.5 capitalize">
            {new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 border rounded-full px-3 py-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
          Actualización automática
        </div>
      </div>

      <ResumenDia citas={citas} enCursoAnteriores={citasAbiertasAnteriores.length} />

      {/* Atenciones sin cerrar de días anteriores */}
      {citasAbiertasAnteriores.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
            <p className="text-sm font-medium text-foreground">
              {citasAbiertasAnteriores.length} atención{citasAbiertasAnteriores.length !== 1 ? 'es' : ''} pendiente{citasAbiertasAnteriores.length !== 1 ? 's' : ''} de cerrar
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {citasAbiertasAnteriores.map(cita => {
              const initials = cita.paciente_nombre.split(' ').slice(0, 2).map((n: string) => n[0]).join('').toUpperCase()
              return (
                <Link
                  key={cita.id}
                  href={`/atenciones/${cita.id}`}
                  className="group relative rounded-xl border border-amber-200 bg-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden"
                >
                  <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-amber-400 to-orange-400" />
                  <div className="flex items-center gap-3 p-4">
                    <div className="flex items-center justify-center h-10 w-10 rounded-full bg-amber-100 text-amber-700 font-semibold text-sm shrink-0">
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{cita.paciente_nombre}</p>
                      <p className="text-xs text-muted-foreground truncate">{cita.servicio_nombre}</p>
                      <p className="text-xs text-amber-600 font-medium mt-0.5">{formatDate(cita.fecha_inicio)} · {formatTime(cita.fecha_inicio)}</p>
                    </div>
                    <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 shrink-0 group-hover:bg-amber-100 transition-colors">
                      Completar
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Paciente activo hoy */}
        <div>
          {citasEnCursoHoy.length > 0 ? (
            <div className="space-y-3">
              {citasEnCursoHoy.map(cita => <PacienteActivo key={cita.id} cita={cita} />)}
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center">
                <Stethoscope className="h-8 w-8 text-muted-foreground/25 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  Sin paciente activo — recepción activará al siguiente cuando llegue
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        <ColaEspera citas={cola} citaActiva={citasEnCursoHoy[0]} />
      </div>
    </div>
  )
}
