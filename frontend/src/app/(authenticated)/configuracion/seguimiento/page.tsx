'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Clock, Hourglass, Loader2, Repeat } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { ErrorState } from '@/components/shared/ErrorState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { seguimientoApi } from '@/lib/api/seguimiento'
import { toast } from '@/hooks/use-toast'
import { formatFechaDMY } from '@/lib/utils'
import { mensajeDeError } from '@/lib/errores'
import type { ConfigSeguimiento } from '@/types/seguimiento'

type Campo = 'dias_tras_compra' | 'tolerancia_dias' | 'dias_sin_sesion' | 'dias_aviso_previo'

const REGLAS: { campo: Campo; icono: LucideIcon; titulo: string; ayuda: string; min: number; max: number }[] = [
  {
    campo: 'dias_tras_compra', icono: CalendarClock, min: 1, max: 90,
    titulo: 'Primera sesión después de comprar',
    ayuda: 'Días que tiene el paciente para agendar su primera sesión. Si no lo hace, aparece en "Para hoy" al día siguiente.',
  },
  {
    campo: 'tolerancia_dias', icono: Hourglass, min: 0, max: 30,
    titulo: 'Margen entre sesiones',
    ayuda: 'Días de espera después de la fecha en que le tocaba la siguiente sesión, antes de avisar que está atrasado.',
  },
  {
    campo: 'dias_sin_sesion', icono: Repeat, min: 7, max: 365,
    titulo: 'Frecuencia general',
    ayuda: 'Se usa cuando el procedimiento o el tratamiento no tienen su propia frecuencia entre sesiones.',
  },
  {
    campo: 'dias_aviso_previo', icono: Clock, min: 0, max: 30,
    titulo: 'Aviso de "le toca pronto"',
    ayuda: 'Cuántos días antes de la fecha esperada se muestra que la próxima sesión ya está cerca.',
  },
]

function enDias(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return formatFechaDMY(d.toLocaleDateString('en-CA'))
}

export default function ConfiguracionSeguimientoPage() {
  const qc = useQueryClient()
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['seguimiento', 'config'], queryFn: seguimientoApi.config })
  const [valores, setValores] = useState<Record<Campo, number> | null>(null)

  useEffect(() => {
    if (data) setValores({
      dias_tras_compra: data.dias_tras_compra,
      tolerancia_dias: data.tolerancia_dias,
      dias_sin_sesion: data.dias_sin_sesion,
      dias_aviso_previo: data.dias_aviso_previo,
    })
  }, [data])

  const guardar = useMutation({
    mutationFn: (v: Partial<ConfigSeguimiento>) => seguimientoApi.guardarConfig(v),
    onSuccess: (nuevo) => {
      qc.setQueryData(['seguimiento', 'config'], nuevo)
      qc.invalidateQueries({ queryKey: ['seguimiento', 'oportunidades'] })
      toast.success('Ajustes guardados', 'La lista "Para hoy" se recalcula con las reglas nuevas.')
    },
    onError: (err: any) => {
      const detalle = err?.response?.data
      const primero = detalle && typeof detalle === 'object' ? Object.values(detalle)[0] : null
      toast.error('No se pudo guardar', Array.isArray(primero) ? String(primero[0]) : 'Revisa los valores e intenta de nuevo.')
    },
  })

  const cambiado = !!data && !!valores && REGLAS.some((r) => valores[r.campo] !== data[r.campo])
  const fueraDeRango = !!valores && REGLAS.some((r) => valores[r.campo] < r.min || valores[r.campo] > r.max)

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="Seguimiento"
        description="Cuándo avisar en &quot;Para hoy&quot; que un paciente ya debió agendar su sesión."
      />

      {isError && !data ? (
        <div className="rounded-xl border bg-white">
          <ErrorState message={mensajeDeError(error, 'No se pudo cargar la configuración de seguimiento.')} onRetry={() => refetch()} />
        </div>
      ) : isLoading || !valores ? (
        <div className="flex h-40 items-center justify-center rounded-xl border bg-white">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="divide-y rounded-xl border bg-white">
            {REGLAS.map((r) => {
              const Icono = r.icono
              const valor = valores[r.campo]
              const invalido = valor < r.min || valor > r.max
              return (
                <div key={r.campo} className="flex items-start gap-4 px-5 py-4">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icono className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <label htmlFor={r.campo} className="text-sm font-medium">{r.titulo}</label>
                    <p className="mt-0.5 text-xs text-muted-foreground">{r.ayuda}</p>
                    {invalido && (
                      <p className="mt-1 text-xs text-destructive">Debe estar entre {r.min} y {r.max} días.</p>
                    )}
                  </div>
                  <div className="relative w-24 shrink-0">
                    <Input
                      id={r.campo}
                      inputMode="numeric"
                      className="h-9 pr-11 text-right tabular-nums"
                      aria-invalid={invalido || undefined}
                      value={valor}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, '').slice(0, 3)
                        setValores({ ...valores, [r.campo]: raw ? Number(raw) : 0 })
                      }}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">días</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Ejemplo con los valores actuales: la regla se entiende mejor con fechas. */}
          <div className="rounded-xl border border-sky-100 bg-sky-50/60 px-5 py-4 text-sm text-sky-900">
            <p className="font-medium">Así funcionaría con estos valores</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[13px]">
              <li>
                Si alguien compra hoy y no agenda, aparece en &quot;Para hoy&quot; el{' '}
                <strong>{enDias(valores.dias_tras_compra + 1)}</strong>.
              </li>
              <li>
                Si su procedimiento es cada 30 días y tuvo sesión hoy, se avisa que está atrasado el{' '}
                <strong>{enDias(30 + valores.tolerancia_dias + 1)}</strong>.
              </li>
            </ul>
          </div>

          <div className="flex justify-end gap-2">
            {cambiado && (
              <Button variant="outline" onClick={() => data && setValores({
                dias_tras_compra: data.dias_tras_compra,
                tolerancia_dias: data.tolerancia_dias,
                dias_sin_sesion: data.dias_sin_sesion,
                dias_aviso_previo: data.dias_aviso_previo,
              })}>
                Descartar cambios
              </Button>
            )}
            <Button disabled={!cambiado || fueraDeRango || guardar.isPending} onClick={() => guardar.mutate(valores)}>
              {guardar.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
