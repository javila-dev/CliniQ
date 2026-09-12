'use client'

import { use, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  params: Promise<{ slug: string }>
}

// El listado por categoría ahora vive en /ayuda con el tema seleccionado en
// la columna de la izquierda (?tema=slug). Esta ruta queda como redirect por
// si algo enlazaba directo a /ayuda/categoria/[slug].
export default function CategoriaAyudaRedirect({ params }: Props) {
  const { slug } = use(params)
  const router = useRouter()

  useEffect(() => {
    router.replace(`/ayuda?tema=${slug}`)
  }, [router, slug])

  return null
}
