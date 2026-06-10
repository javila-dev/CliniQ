'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Clock, User, FileText, Image, Pill, MapPin, Wrench } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { resolveMediaUrl } from '@/lib/utils/media'
import { cn, formatDateTime } from '@/lib/utils'
import type { NotaClinica } from '@/types/historia'

const TIPO_CONFIG: Record<string, { label: string; color: string }> = {
  consulta:      { label: 'Consulta',      color: 'bg-blue-100 text-blue-800' },
  procedimiento: { label: 'Procedimiento', color: 'bg-purple-100 text-purple-800' },
  evolucion:     { label: 'Evolución',     color: 'bg-green-100 text-green-800' },
  aclaratoria:   { label: 'Aclaratoria',   color: 'bg-orange-100 text-orange-800' },
}

interface NotaClinicaCardProps {
  nota: NotaClinica
  defaultOpen?: boolean
  compact?: boolean
}

export function NotaClinicaCard({ nota, defaultOpen = false, compact = false }: NotaClinicaCardProps) {
  const [open, setOpen] = useState(defaultOpen)
  const tipo = TIPO_CONFIG[nota.tipo] ?? { label: nota.tipo, color: 'bg-gray-100 text-gray-700' }

  const tieneContenidoEstetico =
    (nota.zona_tratada && nota.zona_tratada.length > 0) ||
    (nota.productos_usados && nota.productos_usados.length > 0) ||
    nota.tecnica ||
    nota.reacciones_adversas ||
    nota.cuidados_post ||
    nota.proxima_cita_sugerida

  return (
    <div className="rounded-lg border bg-white overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start justify-between p-3 hover:bg-muted/30 transition-colors text-left"
      >
        <div className="flex items-start gap-2.5">
          <FileText className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', tipo.color)}>
                {tipo.label}
              </span>
              {nota.fotos?.length > 0 && (
                <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                  <Image className="h-3 w-3" />
                  {nota.fotos.length}
                </span>
              )}
              {tieneContenidoEstetico && !compact && (
                <span className="text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full">Estético</span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-0.5">
                <Clock className="h-3 w-3" />
                {formatDateTime(nota.created_at)}
              </span>
              {!compact && (
                <>
                  <span className="flex items-center gap-0.5">
                    <User className="h-3 w-3" />
                    {nota.profesional_nombre}
                  </span>
                  <span>{nota.servicio_nombre}</span>
                </>
              )}
            </div>
            {/* Zonas como chips en modo compacto */}
            {compact && nota.zona_tratada && nota.zona_tratada.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {nota.zona_tratada.map((z, i) => (
                  <span key={i} className="text-xs bg-muted px-1.5 py-0.5 rounded">
                    {z.zona}{z.unidades ? ` · ${z.unidades}` : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        {open
          ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
          : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
        }
      </button>

      {/* Body */}
      {open && (
        <div className="border-t px-4 py-4 space-y-4 text-sm">
          {nota.tipo === 'aclaratoria' && nota.nota_aclarada && (
            <div className="rounded-md bg-orange-50 border border-orange-200 px-3 py-2 text-xs text-orange-700">
              Esta nota aclara una nota anterior (ID: {nota.nota_aclarada})
            </div>
          )}

          {/* Campos clásicos */}
          {nota.anamnesis   && <Section label="Anamnesis">{nota.anamnesis}</Section>}
          {nota.diagnostico && <Section label="Diagnóstico">{nota.diagnostico}</Section>}

          {/* Zonas tratadas */}
          {nota.zona_tratada && nota.zona_tratada.length > 0 && (
            <div className="space-y-1.5">
              <SectionTitle icon={<MapPin className="h-3.5 w-3.5" />} label="Zonas tratadas" />
              <div className="space-y-1">
                {nota.zona_tratada.map((z, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="font-medium">{z.zona}</span>
                    {z.unidades && <Badge variant="secondary" className="text-xs">{z.unidades}</Badge>}
                    {z.descripcion && <span className="text-muted-foreground">— {z.descripcion}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Productos usados */}
          {nota.productos_usados && nota.productos_usados.length > 0 && (
            <div className="space-y-1.5">
              <SectionTitle icon={<Pill className="h-3.5 w-3.5" />} label="Productos usados" />
              <div className="space-y-1">
                {nota.productos_usados.map((p, i) => (
                  <div key={i} className="text-sm flex flex-wrap gap-x-3 gap-y-0.5">
                    <span className="font-medium">{p.nombre}</span>
                    {p.marca && <span className="text-muted-foreground">{p.marca}</span>}
                    {p.lote  && <span className="text-muted-foreground text-xs">Lote: {p.lote}</span>}
                    {p.cantidad && p.unidad && (
                      <Badge variant="secondary" className="text-xs">{p.cantidad} {p.unidad}</Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Técnica */}
          {nota.tecnica && (
            <div className="space-y-1">
              <SectionTitle icon={<Wrench className="h-3.5 w-3.5" />} label="Técnica" />
              <p className="text-sm">{nota.tecnica}</p>
            </div>
          )}

          {/* Reacciones adversas */}
          {nota.reacciones_adversas && (
            <Section label="Reacciones adversas">{nota.reacciones_adversas}</Section>
          )}

          {/* Cuidados post */}
          {nota.cuidados_post && (
            <Section label="Cuidados post-procedimiento">{nota.cuidados_post}</Section>
          )}

          {/* Próxima cita */}
          {nota.proxima_cita_sugerida && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Próxima cita</span>
              <Badge variant="outline">{nota.proxima_cita_sugerida}</Badge>
            </div>
          )}

          {nota.plan_manejo  && <Section label="Plan de manejo">{nota.plan_manejo}</Section>}
          {nota.observaciones && <Section label="Observaciones">{nota.observaciones}</Section>}

          {/* Fotos */}
          {nota.fotos?.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fotografías</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {nota.fotos.map((foto) => (
                  <a key={foto.id} href={resolveMediaUrl(foto.url_firmada) ?? '#'} target="_blank" rel="noopener noreferrer">
                    <div className="relative aspect-square rounded-md overflow-hidden border bg-muted/30 hover:opacity-90 transition-opacity">
                      <img
                        src={resolveMediaUrl(foto.url_firmada) ?? ''}
                        alt={foto.descripcion ?? foto.tipo}
                        className="object-cover w-full h-full"
                      />
                      <div className="absolute bottom-0 left-0 right-0 bg-black/40 px-1.5 py-0.5 flex justify-between">
                        <p className="text-white text-xs capitalize">{foto.tipo}</p>
                        {foto.zona && <p className="text-white/80 text-xs">{foto.zona}</p>}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SectionTitle({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
      {icon}
      {label}
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm text-foreground whitespace-pre-line">{children}</p>
    </div>
  )
}
