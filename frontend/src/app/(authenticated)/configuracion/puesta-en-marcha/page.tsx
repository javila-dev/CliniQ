'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Rocket, UserPlus, Undo2 } from 'lucide-react'
import { migracionApi } from '@/lib/api/migracion'
import { PageHeader } from '@/components/shared/PageHeader'
import { LoadingState } from '@/components/shared/LoadingState'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { PacienteEnCursoWizard } from '@/components/puesta-en-marcha/PacienteEnCursoWizard'
import type { LoteMigracion } from '@/types/migracion'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const fmt = (v: string) => new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })

export default function PuestaEnMarchaPage() {
  const qc = useQueryClient()
  const [revertir, setRevertir] = useState<LoteMigracion | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['migracion-lotes'],
    queryFn: () => migracionApi.lotes(),
  })
  const lotes = data?.results ?? []

  const mut = useMutation({
    mutationFn: (id: string) => migracionApi.revertir(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['migracion-lotes'] })
      toast.success('Carga revertida', 'Se eliminaron todos los registros de ese lote.')
      setRevertir(null)
    },
    onError: (e: any) => toast.error('No se pudo revertir', e?.response?.data?.error ?? 'Intenta de nuevo.'),
  })

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <PageHeader
        title="Puesta en marcha"
        description="Carga tus pacientes que vienen a mitad de un tratamiento: lo que ya pagaron, las sesiones hechas y el saldo pendiente."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/configuracion"><ArrowLeft className="h-3.5 w-3.5 mr-1.5" />Volver</Link>
          </Button>
        }
      />

      <Card className="border-primary/30 bg-primary/[0.03]">
        <CardContent className="pt-5 flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Rocket className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 space-y-1">
            <p className="text-sm font-semibold">Cargar un paciente en curso</p>
            <p className="text-xs text-muted-foreground">
              Un asistente te guía: el tratamiento y cuánto costó, qué sesiones ya hizo,
              cuánto pagó y cómo queda el saldo. Todo entra como <strong>datos previos</strong> —
              no cuenta en la caja ni en los ingresos del mes, y no se le envían recordatorios.
            </p>
          </div>
          <Button size="sm" className="shrink-0" onClick={() => setWizardOpen(true)}>
            <UserPlus className="h-4 w-4 mr-1.5" />Empezar
          </Button>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex items-baseline gap-2.5">
          <h2 className="text-sm font-semibold text-gray-800">Cargas hechas</h2>
          <span className="text-xs text-gray-400">Podés revertir una carga completa mientras revisás</span>
        </div>

        {isLoading ? (
          <LoadingState rows={3} />
        ) : !lotes.length ? (
          <p className="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">
            Todavía no cargaste ningún paciente en curso.
          </p>
        ) : (
          <div className="rounded-lg border divide-y">
            {lotes.map((l) => {
              const r = l.manifest?.resumen
              return (
                <div key={l.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-sm font-medium truncate', l.revertido && 'line-through text-muted-foreground')}>
                      {l.paciente_nombre ?? 'Paciente'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {fmt(l.created_at)}
                      {r && ` · ${r.sesiones_realizadas}/${r.sesiones_total} sesiones · pagó ${COP.format(Number(r.pagado))} · debe ${COP.format(Number(r.saldo))}`}
                      {l.creado_por_nombre && ` · ${l.creado_por_nombre}`}
                    </p>
                  </div>
                  {l.revertido ? (
                    <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      Revertido
                    </span>
                  ) : (
                    <Button size="sm" variant="ghost" className="shrink-0 text-rose-600"
                      onClick={() => setRevertir(l)}>
                      <Undo2 className="h-4 w-4 mr-1" />Revertir
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {wizardOpen && (
        <PacienteEnCursoWizard
          onClose={() => setWizardOpen(false)}
          onDone={() => qc.invalidateQueries({ queryKey: ['migracion-lotes'] })}
        />
      )}

      <Dialog open={!!revertir} onOpenChange={(v) => { if (!v) setRevertir(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Revertir la carga</DialogTitle>
            <DialogDescription>
              Se eliminan la cotización, el cobro, los pagos, las citas y la cartera creados para{' '}
              <strong>{revertir?.paciente_nombre}</strong>. Esto no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevertir(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={mut.isPending}
              onClick={() => revertir && mut.mutate(revertir.id)}>
              {mut.isPending ? 'Revirtiendo…' : 'Revertir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
