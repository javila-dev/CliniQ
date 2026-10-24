'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, Loader2, Search } from 'lucide-react'

import { adminApi } from '@/lib/api/admin'
import { useDebounce } from '@/hooks/useDebounce'
import { mensajeDeError } from '@/lib/errores'
import { cn, formatDateTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import type {
  AdminTenant, SoporteAtencion, SoportePaciente, TipoCorreccionSoporte, TrasladoPrevisualizacion,
} from '@/types/admin'

// Piezas comunes de las herramientas de soporte: cada una sigue el mismo patrón
// (clínica → pasos → vista previa → motivo → confirmar → registro).

export const pesos = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

export const MOTIVO_MINIMO = 10

// [singular, plural]
const ETIQUETAS_CONTENIDO: Record<keyof TrasladoPrevisualizacion['contenido'], [string, string]> = {
  notas: ['nota clínica', 'notas clínicas'],
  fotos: ['foto', 'fotos'],
  examenes: ['examen', 'exámenes'],
  ordenes: ['orden', 'órdenes'],
  zonas: ['marca de zonas', 'marcas de zonas'],
  insumos: ['insumo', 'insumos'],
  mediciones: ['medición', 'mediciones'],
  tratamientos_farmacologicos: ['tratamiento farmacológico', 'tratamientos farmacológicos'],
}

export function describirContenido(contenido: TrasladoPrevisualizacion['contenido']): string {
  const partes = (Object.keys(ETIQUETAS_CONTENIDO) as (keyof typeof ETIQUETAS_CONTENIDO)[])
    .filter((k) => contenido[k] > 0)
    .map((k) => `${contenido[k]} ${ETIQUETAS_CONTENIDO[k][contenido[k] === 1 ? 0 : 1]}`)
  return partes.join(', ') || 'la nota clínica'
}

export function EncabezadoHerramienta({ titulo, descripcion }: { titulo: string; descripcion: string }) {
  return (
    <div>
      <Link href="/console/soporte" className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Soporte
      </Link>
      <h1 className="text-xl font-bold text-foreground">{titulo}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{descripcion}</p>
    </div>
  )
}

export function Paso({
  numero, titulo, resumen, onCambiar, children,
}: {
  numero: number
  titulo: string
  /** Lo elegido: con él el paso queda cerrado y muestra "Cambiar". */
  resumen?: ReactNode
  onCambiar?: () => void
  children?: ReactNode
}) {
  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
            resumen ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
          )}
        >
          {numero}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">{titulo}</h2>
            {resumen && onCambiar && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCambiar}>Cambiar</Button>
            )}
          </div>
          {resumen ? <div className="mt-1 text-sm text-muted-foreground">{resumen}</div> : children && <div className="mt-3">{children}</div>}
        </div>
      </div>
    </section>
  )
}

export function Opcion({
  seleccionada, onSelect, children,
}: { seleccionada: boolean; onSelect: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-md border px-3 py-2 text-left text-sm transition-colors',
        seleccionada ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
      )}
    >
      {children}
    </button>
  )
}

export function BuscarClinica({ onSelect }: { onSelect: (c: AdminTenant) => void }) {
  const [q, setQ] = useState('')
  const busqueda = useDebounce(q.trim(), 300)
  const { data, isFetching } = useQuery({
    queryKey: ['soporte-clinicas', busqueda],
    queryFn: () => adminApi.tenants.list({ search: busqueda || undefined }),
  })
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-8" placeholder="Nombre o NIT de la clínica" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>
      {isFetching && !data ? <LoadingState /> : (
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {data?.results.map((c) => (
            <Opcion key={c.id} seleccionada={false} onSelect={() => onSelect(c)}>
              <span className="font-medium">{c.nombre}</span>
              {c.nit && <span className="ml-2 text-xs text-muted-foreground">NIT {c.nit}</span>}
              {!c.activo && <Badge variant="secondary" className="ml-2">Inactiva</Badge>}
            </Opcion>
          ))}
          {data?.results.length === 0 && <p className="text-sm text-muted-foreground">Sin resultados.</p>}
        </div>
      )}
    </div>
  )
}

export function BuscarPaciente({
  clinicaId, excluir, onSelect,
}: { clinicaId: string; excluir?: string; onSelect: (p: SoportePaciente) => void }) {
  const [q, setQ] = useState('')
  const busqueda = useDebounce(q.trim(), 300)
  const { data, isFetching, isError, error } = useQuery({
    queryKey: ['soporte-pacientes', clinicaId, busqueda],
    queryFn: () => adminApi.soporte.pacientes(clinicaId, busqueda),
    enabled: busqueda.length >= 3,
  })
  const resultados = data?.filter((p) => p.id !== excluir)
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-8" placeholder="Nombre o documento (mínimo 3 letras)" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>
      {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      {isError && <p className="text-sm text-destructive">{mensajeDeError(error)}</p>}
      <div className="max-h-64 space-y-1 overflow-y-auto">
        {resultados?.map((p) => (
          <Opcion key={p.id} seleccionada={false} onSelect={() => onSelect(p)}>
            <span className="font-medium">{p.nombre}</span>
            <span className="ml-2 text-xs text-muted-foreground">{p.tipo_documento} {p.numero_documento}</span>
          </Opcion>
        ))}
        {busqueda.length >= 3 && resultados?.length === 0 && <p className="text-sm text-muted-foreground">Sin resultados.</p>}
      </div>
    </div>
  )
}

