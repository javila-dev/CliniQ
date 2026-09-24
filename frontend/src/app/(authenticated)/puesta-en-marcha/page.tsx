'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ChevronLeft, ChevronRight, Rocket, Search, UserPlus, Undo2 } from 'lucide-react'
import { migracionApi } from '@/lib/api/migracion'
import { PageHeader } from '@/components/shared/PageHeader'
import { LoadingState } from '@/components/shared/LoadingState'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { useDebounce } from '@/hooks/useDebounce'
import { PacienteEnCursoWizard } from '@/components/puesta-en-marcha/PacienteEnCursoWizard'
import type { LoteMigracion } from '@/types/migracion'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const fmt = (v: string) => new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
const PAGE_SIZE = 25

export default function PuestaEnMarchaPage() {
  const qc = useQueryClient()
  const [revertir, setRevertir] = useState<LoteMigracion | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounce(search, 350)

  const params = { search: debouncedSearch || undefined, page }

  const { data, isLoading } = useQuery({
    queryKey: ['migracion-lotes', params],
    queryFn: () => migracionApi.lotes(params),
  })
  const lotes = data?.results ?? []
  const total = data?.count ?? 0

  function cambiarBusqueda(v: string) {
    setSearch(v)
    setPage(1)
  }

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
    <div className="space-y-8 max-w-5xl mx-auto">
      <PageHeader
        helpSlug="puesta-en-marcha-cargar-pacientes-en-curso"
        title="Migrar pacientes en curso"
        description="Carga tus pacientes que vienen a mitad de un tratamiento: lo que ya pagaron, las sesiones hechas y el saldo pendiente."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard"><ArrowLeft className="h-3.5 w-3.5 mr-1.5" />Volver</Link>
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
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-baseline gap-2.5">
            <h2 className="text-sm font-semibold text-gray-800">Cargas hechas</h2>
            <span className="text-xs text-gray-400">Podés revertir una carga completa mientras revisás</span>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Paciente, usuario, nota..."
              value={search}
              onChange={(e) => cambiarBusqueda(e.target.value)}
              className="pl-9 h-9 bg-white"
            />
          </div>
        </div>

        {isLoading ? (
          <LoadingState rows={5} />
        ) : !lotes.length ? (
          <p className="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">
            {debouncedSearch ? 'Sin resultados para la búsqueda' : 'Todavía no cargaste ningún paciente en curso.'}
          </p>
        ) : (
          <>
            <div className="rounded-lg border overflow-hidden overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Paciente</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Usuario</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Fecha</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden sm:table-cell">Sesiones</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">Pagó</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">Debe</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {lotes.map((l) => {
                    const r = l.manifest?.resumen
                    return (
                      <tr key={l.id} className="border-b last:border-0">
                        <td className="px-4 py-3">
                          <p className={cn('font-medium truncate max-w-[220px]', l.revertido && 'line-through text-muted-foreground')}>
                            {l.paciente_nombre ?? 'Paciente'}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {l.creado_por_nombre ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {fmt(l.created_at)}
                        </td>
                        <td className="px-4 py-3 tabular-nums hidden sm:table-cell">
                          {r ? `${r.sesiones_realizadas}/${r.sesiones_total}` : '—'}
                        </td>
                        <td className="px-4 py-3 tabular-nums hidden md:table-cell">
                          {r ? COP.format(Number(r.pagado)) : '—'}
                        </td>
                        <td className="px-4 py-3 tabular-nums hidden md:table-cell">
                          {r ? COP.format(Number(r.saldo)) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {l.revertido ? (
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              Revertido
                            </span>
                          ) : (
                            <Button size="sm" variant="ghost" className="text-rose-600"
                              onClick={() => setRevertir(l)}>
                              <Undo2 className="h-4 w-4 mr-1" />Revertir
                            </Button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <Pagination page={page} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
          </>
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

// ─── Paginación ───────────────────────────────────────────────

function Pagination({
  page, total, pageSize, onPage,
}: {
  page: number; total: number; pageSize: number; onPage: (p: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const pages: number[] = []
  const addPage = (p: number) => {
    if (p >= 1 && p <= totalPages && !pages.includes(p)) pages.push(p)
  }
  addPage(1)
  for (let p = page - 2; p <= page + 2; p++) addPage(p)
  addPage(totalPages)

  const withGaps: (number | '…')[] = []
  let prev = 0
  for (const p of pages) {
    if (prev && p - prev > 1) withGaps.push('…')
    withGaps.push(p)
    prev = p
  }

  return (
    <div className="flex items-center justify-between px-1">
      <p className="text-sm text-muted-foreground">
        {total === 0 ? 'Sin resultados' : (
          <>Mostrando <span className="font-medium text-foreground">{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)}</span> de <span className="font-medium text-foreground">{total}</span></>
        )}
      </p>
      <div className={cn('flex items-center gap-1', totalPages <= 1 && 'hidden')}>
        <button
          onClick={() => onPage(page - 1)}
          disabled={page === 1}
          className="flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {withGaps.map((p, i) =>
          p === '…' ? (
            <span key={`gap-${i}`} className="px-1 text-muted-foreground text-sm select-none">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPage(p)}
              className={cn(
                'flex items-center justify-center h-8 min-w-[2rem] px-1 rounded-lg text-sm font-medium transition-colors',
                p === page
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {p}
            </button>
          )
        )}
        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
          className="flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
