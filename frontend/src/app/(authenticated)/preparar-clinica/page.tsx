'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Check, Loader2 } from 'lucide-react'
import { authApi } from '@/lib/api/auth'
import { clinicasApi } from '@/lib/api/clinicas'
import type { GuardarPreparacionRequest, NivelPreparacion, SetupChecklist, SetupChecklistItem } from '@/lib/api/clinicas'
import { useAuthStore } from '@/store/authStore'
import { hasPermission, PERM } from '@/lib/permissions'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { mensajeDeError } from '@/lib/errores'

// Recorrido compacto: una franja de progreso, la pregunta de qué vende la clínica
// en una fila y los pasos como lista. Solo el paso que toca se abre con el
// detalle de qué falta; los demás ocupan una línea.

const QUERY_KEY = ['setup-checklist']

/** Lo que se puede afirmar con los datos actuales, sin prometer de más. */
const FRASE_DEL_NIVEL: Record<NivelPreparacion, string> = {
  sin_empezar: 'Empieza por tu sede y su horario de atención.',
  datos_basicos: 'Ya tienes sede y horario. Para agendar falta un profesional y un procedimiento.',
  lista_para_agendar: 'Ya puedes agendar citas y atender pacientes.',
}

const MODELOS: { value: NonNullable<GuardarPreparacionRequest['modelo']>; titulo: string }[] = [
  { value: 'procedimientos', titulo: 'Procedimientos sueltos' },
  { value: 'tratamientos', titulo: 'Paquetes de sesiones' },
  { value: 'ambos', titulo: 'Las dos cosas' },
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

  // Permite corregir la respuesta de "¿Qué vendes?" si se eligió mal (M1-29).
  const [cambiandoModelo, setCambiandoModelo] = useState(false)
  // El paso que toca está abierto; se puede abrir otro para ver su detalle.
  const [abierto, setAbierto] = useState<string | null>(null)

  const guardar = useMutation({
    mutationFn: (cambios: GuardarPreparacionRequest) => clinicasApi.guardarPreparacion(cambios),
    onSuccess: (nuevo) => {
      qc.setQueryData<SetupChecklist>(QUERY_KEY, nuevo)
      setCambiandoModelo(false)
    },
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
  const requeridos = visibles.filter((p) => p.requerido)
  const siguiente = requeridos.find((p) => !p.completado)?.key ?? visibles.find((p) => !p.completado)?.key
  const abiertoActual = abierto ?? siguiente
  const ocupado = guardar.isPending || yoAtiendo.isPending

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <PageHeader
        helpSlug="checklist-de-configuracion-inicial"
        title="Preparar mi clínica"
        description="Deja tu clínica lista para agendar y atender. Cada paso se marca solo cuando está hecho de verdad."
      />

      {isLoading && <div className="h-80 animate-pulse rounded-xl border bg-gray-50" />}
      {isError && (
        <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">
          No se pudo cargar el estado de tu clínica. Recarga la página para intentarlo de nuevo.
        </div>
      )}

      {data && (
        <>
          {/* Progreso: un tramo por paso obligatorio, y en palabras qué falta. */}
          <div className="rounded-xl border bg-white px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <p className="text-sm font-semibold text-gray-900">
                {data.todo_listo ? 'Todo listo' : `${data.completados} de ${data.total} pasos listos`}
              </p>
              <p className="text-sm text-gray-600">{FRASE_DEL_NIVEL[data.nivel]}</p>
            </div>
            <div className="mt-2.5 flex gap-1" aria-hidden>
              {requeridos.map((p) => (
                <span key={p.key} className={cn('h-1.5 flex-1 rounded-full', p.completado ? 'bg-emerald-500' : p.key === siguiente ? 'bg-primary/40' : 'bg-gray-100')} />
              ))}
            </div>
          </div>

          {/* Qué vende la clínica: decide qué pasos se muestran. */}
          {data.modelo && !cambiandoModelo ? (
            <p className="px-1 text-sm text-gray-500">
              Vendes: <span className="font-medium text-gray-800">{MODELOS.find((m) => m.value === data.modelo)?.titulo ?? data.modelo}</span>
              {' · '}
              <button type="button" className="font-medium text-primary hover:underline" onClick={() => setCambiandoModelo(true)}>
                Cambiar
              </button>
            </p>
          ) : (
            <div className="rounded-xl border bg-white px-4 py-3">
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold text-gray-900">¿Qué vendes en tu clínica?</p>
                <div className="grid grid-cols-3 gap-1 rounded-lg bg-gray-100 p-1">
                  {MODELOS.map((modelo) => (
                    <button
                      key={modelo.value}
                      type="button"
                      disabled={guardar.isPending}
                      onClick={() => guardar.mutate({ modelo: modelo.value })}
                      className={cn(
                        'rounded-md px-2.5 py-1.5 text-xs font-medium leading-tight text-gray-600 transition-colors hover:bg-white hover:text-gray-900 disabled:opacity-60 sm:text-sm',
                        data.modelo === modelo.value && 'bg-white text-gray-900 shadow-sm',
                      )}
                    >
                      {modelo.titulo}
                    </button>
                  ))}
                </div>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-gray-500">
                <span className="font-medium text-gray-700">Procedimiento:</span> lo que haces en una cita y cobras por separado (una limpieza facial).{' '}
                <span className="font-medium text-gray-700">Paquete:</span> varias sesiones que el paciente compra de una vez con una cotización (6 sesiones de láser).
              </p>
            </div>
          )}

          {/* Pasos */}
          <ol className="divide-y rounded-xl border bg-white">
            {visibles.map((paso, indice) => (
              <FilaDePaso
                key={paso.key}
                paso={paso}
                numero={indice + 1}
                esSiguiente={paso.key === siguiente}
                abierto={paso.key === abiertoActual}
                ocupado={ocupado}
                onAlternar={() => setAbierto(paso.key === abiertoActual ? '' : paso.key)}
                onOmitir={() => guardar.mutate({ omitir: paso.key })}
                onYoAtiendo={() => yoAtiendo.mutate()}
              />
            ))}
          </ol>

          {(guardar.isError || yoAtiendo.isError) && (
            <p className="text-sm text-red-500">
              {mensajeDeError(yoAtiendo.error ?? guardar.error, 'No se pudo guardar el cambio. Intenta de nuevo.')}
            </p>
          )}

          {omitidos.length > 0 && (
            <p className="px-1 text-xs text-gray-500">
              Omitidos:{' '}
              {omitidos.map((paso, i) => (
                <span key={paso.key}>
                  {i > 0 && ' · '}
                  {paso.label}{' '}
                  <button
                    type="button"
                    disabled={guardar.isPending}
                    onClick={() => guardar.mutate({ restaurar: paso.key })}
                    className="font-medium text-primary hover:underline disabled:opacity-60"
                  >
                    (restaurar)
                  </button>
                </span>
              ))}
            </p>
          )}
        </>
      )}
    </div>
  )
}

function FilaDePaso({
  paso, numero, esSiguiente, abierto, ocupado, onAlternar, onOmitir, onYoAtiendo,
}: {
  paso: SetupChecklistItem
  numero: number
  esSiguiente: boolean
  abierto: boolean
  ocupado: boolean
  onAlternar: () => void
  onOmitir: () => void
  onYoAtiendo: () => void
}) {
  const puedeOmitir = !paso.requerido && !paso.completado

  return (
    <li className={cn(abierto && !paso.completado && 'bg-primary/[0.03]')}>
      {/* Fila de una línea: estado, nombre, qué hay o para qué sirve, y la acción. */}
      <div className="flex items-center gap-3 px-4 py-3">
        <span
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
            paso.completado
              ? 'bg-emerald-500 text-white'
              : esSiguiente
                ? 'bg-primary text-primary-foreground'
                : 'border border-gray-300 text-gray-500',
          )}
          aria-label={paso.completado ? 'Hecho' : esSiguiente ? 'Siguiente paso' : 'Pendiente'}
        >
          {paso.completado ? <Check className="h-3.5 w-3.5" /> : numero}
        </span>

        <button type="button" onClick={onAlternar} aria-expanded={abierto} className="min-w-0 flex-1 text-left">
          <span className="flex items-center gap-2">
            <span className={cn('text-sm font-medium', paso.completado ? 'text-gray-500' : 'text-gray-900')}>{paso.label}</span>
            {!paso.requerido && <span className="text-xs text-gray-400">Opcional</span>}
          </span>
          {!abierto && (
            <span className="block truncate text-xs text-gray-500">{paso.completado ? paso.resumen : paso.por_que}</span>
          )}
        </button>

        {paso.completado ? (
          <Link href={paso.href} className="shrink-0 text-sm font-medium text-gray-500 hover:text-gray-900">Revisar</Link>
        ) : !abierto && (
          // En celular no cabe junto al texto: se toca la fila y el paso abierto trae su botón.
          <Button asChild size="sm" variant="ghost" className="hidden shrink-0 text-gray-600 sm:inline-flex">
            <Link href={paso.href}>{paso.accion}</Link>
          </Button>
        )}
      </div>

      {/* Detalle del paso abierto: para qué sirve, qué falta exactamente y qué hacer. */}
      {abierto && !paso.completado && (
        <div className="space-y-3 pb-4 pl-[3.25rem] pr-4">
          <p className="text-xs leading-relaxed text-gray-500">{paso.por_que}</p>
          <p className="border-l-2 border-primary/40 pl-3 text-sm text-gray-800">{paso.resumen}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm">
              <Link href={paso.href}>
                {paso.accion}
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
            {paso.puede_marcarse_profesional && (
              <Button size="sm" variant="outline" disabled={ocupado} onClick={onYoAtiendo}>
                {ocupado && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Yo atiendo pacientes
              </Button>
            )}
            {puedeOmitir && (
              <Button size="sm" variant="ghost" disabled={ocupado} onClick={onOmitir} className="text-gray-500">
                Omitir este paso
              </Button>
            )}
          </div>
        </div>
      )}
    </li>
  )
}
