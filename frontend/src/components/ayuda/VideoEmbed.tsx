'use client'

import { cn } from '@/lib/utils'

/** Deriva la URL de embed desde una URL de YouTube/Vimeo (mismo criterio que el backend). */
export function resolverEmbed(url: string): string | null {
  if (!url) return null
  let parsed: URL
  try {
    parsed = new URL(url.trim())
  } catch {
    return null
  }
  const host = parsed.hostname.replace(/^www\./, '').toLowerCase()

  if (['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com'].includes(host)) {
    if (parsed.pathname === '/watch') {
      const id = parsed.searchParams.get('v')
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null
    }
    const m = parsed.pathname.match(/^\/(?:embed|shorts|v|live)\/([\w-]{6,})/)
    return m ? `https://www.youtube-nocookie.com/embed/${m[1]}` : null
  }
  if (host === 'youtu.be') {
    const id = parsed.pathname.replace(/^\//, '').split('/')[0]
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const m = parsed.pathname.match(/(\d{6,})/)
    return m ? `https://player.vimeo.com/video/${m[1]}` : null
  }
  return null
}

interface VideoEmbedProps {
  /** URL original de YouTube/Vimeo, o directamente la URL de embed que da el backend. */
  url: string | null | undefined
  title?: string
  className?: string
}

export function VideoEmbed({ url, title = 'Video de ayuda', className }: VideoEmbedProps) {
  const src = url
    ? url.includes('/embed/') || url.includes('player.vimeo.com')
      ? url
      : resolverEmbed(url)
    : null

  if (!src) return null

  return (
    <div className={cn('relative w-full overflow-hidden rounded-xl border bg-black aspect-video', className)}>
      <iframe
        src={src}
        title={title}
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="absolute inset-0 h-full w-full"
      />
    </div>
  )
}
