'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import {
  Plus, Search, ChevronLeft, ChevronRight, Trash2, TrendingDown, Lock,
} from 'lucide-react'
import { cajaApi } from '@/lib/api/caja'
import { useAuthStore } from '@/store/authStore'
import { hasPermission, PERM } from '@/lib/permissions'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { LoadingState } from '@/components/shared/LoadingState'
import { useResultadosSede } from '../context'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useDebounce } from '@/hooks/useDebounce'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { GastoCaja } from '@/types/caja'

const PAGE_SIZE = 25
const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const SOPORTE_MIN = 50000

export default function EgresosPage() {
  return <RoleGuard check={(u) => hasPermission(u, PERM.CAJA_GASTOS_VER)}><EgresosContent /></RoleGuard>
}

function EgresosContent() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const { sede, sedes } = useResultadosSede()
  const puedeRegistrar = hasPermission(user, PERM.CAJA_GASTOS_REGISTRAR)
  const puedeEditar = hasPermission(user, PERM.CAJA_GASTOS_EDITAR)

  const [search, setSearch] = useState('')
  const [categoria, setCategoria] = useState('todas')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [page, setPage] = useState(1)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [borrando, setBorrando] = useState<GastoCaja | null>(null)
  const debSearch = useDebounce(search, 350)

  const { data: cats } = useQuery({
    queryKey: ['caja-categorias'],
    queryFn: () => cajaApi.categorias.list(),
  })
  const categorias = cats?.results ?? []

  const params = {
    sede,
    search: debSearch || undefined,
    categoria: categoria !== 'todas' ? categoria : undefined,
    fecha__gte: desde || undefined,
    fecha__lte: hasta || undefined,
    page,
    page_size: PAGE_SIZE,
  }
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['caja-gastos', params],
    queryFn: () => cajaApi.gastos.list(params),
    placeholderData: keepPreviousData,
  })
  const gastos = data?.results ?? []
  const total = data?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const totalPagina = gastos.reduce((s, g) => s + Number(g.valor), 0)

  const borrar = useMutation({
    mutationFn: (id: string) => cajaApi.gastos.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['caja-gastos'] })
      qc.invalidateQueries({ queryKey: ['caja-actual'] })
      toast.success('Gasto eliminado')
      setBorrando(null)
    },
    onError: (e: any) => toast.error('No se pudo eliminar', e?.response?.data?.error ?? 'La sesión de caja podría estar cerrada.'),
  })

  const reset = (fn: () => void) => { fn(); setPage(1) }

  return (
    <div className="space-y-4">
      {puedeRegistrar && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setSheetOpen(true)}><Plus className="h-4 w-4 mr-1.5" />Registrar gasto</Button>
        </div>
      )}

      {/* Resumen */}
      <Card className="max-w-xs"><CardContent className="pt-4 flex items-center gap-3">
        <div className="rounded-lg p-2.5 bg-rose-500"><TrendingDown className="h-4 w-4 text-white" /></div>
        <div><p className="text-xs text-muted-foreground">Total en esta página</p><p className="text-lg font-bold tabular-nums">{COP.format(totalPagina)}</p></div>
      </CardContent></Card>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar descripción…" value={search} onChange={(e) => reset(() => setSearch(e.target.value))} className="pl-9 h-9 bg-white" />
        </div>
        <Input type="date" value={desde} max={hasta || undefined} onChange={(e) => reset(() => setDesde(e.target.value))} className="w-36 h-9" />
        <Input type="date" value={hasta} min={desde || undefined} onChange={(e) => reset(() => setHasta(e.target.value))} className="w-36 h-9" />
        <Select value={categoria} onValueChange={(v) => reset(() => setCategoria(v))}>
          <SelectTrigger className="w-44 h-9 bg-white text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas las categorías</SelectItem>
            {categorias.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Tabla */}
      {isLoading ? (
        <LoadingState rows={5} />
      ) : !gastos.length ? (
        <Card><CardContent className="py-16 text-center">
          <TrendingDown className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">Sin gastos para los filtros seleccionados</p>
        </CardContent></Card>
      ) : (
        <div className={cn('rounded-xl border bg-white shadow-sm overflow-hidden transition-opacity', isFetching && 'opacity-60')}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/60 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                <th className="text-left px-5 py-2.5">Fecha</th>
                <th className="text-left px-5 py-2.5">Descripción</th>
                <th className="text-left px-5 py-2.5 hidden md:table-cell">Categoría</th>
                <th className="text-left px-5 py-2.5 hidden lg:table-cell">Sede</th>
                <th className="text-right px-5 py-2.5">Valor</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {gastos.map((g) => (
                <tr key={g.id} className="border-b border-gray-100 last:border-0 hover:bg-muted/30">
                  <td className="px-5 py-2.5 text-xs text-muted-foreground tabular-nums whitespace-nowrap">{g.fecha}</td>
                  <td className="px-5 py-2.5">
                    <p className="font-medium">{g.descripcion}</p>
                    <p className="text-[11px] text-muted-foreground md:hidden">{g.categoria_nombre} · {g.sede_nombre}</p>
                    {g.registrado_por_nombre && (
                      <p className="text-[11px] text-muted-foreground">Registró: {g.registrado_por_nombre}</p>
                    )}
                  </td>
                  <td className="px-5 py-2.5 hidden md:table-cell text-muted-foreground">{g.categoria_nombre}</td>
                  <td className="px-5 py-2.5 hidden lg:table-cell text-muted-foreground">{g.sede_nombre}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums font-semibold">{COP.format(Number(g.valor))}</td>
                  <td className="px-5 py-2.5 text-right whitespace-nowrap">
                    {g.soporte_foto && (
                      <a href={g.soporte_foto} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline mr-2">soporte</a>
                    )}
                    {puedeEditar && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-600" title="Eliminar"
                        onClick={() => setBorrando(g)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginación */}
      {!isLoading && total > 0 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} de {total}</p>
          <div className={cn('flex items-center gap-2', totalPages <= 1 && 'hidden')}>
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-muted-foreground tabular-nums">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      <RegistrarGastoSheet
        open={sheetOpen} onClose={() => setSheetOpen(false)}
        sedes={sedes} sedeDefault={sede} categorias={categorias.filter((c) => c.activa)}
      />
      <ConfirmarBorrado gasto={borrando} pending={borrar.isPending}
        onClose={() => setBorrando(null)} onConfirm={() => borrando && borrar.mutate(borrando.id)} />
    </div>
  )
}

// ─── Registrar gasto ─────────────────────────────────────────

function RegistrarGastoSheet({ open, onClose, sedes, sedeDefault, categorias }: {
  open: boolean; onClose: () => void
  sedes: { id: string; nombre: string }[]
  sedeDefault?: string
  categorias: { id: string; nombre: string }[]
}) {
  const qc = useQueryClient()
  const [sede, setSede] = useState('')
  const [categoria, setCategoria] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [valor, setValor] = useState('')
  const [fecha, setFecha] = useState(() => new Date().toLocaleDateString('en-CA'))
  const [foto, setFoto] = useState<File | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const sedeSel = sede || sedeDefault || (sedes[0]?.id ?? '')
  const necesitaFoto = Number(valor || 0) > SOPORTE_MIN

  // ¿La caja de la sede elegida está abierta? Un gasto solo entra si hay sesión.
  const { data: estadoCaja, isLoading: cargandoCaja } = useQuery({
    queryKey: ['caja-actual', sedeSel],
    queryFn: () => cajaApi.sesiones.actual(sedeSel),
    enabled: open && !!sedeSel,
  })
  const cajaAbierta = !!estadoCaja?.sesion
  const sinCaja = open && !!sedeSel && !cargandoCaja && !estadoCaja?.caja

  const mut = useMutation({
    mutationFn: () => cajaApi.gastos.create({
      sede: sedeSel, categoria, descripcion, valor: Number(valor), fecha, soporte_foto: foto,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['caja-gastos'] })
      qc.invalidateQueries({ queryKey: ['caja-actual'] })
      toast.success('Gasto registrado')
      setSede(''); setCategoria(''); setDescripcion(''); setValor(''); setFoto(null); setErr(null)
      onClose()
    },
    onError: (e: any) => setErr(
      e?.response?.data?.error ?? e?.response?.data?.soporte_foto ?? e?.response?.data?.detail ?? 'No se pudo registrar el gasto',
    ),
  })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!sedeSel || !categoria || !descripcion || !valor) { setErr('Completa todos los campos.'); return }
    if (necesitaFoto && !foto) { setErr('Para gastos mayores a $50.000 el soporte fotográfico es obligatorio.'); return }
    mut.mutate()
  }

  const bloqueado = sinCaja || (!cargandoCaja && !cajaAbierta && !!sedeSel)

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader><SheetTitle>Registrar gasto</SheetTitle></SheetHeader>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="space-y-1.5">
            <Label>Sede *</Label>
            <Select value={sedeSel} onValueChange={setSede}>
              <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
              <SelectContent>{sedes.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {bloqueado && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 flex gap-2">
              <Lock className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                {sinCaja
                  ? 'Esta sede no tiene una caja configurada. Pídele a un administrador que la cree en Configuración → Cajas.'
                  : <>La caja de esta sede está cerrada. Ábrela en la pestaña <span className="font-medium">Caja</span> para registrar gastos.</>}
              </div>
            </div>
          )}

          <fieldset disabled={bloqueado} className="space-y-4 disabled:opacity-50">
            <div className="space-y-1.5">
              <Label>Categoría *</Label>
              <Select value={categoria} onValueChange={setCategoria}>
                <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                <SelectContent>{categorias.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Descripción *</Label>
              <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={200} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Valor *</Label>
                <Input type="number" min={0} step="1" value={valor} onChange={(e) => setValor(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Fecha *</Label>
                <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Soporte {necesitaFoto ? '*' : '(opcional)'}</Label>
              <Input type="file" accept="image/*" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
              {necesitaFoto && <p className="text-[11px] text-amber-600">Obligatorio para gastos &gt; {COP.format(SOPORTE_MIN)}.</p>}
            </div>
          </fieldset>

          {err && <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">{err}</div>}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button type="submit" className="flex-1" disabled={mut.isPending || bloqueado}>{mut.isPending ? 'Guardando…' : 'Registrar'}</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}

// ─── Confirmar borrado ───────────────────────────────────────

function ConfirmarBorrado({ gasto, pending, onClose, onConfirm }: {
  gasto: GastoCaja | null; pending: boolean; onClose: () => void; onConfirm: () => void
}) {
  return (
    <Dialog open={!!gasto} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Eliminar gasto</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {gasto?.descripcion} · {gasto ? COP.format(Number(gasto.valor)) : ''}
          </p>
          <p className="text-xs text-muted-foreground">Solo se puede eliminar mientras la sesión de caja siga abierta.</p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button className="flex-1" variant="destructive" disabled={pending} onClick={onConfirm}>
              {pending ? 'Eliminando…' : 'Eliminar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

