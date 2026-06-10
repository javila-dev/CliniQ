'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { pacientesApi } from '@/lib/api/pacientes'
import { PacienteForm } from '@/components/pacientes/PacienteForm'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { CreatePacienteRequest } from '@/types/pacientes'

export default function NuevoPacientePage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)

  const { mutateAsync, isPending } = useMutation({
    mutationFn: pacientesApi.create,
    onSuccess: (paciente) => {
      queryClient.invalidateQueries({ queryKey: ['pacientes'] })
      router.push(`/pacientes/${paciente.id}`)
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
        'Error al crear el paciente. Verifica los datos.'
      setServerError(String(msg))
    }
  }

  return (
    <div>
      <PageHeader
        title="Nuevo paciente"
        description="Completa los datos para registrar al paciente"
        action={
          <Button variant="outline" asChild>
            <Link href="/pacientes">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver
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
            onSubmit={handleSubmit}
            isLoading={isPending}
            submitLabel="Registrar paciente"
          />
        </CardContent>
      </Card>
    </div>
  )
}
