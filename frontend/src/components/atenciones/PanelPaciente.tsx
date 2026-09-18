'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, User, Stethoscope, IdCard } from 'lucide-react'
import Link from 'next/link'
import { historiaClinicaApi } from '@/lib/api/historiaClinica'
import { cotizacionesApi } from '@/lib/api/cotizaciones'
import { agendaApi } from '@/lib/api/agenda'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TabDatosGenerales } from '@/components/historia/TabDatosGenerales'
import { formatDate } from '@/lib/utils'
import type { Paciente } from '@/types/pacientes'
import type { Cita } from '@/types/agenda'
import type { HistoriaClinica } from '@/types/historia'

interface PanelPacienteProps {
  paciente: Paciente
  cita: Cita
  historia?: HistoriaClinica
  totalNotas?: number
  totalFotos?: number
  /** Respeta el toggle de configuración de la clínica para este tab/sección. */
  mostrarDatosGenerales?: boolean
}

function calcularEdad(fechaNacimiento: string | null): string {
  if (!fechaNacimiento) return '—'
  const hoy = new Date()
  const nac = new Date(fechaNacimiento)
  const edad = hoy.getFullYear() - nac.getFullYear()
  const m = hoy.getMonth() - nac.getMonth()
  return String(m < 0 || (m === 0 && hoy.getDate() < nac.getDate()) ? edad - 1 : edad) + ' años'
}

