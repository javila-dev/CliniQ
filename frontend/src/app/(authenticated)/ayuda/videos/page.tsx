'use client'

import { useQuery } from '@tanstack/react-query'

import { ayudaApi } from '@/lib/api/ayuda'
import { PageHeader } from '@/components/shared/PageHeader'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import { VideoGrid } from '@/components/ayuda/VideoGrid'

export default function AyudaVideosPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['ayuda', 'articulos', { tiene_video: true }],
    queryFn: () => ayudaApi.articulos({ tiene_video: true }),
  })

  if (isLoading) return <LoadingState rows={4} />
  if (isError) return <ErrorState onRetry={() => refetch()} />

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader title="Videos de ayuda" description="Tutoriales cortos en video." backHref="/ayuda" />
      <VideoGrid articulos={data?.results ?? []} />
    </div>
  )
}
