import { redirect } from 'next/navigation'

export default function ServiciosRedirect() {
  redirect('/catalogo?tab=procedimientos')
}
