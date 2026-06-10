'use client'

import { use } from 'react'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { pacientesApi } from '@/lib/api/pacientes'
import { PacienteForm } from '@/components/pacientes/PacienteForm'
import { PageHeader } from '@/components/shared/PageHeader'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { CreatePacienteRequest } from '@/types/pacientes'

interface Props {
  params: Promise<{ id: string }>
}

export default function EditarPacientePage({ params }: Props) {
  const { id } = use(params)
  const router = useRouter()
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)

  const { data: paciente, isLoading, isError } = useQuery({
    queryKey: ['pacientes', id],
    queryFn: () => pacientesApi.get(id),
  })

  const { mutateAsync, isPending } = useMutation({
    mutationFn: (data: Partial<CreatePacienteRequest>) => pacientesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pacientes', id] })
      queryClient.invalidateQueries({ queryKey: ['pacientes'] })
      router.push(`/pacientes/${id}`)
    },
  })

  const handleSubmit = async (data: CreatePacienteRequest) => {
    setServerError(null)
    try {
      await mutateAsync(data)
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        Object.values(err?.response?.data ?? {})[0] ||
        'Error al guardar los cambios.'
      setServerError(String(msg))
    }
  }

  if (isLoading) return <LoadingState rows={4} />
  if (isError || !paciente) return <ErrorState message="No se pudo cargar el paciente." />

  return (
    <div>
      <PageHeader
        title="Editar paciente"
        description={paciente.nombre_completo}
        action={
          <Button variant="outline" asChild>
            <Link href={`/pacientes/${id}`}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Cancelar
            </Link>
          </Button>
        }
      />

      <Card className="w-4/5 mx-auto">
        <CardContent className="pt-6">
          {serverError && (
            <div className="mb-4 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
              <p className="text-sm text-destructive">{serverError}</p>
            </div>
          )}
          <PacienteForm
            defaultValues={paciente}
            onSubmit={handleSubmit}
            isLoading={isPending}
            submitLabel="Guardar cambios"
          />
        </CardContent>
      </Card>
    </div>
  )
}
