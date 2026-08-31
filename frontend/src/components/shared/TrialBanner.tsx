'use client'

import { useEffect, useState } from 'react'
import { Clock, AlertTriangle } from 'lucide-react'
import { clinicasApi } from '@/lib/api/clinicas'
import { useAuthStore } from '@/store/authStore'
import { isSuperAdmin } from '@/lib/permissions'
import { cn } from '@/lib/utils'

export function TrialBanner() {
  const { user, hasCheckedAuth } = useAuthStore()
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null)

  useEffect(() => {
    if (!hasCheckedAuth || !user || isSuperAdmin(user) || !user.clinica_id) return

    clinicasApi.miClinica().then((clinica) => {
      if (typeof clinica.trial_days_remaining === 'number') {
        setDaysRemaining(clinica.trial_days_remaining)
      }
    }).catch(() => {})
  }, [hasCheckedAuth, user])

  if (daysRemaining === null) return null

  const expired = daysRemaining === 0
  const urgent = daysRemaining <= 3

  return (
    <div className={cn(
      'flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium',
      expired  && 'bg-destructive text-destructive-foreground',
      !expired && urgent  && 'bg-amber-500 text-white',
      !expired && !urgent && 'bg-amber-400/20 text-amber-700 border-b border-amber-400/30',
    )}>
      {expired
        ? <AlertTriangle className="h-4 w-4 shrink-0" />
        : <Clock className="h-4 w-4 shrink-0" />
      }
      <span>
        {expired
          ? 'Tu período de prueba ha vencido. Contacta a soporte para activar tu plan.'
          : daysRemaining === 1
            ? 'Tu período de prueba vence hoy.'
            : `Te quedan ${daysRemaining} días de prueba gratuita.`
        }
      </span>
    </div>
  )
}
