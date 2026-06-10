'use client'

import { AlertTriangle, Clock, Stethoscope } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatTime, formatDuracion } from '@/lib/utils'
import type { Cita } from '@/types/agenda'

const MINUTOS_ALERTA = 30

interface PacienteActivoProps {
  cita: Cita
}

export function PacienteActivo({ cita }: PacienteActivoProps) {
  const ahora = Date.now()

  const minutosTranscurridos = cita.fecha_inicio_real
    ? Math.floor((ahora - new Date(cita.fecha_inicio_real).getTime()) / 60000)
    : null

  const minutosSobreHorario = cita.fecha_fin
    ? Math.floor((ahora - new Date(cita.fecha_fin).getTime()) / 60000)
    : null

  const estaVencida = minutosSobreHorario !== null && minutosSobreHorario > MINUTOS_ALERTA

  const initials = cita.paciente_nombre
    .split(' ')
    .slice(0, 2)
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()

  return (
    <Card className={`shadow-sm overflow-hidden ${estaVencida ? 'border-amber-400' : 'border-primary/30'}`}>
      <div className={`h-1 w-full bg-gradient-to-r ${estaVencida ? 'from-amber-400 to-amber-500' : 'from-rose-400 to-rose-500'}`} />

      {estaVencida && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs font-medium">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Atención sin cerrar — {formatDuracion(minutosSobreHorario)} sobre el horario programado
        </div>
      )}

      <CardHeader className="pb-3 pt-4">
        <div className="flex items-start gap-3">
          <div className={`flex items-center justify-center h-11 w-11 rounded-full font-semibold text-sm shrink-0 ${estaVencida ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-600'}`}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              {estaVencida ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-300 rounded-full px-2.5 py-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Tiempo excedido
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-600 bg-rose-50 border border-rose-200 rounded-full px-2.5 py-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                  En atención
                </span>
              )}
              {minutosTranscurridos !== null && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDuracion(minutosTranscurridos)}
                </span>
              )}
            </div>
            <CardTitle className="text-lg leading-tight">{cita.paciente_nombre}</CardTitle>
            <p className="text-sm text-muted-foreground mt-0.5">
              {cita.servicio_nombre} · {formatTime(cita.fecha_inicio)}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <Button
          className={`w-full ${estaVencida ? 'bg-amber-500 hover:bg-amber-600 text-white' : ''}`}
          size="lg"
          asChild
        >
          <Link href={`/atenciones/${cita.id}`}>
            <Stethoscope className="h-4 w-4 mr-2" />
            {estaVencida ? 'Completar atención pendiente' : 'Ir a la atención'}
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
