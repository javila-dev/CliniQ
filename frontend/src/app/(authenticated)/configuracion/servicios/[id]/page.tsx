import { redirect } from 'next/navigation'
import { use } from 'react'

export default function ServicioDetailRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  redirect(`/configuracion/procedimientos/${id}`)
}
