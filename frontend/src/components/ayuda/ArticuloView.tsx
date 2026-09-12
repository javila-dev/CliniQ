'use client'

import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'

import { cn } from '@/lib/utils'
import { VideoEmbed } from './VideoEmbed'

// scroll-mt-24: al saltar a un ancla (#id) desde el índice, deja aire arriba
// en vez de pegar el encabezado al borde de la pantalla.
const MD_COMPONENTS: Components = {
  h1: ({ children, id }) => <h1 id={id} className="mt-8 mb-3 scroll-mt-24 text-2xl font-bold tracking-tight text-foreground first:mt-0">{children}</h1>,
  h2: ({ children, id }) => <h2 id={id} className="mt-8 mb-3 scroll-mt-24 text-xl font-semibold tracking-tight text-foreground first:mt-0">{children}</h2>,
  h3: ({ children, id }) => <h3 id={id} className="mt-6 mb-2 scroll-mt-24 text-base font-semibold text-foreground first:mt-0">{children}</h3>,
  p: ({ children }) => <p className="my-3 leading-7 text-[15px] text-foreground/90">{children}</p>,
  ul: ({ children }) => <ul className="my-3 ml-5 list-disc space-y-1.5 text-[15px] text-foreground/90 marker:text-muted-foreground">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 ml-5 list-decimal space-y-1.5 text-[15px] text-foreground/90 marker:text-muted-foreground">{children}</ol>,
  li: ({ children }) => <li className="leading-7">{children}</li>,
  a: ({ children, href }) => (
    <a
      href={href}
      target={href?.startsWith('http') ? '_blank' : undefined}
      rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
      className="font-medium text-rose-600 underline underline-offset-2 hover:text-rose-700"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  blockquote: ({ children }) => (
    <blockquote className="my-4 border-l-2 border-rose-300 bg-rose-50/50 py-1 pl-4 text-[15px] text-foreground/80">
      {children}
    </blockquote>
  ),
  code: ({ className, children }) => {
    const isBlock = (className ?? '').includes('language-')
    if (isBlock) {
      return <code className={cn('block', className)}>{children}</code>
    }
    return <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px] text-foreground">{children}</code>
  },
  pre: ({ children }) => (
    <pre className="my-4 overflow-x-auto rounded-lg bg-zinc-900 p-4 text-[13px] leading-6 text-zinc-100">{children}</pre>
  ),
  img: ({ src, alt }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={typeof src === 'string' ? src : ''} alt={alt ?? ''} className="my-4 rounded-lg border" loading="lazy" />
  ),
  hr: () => <hr className="my-6 border-border" />,
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-border bg-muted px-3 py-2 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border border-border px-3 py-2 align-top">{children}</td>,
}

interface ArticuloViewProps {
  contenido: string
  videoUrl?: string | null
  className?: string
}

/** Render de un artículo del centro de ayuda. Reutilizado como preview en el editor. */
export function ArticuloView({ contenido, videoUrl, className }: ArticuloViewProps) {
  return (
    <div className={cn('max-w-2xl', className)}>
      {videoUrl ? <VideoEmbed url={videoUrl} className="mb-6" /> : null}
      {contenido.trim() ? (
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]} components={MD_COMPONENTS}>
          {contenido}
        </ReactMarkdown>
      ) : (
        <p className="text-sm italic text-muted-foreground">Sin contenido todavía.</p>
      )}
    </div>
  )
}
