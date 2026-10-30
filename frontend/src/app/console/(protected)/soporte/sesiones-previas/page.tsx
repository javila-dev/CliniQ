'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, CheckCircle2 } from 'lucide-react'

import { adminApi } from '@/lib/api/admin'
import { toast } from '@/hooks/use-toast'
import { mensajeDeError } from '@/lib/errores'
import { cn, formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import type { AdminTenant, SoporteCargaMigrada, SoportePaciente } from '@/types/admin'

import {
  BuscarClinica, BuscarPaciente, CampoMotivo, CorreccionesRecientes, EncabezadoHerramienta, MOTIVO_MINIMO, Opcion,
  Paso, resumenPaciente,
} from '../_componentes'

const sesionesTexto = (n: number) => `${n} ${n === 1 ? 'sesión' : 'sesiones'}`

function resumenCarga(c: SoporteCargaMigrada): string {
  return `${c.descripcion} · ${c.previas} de ${c.total} hechas antes de CliniQ`
}

function ElegirCarga({
  clinicaId, pacienteId, onSelect,
}: { clinicaId: string; pacienteId: string; onSelect: (c: SoporteCargaMigrada) => void }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['soporte-cargas-migradas', clinicaId, pacienteId],
    queryFn: () => adminApi.soporte.cargasMigradas(clinicaId, pacienteId),
  })
  if (isLoading) return <LoadingState />
  if (isError) return <ErrorState onRetry={refetch} />
  if (!data?.length) {
    return <p className="text-sm text-muted-foreground">Este paciente no tiene paquetes cargados en la puesta en marcha.</p>
  }
  return (
    <div className="space-y-1">
      {data.map((c) => {
        const detalle = (
          <>
            <div className="flex flex-wrap items-center gap-x-2">
              <span className="font-medium">{c.descripcion}</span>
              <span>· {c.previas} de {c.total} hechas antes de CliniQ</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Cargado el {formatDate(c.cargado_en)}{c.cargado_por && ` por ${c.cargado_por}`}
              {c.nota && ` · ${c.nota}`}
            </p>
          </>
        )
        if (c.bloqueo) {
          return (
            <div key={c.item_id} className="rounded-md border px-3 py-2 text-sm opacity-70">
              {detalle}
              <p className="mt-1 text-xs text-destructive">{c.bloqueo}</p>
            </div>
          )
        }
        return <Opcion key={c.item_id} seleccionada={false} onSelect={() => onSelect(c)}>{detalle}</Opcion>
      })}
    </div>
  )
}

