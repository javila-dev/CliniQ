import { redirect } from 'next/navigation'

// Los recordatorios ahora se configuran en Configuración → Agenda y pacientes.
export default function RecordatoriosRedirect() {
  redirect('/configuracion/agenda')
}
