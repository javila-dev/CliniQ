import { redirect } from 'next/navigation'

// Las pestañas de la historia ahora se configuran junto con las de la atención.
export default function ConfiguracionHistoriaClinicaPage() {
  redirect('/configuracion/atencion')
}
