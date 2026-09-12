import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'
import { HelpButton } from '@/components/ayuda/HelpButton'

interface PageHeaderProps {
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
  backHref?: string
  /** Slug de un artículo del centro de ayuda: agrega un "?" junto al título. */
  helpSlug?: string
}

export function PageHeader({ title, description, action, className, backHref, helpSlug }: PageHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4 mb-6', className)}>
      <div>
        {backHref && (
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver
          </Link>
        )}
        <div className="flex items-center gap-1.5">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
          {helpSlug && <HelpButton slug={helpSlug} />}
        </div>
        {description && (
          typeof description === 'string'
            ? <p className="text-sm text-muted-foreground mt-1">{description}</p>
            : <div className="mt-1">{description}</div>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
