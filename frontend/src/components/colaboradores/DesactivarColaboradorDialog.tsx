'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { colaboradoresApi } from '@/lib/api/colaboradores'
import { mensajeDeError } from '@/lib/errores'
import { cn, formatDateTime, toTitleCase } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ProfesionalSelect } from '@/components/agenda/ProfesionalSelect'
import type { CitaFutura, Colaborador } from '@/types/colaboradores'

const MAX_VISIBLES = 5

function plural(n: number, uno: string, varios: string) {
  return `${n} ${n === 1 ? uno : varios}`
}

function FilaCita({ cita }: { cita: CitaFutura }) {
  return (
    <li className="py-2">
      <p className="text-sm">
        <span className="font-medium">{formatDateTime(cita.fecha_inicio)}</span>
        <span className="text-muted-foreground"> · {toTitleCase(cita.paciente_nombre)}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        {[cita.servicio_nombre, cita.sede_nombre].filter(Boolean).join(' · ')}
      </p>
      {cita.motivo && <p className="text-xs text-destructive mt-0.5">{cita.motivo}</p>}
    </li>
  )
}

function ListaCitas({ citas, total }: { citas: CitaFutura[]; total?: number }) {
  const visibles = citas.slice(0, MAX_VISIBLES)
  const resto = (total ?? citas.length) - visibles.length
  return (
    <ul className="divide-y rounded-md border px-3 max-h-56 overflow-y-auto">
      {visibles.map((c) => <FilaCita key={c.id} cita={c} />)}
      {resto > 0 && <li className="py-2 text-xs text-muted-foreground">y {plural(resto, 'cita más', 'citas más')}</li>}
    </ul>
  )
}

/**
 * Desactivar a un colaborador. Si tiene citas por delante, deja pasarlas todas a
 * otro profesional en el mismo paso: el servidor prueba cada una con las reglas
 * de la agenda y muestra antes cuáles caben y cuáles no.
 */
