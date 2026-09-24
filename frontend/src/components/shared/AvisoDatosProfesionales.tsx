'use client'

import Link from 'next/link'
import { PenLine } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Quien atiende pacientes necesita su firma: firma los consentimientos en la primera atención
 * (sin ella no puede iniciarla) y las órdenes médicas. La TP no se exige aquí: no todo el
 * personal la tiene y solo la piden los consentimientos que incluyen ese campo. */
export function AvisoDatosProfesionales({ className }: { className?: string }) {
  const user = useAuthStore(s => s.user)
  if (!user?.es_profesional || user.firma_digital_url) return null

  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3',
        className,
      )}
    >
      <div className="flex items-start gap-3 flex-1">
        <div className="h-9 w-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
          <PenLine className="h-4 w-4 text-amber-700" />
        </div>
        <div>
          <p className="text-sm font-semibold text-amber-900">Carga tu firma</p>
          <p className="text-sm text-amber-800 leading-snug">
            Como atiendes pacientes, la necesitas para firmar los consentimientos al iniciar cada primera
            atención. Sin ella no podrás iniciar esas atenciones.
          </p>
        </div>
      </div>
      <Button asChild size="sm" className="shrink-0 self-start sm:self-center">
        <Link href="/perfil">Ir a mi perfil</Link>
      </Button>
    </div>
  )
}
