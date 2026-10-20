'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Building2, MessageCircle, ScanFace, Smartphone, Sparkles, Users } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { useAuthStore } from '@/store/authStore'
import { clinicasApi } from '@/lib/api/clinicas'
import { cn } from '@/lib/utils'
import { EtiquetaAjuste, FilaAjuste, NotaAjuste, SeccionAjustes } from '@/components/configuracion/ajustes'

// Lo que incluye el plan de la clínica y cuánto se lleva usado. Es solo lectura:
// los cambios de plan y los add-ons los activa el equipo de CliniQ.

/** Fila de consumo: "usado / incluido" a la derecha y barra debajo; se pone ámbar al pasar el 80 %. */
function FilaConsumo({ icono, titulo, descripcion, usado, incluido, unidad }: {
  icono: React.ElementType
  titulo: string
  descripcion: React.ReactNode
  usado: number
  incluido: number | null
  unidad: string
}) {
  const pct = incluido ? Math.min((usado / incluido) * 100, 100) : 0
  return (
    <FilaAjuste
      icono={icono}
      titulo={titulo}
      descripcion={descripcion}
      contenido={incluido !== null && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className={cn('h-full rounded-full', pct >= 80 ? 'bg-amber-500' : 'bg-primary')} style={{ width: `${pct}%` }} />
        </div>
      )}
    >
      <p className="text-sm tabular-nums">
        <span className="font-semibold">{usado}</span>
        <span className="text-muted-foreground"> / {incluido ?? '∞'} {unidad}</span>
      </p>
    </FilaAjuste>
  )
}

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

export default function PlanConfigPage() {
  const { user } = useAuthStore()
  const clinicaId = user?.clinica_id

  const { data: clinica, isLoading } = useQuery({
    queryKey: ['mi-clinica', clinicaId],
    queryFn: () => clinicasApi.miClinica(clinicaId),
    enabled: !!clinicaId,
  })
  const { data: planUsuarios } = useQuery({ queryKey: ['mi-plan'], queryFn: clinicasApi.getMiPlan })
  const { data: planSedes } = useQuery({ queryKey: ['sedes-limite'], queryFn: clinicasApi.getSedesLimite })

  const whatsapp = clinica?.whatsapp_uso
  const diasPrueba = clinica?.trial_days_remaining

  const addons = [
    { icono: ScanFace, titulo: 'Verificación facial', detalle: 'Compara la foto en vivo del paciente con su foto de control al llegar.', activo: !!clinica?.facial_verificacion_habilitada },
    { icono: Sparkles, titulo: 'Módulo estético', detalle: 'Procedimientos y zonas corporales en la atención y la historia.', activo: !!clinica?.modulo_estetico_habilitado },
    { icono: Smartphone, titulo: 'WhatsApp con número propio', detalle: 'Tus pacientes reciben los mensajes desde el WhatsApp de tu clínica y te responden a ti.', activo: !!clinica?.whatsapp_numero_propio_habilitado },
  ]

  return (
    <div className="space-y-6">
      <PageHeader title="Plan" description="Lo que incluye tu plan y cuánto llevas usado este mes." />

      <div className="space-y-7">
        <SeccionAjustes
          titulo="Consumo"
          descripcion="Lo que llevas usado frente a lo que incluye tu plan."
          accion={!isLoading && typeof diasPrueba === 'number' && (
            <EtiquetaAjuste tono="aviso">
              Periodo de prueba: {diasPrueba === 1 ? 'queda 1 día' : `quedan ${diasPrueba} días`}
            </EtiquetaAjuste>
          )}
        >
          {isLoading ? <FilasCargando filas={3} /> : (
            <>
              {clinica?.whatsapp_habilitado && whatsapp ? (
                <FilaConsumo
                  icono={MessageCircle}
                  titulo="Envíos por WhatsApp"
                  descripcion={
                    <>
                      Cotizaciones, firmas, check-in por código y recordatorios. Se reinicia cada mes.{' '}
                      <Link href="/configuracion/whatsapp/consumo" className="font-medium text-primary underline-offset-2 hover:underline">
                        Ver detalle
                      </Link>
                    </>
                  }
                  usado={whatsapp.envios_realizados}
                  incluido={whatsapp.sin_limite ? null : whatsapp.envios_incluidos}
                  unidad="este mes"
                />
              ) : (
                <FilaAjuste
                  icono={MessageCircle}
                  apagada
                  titulo="Envíos por WhatsApp"
                  descripcion="Envía cotizaciones, firmas y recordatorios por WhatsApp, y verifica la llegada del paciente por código. Contáctanos para activarlo en tu plan."
                >
                  <EtiquetaAjuste>No incluido</EtiquetaAjuste>
                </FilaAjuste>
              )}
              {planUsuarios && (
                <FilaConsumo
                  icono={Users}
                  titulo="Usuarios activos"
                  descripcion="Cuentas del equipo que pueden entrar a CliniQ."
                  usado={planUsuarios.usuarios_activos}
                  incluido={planUsuarios.sin_limite ? null : planUsuarios.max_usuarios}
                  unidad="usuarios"
                />
              )}
              {planSedes && typeof planSedes.sedes_activas === 'number' && (
                <FilaConsumo
                  icono={Building2}
                  titulo="Sedes"
                  descripcion="Sucursales activas de la clínica."
                  usado={planSedes.sedes_activas}
                  incluido={planSedes.sin_limite ? null : planSedes.max_sedes}
                  unidad="sedes"
                />
              )}
            </>
          )}
        </SeccionAjustes>

        <SeccionAjustes titulo="Add-ons y módulos" descripcion="Funciones que se suman a tu plan.">
          {isLoading ? <FilasCargando filas={3} /> : (
            <>
              {addons.map((a) => (
                <FilaAjuste key={a.titulo} icono={a.icono} apagada={!a.activo} titulo={a.titulo} descripcion={a.detalle}>
                  <EtiquetaAjuste tono={a.activo ? 'activo' : 'neutro'}>{a.activo ? 'Incluido' : 'No incluido'}</EtiquetaAjuste>
                </FilaAjuste>
              ))}
              <NotaAjuste>Para cambiar de plan o activar un add-on, escríbenos.</NotaAjuste>
            </>
          )}
        </SeccionAjustes>
      </div>
    </div>
  )
}
