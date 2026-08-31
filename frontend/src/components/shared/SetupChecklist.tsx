'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import {
  CheckCircle2, Circle, ArrowRight, Rocket,
  Building2, MapPin, Users, Stethoscope, FileText,
} from 'lucide-react'
import { clinicasApi } from '@/lib/api/clinicas'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'

const ITEM_ICONS: Record<string, React.ElementType> = {
  clinica:        Building2,
  sedes:          MapPin,
  usuarios:       Users,
  servicios:      Stethoscope,
  consentimientos: FileText,
}

export function useSetupChecklist() {
  const { user, hasCheckedAuth } = useAuthStore()
  const enabled = !!(hasCheckedAuth && user && user.rol === 'admin' && user.clinica_id)

  const { data, isLoading } = useQuery({
    queryKey: ['setup-checklist'],
    queryFn: clinicasApi.setupChecklist,
    enabled,
    staleTime: 0,
  })

  const allDone = !data || data.items.every(i => i.completado)
  return { data, isLoading, enabled, allDone }
}

export function SetupChecklist() {
  const { data, isLoading, enabled, allDone } = useSetupChecklist()

  if (!enabled || isLoading || !data || allDone) return null

  const doneCount = data.items.filter(i => i.completado).length

  return (
    <div className="bg-white rounded-xl border border-primary/20 shadow-sm overflow-hidden h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3.5 border-b bg-primary/5">
        <div className="h-7 w-7 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
          <Rocket className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-sm leading-tight">Configura tu clínica</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {doneCount} de {data.items.length} completados
          </p>
        </div>
        {/* Progress dots */}
        <div className="flex gap-1 shrink-0">
          {data.items.map(item => (
            <div
              key={item.key}
              className={cn(
                'h-1.5 w-4 rounded-full transition-colors',
                item.completado ? 'bg-primary' : 'bg-gray-200'
              )}
            />
          ))}
        </div>
      </div>

      {/* Items */}
      <div className="divide-y divide-gray-50 flex-1">
        {data.items.map(item => {
          const Icon = ITEM_ICONS[item.key] ?? Circle
          return (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-4 py-2.5 transition-colors group',
                item.completado
                  ? 'opacity-50 hover:opacity-70 hover:bg-gray-50/50'
                  : 'hover:bg-primary/5'
              )}
            >
              {/* Item icon */}
              <div className={cn(
                'h-7 w-7 rounded-lg flex items-center justify-center shrink-0 transition-colors',
                item.completado
                  ? 'bg-primary/10'
                  : 'bg-gray-100 group-hover:bg-primary/10'
              )}>
                <Icon className={cn(
                  'h-3.5 w-3.5 transition-colors',
                  item.completado ? 'text-primary' : 'text-gray-400 group-hover:text-primary'
                )} />
              </div>

              <span className={cn(
                'flex-1 text-sm',
                item.completado ? 'line-through text-muted-foreground' : 'font-medium'
              )}>
                {item.label}
              </span>

              {item.completado ? (
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
              ) : (
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
