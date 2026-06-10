'use client'

import Link from 'next/link'
import { Edit, Phone, Mail, FileText, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import { SignosVitalesWidget } from './SignosVitalesWidget'
import type { Paciente } from '@/types/pacientes'
import type { HistoriaClinica, AntecedentePaciente } from '@/types/historia'

const TIPO_DOC_LABELS: Record<string, string> = {
  CC: 'Cédula de ciudadanía', CE: 'Cédula de extranjería',
  PA: 'Pasaporte', TI: 'Tarjeta de identidad', NIT: 'NIT',
}
const SEXO_LABELS: Record<string, string> = { M: 'Masculino', F: 'Femenino', O: 'Otro' }

const FITZPATRICK_LABELS: Record<string, string> = {
  I:   'Tipo I — Siempre se quema, nunca se broncea',
  II:  'Tipo II — Usualmente se quema, poco bronceado',
  III: 'Tipo III — Algunas veces se quema, bronceado uniforme',
  IV:  'Tipo IV — Rara vez se quema, siempre se broncea',
  V:   'Tipo V — Muy rara vez se quema, bronceado oscuro',
  VI:  'Tipo VI — Nunca se quema, pigmentación profunda',
}

const ESTADO_CIVIL_LABELS: Record<string, string> = {
  soltero: 'Soltero/a', casado: 'Casado/a', union_libre: 'Unión libre',
  separado: 'Separado/a', divorciado: 'Divorciado/a', viudo: 'Viudo/a',
}
const ESCOLARIDAD_LABELS: Record<string, string> = {
  ninguna: 'Sin escolaridad', primaria: 'Primaria', secundaria: 'Secundaria',
  tecnico: 'Técnico/Tecnólogo', universitario: 'Universitario', posgrado: 'Posgrado',
}
const ETNIA_LABELS: Record<string, string> = {
  mestizo: 'Mestizo', blanco: 'Blanco', afrocolombiano: 'Afrocolombiano',
  indigena: 'Indígena', raizal: 'Raizal', rom: 'ROM/Gitano', otro: 'Otro',
}
const TIPO_AFILIADO_LABELS: Record<string, string> = {
  cotizante: 'Cotizante', beneficiario: 'Beneficiario', independiente: 'Independiente',
  subsidiado: 'Subsidiado', vinculado: 'Vinculado',
}
const REGIMEN_LABELS: Record<string, string> = {
  contributivo: 'Contributivo', subsidiado: 'Subsidiado', vinculado: 'Vinculado',
  especial: 'Especial/Excepción', pensionado: 'Pensionado',
}

function calcularEdad(fechaNacimiento: string | null): string {
  if (!fechaNacimiento) return '—'
  const hoy = new Date()
  const nac = new Date(fechaNacimiento)
  let edad = hoy.getFullYear() - nac.getFullYear()
  const m = hoy.getMonth() - nac.getMonth()
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--
  return `${edad} años`
}

function Fila({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b last:border-0">
      <span className="text-xs text-muted-foreground w-40 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm">{value || <span className="text-muted-foreground/50 italic">No registrado</span>}</span>
    </div>
  )
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-4 space-y-0">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</p>
        {action}
      </div>
      {children}
    </div>
  )
}

interface TabDatosGeneralesProps {
  paciente: Paciente
  historia: HistoriaClinica
  antecedentes: AntecedentePaciente | undefined
  totalNotas: number
  totalFotos: number
}

