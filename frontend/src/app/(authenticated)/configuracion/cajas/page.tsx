'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Wallet, Tag, Plus, Pencil, Check, X, ArrowLeft } from 'lucide-react'
import { cajaApi } from '@/lib/api/caja'
import { clinicasApi } from '@/lib/api/clinicas'
import { colaboradoresApi } from '@/lib/api/colaboradores'
import { hasPermission, PERM } from '@/lib/permissions'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { PageHeader } from '@/components/shared/PageHeader'
import { LoadingState } from '@/components/shared/LoadingState'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { Caja } from '@/types/caja'

const SIN_RESPONSABLE = '__none__'

export default function CajasConfigPage() {
  return (
    <RoleGuard check={(u) => hasPermission(u, PERM.CAJA_CAJAS_GESTIONAR)}>
      <CajasConfigContent />
    </RoleGuard>
  )
}

function SectionTitle({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
      <span className="text-xs text-gray-400">{hint}</span>
    </div>
  )
}

function CajasConfigContent() {
  const { data: sedesData, isLoading: loadingSedes } = useQuery({
    queryKey: ['sedes', 'activas'],
    queryFn: () => clinicasApi.sedes.list({ activa: true }),
  })
  const { data: cajasData, isLoading: loadingCajas } = useQuery({
    queryKey: ['cajas', 'config'],
    queryFn: () => cajaApi.cajas.list(),
  })
  const { data: colabsData } = useQuery({
    queryKey: ['colaboradores', 'activos'],
    queryFn: () => colaboradoresApi.list({ activo: true, page_size: 200 }),
  })

  const sedes = sedesData?.results ?? []
  const cajaPorSede = useMemo(() => {
    const m = new Map<string, Caja>()
    for (const c of cajasData?.results ?? []) m.set(c.sede, c)
    return m
  }, [cajasData])
  const responsables = (colabsData?.results ?? []).map((c) => ({ id: c.user, nombre: c.nombre_completo }))

  if (loadingSedes || loadingCajas) return <LoadingState rows={4} />

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <PageHeader
        title="Cajas y categorías"
        description="Configura la caja física de cada sede y el catálogo de categorías de gasto."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/configuracion">
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
              Volver
            </Link>
          </Button>
        }
      />

      <section className="space-y-3">
        <SectionTitle title="Caja por sede" hint="Responsable y estado de la caja de cada sede" />
        {!sedes.length ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No hay sedes activas.</CardContent></Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {sedes.map((s) => (
              <CajaCard
                key={s.id}
                sedeId={s.id}
                sedeNombre={s.nombre}
                caja={cajaPorSede.get(s.id) ?? null}
                responsables={responsables}
              />
            ))}
          </div>
        )}
      </section>

      <CategoriasSection />
    </div>
  )
}

// ─── Caja por sede ───────────────────────────────────────────

