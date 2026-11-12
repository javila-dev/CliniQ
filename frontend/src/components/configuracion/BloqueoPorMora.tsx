'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Loader2, ShieldAlert } from 'lucide-react'
import { clinicasApi } from '@/lib/api/clinicas'
import { toast } from '@/hooks/use-toast'
import { mensajeDeError } from '@/lib/errores'
import { Switch } from '@/components/ui/switch'
import type { UpdateClinicaRequest } from '@/types/clinicas'
import { avisarGuardado, FilaAjuste, SelectAjuste } from './ajustes'

const OPCIONES_GRACIA = [0, 1, 2, 3, 5, 7, 15, 30].map((d) => ({
  value: String(d),
  label: d === 0 ? 'Sin gracia' : d === 1 ? '1 día' : `${d} días`,
}))

interface Props {
  clinicaId: string
  activo: boolean
  diasGracia: number
  puedeEditar: boolean
}

/** Bloqueo por mora (12/11/2026): con cuotas vencidas el paciente se puede
 *  agendar (el modal avisa), pero recepción no lo recibe ni se inicia su
 *  atención hasta que pague o Cartera apruebe una excepción. */
export function BloqueoPorMora({ clinicaId, activo, diasGracia, puedeEditar }: Props) {
  const qc = useQueryClient()

  const guardar = useMutation({
    mutationFn: (data: UpdateClinicaRequest) => clinicasApi.update(clinicaId, data),
    onSuccess: (_, data) => {
      qc.invalidateQueries({ queryKey: ['clinica', clinicaId] })
      qc.invalidateQueries({ queryKey: ['citas'] })
      const anterior: UpdateClinicaRequest = 'bloquear_agenda_por_deuda' in data
        ? { bloquear_agenda_por_deuda: activo }
        : { dias_gracia_deuda: diasGracia }
      avisarGuardado(() => guardar.mutate(anterior))
    },
    onError: (err) => toast.error('No se guardó el cambio', mensajeDeError(err, 'Intenta de nuevo.')),
  })

  return (
    <>
      <FilaAjuste
        icono={ShieldAlert}
        apagada={!activo}
        titulo="No recibir pacientes en mora"
        descripcion={activo
          ? 'Con cuotas vencidas se puede agendar, pero no se recibe al paciente ni se inicia su atención hasta que pague o Cartera apruebe una excepción.'
          : 'Apagado: la mora solo se avisa al agendar; se recibe y se atiende igual.'}
      >
        {guardar.isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        <Switch
          checked={activo}
          disabled={!puedeEditar || guardar.isPending}
          onCheckedChange={(valor) => guardar.mutate({ bloquear_agenda_por_deuda: valor })}
          aria-label="No recibir pacientes en mora"
        />
      </FilaAjuste>
      {activo && (
        <FilaAjuste
          icono={CalendarClock}
          titulo="Días de gracia"
          descripcion="Cuántos días después del vencimiento la cuota todavía no bloquea."
        >
          <SelectAjuste
            etiqueta="Días de gracia"
            valor={String(diasGracia)}
            opciones={OPCIONES_GRACIA.some((o) => o.value === String(diasGracia))
              ? OPCIONES_GRACIA
              : [...OPCIONES_GRACIA, { value: String(diasGracia), label: `${diasGracia} días` }]}
            onCambiar={(v) => guardar.mutate({ dias_gracia_deuda: Number(v) })}
            deshabilitado={!puedeEditar || guardar.isPending}
          />
        </FilaAjuste>
      )}
    </>
  )
}
