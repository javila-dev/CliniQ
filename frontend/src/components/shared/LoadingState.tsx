import { Skeleton } from '@/components/ui/skeleton'

interface LoadingStateProps {
  rows?: number
}

export function LoadingState({ rows = 5 }: LoadingStateProps) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-lg" />
      ))}
    </div>
  )
}
