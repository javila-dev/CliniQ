'use client'

import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Check, Loader2, RotateCcw } from 'lucide-react'
import { authApi } from '@/lib/api/auth'
import { clinicasApi } from '@/lib/api/clinicas'
import type { GuardarPreparacionRequest, NivelPreparacion, SetupChecklist, SetupChecklistItem } from '@/lib/api/clinicas'
import { useAuthStore } from '@/store/authStore'
import { hasPermission, PERM } from '@/lib/permissions'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const QUERY_KEY = ['setup-checklist']

/** Lo que se puede afirmar con los datos actuales, sin prometer de más. */
const FRASE_DEL_NIVEL: Record<NivelPreparacion, string> = {
  sin_empezar: 'Empieza por tu sede y su horario de atención.',
  datos_basicos: 'Ya tienes sede y horario. Para poder agendar falta un profesional y un procedimiento.',
  lista_para_agendar: 'Ya puedes agendar citas y atender pacientes.',
}

const MODELOS: { value: NonNullable<GuardarPreparacionRequest['modelo']>; titulo: string; descripcion: string }[] = [
  { value: 'procedimientos', titulo: 'Procedimientos sueltos', descripcion: 'Cada cita es un procedimiento que cobras por separado.' },
  { value: 'tratamientos', titulo: 'Tratamientos por sesiones', descripcion: 'Agrupas procedimientos en paquetes de varias sesiones que vendes con una cotización.' },
  { value: 'ambos', titulo: 'Las dos cosas', descripcion: 'Algunos procedimientos sueltos y algunos paquetes.' },
]