export function DesactivarColaboradorDialog({
  colaborador,
  onOpenChange,
}: {
  colaborador: Colaborador | null
  onOpenChange: (open: boolean) => void
}) {
  const qc = useQueryClient()
  const open = !!colaborador
  const id = colaborador?.id ?? ''
  const nombre = colaborador ? toTitleCase(colaborador.nombre_completo) : ''
  const [destino, setDestino] = useState('')
  // Con citas por delante: pasarlas a otro profesional o quitar el acceso y
  // dejárselas (recepción elige otro profesional al recibir a cada paciente).
  const [modo, setModo] = useState<'pasar' | 'dejar'>('pasar')

  useEffect(() => { if (!open) { setDestino(''); setModo('pasar') } }, [open])

  const futuras = useQuery({
    queryKey: ['colaborador-citas-futuras', id],
    queryFn: () => colaboradoresApi.citasFuturas(id),
    enabled: open,
    staleTime: 0,
  })

  const total = futuras.data?.total ?? 0

  const vistaPrevia = useQuery({
    queryKey: ['colaborador-reasignar-preview', id, destino],
    queryFn: () => colaboradoresApi.reasignarCitas(id, { profesional: destino, confirmar: false }),
    enabled: open && total > 0 && !!destino && modo === 'pasar',
    staleTime: 0,
    retry: false,
  })

  // El nombre del profesional elegido sale de la misma lista que usa el selector.
  const { data: profesionales } = useQuery({
    queryKey: ['profesionales', undefined, '', '', ''],
    queryFn: () => colaboradoresApi.profesionales(),
    enabled: open && total > 0,
  })
  const nombreDestino = toTitleCase(profesionales?.find((p) => p.id === destino)?.nombre_completo ?? 'el profesional elegido')

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['colaboradores'] })
    qc.invalidateQueries({ queryKey: ['mi-plan'] })
    qc.invalidateQueries({ queryKey: ['citas'] })
    qc.invalidateQueries({ queryKey: ['slots'] })
  }

  const desactivar = useMutation({
    mutationFn: (conservarCitas: boolean) =>
      colaboradoresApi.update(id, { activo: false, ...(conservarCitas ? { conservar_citas: true } : {}) }),
    onSuccess: (_r, conservarCitas) => {
      refrescar()
      toast.success(
        'Usuario desactivado',
        conservarCitas
          ? `${nombre} ya no tiene acceso. Sus citas siguen en la agenda: al recibir a cada paciente se elegirá otro profesional.`
          : `${nombre} ya no tiene acceso a la clínica.`,
      )
      onOpenChange(false)
    },
    onError: (e) => {
      // Alguien agendó mientras el diálogo estaba abierto: se vuelve a mirar la agenda.
      futuras.refetch()
      toast.error('No se pudo desactivar', mensajeDeError(e, 'Intenta de nuevo.'))
    },
  })

  const reasignar = useMutation({
    mutationFn: () => colaboradoresApi.reasignarCitas(id, { profesional: destino, confirmar: true, desactivar: true }),
    onSuccess: (r) => {
      refrescar()
      const pasaron = plural(r.movidas.length, 'cita pasó', 'citas pasaron')
      if (r.desactivado) {
        toast.success('Usuario desactivado', `Sus ${pasaron} a ${nombreDestino}.`)
        onOpenChange(false)
        return
      }
      toast.success(`${pasaron[0].toUpperCase()}${pasaron.slice(1)} a ${nombreDestino}`,
        r.pendientes.length ? 'Las que no cabían siguen pendientes.' : undefined)
      futuras.refetch()
      vistaPrevia.refetch()
    },
    onError: (e) => toast.error('No se pudieron pasar las citas', mensajeDeError(e, 'Intenta de nuevo.')),
  })

  const ocupado = desactivar.isPending || reasignar.isPending
  const preview = vistaPrevia.data
  const caben = preview?.movidas.length ?? 0
  const noCaben = preview?.pendientes ?? []

  let cuerpo: ReactNode
  let accion: ReactNode

  if (futuras.isLoading) {
    cuerpo = <p className="text-sm text-muted-foreground">Revisando su agenda…</p>
    accion = <Button variant="destructive" className="flex-1" disabled>Desactivar</Button>
  } else if (futuras.isError) {
    cuerpo = (
      <p className="text-sm text-destructive">
        {mensajeDeError(futuras.error, 'No se pudo revisar su agenda.')}{' '}
        <button type="button" className="underline" onClick={() => futuras.refetch()}>Reintentar</button>
      </p>
    )
    accion = <Button variant="destructive" className="flex-1" disabled>Desactivar</Button>
  } else if (total === 0) {
    cuerpo = null
    accion = (
      <Button variant="destructive" className="flex-1" disabled={ocupado} onClick={() => desactivar.mutate(false)}>
        {desactivar.isPending ? 'Desactivando…' : 'Desactivar'}
      </Button>
    )
  } else {
    cuerpo = (
      <div className="space-y-3">
        <p className="text-sm">
          Tiene <span className="font-medium">{plural(total, 'cita futura', 'citas futuras')}</span>. ¿Qué hacemos con {total === 1 ? 'ella' : 'ellas'}?
        </p>

        <div role="radiogroup" aria-label="Qué hacer con las citas" className="grid gap-2 sm:grid-cols-2">
          {([
            ['pasar', 'Pasarlas a otro profesional', 'Eliges a quién y ves antes cuáles caben en su agenda.'],
            ['dejar', 'Quitar el acceso y dejarlas', 'Siguen a su nombre: al recibir a cada paciente se elige otro profesional.'],
          ] as const).map(([valor, titulo, detalle]) => (
            <button
              key={valor}
              type="button"
              role="radio"
              aria-checked={modo === valor}
              disabled={ocupado}
              onClick={() => setModo(valor)}
              className={cn(
                'rounded-md border px-3 py-2 text-left transition-colors disabled:opacity-50',
                modo === valor ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-accent',
              )}
            >
              <span className="block text-sm font-medium">{titulo}</span>
              <span className="block text-xs text-muted-foreground mt-0.5">{detalle}</span>
            </button>
          ))}
        </div>

        {modo === 'dejar' ? (
          <>
            <ListaCitas citas={futuras.data?.citas ?? []} total={total} />
            <p className="text-xs text-muted-foreground">
              En la agenda se verán con el aviso “sin acceso”. Recepción no podrá recibir al paciente hasta cambiar el
              profesional de la cita.
            </p>
          </>
        ) : (
        <>
        <div className="space-y-1.5">
          <Label className="text-xs">Pasar las citas a</Label>
          <ProfesionalSelect
            value={destino}
            onValueChange={setDestino}
            excluirIds={colaborador ? [colaborador.user] : undefined}
            disabled={ocupado}
          />
          <p className="text-xs text-muted-foreground">
            Solo cambia el profesional: la hora, la sala y los equipos siguen igual. Al paciente no se le avisa.
          </p>
        </div>

        {!destino && futuras.data && <ListaCitas citas={futuras.data.citas} total={total} />}

        {destino && vistaPrevia.isFetching && !preview && (
          <p className="text-sm text-muted-foreground">Revisando la agenda de {nombreDestino}…</p>
        )}
        {destino && vistaPrevia.isError && (
          <p className="text-sm text-destructive">{mensajeDeError(vistaPrevia.error, 'No se pudo revisar su agenda.')}</p>
        )}
        {destino && preview && (
          noCaben.length === 0 ? (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
              {caben === 1 ? 'La cita cabe' : `Las ${caben} citas caben`} en la agenda de {nombreDestino}.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm">
                {caben > 0 ? `Pasan ${caben} de ${caben + noCaben.length}. ` : `Ninguna cabe en la agenda de ${nombreDestino}. `}
                {noCaben.length === 1
                  ? `Esta cita se queda con ${nombre}: muévela de hora o cancélala en la agenda.`
                  : `Estas ${noCaben.length} citas se quedan con ${nombre}: muévelas de hora o cancélalas en la agenda.`}
              </p>
              <ListaCitas citas={noCaben} />
            </div>
          )
        )}
        </>
        )}
      </div>
    )
    const listo = !!preview && !vistaPrevia.isFetching
    accion = modo === 'dejar' ? (
      <Button variant="destructive" className="flex-1" disabled={ocupado} onClick={() => desactivar.mutate(true)}>
        {desactivar.isPending ? 'Quitando acceso…' : 'Quitar acceso'}
      </Button>
    ) : noCaben.length === 0 ? (
      <Button
        variant="destructive"
        className="flex-1"
        disabled={!destino || !listo || ocupado || caben === 0}
        onClick={() => reasignar.mutate()}
      >
        {reasignar.isPending ? 'Pasando citas…' : 'Pasar citas y desactivar'}
      </Button>
    ) : (
      <Button className="flex-1" disabled={!listo || ocupado || caben === 0} onClick={() => reasignar.mutate()}>
        {reasignar.isPending ? 'Pasando citas…' : caben === 0 ? 'Ninguna cabe' : `Pasar las ${caben} que caben`}
      </Button>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !ocupado) onOpenChange(false) }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Desactivar usuario</DialogTitle>
          <DialogDescription>{nombre} perderá el acceso a la clínica hasta que se reactive.</DialogDescription>
        </DialogHeader>
        {cuerpo}
        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" disabled={ocupado} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          {accion}
        </div>
      </DialogContent>
    </Dialog>
  )
}
