'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { configuracionApi, type CampoPlantilla } from '@/lib/api/configuracion'
import { MapeadorCampos } from '@/components/consentimientos/MapeadorCampos'

function mensajeError(error: unknown) {
  const data = (error as { response?: { data?: { campos?: string | string[] } } })?.response?.data
  const campos = data?.campos
  if (campos) return Array.isArray(campos) ? campos.join(' ') : campos
  return 'No se pudo guardar la plantilla. Intenta de nuevo.'
}

export default function CamposMapperPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const qc = useQueryClient()
  // Al guardar se vuelve al listado; el botón sigue "guardando" hasta que la página cambie.
  const [redirigiendo, setRedirigiendo] = useState(false)

  const { data: plantilla } = useQuery({
    queryKey: ['plantillas-consentimiento', id],
    queryFn: async () => {
      const list = await configuracionApi.plantillasConsentimiento.list()
      return list.find(p => p.id === id) ?? null
    },
  })

  const saveMutation = useMutation({
    mutationFn: ({ campos, requiere }: { campos: CampoPlantilla[]; requiere: boolean }) =>
      configuracionApi.plantillasConsentimiento.guardarCampos(id, campos, requiere),
    onSuccess: () => {
      setRedirigiendo(true)
      qc.invalidateQueries({ queryKey: ['plantillas-consentimiento'] })
      router.push('/configuracion/consentimientos')
    },
  })

  const [pdfBlob, setPdfBlob] = useState<string | null>(null)
  useEffect(() => {
    if (!id) return
    let url: string | null = null
    import('@/lib/api/client').then(({ apiClient }) => {
      apiClient.get(`/configuracion/plantillas-consentimiento/${id}/pdf/`, { responseType: 'blob' })
        .then(res => {
          url = URL.createObjectURL(res.data)
          setPdfBlob(url)
        })
        .catch(() => {})
    })
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [id])

  return (
    <MapeadorCampos
      pdfUrl={pdfBlob}
      campos={plantilla?.campos ?? []}
      requiereFirmaProfesional={plantilla?.requiere_firma_profesional ?? true}
      pasoInicial={2}
      guardando={saveMutation.isPending || redirigiendo}
      error={saveMutation.isError ? mensajeError(saveMutation.error) : null}
      onGuardar={(campos, requiere) => saveMutation.mutate({ campos, requiere })}
      encabezado={
        <>
          <Link href="/configuracion/consentimientos" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-3.5 w-3.5" /> Volver
          </Link>
          <p className="font-semibold text-sm mt-2 truncate">{plantilla?.nombre ?? 'Cargando…'}</p>
        </>
      }
    />
  )
}
