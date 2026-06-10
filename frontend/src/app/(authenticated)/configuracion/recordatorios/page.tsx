'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, Check, Info } from 'lucide-react'
import { clinicasApi } from '@/lib/api/clinicas'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/store/authStore'
import { hasPermission, PERM } from '@/lib/permissions'
import { cn } from '@/lib/utils'

// Opciones de intervalo en horas disponibles para la clínica
const INTERVALO_OPTIONS = [
  { value: 1,   label: '1 hora antes' },
  { value: 2,   label: '2 horas antes' },
  { value: 4,   label: '4 horas antes' },
  { value: 6,   label: '6 horas antes' },
  { value: 12,  label: '12 horas antes' },
  { value: 24,  label: '1 día antes' },
  { value: 48,  label: '2 días antes' },
  { value: 72,  label: '3 días antes' },
]

export default function RecordatoriosConfigPage() {
  const { user } = useAuthStore()
  const clinicaId = user?.clinica_id
  const qc = useQueryClient()
  const isAdmin = hasPermission(user, PERM.CLINICAS_EDITAR)

  const { data: config, isLoading } = useQuery({
    queryKey: ['recordatorio_config', clinicaId],
    queryFn: () => clinicasApi.recordatorioConfig.get(clinicaId!),
    enabled: !!clinicaId,
  })

  const [activos, setActivos] = useState(true)
  const [intervalo, setIntervalo] = useState(24)

  useEffect(() => {
    if (config) {
      setActivos(config.recordatorios_automaticos)
      setIntervalo(config.intervalo_recordatorio_horas)
    }
  }, [config])

  const isDirty =
    config?.recordatorios_automaticos !== activos ||
    config?.intervalo_recordatorio_horas !== intervalo

  const updateMutation = useMutation({
    mutationFn: () =>
      clinicasApi.recordatorioConfig.update(clinicaId!, {
        recordatorios_automaticos: activos,
        intervalo_recordatorio_horas: intervalo,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recordatorio_config', clinicaId] })
    },
  })

  if (!clinicaId) {
    return (
      <div className="max-w-2xl">
        <PageHeader title="Recordatorios de citas" />
        <div className="rounded-xl border bg-white p-8 text-center text-sm text-gray-400">
          No tienes una clínica asignada.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recordatorios de citas"
        description="Configura cuándo y cómo se envían recordatorios automáticos a tus pacientes."
        backHref="/configuracion"
      />

      {/* ── Activar recordatorios automáticos ── */}
      <div className="rounded-xl border bg-white p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-gray-400" />
          <p className="text-sm font-semibold text-gray-800">Recordatorios automáticos</p>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <div className="h-5 w-64 rounded bg-gray-100 animate-pulse" />
            <div className="h-4 w-80 rounded bg-gray-100 animate-pulse" />
          </div>
        ) : (
          <div className="flex items-start gap-4">
            <Switch
              checked={activos}
              onCheckedChange={setActivos}
              disabled={!isAdmin}
              aria-label="Activar recordatorios automáticos"
            />
            <div>
              <Label className="text-sm font-medium text-gray-700 cursor-pointer">
                {activos ? 'Recordatorios activados' : 'Recordatorios desactivados'}
              </Label>
              <p className="mt-0.5 text-xs text-gray-400">
                {activos
                  ? 'El sistema enviará recordatorios automáticos a los pacientes antes de su cita.'
                  : 'Los pacientes no recibirán recordatorios automáticos. Puedes enviarlos manualmente desde cada cita.'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Tiempo de anticipación ── */}
      <div className={cn('rounded-xl border bg-white p-6 space-y-5 transition-opacity', !activos && 'opacity-50 pointer-events-none')}>
        <div>
          <p className="text-sm font-semibold text-gray-800">Tiempo de anticipación</p>
          <p className="mt-1 text-xs text-gray-400">
            Con cuánta anticipación se envía el recordatorio antes de la hora de la cita.
          </p>
        </div>

        {isLoading ? (
          <div className="flex gap-2 flex-wrap">
            {INTERVALO_OPTIONS.map(o => (
              <div key={o.value} className="h-10 w-28 rounded-lg bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="flex gap-2 flex-wrap">
            {INTERVALO_OPTIONS.map(o => (
              <button
                key={o.value}
                type="button"
                disabled={!isAdmin}
                onClick={() => setIntervalo(o.value)}
                className={cn(
                  'h-10 px-4 rounded-lg border text-sm font-medium transition-all',
                  intervalo === o.value
                    ? 'border-rose-500 bg-rose-50 text-rose-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-rose-300 hover:text-rose-600',
                  !isAdmin && 'opacity-50 cursor-not-allowed',
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Nota informativa ── */}
      <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
        <Info className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
        <div className="space-y-1">
          <p className="text-xs font-medium text-blue-700">¿Cómo funcionan los recordatorios?</p>
          <p className="text-xs text-blue-600">
            n8n consulta periódicamente las citas pendientes de recordatorio y envía mensajes por WhatsApp o SMS
            según el canal de contacto del paciente. También puedes solicitar un recordatorio manual
            desde el detalle de cualquier cita activa.
          </p>
        </div>
      </div>

      {/* ── Acciones ── */}
      {isAdmin && (
        <div className="flex items-center gap-3 pt-1">
          <Button
            type="button"
            onClick={() => updateMutation.mutate()}
            disabled={!isDirty || updateMutation.isPending}
            className="gap-1.5"
          >
            {updateMutation.isPending ? 'Guardando…' : (
              <><Check className="h-4 w-4" /> Guardar cambios</>
            )}
          </Button>
          {updateMutation.isSuccess && !isDirty && (
            <span className="text-sm text-emerald-600 font-medium">Guardado correctamente</span>
          )}
          {updateMutation.isError && (
            <span className="text-sm text-red-500">Error al guardar. Intenta de nuevo.</span>
          )}
        </div>
      )}
    </div>
  )
}
