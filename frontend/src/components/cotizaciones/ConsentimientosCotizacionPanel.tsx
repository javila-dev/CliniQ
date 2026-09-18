'use client'

import { useState } from 'react'
import { CheckCircle2, FileText, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn, formatFechaLocal } from '@/lib/utils'
import type { ConsentimientoRequeridoCotizacion } from '@/lib/api/cotizaciones'

interface Props {
  consentimientos: ConsentimientoRequeridoCotizacion[]
  canFirmar: boolean
  onFirmar: () => void
  className?: string
}

export function ConsentimientosCotizacionPanel({ consentimientos, canFirmar, onFirmar, className }: Props) {
  const [listadoOpen, setListadoOpen] = useState(false)

  const firmados = consentimientos.filter((c) => c.estado === 'firmado')
  const pendientes = consentimientos.filter((c) => c.estado === 'pendiente')
  const todosFirmados = pendientes.length === 0

  const tone = todosFirmados
    ? { badge: 'bg-green-50 text-green-700 ring-green-200/60', dot: 'bg-green-500' }
    : { badge: 'bg-amber-50 text-amber-700 ring-amber-200/60', dot: 'bg-amber-500' }
  const label = todosFirmados
    ? 'Firmado'
    : pendientes.length === 1 ? '1 pendiente' : `${pendientes.length} pendientes`

  return (
    <>
      <div className={cn('bg-white rounded-xl border p-4 flex items-center justify-between gap-3', className)}>
        <div className="flex items-center gap-2.5 min-w-0">
          <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium">Consentimientos informados</p>
            <p className="text-xs text-muted-foreground">
              {todosFirmados
                ? `${firmados.length} de ${consentimientos.length} firmados`
                : `${firmados.length} de ${consentimientos.length} firmados — faltan ${pendientes.length}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn('inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ring-1', tone.badge)}>
            <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} />
            {label}
          </span>
          {!todosFirmados && canFirmar && (
            <Button variant="outline" size="sm" onClick={onFirmar}>
              Firmar ahora
            </Button>
          )}
          {firmados.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setListadoOpen(true)}>
              <FileText className="h-3.5 w-3.5 mr-1.5" />
              {todosFirmados ? 'Ver PDF' : 'Ver firmados'}
            </Button>
          )}
        </div>
      </div>

      <Dialog open={listadoOpen} onOpenChange={setListadoOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4.5 w-4.5 text-primary" />
              Consentimientos firmados
            </DialogTitle>
          </DialogHeader>

          <ul className="divide-y rounded-xl border">
            {firmados.map((c) => (
              <li key={c.template_token} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{c.template_nombre}</p>
                    <p className="text-xs text-muted-foreground">Requerido por: {c.procedimiento}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.fecha_firma ? `Firmado el ${formatFechaLocal(c.fecha_firma)}` : 'Firmado'}
                      {c.fecha_vencimiento ? ` · vigente hasta ${formatFechaLocal(c.fecha_vencimiento)}` : ''}
                      {c.origen === 'manual' ? ' · registro manual' : ''}
                    </p>
                  </div>
                </div>
                {c.archivo_url ? (
                  <Button variant="outline" size="sm" className="shrink-0" asChild>
                    <a href={c.archivo_url} target="_blank" rel="noopener noreferrer">
                      <FileText className="h-3.5 w-3.5 mr-1.5" />
                      Ver PDF
                    </a>
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground shrink-0">PDF no disponible</span>
                )}
              </li>
            ))}
          </ul>

          {!todosFirmados && (
            <p className="text-xs text-amber-700">
              Faltan {pendientes.length} consentimiento{pendientes.length > 1 ? 's' : ''} por firmar.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