export function ElegirAtencion({
  clinicaId, pacienteId, onSelect,
}: { clinicaId: string; pacienteId: string; onSelect: (a: SoporteAtencion) => void }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['soporte-atenciones', clinicaId, pacienteId],
    queryFn: () => adminApi.soporte.atenciones(clinicaId, pacienteId),
  })
  if (isLoading) return <LoadingState />
  if (isError) return <ErrorState onRetry={refetch} />
  if (!data?.length) return <p className="text-sm text-muted-foreground">Este paciente no tiene atenciones documentadas.</p>
  return (
    <div className="max-h-80 space-y-1 overflow-y-auto">
      {data.map((a) => (
        <Opcion key={a.id} seleccionada={false} onSelect={() => onSelect(a)}>
          <div className="flex flex-wrap items-center gap-x-2">
            <span className="font-medium">{formatDateTime(a.fecha_inicio)}</span>
            <span>· {a.servicio_nombre}</span>
            {a.estado === 'en_curso' && <Badge variant="secondary">En curso</Badge>}
            {a.recibida_por_traslado && <Badge variant="outline">Llegó por traslado</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">
            {a.profesional_nombre ?? 'Sin profesional'} · {a.sede_nombre}
            {a.paquete && ` · Paquete: ${a.paquete}`}
          </p>
        </Opcion>
      ))}
    </div>
  )
}

export function resumenAtencion(a: SoporteAtencion): string {
  return `${formatDateTime(a.fecha_inicio)} · ${a.servicio_nombre} · ${a.profesional_nombre ?? 'Sin profesional'}`
}

export function resumenPaciente(p: SoportePaciente): string {
  return `${p.nombre} · ${p.tipo_documento} ${p.numero_documento}`
}

export function Avisos({
  avisos, revisado, onRevisado,
}: { avisos: { code: string; texto: string }[]; revisado: boolean; onRevisado: (v: boolean) => void }) {
  if (!avisos.length) return null
  return (
    <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <AlertTriangle className="h-4 w-4 text-amber-600" /> Revisa antes de confirmar
      </p>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {avisos.map((a) => <li key={a.code}>{a.texto}</li>)}
      </ul>
      <div className="pt-1 text-sm">
        <Checkbox id="avisos-revisados" label="Los revisé" checked={revisado} onChange={(e) => onRevisado(e.target.checked)} />
      </div>
    </div>
  )
}

export function CampoMotivo({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const largo = value.trim().length
  return (
    <div className="space-y-1.5">
      <Label htmlFor="motivo-correccion">Motivo *</Label>
      <Textarea
        id="motivo-correccion"
        rows={3}
        placeholder="Qué pasó y quién lo reportó (queda en el historial de la clínica)"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {largo > 0 && largo < MOTIVO_MINIMO && (
        <p className="text-xs text-muted-foreground">Escribe al menos {MOTIVO_MINIMO} caracteres.</p>
      )}
    </div>
  )
}

const ACCION_COBRO_TEXTO: Record<string, string> = {
  sin_cobro: 'Sin cobro',
  mover: 'Cobro movido',
  mantener: 'Cobro en la cita',
  desligar: 'Cobro sin la cita',
  anular: 'Cobro anulado',
}

const ESTADO_CITA_TEXTO: Record<string, string> = {
  cancelada: 'Cita cancelada',
  no_asistio: 'No asistió',
  pendiente: 'Cita agendada de nuevo',
}

export function CorreccionesRecientes({ clinicaId, tipo }: { clinicaId: string; tipo: TipoCorreccionSoporte }) {
  const { data } = useQuery({
    queryKey: ['soporte-correcciones', clinicaId, tipo],
    queryFn: () => adminApi.soporte.correcciones(clinicaId, tipo),
  })
  if (!data?.length) return null
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold">Hechas en esta clínica</h2>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Atención</TableHead>
              <TableHead>Paciente</TableHead>
              <TableHead>Resultado</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead>Hecho por</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="text-xs">{formatDateTime(c.fecha_atencion)}</TableCell>
                <TableCell className="text-xs">
                  {c.paciente}{c.paciente_destino && ` → ${c.paciente_destino}`}
                </TableCell>
                <TableCell className="text-xs">
                  {[c.estado_cita && ESTADO_CITA_TEXTO[c.estado_cita], ACCION_COBRO_TEXTO[c.accion_cobro]].filter(Boolean).join(' · ')}
                </TableCell>
                <TableCell className="max-w-xs truncate text-xs" title={c.motivo}>{c.motivo}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {c.realizado_por ?? '—'} · {formatDateTime(c.created_at)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
