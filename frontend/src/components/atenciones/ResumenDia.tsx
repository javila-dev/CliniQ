import { CheckCircle, Clock, PlayCircle, CalendarDays } from 'lucide-react'
import type { Cita } from '@/types/agenda'

interface ResumenDiaProps {
  citas: Cita[]
  enCursoAnteriores?: number
}

const stats = (total: number, completadas: number, enCurso: number, pendientes: number) => [
  {
    label: 'Total hoy',
    value: total,
    icon: CalendarDays,
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    iconBg: 'bg-slate-100',
    iconColor: 'text-slate-500',
    valueColor: 'text-slate-800',
  },
  {
    label: 'Completadas',
    value: completadas,
    icon: CheckCircle,
    bg: 'bg-green-50',
    border: 'border-green-200',
    iconBg: 'bg-green-100',
    iconColor: 'text-green-600',
    valueColor: 'text-green-700',
  },
  {
    label: 'En atención',
    value: enCurso,
    icon: PlayCircle,
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    iconBg: 'bg-rose-100',
    iconColor: 'text-rose-500',
    valueColor: 'text-rose-600',
  },
  {
    label: 'Pendientes',
    value: pendientes,
    icon: Clock,
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    valueColor: 'text-amber-700',
  },
]

export function ResumenDia({ citas, enCursoAnteriores = 0 }: ResumenDiaProps) {
  const total = citas.length
  const completadas = citas.filter(c => c.estado === 'completada').length
  const enCurso = citas.filter(c => c.estado === 'en_curso').length + enCursoAnteriores
  const pendientes = citas.filter(c => ['pendiente', 'confirmada'].includes(c.estado)).length

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {stats(total, completadas, enCurso, pendientes).map(({ label, value, icon: Icon, bg, border, iconBg, iconColor, valueColor }) => (
        <div key={label} className={`rounded-xl border ${border} ${bg} px-4 py-3.5 flex items-center gap-3`}>
          <div className={`flex items-center justify-center h-9 w-9 rounded-lg ${iconBg} shrink-0`}>
            <Icon className={`h-4.5 w-4.5 ${iconColor}`} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground leading-none mb-1">{label}</p>
            <p className={`text-2xl font-bold leading-none ${valueColor}`}>{value}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
