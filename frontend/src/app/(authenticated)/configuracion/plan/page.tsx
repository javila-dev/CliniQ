'use client'

import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '@/components/shared/PageHeader'
import { useAuthStore } from '@/store/authStore'
import { clinicasApi } from '@/lib/api/clinicas'
import { cn } from '@/lib/utils'

// Lo que incluye el plan de la clínica y cuánto se lleva usado. Es solo lectura:
// los cambios de plan y los add-ons los activa el equipo de CliniQ.

function Bloque({ titulo, extra, children }: { titulo: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border bg-white">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3 text-[13.5px] font-semibold">
        {titulo}
        {extra}
      </div>
      <div className="divide-y divide-border/60">{children}</div>
    </section>
  )
}

function Estado({ activo, texto }: { activo: boolean; texto?: string }) {
  return (
    <span className={cn(
      'shrink-0 rounded-full px-2.5 py-0.5 text-[11.5px] font-medium',
      activo ? 'bg-emerald-50 text-emerald-700' : 'bg-muted text-muted-foreground',
    )}>
      {texto ?? (activo ? 'Incluido' : 'No incluido')}
    </span>
  )
}

/** Fila de consumo: "usado / incluido" con barra; se pone ámbar al pasar el 80 %. */
function Consumo({ titulo, detalle, usado, incluido, unidad }: {
  titulo: string
  detalle: string
  usado: number
  incluido: number | null
  unidad: string
}) {
  const pct = incluido ? Math.min((usado / incluido) * 100, 100) : 0
  return (
    <div className="space-y-2.5 px-4 py-3.5">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{titulo}</p>
          <p className="text-[12.5px] text-muted-foreground">{detalle}</p>
        </div>
        <p className="shrink-0 text-sm tabular-nums">
          <span className="font-semibold">{usado}</span>
          <span className="text-muted-foreground"> / {incluido ?? '∞'} {unidad}</span>
        </p>
      </div>
      {incluido !== null && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className={cn('h-full rounded-full', pct >= 80 ? 'bg-amber-500' : 'bg-primary')} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
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

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader title="Plan" description="Lo que incluye tu plan y cuánto llevas usado este mes." />

      {isLoading ? (
        <div className="h-48 animate-pulse rounded-xl border bg-muted/40" />
      ) : (
        <>
          {typeof clinica?.trial_days_remaining === 'number' && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Estás en periodo de prueba: {clinica.trial_days_remaining === 1 ? 'queda 1 día' : `quedan ${clinica.trial_days_remaining} días`}.
            </p>
          )}

          <Bloque titulo="Consumo">
            {clinica?.whatsapp_habilitado && whatsapp ? (
              <Consumo
                titulo="Envíos por WhatsApp"
                detalle="Cotizaciones, firma de documentos, check-in por código y recordatorios. Se reinicia cada mes."
                usado={whatsapp.envios_realizados}
                incluido={whatsapp.sin_limite ? null : whatsapp.envios_incluidos}
                unidad="este mes"
              />
            ) : (
              <div className="flex items-start gap-4 px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Envíos por WhatsApp</p>
                  <p className="text-[12.5px] text-muted-foreground">
                    Envía cotizaciones, firmas y recordatorios por WhatsApp, y verifica la llegada del paciente por código.
                    Contáctanos para activarlo en tu plan.
                  </p>
                </div>
                <Estado activo={false} />
              </div>
            )}
            {planUsuarios && (
              <Consumo
                titulo="Usuarios activos"
                detalle="Cuentas del equipo que pueden entrar a CliniQ."
                usado={planUsuarios.usuarios_activos}
                incluido={planUsuarios.sin_limite ? null : planUsuarios.max_usuarios}
                unidad="usuarios"
              />
            )}
            {planSedes && typeof planSedes.sedes_activas === 'number' && (
              <Consumo
                titulo="Sedes"
                detalle="Sucursales activas de la clínica."
                usado={planSedes.sedes_activas}
                incluido={planSedes.sin_limite ? null : planSedes.max_sedes}
                unidad="sedes"
              />
            )}
          </Bloque>

          <Bloque titulo="Add-ons y módulos">
            {[
              { titulo: 'Verificación facial', detalle: 'Compara la foto en vivo del paciente con su foto de control al llegar.', activo: !!clinica?.facial_verificacion_habilitada },
              { titulo: 'Módulo estético', detalle: 'Procedimientos y zonas corporales en la atención y la historia.', activo: !!clinica?.modulo_estetico_habilitado },
            ].map((a) => (
              <div key={a.titulo} className="flex items-center gap-4 px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{a.titulo}</p>
                  <p className="text-[12.5px] text-muted-foreground">{a.detalle}</p>
                </div>
                <Estado activo={a.activo} />
              </div>
            ))}
          </Bloque>

          <p className="text-xs text-muted-foreground">Para cambiar de plan o activar un add-on, escríbenos.</p>
        </>
      )}
    </div>
  )
}
