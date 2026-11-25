'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'

import { adminApi } from '@/lib/api/admin'
import { toast } from '@/hooks/use-toast'
import { mensajeDeError } from '@/lib/errores'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import type { AdminTenant, SoportePaciente, SoporteVentaTerminada } from '@/types/admin'

import {
  BuscarClinica, BuscarPaciente, CampoMotivo, CorreccionesRecientes, EncabezadoHerramienta, MOTIVO_MINIMO,
  Opcion, Paso, pesos, resumenPaciente,
} from '../_componentes'

// Una venta terminada cuya cartera quedó con saldo por error (se eligió cobrar
// un valor que no se iba a cobrar, o se terminó antes de que la terminación
// viera el saldo sin cuota). Cerrarla perdona lo pendiente: igual que elegir
// "Perdonar el saldo" al terminar.

const dinero = (v: string | number) => pesos.format(Number(v))

function resumenVenta(v: SoporteVentaTerminada): string {
  return `${v.descripcion} · terminada el ${formatDate(v.terminada_en)} · saldo ${dinero(v.saldo)}`
}

function ElegirVenta({
  clinicaId, pacienteId, onSelect,
}: { clinicaId: string; pacienteId: string; onSelect: (v: SoporteVentaTerminada) => void }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['soporte-ventas-terminadas', clinicaId, pacienteId],
    queryFn: () => adminApi.soporte.ventasTerminadas(clinicaId, pacienteId),
  })
  if (isLoading) return <LoadingState />
  if (isError) return <ErrorState onRetry={refetch} />
  if (!data?.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Este paciente no tiene ventas terminadas. Esta herramienta solo cierra la cartera de una venta ya terminada:
        si la venta sigue abierta, la clínica la termina desde la cotización.
      </p>
    )
  }
  return (
    <div className="space-y-1">
      {data.map((v) => {
        const detalle = (
          <>
            <div className="flex flex-wrap items-center gap-x-2">
              <span className="font-medium">{v.descripcion}</span>
              <span>· saldo {dinero(v.saldo)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Terminada el {formatDate(v.terminada_en)}
              {v.terminada_por ? ` por ${v.terminada_por}` : ''}
              {v.motivo_terminacion ? ` · ${v.motivo_terminacion}` : ''}
              {Number(v.valor_perdonado) > 0 ? ` · ya se perdonaron ${dinero(v.valor_perdonado)}` : ''}
            </p>
          </>
        )
        if (v.bloqueo) {
          return (
            <div key={v.cotizacion_id} className="rounded-md border px-3 py-2 text-sm opacity-70">
              {detalle}
              <p className="mt-1 text-xs text-muted-foreground">{v.bloqueo}</p>
            </div>
          )
        }
        return (
          <Opcion key={v.cotizacion_id} seleccionada={false} onSelect={() => onSelect(v)}>
            {detalle}
          </Opcion>
        )
      })}
    </div>
  )
}

