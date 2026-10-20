'use client'

import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Wallet, Tag, Plus, Pencil, Check, X, MoreHorizontal, Power } from 'lucide-react'
import { cajaApi } from '@/lib/api/caja'
import { clinicasApi } from '@/lib/api/clinicas'
import { colaboradoresApi } from '@/lib/api/colaboradores'
import { hasPermission, PERM } from '@/lib/permissions'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { PageHeader } from '@/components/shared/PageHeader'
import {
  avisarGuardado, EtiquetaAjuste, FilaAjuste, NotaAjuste, SeccionAjustes, SelectAjuste, VacioAjustes,
} from '@/components/configuracion/ajustes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from '@/hooks/use-toast'
import type { Caja } from '@/types/caja'
import type { Paginated } from '@/types/common'

const SIN_RESPONSABLE = '__none__'

export default function CajasConfigPage() {
  return (
    <RoleGuard check={(u) => hasPermission(u, PERM.CAJA_CAJAS_GESTIONAR)}>
      <CajasConfigContent />
    </RoleGuard>
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

  return (
    <div className="space-y-6">
      <PageHeader
        helpSlug="abrir-y-cerrar-la-caja"
        title="Cajas y categorías"
        description="Configura la caja física de cada sede y el catálogo de categorías de gasto."
      />

      <div className="space-y-7">
        <SeccionAjustes
          titulo="Caja por sede"
          descripcion="Quién responde por la caja de cada sede y si se usa."
        >
          {loadingSedes || loadingCajas ? <FilasCargando filas={2} /> : !sedes.length ? (
            <VacioAjustes titulo="No hay sedes activas" descripcion="Activa o crea una sede para configurar su caja." />
          ) : (
            sedes.map((s) => (
              <FilaCaja
                key={s.id}
                sedeId={s.id}
                sedeNombre={s.nombre}
                caja={cajaPorSede.get(s.id) ?? null}
                responsables={responsables}
              />
            ))
          )}
        </SeccionAjustes>

        <CategoriasSection />
      </div>
    </div>
  )
}

// ─── Caja por sede ───────────────────────────────────────────

function FilaCaja({ sedeId, sedeNombre, caja, responsables }: {
  sedeId: string
  sedeNombre: string
  caja: Caja | null
  responsables: { id: string; nombre: string }[]
}) {
  const qc = useQueryClient()

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['cajas', 'config'] })
    qc.invalidateQueries({ queryKey: ['caja-actual'] })
  }

  const crear = useMutation({
    mutationFn: () => cajaApi.cajas.create({ sede: sedeId, saldo_inicial: 0, responsable: null, activa: true }),
    onSuccess: () => {
      invalidate()
      toast.success(`Caja creada para ${sedeNombre}`)
    },
    onError: () => toast.error('No se pudo guardar'),
  })

  const actualizar = useMutation({
    mutationFn: (data: { responsable?: string | null; activa?: boolean }) => cajaApi.cajas.update(caja!.id, data),
    onSuccess: (guardada) => {
      // Se actualiza la lista ya, para que la fila no vuelva un instante al valor anterior.
      qc.setQueryData<Paginated<Caja>>(['cajas', 'config'], (prev) => prev && {
        ...prev, results: prev.results.map((c) => (c.id === guardada.id ? { ...c, ...guardada } : c)),
      })
      invalidate()
    },
    onError: () => toast.error('No se pudo guardar', 'Intenta de nuevo.'),
  })

  // Mientras se guarda se muestra el valor nuevo, no el anterior.
  const pendiente = actualizar.isPending ? actualizar.variables : undefined
  const responsable = pendiente && 'responsable' in pendiente ? pendiente.responsable ?? null : caja?.responsable ?? null
  const activa = pendiente?.activa ?? caja?.activa ?? true

  function cambiarResponsable(valor: string | null, anterior?: string | null) {
    actualizar.mutate({ responsable: valor }, {
      onSuccess: () => avisarGuardado(anterior !== undefined ? () => cambiarResponsable(anterior) : undefined),
    })
  }

  function cambiarActiva(valor: boolean, conDeshacer = true) {
    actualizar.mutate({ activa: valor }, {
      onSuccess: () => avisarGuardado(conDeshacer ? () => cambiarActiva(!valor, false) : undefined),
    })
  }

  // El responsable actual puede no estar entre los colaboradores activos.
  const opciones = [
    { value: SIN_RESPONSABLE, label: 'Sin asignar' },
    ...responsables.map((r) => ({ value: r.id, label: r.nombre })),
  ]
  if (responsable && !responsables.some((r) => r.id === responsable)) {
    opciones.push({ value: responsable, label: caja?.responsable_nombre ?? 'Responsable actual' })
  }

  const sesionAbierta = !!caja?.sesion_abierta_id

  return (
    <FilaAjuste
      icono={Wallet}
      apagada={!caja || !activa}
      titulo={sedeNombre}
      extra={!caja ? <EtiquetaAjuste tono="aviso">Sin configurar</EtiquetaAjuste>
        : sesionAbierta ? <EtiquetaAjuste tono="activo">Abierta ahora</EtiquetaAjuste>
        : !activa ? <EtiquetaAjuste tono="aviso">Inactiva</EtiquetaAjuste>
        : undefined}
      descripcion={!caja
        ? 'Esta sede aún no tiene caja. Créala para abrirla y registrar cobros y gastos.'
        : 'Quién abre y cierra la caja.'}
    >
      {!caja ? (
        <Button size="sm" variant="outline" disabled={crear.isPending} onClick={() => crear.mutate()}>
          {crear.isPending ? 'Creando…' : 'Crear caja'}
        </Button>
      ) : (
        <>
          <SelectAjuste
            etiqueta={`Responsable de la caja de ${sedeNombre}`}
            valor={responsable ?? SIN_RESPONSABLE}
            opciones={opciones}
            deshabilitado={actualizar.isPending}
            onCambiar={(v) => {
              const nuevo = v === SIN_RESPONSABLE ? null : v
              if (nuevo !== responsable) cambiarResponsable(nuevo, responsable)
            }}
            ancho="w-[8.25rem] sm:w-48"
          />
          <Switch
            checked={activa}
            disabled={actualizar.isPending}
            onCheckedChange={(v) => cambiarActiva(v)}
            aria-label={`Caja de ${sedeNombre} activa`}
          />
        </>
      )}
    </FilaAjuste>
  )
}