export function TabDatosGenerales({ paciente, historia, antecedentes, totalNotas, totalFotos }: TabDatosGeneralesProps) {
  const editBtn = (
    <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
      <Link href={`/pacientes/${paciente.id}/editar`}>
        <Edit className="h-3 w-3 mr-1" />
        Editar
      </Link>
    </Button>
  )

  const tieneResidencia = paciente.direccion || paciente.ciudad || paciente.barrio
  const tieneSocioeconomico = paciente.estado_civil || paciente.ocupacion || paciente.escolaridad || paciente.grupo_etnico
  const tieneSalud = paciente.grupo_sanguineo || paciente.eps || paciente.tipo_afiliado || paciente.regimen
  const tieneResponsable = paciente.nombre_responsable

  return (
    <div className="space-y-6 max-w-2xl">

      {/* Identificación */}
      <Section title="Identificación" action={editBtn}>
        <Fila label="Nombre completo" value={paciente.nombre_completo} />
        <Fila
          label="Documento"
          value={`${TIPO_DOC_LABELS[paciente.tipo_documento] ?? paciente.tipo_documento} ${paciente.numero_documento}`}
        />
        <Fila label="Sexo" value={SEXO_LABELS[paciente.sexo] ?? paciente.sexo} />
        <Fila
          label="Fecha de nacimiento"
          value={paciente.fecha_nacimiento
            ? `${formatDate(paciente.fecha_nacimiento)} (${calcularEdad(paciente.fecha_nacimiento)})`
            : null}
        />
      </Section>

      {/* Contacto */}
      <Section title="Contacto">
        <Fila label={<><Phone className="h-3 w-3 inline mr-1" />Teléfono</>} value={paciente.telefono} />
        <Fila label={<><Mail className="h-3 w-3 inline mr-1" />Email</>} value={paciente.email} />
        <Fila
          label="Canal de confirmación"
          value={<Badge variant="outline" className="text-xs capitalize">{paciente.canal_confirmacion}</Badge>}
        />
      </Section>

      {/* Residencia */}
      {tieneResidencia && (
        <Section title="Residencia">
          <Fila label="Dirección" value={paciente.direccion} />
          <Fila label="Ciudad / Municipio" value={paciente.ciudad} />
          <Fila label="Barrio" value={paciente.barrio} />
        </Section>
      )}

      {/* Perfil socioeconómico */}
      {tieneSocioeconomico && (
        <Section title="Perfil socioeconómico">
          {paciente.estado_civil && (
            <Fila label="Estado civil" value={ESTADO_CIVIL_LABELS[paciente.estado_civil] ?? paciente.estado_civil} />
          )}
          {paciente.ocupacion && (
            <Fila label="Ocupación" value={paciente.ocupacion} />
          )}
          {paciente.escolaridad && (
            <Fila label="Escolaridad" value={ESCOLARIDAD_LABELS[paciente.escolaridad] ?? paciente.escolaridad} />
          )}
          {paciente.grupo_etnico && (
            <Fila label="Grupo étnico" value={ETNIA_LABELS[paciente.grupo_etnico] ?? paciente.grupo_etnico} />
          )}
        </Section>
      )}

      {/* Salud y seguridad social */}
      {tieneSalud && (
        <Section title="Salud y seguridad social">
          {paciente.grupo_sanguineo && (
            <Fila label="Grupo sanguíneo" value={
              <Badge variant="secondary" className="text-xs font-bold">{paciente.grupo_sanguineo}</Badge>
            } />
          )}
          {paciente.eps && <Fila label="EPS / Aseguradora" value={paciente.eps} />}
          {paciente.tipo_afiliado && (
            <Fila label="Tipo de afiliado" value={TIPO_AFILIADO_LABELS[paciente.tipo_afiliado] ?? paciente.tipo_afiliado} />
          )}
          {paciente.regimen && (
            <Fila label="Régimen SGSSS" value={REGIMEN_LABELS[paciente.regimen] ?? paciente.regimen} />
          )}
        </Section>
      )}

      {/* Responsable */}
      {tieneResponsable && (
        <Section title="Responsable / acompañante">
          <Fila
            label={<><Users className="h-3 w-3 inline mr-1" />Nombre</>}
            value={
              <span>
                {paciente.nombre_responsable}
                {paciente.parentesco_responsable && (
                  <span className="text-muted-foreground ml-1">({paciente.parentesco_responsable})</span>
                )}
              </span>
            }
          />
          {paciente.telefono_responsable && (
            <Fila label="Teléfono" value={paciente.telefono_responsable} />
          )}
        </Section>
      )}

      {/* Clasificación de piel */}
      {antecedentes?.personales?.tipo_piel && (
        <Section title="Clasificación de piel">
          <Fila
            label="Escala Fitzpatrick"
            value={
              <span>
                <Badge variant="secondary" className="mr-2">Fitzpatrick {antecedentes.personales.tipo_piel}</Badge>
                {FITZPATRICK_LABELS[antecedentes.personales.tipo_piel]}
              </span>
            }
          />
        </Section>
      )}

      {/* Signos vitales */}
      <SignosVitalesWidget pacienteId={paciente.id} />

      {/* Resumen historia */}
      <Section title="Resumen historia clínica">
        <Fila label={<><FileText className="h-3 w-3 inline mr-1" />Apertura</>} value={formatDate(historia.created_at)} />
        <Fila label="Total notas" value={`${totalNotas} nota${totalNotas !== 1 ? 's' : ''}`} />
        <Fila label="Total fotos" value={`${totalFotos} foto${totalFotos !== 1 ? 's' : ''}`} />
        <Fila
          label="Autoriza datos"
          value={
            <Badge variant={paciente.autoriza_datos ? 'default' : 'secondary'} className="text-xs">
              {paciente.autoriza_datos ? 'Sí' : 'No'}
            </Badge>
          }
        />
      </Section>
    </div>
  )
}