export default function PrepararClinicaPage() {
  const { user, setUser } = useAuthStore()
  const qc = useQueryClient()
  const puedeEditar = hasPermission(user, PERM.CLINICAS_EDITAR)

  const { data, isLoading, isError } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: clinicasApi.setupChecklist,
    enabled: !!user?.clinica_id && puedeEditar,
    staleTime: 0,
  })

  const guardar = useMutation({
    mutationFn: (cambios: GuardarPreparacionRequest) => clinicasApi.guardarPreparacion(cambios),
    onSuccess: (nuevo) => qc.setQueryData<SetupChecklist>(QUERY_KEY, nuevo),
  })

  const yoAtiendo = useMutation({
    mutationFn: () => clinicasApi.marcarmeComoProfesional(),
    onSuccess: async (nuevo) => {
      qc.setQueryData<SetupChecklist>(QUERY_KEY, nuevo)
      qc.invalidateQueries({ queryKey: ['profesionales'] })
      // El perfil lleva es_profesional: sin refrescarlo, el menú no mostraría las atenciones.
      try { setUser(await authApi.me()) } catch { /* se actualiza en el próximo ingreso */ }
    },
  })

  if (!user) return null

  if (!puedeEditar) {
    return (
      <div className="max-w-2xl">
        <PageHeader title="Preparar mi clínica" />
        <div className="rounded-xl border bg-white p-8 text-center text-sm text-gray-400">
          Solo quien administra la clínica puede ver este recorrido.
        </div>
      </div>
    )
  }

  const visibles = data?.items.filter((p) => !p.omitido) ?? []
  const omitidos = data?.items.filter((p) => p.omitido) ?? []
  const siguiente = visibles.find((p) => p.requerido && !p.completado)?.key
  const porcentaje = data && data.total ? Math.round((data.completados / data.total) * 100) : 0

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <PageHeader
        helpSlug="checklist-de-configuracion-inicial"
        title="Preparar mi clínica"
        description="Deja tu clínica lista para agendar y atender. Cada paso se marca solo cuando de verdad está hecho."
      />

      {isLoading && <div className="h-64 rounded-xl border bg-gray-50 animate-pulse" />}
      {isError && (
        <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">
          No se pudo cargar el estado de tu clínica. Recarga la página para intentarlo de nuevo.
        </div>
      )}

      {data && (
        <>
          {/* Progreso y niveles */}
          <div className="rounded-xl border bg-white p-5 space-y-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-semibold text-gray-900">{data.completados} de {data.total} pasos</p>
              <p className="text-xs text-gray-400">{porcentaje} %</p>
            </div>
            <div className="h-1.5 rounded-full bg-gray-100">
              <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${porcentaje}%` }} />
            </div>
            <div className="flex flex-wrap gap-2">
              {data.niveles.map((nivel) => (
                <span
                  key={nivel.key}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium',
                    nivel.alcanzado
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-gray-200 bg-white text-gray-500',
                  )}
                >
                  {nivel.alcanzado && <Check className="h-3 w-3" />}
                  {nivel.label}
                </span>
              ))}
            </div>
            <p className="text-sm text-gray-600">{FRASE_DEL_NIVEL[data.nivel]}</p>
          </div>

          {/* Qué vende la clínica */}
          {!data.modelo && (
            <div className="rounded-xl border bg-white p-5 space-y-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">¿Qué vendes en tu clínica?</p>
                <p className="text-xs text-gray-400 mt-0.5">Así te mostramos solo los pasos que necesitas.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {MODELOS.map((modelo) => (
                  <button
                    key={modelo.value}
                    type="button"
                    disabled={guardar.isPending}
                    onClick={() => guardar.mutate({ modelo: modelo.value })}
                    className="rounded-lg border p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-60"
                  >
                    <p className="text-sm font-medium text-gray-900">{modelo.titulo}</p>
                    <p className="text-xs text-gray-400 mt-0.5 leading-snug">{modelo.descripcion}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Pasos */}
          <div className="rounded-xl border bg-white divide-y">
            {visibles.map((paso, indice) => (
              <FilaDePaso
                key={paso.key}
                paso={paso}
                numero={indice + 1}
                esSiguiente={paso.key === siguiente}
                ocupado={guardar.isPending || yoAtiendo.isPending}
                onOmitir={() => guardar.mutate({ omitir: paso.key })}
                onYoAtiendo={() => yoAtiendo.mutate()}
              />
            ))}
          </div>

          {(guardar.isError || yoAtiendo.isError) && (
            <p className="text-sm text-red-500">
              {(yoAtiendo.error as any)?.response?.data?.error ?? 'No se pudo guardar el cambio. Intenta de nuevo.'}
            </p>
          )}

          {/* Omitidos */}
          {omitidos.length > 0 && (
            <div className="rounded-xl border border-dashed bg-gray-50/60 p-4 space-y-2">
              <p className="text-xs font-medium text-gray-500">Omitidos</p>
              {omitidos.map((paso) => (
                <div key={paso.key} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-gray-500">{paso.label}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={guardar.isPending}
                    onClick={() => guardar.mutate({ restaurar: paso.key })}
                    className="gap-1.5 text-xs"
                  >
                    <RotateCcw className="h-3 w-3" />Restaurar
                  </Button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function FilaDePaso({
  paso, numero, esSiguiente, ocupado, onOmitir, onYoAtiendo,
}: {
  paso: SetupChecklistItem
  numero: number
  esSiguiente: boolean
  ocupado: boolean
  onOmitir: () => void
  onYoAtiendo: () => void
}) {
  const puedeOmitir = !paso.requerido && !paso.completado

  // Un círculo por estado: hecho, siguiente paso o pendiente.
  const circulo = paso.completado
    ? 'bg-emerald-500 text-white'
    : esSiguiente
      ? 'bg-primary text-primary-foreground'
      : 'border border-gray-300 text-gray-600'

  return (
    <div className={cn('flex gap-4 p-5', esSiguiente && 'bg-primary/[0.03]')}>
      <div
        className={cn(
          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
          circulo,
        )}
      >
        {paso.completado ? <Check className="h-4 w-4" /> : numero}
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-gray-900">{paso.label}</p>
            {!paso.requerido && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">Opcional</span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-gray-500 leading-snug">{paso.por_que}</p>
        </div>

        <p className={cn('text-sm leading-snug', paso.completado ? 'text-gray-600' : 'text-gray-800')}>{paso.resumen}</p>

        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <Button asChild size="sm" variant={paso.completado || !esSiguiente ? 'outline' : 'default'}>
            <Link href={paso.href}>
              {paso.completado ? 'Revisar' : paso.accion}
              {!paso.completado && <ArrowRight className="ml-1.5 h-3.5 w-3.5" />}
            </Link>
          </Button>

          {paso.puede_marcarse_profesional && !paso.completado && (
            <Button size="sm" variant="outline" disabled={ocupado} onClick={onYoAtiendo}>
              {ocupado && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Yo atiendo pacientes
            </Button>
          )}

          {puedeOmitir && (
            <Button size="sm" variant="ghost" disabled={ocupado} onClick={onOmitir} className="text-gray-500">
              Omitir
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
