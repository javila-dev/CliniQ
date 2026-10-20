'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Clock, Hourglass, Repeat } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { seguimientoApi } from '@/lib/api/seguimiento'
import { toast } from '@/hooks/use-toast'
import { formatFechaDMY } from '@/lib/utils'
import { mensajeDeError } from '@/lib/errores'
import {
  avisarGuardado, BarraGuardado, FilaAjuste, NotaAjuste, SeccionAjustes,
} from '@/components/configuracion/ajustes'
import { CotizacionesAjustes } from '@/components/configuracion/CotizacionesAjustes'
import type { ConfigSeguimiento } from '@/types/seguimiento'

type Campo = 'dias_tras_compra' | 'tolerancia_dias' | 'dias_sin_sesion' | 'dias_aviso_previo'
type Valores = Record<Campo, number>

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

function valoresDe(data: ConfigSeguimiento): Valores {
  return {
    dias_tras_compra: data.dias_tras_compra,
    tolerancia_dias: data.tolerancia_dias,
    dias_sin_sesion: data.dias_sin_sesion,
    dias_aviso_previo: data.dias_aviso_previo,
  }
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
          <div className="h-9 w-24 animate-pulse rounded-md bg-muted" />
        </div>
      ))}
    </>
  )
}

export default function ConfiguracionComercialPage() {
  const qc = useQueryClient()
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['seguimiento', 'config'], queryFn: seguimientoApi.config })
  const [valores, setValores] = useState<Valores | null>(null)

  useEffect(() => {
    if (data) setValores(valoresDe(data))
  }, [data])

  const guardar = useMutation({
    mutationFn: (v: Partial<ConfigSeguimiento>) => seguimientoApi.guardarConfig(v),
    onSuccess: (nuevo) => {
      qc.setQueryData(['seguimiento', 'config'], nuevo)
      qc.invalidateQueries({ queryKey: ['seguimiento', 'oportunidades'] })
      avisarGuardado(undefined, 'Guardado. "Para hoy" se recalcula con las reglas nuevas.')
    },
    onError: (err: any) => {
      const detalle = err?.response?.data
      const primero = detalle && typeof detalle === 'object' ? Object.values(detalle)[0] : null
      toast.error('No se pudo guardar', Array.isArray(primero) ? String(primero[0]) : 'Revisa los valores e intenta de nuevo.')
    },
  })

  const cambiado = !!data && !!valores && REGLAS.some((r) => valores[r.campo] !== data[r.campo])
  const fueraDeRango = !!valores && REGLAS.some((r) => valores[r.campo] < r.min || valores[r.campo] > r.max)

  const onGuardar = () => {
    if (!valores) return
    if (fueraDeRango) {
      toast.error('Revisa los valores', 'Hay días fuera del rango permitido.')
      return
    }
    guardar.mutate(valores)
  }

  return (
    <div className="space-y-7">
      <PageHeader
        title="Comercial"
        description="Seguimiento a interesados y lo que firma el paciente al aceptar una cotización."
      />

      <SeccionAjustes
        id="seguimiento"
        titulo="Seguimiento"
        descripcion='Cuántos días esperar antes de que un paciente aparezca en "Para hoy".'
      >
        {isError && !data ? (
          <FilaAjuste titulo={mensajeDeError(error, 'No se pudo cargar la configuración de seguimiento.')}>
            <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>Reintentar</Button>
          </FilaAjuste>
        ) : isLoading || !valores ? (
          <FilasCargando filas={4} />
        ) : (
          <>
            {REGLAS.map((r) => {
              const valor = valores[r.campo]
              const invalido = valor < r.min || valor > r.max
              return (
                <FilaAjuste
                  key={r.campo}
                  icono={r.icono}
                  titulo={<label htmlFor={r.campo}>{r.titulo}</label>}
                  descripcion={r.ayuda}
                  contenido={invalido && (
                    <p className="text-[13px] text-destructive">Debe estar entre {r.min} y {r.max} días.</p>
                  )}
                >
                  <div className="relative w-24">
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
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">días</span>
                  </div>
                </FilaAjuste>
              )
            })}
            {/* Ejemplo con los valores actuales: la regla se entiende mejor con fechas. */}
            <NotaAjuste>
              Con estos valores: si alguien compra hoy y no agenda, aparece en &quot;Para hoy&quot; el{' '}
              <strong className="font-medium text-foreground">{enDias(valores.dias_tras_compra + 1)}</strong>.
              Si su procedimiento es cada 30 días y tuvo sesión hoy, se avisa que está atrasado el{' '}
              <strong className="font-medium text-foreground">{enDias(30 + valores.tolerancia_dias + 1)}</strong>.
            </NotaAjuste>
          </>
        )}
      </SeccionAjustes>

      <CotizacionesAjustes />

      <BarraGuardado
        visible={cambiado}
        guardando={guardar.isPending}
        onGuardar={onGuardar}
        onDescartar={() => data && setValores(valoresDe(data))}
      />
    </div>
  )
}
