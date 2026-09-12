import * as Lucide from 'lucide-react'
import { BookOpen, type LucideProps } from 'lucide-react'

function toPascal(name: string): string {
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

/** Renderiza un icono de lucide a partir de su nombre en kebab-case (ej. "calendar-days"). */
export function DynamicIcon({ name, ...props }: { name?: string | null } & LucideProps) {
  const key = name ? toPascal(name) : ''
  const registry = Lucide as unknown as Record<string, React.ComponentType<LucideProps>>
  const Icon = (key && registry[key]) || BookOpen
  return <Icon {...props} />
}