export function PanelPaciente({
  paciente, cita, historia, totalNotas = 0, totalFotos = 0, mostrarDatosGenerales = true,
}: PanelPacienteProps) {
  const [datosOpen, setDatosOpen] = useState(false)

  const { data: antecedentes } = useQuery({
    queryKey: ['antecedentes', paciente.id],
    queryFn: () => historiaClinicaApi.antecedentes.get(paciente.id),
    retry: false,
  })

  const { data: citasPaciente } = useQuery({
    queryKey: ['citas-paciente', paciente.id],
    queryFn: () => agendaApi.citas.list({ paciente: paciente.id, page_size: 10 }),
    enabled: Boolean(paciente.id),
  })
  const visitasAnteriores = (citasPaciente?.results ?? [])
    .filter((c) => c.id !== cita.id && c.estado === 'completada')
    .slice(0, 4)

  const cotizacionId = cita.cotizacion_resumen?.cotizacion_id
  const { data: sesionesCotizacion } = useQuery({
    queryKey: ['cotizacion-sesiones', cotizacionId],
    queryFn: () => cotizacionesApi.sesiones(cotizacionId!),
    enabled: Boolean(cotizacionId),
  })
  const itemSesiones = sesionesCotizacion?.items.find(
    (i) => i.item_id === cita.item_cotizacion_id
  )

  // Para tratamientos, num_citas en cotizacion_resumen siempre es 1 (cantidad del paquete).
  // El total real de sesiones viene del endpoint /cotizaciones/{id}/sesiones/.
  const totalSesionesContratadas = itemSesiones?.num_citas ?? cita.cotizacion_resumen?.num_citas ?? 0
  const citasRestantes = itemSesiones?.citas_restantes ?? cita.cotizacion_resumen?.citas_restantes ?? 0
  const citasAgendadas = itemSesiones?.citas_agendadas ?? cita.cotizacion_resumen?.citas_agendadas ?? 0
  const sesionesUsadas = Math.max(0, totalSesionesContratadas - citasRestantes)
  const sesionActual = totalSesionesContratadas > 0
    ? Math.min(totalSesionesContratadas, Math.max(1, sesionesUsadas || citasAgendadas || 1))
    : 0
  const progresoSesionesPct = totalSesionesContratadas > 0
    ? Math.min(100, Math.round((sesionesUsadas / totalSesionesContratadas) * 100))
    : 0

  const initials = paciente.nombre_completo
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase()

  const tieneAlertas =
    (antecedentes?.personales?.alergicos && antecedentes.personales.alergicos.trim()) ||
    (antecedentes?.personales?.contraindicaciones && antecedentes.personales.contraindicaciones.trim())

  return (
    <>
      <div className="p-4 space-y-4">
        {/* Avatar + datos básicos */}
        <div className="flex flex-col items-center text-center pt-2">
          <div className="h-14 w-14 rounded-full bg-rose-100 text-rose-600 font-semibold text-lg flex items-center justify-center mb-2">
            {initials}
          </div>
          <p className="font-semibold text-sm leading-tight">{paciente.nombre_completo}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{calcularEdad(paciente.fecha_nacimiento)}</p>
          {historia && mostrarDatosGenerales && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 mt-2.5 text-xs"
              onClick={() => setDatosOpen(true)}
            >
              <IdCard className="h-3.5 w-3.5 mr-1.5" />
              Datos generales
            </Button>
          )}
        </div>

        {/* Progreso de cotización */}
        {cita.cotizacion_resumen && (
          <Link
            href={'/cotizaciones/' + cita.cotizacion_resumen.cotizacion_id}
            className="block rounded-lg border bg-white p-3 shadow-sm space-y-2 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
          >
            <p className="text-xs font-medium leading-snug line-clamp-2">
              {cita.cotizacion_resumen.descripcion}
            </p>
            {totalSesionesContratadas > 0 && (
              <>
                <div className="flex items-end justify-between gap-3 pt-1">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Sesión actual</p>
                    <p className="text-2xl font-semibold leading-none tabular-nums">
                      {sesionActual}
                      <span className="text-sm font-medium text-muted-foreground">/{totalSesionesContratadas}</span>
                    </p>
                  </div>
                  <div className="text-right text-[11px] text-muted-foreground space-y-0.5">
                    <p>{citasAgendadas} agendada{citasAgendadas !== 1 ? 's' : ''}</p>
                    <p>{citasRestantes} restante{citasRestantes !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: progresoSesionesPct + '%' }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Esta atención corresponde a la sesión {sesionActual} de {totalSesionesContratadas} contratada{totalSesionesContratadas !== 1 ? 's' : ''}.
                </p>
              </>
            )}
          </Link>
        )}

        {/* Alertas */}
        {tieneAlertas ? (
          <div className="rounded-md bg-amber-50 border border-amber-200 p-3 space-y-1.5">
            <div className="flex items-center gap-1.5 text-amber-700 font-medium text-xs uppercase tracking-wide">
              <AlertTriangle className="h-3.5 w-3.5" />
              Alertas clínicas
            </div>
            {antecedentes?.personales?.alergicos && (
              <div>
                <p className="text-xs font-medium text-amber-800">Alergias</p>
                <p className="text-xs text-amber-700">{antecedentes.personales.alergicos}</p>
              </div>
            )}
            {antecedentes?.personales?.contraindicaciones && (
              <div>
                <p className="text-xs font-medium text-amber-800">Contraindicaciones</p>
                <p className="text-xs text-amber-700">{antecedentes.personales.contraindicaciones}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-md border border-dashed p-3 text-center">
            <p className="text-xs text-muted-foreground">Sin alertas registradas</p>
          </div>
        )}

        {/* Mini timeline visitas anteriores */}
        {visitasAnteriores.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Últimas visitas</p>
            <div className="space-y-1">
              {visitasAnteriores.map((v) => (
                <div key={v.id} className="flex items-start gap-2 text-xs">
                  <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 mt-1.5 shrink-0" />
                  <div>
                    <p className="text-foreground uppercase">{v.servicio_nombre}</p>
                    <p className="text-muted-foreground">{formatDate(v.fecha_inicio)}</p>
                  </div>
                </div>
              ))}
            </div>
            <Button variant="ghost" size="sm" className="w-full h-7 text-xs" asChild>
              <Link href={`/pacientes/${paciente.id}/historia`} target="_blank" rel="noopener noreferrer">
                <Stethoscope className="h-3 w-3 mr-1" />
                Historia completa
              </Link>
            </Button>
          </div>
        )}

        {/* Sin historial */}
        {citasPaciente && visitasAnteriores.length === 0 && (
          <div className="text-center pt-2">
            <User className="h-6 w-6 text-muted-foreground/30 mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">Primera visita</p>
          </div>
        )}
      </div>

      {historia && mostrarDatosGenerales && (
        <Dialog open={datosOpen} onOpenChange={setDatosOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Datos generales — {paciente.nombre_completo}</DialogTitle>
            </DialogHeader>
            <TabDatosGenerales
              paciente={paciente}
              historia={historia}
              antecedentes={antecedentes}
              totalNotas={totalNotas}
              totalFotos={totalFotos}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
