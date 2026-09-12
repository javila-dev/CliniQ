'use client'

import { AlertTriangle } from 'lucide-react'

import type { AreaAyuda, CategoriaAyuda, EstadoArticulo } from '@/types/ayuda'
import { AREAS_AYUDA } from '@/types/ayuda'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { VideoEmbed } from '@/components/ayuda/VideoEmbed'

export interface ArticuloFormState {
  categoria: string
  titulo: string
  slug: string
  resumen: string
  contenido: string
  video_url: string
  keywords: string
  area: AreaAyuda
  destacado: boolean
  estado: EstadoArticulo
}

interface Props {
  value: ArticuloFormState
  onPatch: (patch: Partial<ArticuloFormState>) => void
  categorias: CategoriaAyuda[]
  slugPublicado: string | null
}

export function MetadataPanel({ value, onPatch, categorias, slugPublicado }: Props) {
  const slugCambiado = !!slugPublicado && value.slug !== slugPublicado

  return (
    <div className="space-y-5 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
        <div>
          <p className="text-sm font-medium">{value.estado === 'publicado' ? 'Publicado' : 'Borrador'}</p>
          <p className="text-xs text-muted-foreground">
            {value.estado === 'publicado' ? 'Visible para todo el staff.' : 'Solo visible en gestión.'}
          </p>
        </div>
        <Switch
          checked={value.estado === 'publicado'}
          onCheckedChange={(v) => onPatch({ estado: v ? 'publicado' : 'borrador' })}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Categoría *</Label>
        <Select value={value.categoria} onValueChange={(v) => onPatch({ categoria: v })}>
          <SelectTrigger><SelectValue placeholder="Elegir categoría" /></SelectTrigger>
          <SelectContent>
            {categorias.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Área</Label>
        <Select value={value.area || 'ninguna'} onValueChange={(v) => onPatch({ area: v === 'ninguna' ? '' : (v as AreaAyuda) })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ninguna">Sin área</SelectItem>
            {AREAS_AYUDA.map((a) => (
              <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Slug</Label>
        <Input
          value={value.slug}
          onChange={(e) => onPatch({ slug: e.target.value })}
          placeholder="se-genera-del-titulo"
        />
        {slugCambiado && (
          <p className="flex items-start gap-1.5 text-xs text-amber-600">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            Cambiar el slug de un artículo publicado rompe los enlaces existentes.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Resumen</Label>
        <Textarea
          value={value.resumen}
          onChange={(e) => onPatch({ resumen: e.target.value })}
          rows={2}
          maxLength={300}
          placeholder="Frase corta para las tarjetas y la búsqueda."
        />
      </div>

      <div className="space-y-1.5">
        <Label>Palabras clave</Label>
        <Input
          value={value.keywords}
          onChange={(e) => onPatch({ keywords: e.target.value })}
          placeholder="agenda, cita, turno"
        />
        <p className="text-xs text-muted-foreground">Separadas por coma. Ayudan en la búsqueda.</p>
      </div>

      <div className="space-y-1.5">
        <Label>Video (YouTube / Vimeo)</Label>
        <Input
          value={value.video_url}
          onChange={(e) => onPatch({ video_url: e.target.value })}
          placeholder="https://youtu.be/…"
        />
        {value.video_url && <VideoEmbed url={value.video_url} className="mt-2" />}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <Label>Destacado</Label>
          <p className="text-xs text-muted-foreground">Aparece en la portada del centro de ayuda.</p>
        </div>
        <Switch checked={value.destacado} onCheckedChange={(v) => onPatch({ destacado: v })} />
      </div>
    </div>
  )
}