// ─── Categorías de gasto ─────────────────────────────────────

function CategoriasSection() {
  const qc = useQueryClient()
  const [agregando, setAgregando] = useState(false)
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
    mutationFn: (c: { id: string; activa: boolean }) => cajaApi.categorias.update(c.id, { activa: c.activa }),
    onSuccess: invalidate,
    onError: () => toast.error('No se pudo guardar', 'Intenta de nuevo.'),
  })

  function cambiarActiva(c: { id: string; nombre: string }, activa: boolean, conDeshacer = true) {
    toggle.mutate({ id: c.id, activa }, {
      onSuccess: () => avisarGuardado(
        conDeshacer ? () => cambiarActiva(c, !activa, false) : undefined,
        activa ? `${c.nombre} activada` : `${c.nombre} desactivada`,
      ),
    })
  }

  const activas = cats.filter((c) => c.activa)
  const inactivas = cats.filter((c) => !c.activa)

  const botonNueva = (
    <Button size="sm" onClick={() => setAgregando(true)} disabled={agregando}>
      <Plus className="mr-1.5 h-3.5 w-3.5" />
      Nueva categoría
    </Button>
  )

  return (
    <SeccionAjustes
      titulo="Categorías de gasto"
      descripcion="Para clasificar los gastos de caja. Se comparten en toda la clínica."
      accion={cats.length > 0 || agregando ? botonNueva : undefined}
    >
      {agregando && (
        <form
          className="flex items-center gap-2 px-4 py-3"
          onSubmit={(e) => { e.preventDefault(); if (nueva.trim()) crear.mutate() }}
        >
          <div className="relative flex-1">
            <Tag className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { setAgregando(false); setNueva('') } }}
              placeholder="Ej. Arriendo, Servicios públicos"
              aria-label="Nombre de la nueva categoría"
              className="h-9 pl-9"
              maxLength={100}
              autoFocus
            />
          </div>
          <Button type="submit" size="sm" disabled={!nueva.trim() || crear.isPending}>
            {crear.isPending ? 'Agregando…' : 'Agregar'}
          </Button>
          <Button
            type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label="Cancelar"
            onClick={() => { setAgregando(false); setNueva('') }}
          >
            <X className="h-4 w-4" />
          </Button>
        </form>
      )}

      {isLoading ? (
        <FilasCargando filas={3} />
      ) : !cats.length ? (
        !agregando && (
          <VacioAjustes
            titulo="Aún no hay categorías"
            descripcion="Crea las categorías con las que clasificas los gastos (arriendo, insumos, servicios…)."
            accion={botonNueva}
          />
        )
      ) : (
        <>
          {[...activas, ...inactivas].map((c) => editId === c.id ? (
            <div key={c.id} className="flex items-center gap-2 px-4 py-3">
              <Input
                value={editVal}
                onChange={(e) => setEditVal(e.target.value)}
                className="h-9 flex-1"
                maxLength={100}
                aria-label={`Nuevo nombre de ${c.nombre}`}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && editVal.trim()) renombrar.mutate({ id: c.id, nombre: editVal.trim() })
                  if (e.key === 'Escape') setEditId(null)
                }}
              />
              <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600" aria-label="Guardar nombre"
                disabled={!editVal.trim() || renombrar.isPending}
                onClick={() => renombrar.mutate({ id: c.id, nombre: editVal.trim() })}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Cancelar" onClick={() => setEditId(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <FilaAjuste
              key={c.id}
              icono={Tag}
              apagada={!c.activa}
              titulo={c.nombre}
              extra={!c.activa ? <EtiquetaAjuste tono="aviso">Inactiva</EtiquetaAjuste> : undefined}
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Acciones de ${c.nombre}`}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => { setEditId(c.id); setEditVal(c.nombre) }}>
                    <Pencil className="mr-2 h-3.5 w-3.5" />Renombrar
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={toggle.isPending} onClick={() => cambiarActiva(c, !c.activa)}>
                    <Power className="mr-2 h-3.5 w-3.5" />{c.activa ? 'Desactivar' : 'Activar'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </FilaAjuste>
          ))}
          <NotaAjuste>Desactivar una categoría la oculta al registrar gastos nuevos, pero conserva el histórico.</NotaAjuste>
        </>
      )}
    </SeccionAjustes>
  )
}

/** Filas grises mientras cargan los datos (igual que en ClinicaConfig). */
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
        </div>
      ))}
    </>
  )
}