function CerrarCartera({
  clinicaId, venta, onListo,
}: { clinicaId: string; venta: SoporteVentaTerminada; onListo: (texto: string) => void }) {
  const queryClient = useQueryClient()
  const [motivo, setMotivo] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const saldo = dinero(venta.saldo)
  const conAbono = venta.cuotas_pendientes.filter((c) => Number(c.abonado) > 0)
  const listo = motivo.trim().length >= MOTIVO_MINIMO

  const cerrar = useMutation({
    mutationFn: () => adminApi.soporte.cerrarCartera({ clinica: clinicaId, cotizacion: venta.cotizacion_id, motivo: motivo.trim() }),
    onSuccess: () => {
      toast.success('Cartera cerrada', 'Se perdonó el saldo pendiente y se registró la corrección.')
      queryClient.invalidateQueries({ queryKey: ['soporte-ventas-terminadas'] })
      queryClient.invalidateQueries({ queryKey: ['soporte-correcciones', clinicaId] })
      onListo(`La cartera de «${venta.descripcion}» quedó en $0: se perdonaron ${saldo}.`)
    },
    onError: (err) => {
      setConfirmando(false)
      toast.error('No se pudo cerrar la cartera', mensajeDeError(err))
    },
  })

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label>Lo que la cartera tiene por cobrar: {saldo}</Label>
        <ul className="divide-y rounded-md border text-sm">
          {venta.cuotas_pendientes.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0">
                {c.descripcion || 'Cuota'}
                {c.fecha_esperada ? ` · ${formatDate(c.fecha_esperada)}` : ' · sin fecha'}
                {c.vencida && <span className="ml-1.5 text-xs font-medium text-rose-600">Vencida</span>}
                {Number(c.abonado) > 0 && (
                  <span className="ml-1.5 text-xs text-muted-foreground">(abonado {dinero(c.abonado)})</span>
                )}
              </span>
              <span className="shrink-0 tabular-nums">{dinero(c.saldo)}</span>
            </li>
          ))}
          {Number(venta.saldo_sin_cuota) > 0 && (
            <li className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="text-muted-foreground">Saldo sin cuota (la cartera no cuadra con sus cuotas)</span>
              <span className="shrink-0 tabular-nums">{dinero(venta.saldo_sin_cuota)}</span>
            </li>
          )}
        </ul>
      </div>

      <div className="rounded-md bg-muted/40 p-3 text-sm">
        <p className="font-medium">Al cerrarla</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
          <li>Se perdonan {saldo}: la cartera de esta venta queda en $0 y el paciente sale de mora por ella.</li>
          {conAbono.length > 0 && (
            <li>
              {conAbono.length === 1 ? 'La cuota con abono queda cerrada' : `Las ${conAbono.length} cuotas con abono quedan cerradas`} por
              lo ya abonado; lo pagado no se toca.
            </li>
          )}
          <li>Las demás cuotas pendientes se anulan (quedan en el historial de la cartera).</li>
          <li>La venta no se podrá reanudar, como cualquier venta con saldo perdonado.</li>
          <li>Los pagos, las citas y las sesiones de la venta no cambian.</li>
        </ul>
      </div>

      <CampoMotivo value={motivo} onChange={setMotivo} />

      <div className="flex justify-end">
        <Button variant="destructive" disabled={!listo || cerrar.isPending} onClick={() => setConfirmando(true)}>
          Cerrar cartera
        </Button>
      </div>

      <ConfirmDialog
        open={confirmando}
        onOpenChange={setConfirmando}
        title="¿Cerrar la cartera de esta venta?"
        description={`Se perdonan ${saldo} de «${venta.descripcion}» y la cartera queda en $0. No se puede deshacer desde aquí. Queda registrado con tu usuario y el motivo.`}
        confirmLabel="Sí, cerrar"
        variant="destructive"
        loading={cerrar.isPending}
        onConfirm={() => cerrar.mutate()}
      />
    </div>
  )
}

export default function CerrarCarteraPage() {
  const [clinica, setClinica] = useState<AdminTenant | null>(null)
  const [paciente, setPaciente] = useState<SoportePaciente | null>(null)
  const [venta, setVenta] = useState<SoporteVentaTerminada | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)

  function reiniciarDesde(paso: 1 | 2 | 3) {
    if (paso <= 1) setClinica(null)
    if (paso <= 2) setPaciente(null)
    setVenta(null)
    setHecho(null)
  }

  return (
    <div className="max-w-3xl space-y-4">
      <EncabezadoHerramienta
        titulo="Cerrar cartera de una venta terminada"
        descripcion="La venta ya se terminó, pero su cartera quedó con saldo por error (por ejemplo, se eligió cobrar un valor que la clínica no iba a cobrar). Se perdona lo pendiente y la cartera queda en $0. Solo funciona con ventas terminadas."
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
            <Paso numero={3} titulo="Venta terminada" resumen={venta && resumenVenta(venta)} onCambiar={() => reiniciarDesde(3)}>
              <ElegirVenta clinicaId={clinica.id} pacienteId={paciente.id} onSelect={setVenta} />
            </Paso>
          )}

          {venta && (
            <Paso numero={4} titulo="Revisar y confirmar">
              <CerrarCartera
                key={venta.cotizacion_id}
                clinicaId={clinica.id}
                venta={venta}
                onListo={(texto) => setHecho(`${texto} Paciente: ${paciente?.nombre}.`)}
              />
            </Paso>
          )}
        </>
      )}

      {clinica && <CorreccionesRecientes clinicaId={clinica.id} tipo="cerrar_cartera" />}
    </div>
  )
}