function CajaCard({ sedeId, sedeNombre, caja, responsables }: {
  sedeId: string
  sedeNombre: string
  caja: Caja | null
  responsables: { id: string; nombre: string }[]
}) {
  const qc = useQueryClient()
  const [responsable, setResponsable] = useState(caja?.responsable ?? SIN_RESPONSABLE)
  const [activa, setActiva] = useState(caja?.activa ?? true)

  const responsableNorm = responsable === SIN_RESPONSABLE ? null : responsable
  const sesionAbierta = !!caja?.sesion_abierta_id
  const sucia = caja
    ? responsableNorm !== caja.responsable || activa !== caja.activa
    : true

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['cajas', 'config'] })
    qc.invalidateQueries({ queryKey: ['caja-actual'] })
  }

  const guardar = useMutation({
    mutationFn: () => {
      return caja
        ? cajaApi.cajas.update(caja.id, { responsable: responsableNorm, activa })
        : cajaApi.cajas.create({ sede: sedeId, saldo_inicial: 0, responsable: responsableNorm, activa })
    },
    onSuccess: () => {
      invalidate()
      toast.success(caja ? 'Caja actualizada' : `Caja creada para ${sedeNombre}`)
    },
    onError: () => toast.error('No se pudo guardar'),
  })

  const estado = !caja ? 'Sin configurar'
    : sesionAbierta ? 'Sesión abierta ahora'
    : activa ? 'Activa' : 'Inactiva'

  return (
    <Card>
      <CardContent className="pt-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
              caja ? 'bg-green-50 text-green-600' : 'bg-muted text-muted-foreground',
            )}>
              <Wallet className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{sedeNombre}</p>
              <p className={cn(
                'text-xs',
                !caja ? 'text-amber-600' : sesionAbierta ? 'text-emerald-600' : 'text-muted-foreground',
              )}>{estado}</p>
            </div>
          </div>
          <Switch checked={activa} onCheckedChange={setActiva} />
        </div>

        <div className="space-y-1.5">
          <Label>Responsable</Label>
          <Select value={responsable} onValueChange={setResponsable}>
            <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={SIN_RESPONSABLE}>Sin asignar</SelectItem>
              {responsables.map((r) => <SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={guardar.isPending || (!!caja && !sucia)}
            onClick={() => guardar.mutate()}
          >
            {guardar.isPending ? 'Guardando…' : caja ? 'Guardar' : 'Crear caja'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Categorías de gasto ─────────────────────────────────────

function CategoriasSection() {
  const qc = useQueryClient()
  const [nueva, setNueva] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editVal, setEditVal] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['caja-categorias', 'config'],
    queryFn: () => cajaApi.categorias.list(),
  })
  const cats = data?.results ?? []

  const invalidate = () => qc.invalidateQueries({ queryKey: ['caja-categorias'] })
  const errMsg = (e: any, fallback: string) => {
    const n = e?.response?.data?.nombre
    return (Array.isArray(n) ? n[0] : n) ?? fallback
  }

  const crear = useMutation({
    mutationFn: () => cajaApi.categorias.create({ nombre: nueva.trim() }),
    onSuccess: () => { invalidate(); setNueva(''); toast.success('Categoría creada') },
    onError: (e: any) => toast.error('No se pudo crear', errMsg(e, 'Revisa el nombre.')),
  })
  const renombrar = useMutation({
    mutationFn: ({ id, nombre }: { id: string; nombre: string }) => cajaApi.categorias.update(id, { nombre }),
    onSuccess: () => { invalidate(); setEditId(null); toast.success('Categoría actualizada') },
    onError: (e: any) => toast.error('No se pudo renombrar', errMsg(e, 'Revisa el nombre.')),
  })
  const toggle = useMutation({
    mutationFn: (c: { id: string; activa: boolean }) => cajaApi.categorias.update(c.id, { activa: !c.activa }),
    onSuccess: invalidate,
  })

  const activas = cats.filter((c) => c.activa)
  const inactivas = cats.filter((c) => !c.activa)

  return (
    <section className="space-y-3">
      <SectionTitle title="Categorías de gasto" hint="Únicas por nombre — se comparten en toda la clínica" />

      <Card>
        <CardContent className="pt-5 space-y-4">
          <form
            className="flex gap-2"
            onSubmit={(e) => { e.preventDefault(); if (nueva.trim()) crear.mutate() }}
          >
            <div className="relative flex-1">
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={nueva}
                onChange={(e) => setNueva(e.target.value)}
                placeholder="Nueva categoría (ej. Arriendo, Servicios públicos)"
                className="pl-9"
                maxLength={100}
              />
            </div>
            <Button type="submit" disabled={!nueva.trim() || crear.isPending}>
              <Plus className="h-4 w-4 mr-1" />
              {crear.isPending ? 'Agregando…' : 'Agregar'}
            </Button>
          </form>

          {isLoading ? (
            <LoadingState rows={3} />
          ) : !cats.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Aún no hay categorías.</p>
          ) : (
            <div className="rounded-lg border divide-y">
              {[...activas, ...inactivas].map((c) => (
                <div key={c.id} className="flex items-center gap-2 px-3 py-2">
                  {editId === c.id ? (
                    <>
                      <Input
                        value={editVal}
                        onChange={(e) => setEditVal(e.target.value)}
                        className="h-8 flex-1"
                        maxLength={100}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && editVal.trim()) renombrar.mutate({ id: c.id, nombre: editVal.trim() })
                          if (e.key === 'Escape') setEditId(null)
                        }}
                      />
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600"
                        disabled={!editVal.trim() || renombrar.isPending}
                        onClick={() => renombrar.mutate({ id: c.id, nombre: editVal.trim() })}>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditId(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className={cn('flex-1 text-sm', !c.activa && 'text-muted-foreground line-through')}>
                        {c.nombre}
                      </span>
                      {!c.activa && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          Inactiva
                        </span>
                      )}
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" title="Renombrar"
                        onClick={() => { setEditId(c.id); setEditVal(c.nombre) }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 w-[92px] text-xs"
                        disabled={toggle.isPending}
                        onClick={() => toggle.mutate(c)}>
                        {c.activa ? 'Desactivar' : 'Activar'}
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Desactivar una categoría la oculta al registrar gastos nuevos, pero conserva el histórico.
          </p>
        </CardContent>
      </Card>
    </section>
  )
}
