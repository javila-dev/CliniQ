import { AuthGuard } from '@/components/shared/AuthGuard'
import { AppShell } from '@/components/shared/AppShell'

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <AppShell>{children}</AppShell>
    </AuthGuard>
  )
}