function CorregirSesiones({
  clinicaId, carga, onListo,
}: { clinicaId: string; carga: SoporteCargaMigrada; onListo: (despues: number) => void }) {
  const queryClient = useQueryClient()
  const [sesiones, setSesiones] = useState(carga.previas)
  const [motivo, setMotivo] = useState('')
  const [confirmando, setConfirmando] = useState(false)

  const corregir = useMutation({
    mutationFn: () => adminApi.soporte.corregirSesionesPrevias({
      clinica: clinicaId, item: carga.item_id, sesiones, motivo: motivo.trim(),
    }),
    onSuccess: () => {
      toast.success('Sesiones corregidas', 'El paquete quedó con el número correcto y se registró la corrección.')
      queryClient.invalidateQueries({ queryKey: ['soporte-cargas-migradas'] })
      queryClient.invalidateQueries({ queryKey: ['soporte-correcciones', clinicaId] })
      onListo(sesiones)
    },
    onError: (err) => {
      setConfirmando(false)
      toast.error('No se pudieron corregir las sesiones', mensajeDeError(err))
    },
  })

  const fijar = (n: number) => setSesiones(Math.max(carga.minimo, Math.min(carga.maximo, n)))
  // Las del protocolo que quedan hechas: las previas sin cita, desde la primera.
  const sinCita = sesiones - carga.con_cita
  const restantesDespues = carga.restantes - (sesiones - carga.previas)
  const cambia = sesiones !== carga.previas
  const listo = cambia && motivo.trim().length >= MOTIVO_MINIMO

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <Label>Sesiones hechas antes de CliniQ</Label>
          <span className="text-muted-foreground">{sesiones} de {carga.total}</span>
        </div>
        <div className="flex gap-0.5">
          {Array.from({ length: carga.total }, (_, i) => (
            <div key={i} className={cn('h-1.5 flex-1 rounded-full', i < sesiones ? 'bg-primary' : 'bg-muted')} />
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Input
            type="number"
            min={carga.minimo}
            max={carga.maximo}
            value={sesiones}
            onChange={(e) => fijar(Number(e.target.value) || 0)}
            className="h-8 w-20"
          />
          <span className="text-muted-foreground">
            de {carga.total} (entre {carga.minimo} y {carga.maximo})
          </span>
        </div>
        {carga.con_cita > 0 && (
          <p className="text-xs text-muted-foreground">
            {sesionesTexto(carga.con_cita)} se cargaron con cita y profesional: cuentan siempre y no se cambian.
          </p>
        )}
        {carga.agendadas_en_app > 0 && (
          <p className="text-xs text-muted-foreground">
            {carga.agendadas_en_app === 1 ? 'Hay 1 cita agendada' : `Hay ${carga.agendadas_en_app} citas agendadas`} en
            la app con este paquete: siguen igual y ocupan su sesión, por eso el máximo es {carga.maximo}.
          </p>
        )}
      </div>

      {carga.sesiones.length > 0 && (
        <div className="max-h-72 divide-y overflow-y-auto rounded-lg border">
          {carga.sesiones.map((s, i) => {
            const hecha = i < sinCita
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => fijar(carga.con_cita + (sinCita === i + 1 ? i : i + 1))}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-muted/40"
              >
                <span
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                    hecha ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                  )}
                >
                  {hecha && <Check className="h-3 w-3" />}
                </span>
                <span className={cn(!hecha && 'text-muted-foreground')}>{s.nombre} #{s.numero}</span>
                {hecha !== s.previa && (
                  <span className="ml-auto text-xs text-muted-foreground">{hecha ? 'pasa a hecha' : 'vuelve a pendiente'}</span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {cambia && (
        <div className="rounded-md bg-muted/40 p-3 text-sm">
          <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
            <li>Sesiones hechas antes de CliniQ: {carga.previas} → {sesiones}.</li>
            <li>Libres para agendar: {carga.restantes} → {restantesDespues}.</li>
            {sesiones >= carga.total && <li>El tratamiento queda completo.</li>}
          </ul>
        </div>
      )}

      <CampoMotivo value={motivo} onChange={setMotivo} />

      <div className="flex justify-end">
        <Button disabled={!listo || corregir.isPending} onClick={() => setConfirmando(true)}>
          Corregir sesiones
        </Button>
      </div>

      <ConfirmDialog
        open={confirmando}
        onOpenChange={setConfirmando}
        title="¿Corregir las sesiones previas?"
        description={`«${carga.descripcion}» pasa de ${sesionesTexto(carga.previas)} hechas antes de CliniQ a ${sesionesTexto(sesiones)}. Queda registrado con tu usuario y el motivo.`}
        confirmLabel="Sí, corregir"
        loading={corregir.isPending}
        onConfirm={() => corregir.mutate()}
      />
    </div>
  )
}

export default function SesionesPreviasPage() {
  const [clinica, setClinica] = useState<AdminTenant | null>(null)
  const [paciente, setPaciente] = useState<SoportePaciente | null>(null)
  const [carga, setCarga] = useState<SoporteCargaMigrada | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)

  function reiniciarDesde(paso: 1 | 2 | 3) {
    if (paso <= 1) setClinica(null)
    if (paso <= 2) setPaciente(null)
    setCarga(null)
    setHecho(null)
  }

  return (
    <div className="max-w-3xl space-y-4">
      <EncabezadoHerramienta
        titulo="Corregir sesiones previas"
        descripcion="Para un paciente que llegó por la puesta en marcha con mal marcado el número de sesiones que ya había hecho. Se corrige solo mientras no haya hecho ninguna sesión de ese paquete en la app."
      />

      {hecho && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-800 dark:bg-emerald-950/30">
          <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> {hecho}</p>
          <Button size="sm" variant="outline" onClick={() => reiniciarDesde(2)}>Hacer otra</Button>
        </div>
      )}

      <Paso numero={1} titulo="Clínica" resumen={clinica?.nombre} onCambiar={() => reiniciarDesde(1)}>
        <BuscarClinica onSelect={setClinica} />
      </Paso>

      {clinica && !hecho && (
        <>
          <Paso numero={2} titulo="Paciente" resumen={paciente && resumenPaciente(paciente)} onCambiar={() => reiniciarDesde(2)}>
            <BuscarPaciente clinicaId={clinica.id} onSelect={setPaciente} />
          </Paso>

          {paciente && (
            <Paso numero={3} titulo="Paquete migrado" resumen={carga && resumenCarga(carga)} onCambiar={() => reiniciarDesde(3)}>
              <ElegirCarga clinicaId={clinica.id} pacienteId={paciente.id} onSelect={setCarga} />
            </Paso>
          )}

          {carga && (
            <Paso numero={4} titulo="Sesiones ya hechas y confirmación">
              <CorregirSesiones
                clinicaId={clinica.id}
                carga={carga}
                onListo={(n) => setHecho(`«${carga.descripcion}» de ${paciente?.nombre} quedó con ${sesionesTexto(n)} previas.`)}
              />
            </Paso>
          )}
        </>
      )}

      {clinica && <CorreccionesRecientes clinicaId={clinica.id} tipo="corregir_sesiones_previas" />}
    </div>
  )
}
