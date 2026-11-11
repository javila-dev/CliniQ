'use client'

import { AlertTriangle, ArrowRight } from 'lucide-react'

import { cn, formatDateTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { CorreccionMigradoPrevisualizacion, SoporteAtencionPaquete, SoporteTratamientoCatalogo } from '@/types/admin'

// Piezas de las herramientas que cambian el tratamiento de un paquete (migrado o
// vendido): pasar cada atención a una sesión del tratamiento nuevo y ver el
// protocolo como queda.

export const sesionesTexto = (n: number) => `${n} ${n === 1 ? 'sesión' : 'sesiones'}`

const ESTADO_ATENCION: Record<string, string> = {
  completada: 'Hecha',
  en_curso: 'En curso',
}

export function estadoAtencion(estado: string): string {
  return ESTADO_ATENCION[estado] ?? 'Agendada'
}

export function describirAtencion(a: SoporteAtencionPaquete): string {
  return `${formatDateTime(a.fecha_inicio)} · ${a.servicio_nombre} · ${a.profesional_nombre ?? 'Sin profesional'}`
}

/** Soporte elige a mano a qué sesión exacta del tratamiento nuevo pasa cada atención. */
export function AsignarAtenciones({
  atenciones, tratamiento, asignadas, onChange,
}: {
  atenciones: SoporteAtencionPaquete[]
  tratamiento: SoporteTratamientoCatalogo
  asignadas: Record<string, string>
  onChange: (v: Record<string, string>) => void
}) {
  const total = tratamiento.sesiones.length
  return (
    <div className="space-y-2">
      <Label>¿A qué sesión de «{tratamiento.nombre}» pasa cada atención?</Label>
      {atenciones.map((a) => {
        const usadas = new Set(Object.entries(asignadas).filter(([cita]) => cita !== a.cita_id).map(([, clave]) => clave))
        return (
          <div key={a.cita_id} className="space-y-2 rounded-md border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{describirAtencion(a)}</span>
              <Badge variant="secondary">{estadoAtencion(a.estado)}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">
                Hoy: {a.sesion ? `${a.sesion.nombre} #${a.sesion.numero}` : 'sin sesión del protocolo'}
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-[16rem] flex-1">
                <Select value={asignadas[a.cita_id] ?? ''} onValueChange={(v) => onChange({ ...asignadas, [a.cita_id]: v })}>
                  <SelectTrigger><SelectValue placeholder="Elige la sesión" /></SelectTrigger>
                  <SelectContent>
                    {tratamiento.sesiones.map((r, i) => (
                      <SelectItem key={r.clave} value={r.clave} disabled={usadas.has(r.clave)}>
                        {r.nombre} · sesión {i + 1} de {total}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** El protocolo tal como queda: la corrección se hace completa en el servidor y se descarta. */
export function ProtocoloResultante({
  vista, conPrevias = true,
}: { vista: CorreccionMigradoPrevisualizacion; conPrevias?: boolean }) {
  return (
    <div className="space-y-2">
      <Label>Así queda «{vista.descripcion}»</Label>
      <div className="divide-y rounded-lg border text-sm">
        {vista.protocolo.map((s) => (
          <div key={s.id} className={cn('flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2', s.origen === 'atencion' && 'bg-primary/5')}>
            <span className="w-40 shrink-0 font-medium">{s.nombre} · sesión {s.posicion} de {vista.protocolo.length}</span>
            <div className="min-w-0 flex-1">
              {s.origen === 'previa' && <span className="text-muted-foreground">Hecha antes de CliniQ</span>}
              {s.origen === 'pendiente' && <span className="text-muted-foreground">Pendiente</span>}
              {s.origen === 'atencion' && s.atencion && (
                <>
                  <span>
                    {estadoAtencion(s.atencion.estado)}: {describirAtencion(s.atencion)}
                  </span>
                  {!!s.consentimientos_faltantes?.length && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Esta sesión pide {s.consentimientos_faltantes.join(', ')} y la atención no lo tiene.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
        {!vista.protocolo.length && (
          <p className="px-3 py-2 text-muted-foreground">Sin protocolo por sesiones: el paquete cuenta {sesionesTexto(vista.total)}.</p>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {conPrevias && `${sesionesTexto(vista.previas)} antes de CliniQ · `}{vista.restantes} libres para agendar.
      </p>
    </div>
  )
}
