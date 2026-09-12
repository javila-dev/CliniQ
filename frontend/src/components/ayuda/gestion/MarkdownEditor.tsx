'use client'

import { useCallback, useRef, useState } from 'react'
import {
  Bold, Italic, Heading2, Heading3, Link2, List, ListOrdered, Quote, Code, Image as ImageIcon, Loader2,
} from 'lucide-react'

import { ayudaAdminApi } from '@/lib/api/ayuda'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

interface Props {
  value: string
  onChange: (v: string) => void
  className?: string
}

type Wrap = { before: string; after?: string; linePrefix?: string; placeholder?: string }

const ACCIONES: { icon: React.ElementType; label: string; wrap: Wrap }[] = [
  { icon: Bold, label: 'Negrita', wrap: { before: '**', after: '**', placeholder: 'texto' } },
  { icon: Italic, label: 'Itálica', wrap: { before: '_', after: '_', placeholder: 'texto' } },
  { icon: Heading2, label: 'Título', wrap: { before: '', linePrefix: '## ', placeholder: 'Título' } },
  { icon: Heading3, label: 'Subtítulo', wrap: { before: '', linePrefix: '### ', placeholder: 'Subtítulo' } },
  { icon: Link2, label: 'Enlace', wrap: { before: '[', after: '](https://)', placeholder: 'texto' } },
  { icon: List, label: 'Lista', wrap: { before: '', linePrefix: '- ', placeholder: 'elemento' } },
  { icon: ListOrdered, label: 'Lista numerada', wrap: { before: '', linePrefix: '1. ', placeholder: 'elemento' } },
  { icon: Quote, label: 'Cita', wrap: { before: '', linePrefix: '> ', placeholder: 'cita' } },
  { icon: Code, label: 'Código', wrap: { before: '`', after: '`', placeholder: 'código' } },
]

export function MarkdownEditor({ value, onChange, className }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const { toast } = useToast()
  const [subiendo, setSubiendo] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const insertar = useCallback(
    (wrap: Wrap) => {
      const el = ref.current
      if (!el) return
      const start = el.selectionStart
      const end = el.selectionEnd
      const sel = value.slice(start, end) || wrap.placeholder || ''

      let inserted: string
      if (wrap.linePrefix) {
        inserted = sel
          .split('\n')
          .map((l) => wrap.linePrefix + l)
          .join('\n')
      } else {
        inserted = `${wrap.before}${sel}${wrap.after ?? ''}`
      }
      const next = value.slice(0, start) + inserted + value.slice(end)
      onChange(next)
      requestAnimationFrame(() => {
        el.focus()
        el.selectionStart = start + (wrap.linePrefix ? 0 : wrap.before.length)
        el.selectionEnd = start + inserted.length - (wrap.after?.length ?? 0)
      })
    },
    [value, onChange],
  )

  const insertarTexto = useCallback(
    (texto: string) => {
      const el = ref.current
      const at = el ? el.selectionStart : value.length
      onChange(value.slice(0, at) + texto + value.slice(at))
    },
    [value, onChange],
  )

  const subirImagen = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) return
      setSubiendo(true)
      try {
        const { url } = await ayudaAdminApi.subirImagen(file)
        insertarTexto(`\n![${file.name.replace(/\.[^.]+$/, '')}](${url})\n`)
      } catch (e) {
        const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
        toast({ title: msg ?? 'No se pudo subir la imagen', variant: 'destructive' })
      } finally {
        setSubiendo(false)
      }
    },
    [insertarTexto, toast],
  )

  return (
    <div className={cn('flex min-h-0 flex-col rounded-xl border bg-card', className)}>
      <div className="flex flex-wrap items-center gap-0.5 border-b p-1.5">
        {ACCIONES.map((a) => (
          <button
            key={a.label}
            type="button"
            title={a.label}
            onClick={() => insertar(a.wrap)}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <a.icon className="h-4 w-4" />
          </button>
        ))}
        <label
          title="Insertar imagen"
          className="cursor-pointer rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {subiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void subirImagen(f)
              e.target.value = ''
            }}
          />
        </label>
      </div>

      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPaste={(e) => {
          const img = Array.from(e.clipboardData.items).find((it) => it.type.startsWith('image/'))
          if (img) {
            const file = img.getAsFile()
            if (file) { e.preventDefault(); void subirImagen(file) }
          }
        }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const file = e.dataTransfer.files?.[0]
          if (file) void subirImagen(file)
        }}
        placeholder="Escribe el artículo en Markdown. Arrastra o pega una imagen para subirla."
        spellCheck
        className={cn(
          'min-h-[380px] flex-1 resize-none rounded-b-xl bg-transparent p-4 font-mono text-[13px] leading-6 outline-none',
          dragOver && 'ring-2 ring-inset ring-rose-300',
        )}
      />
    </div>
  )
}
