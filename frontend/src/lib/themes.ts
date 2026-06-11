export interface Palette {
  id: string
  label: string
  swatch: string
  vars: Record<string, string>
}

export const PALETTES: Palette[] = [
  {
    id: 'rosa',
    label: 'Rosa',
    swatch: 'hsl(334, 72%, 55%)',
    vars: {
      '--primary': '334 72% 55%',
      '--primary-foreground': '0 0% 100%',
      '--secondary': '334 30% 95%',
      '--secondary-foreground': '334 40% 28%',
      '--accent': '334 25% 94%',
      '--accent-foreground': '334 40% 28%',
      '--ring': '334 72% 55%',
    },
  },
  {
    id: 'azul',
    label: 'Azul',
    swatch: 'hsl(217, 71%, 53%)',
    vars: {
      '--primary': '217 71% 53%',
      '--primary-foreground': '0 0% 100%',
      '--secondary': '217 30% 95%',
      '--secondary-foreground': '217 40% 28%',
      '--accent': '217 25% 94%',
      '--accent-foreground': '217 40% 28%',
      '--ring': '217 71% 53%',
    },
  },
  {
    id: 'verde',
    label: 'Verde',
    swatch: 'hsl(160, 60%, 42%)',
    vars: {
      '--primary': '160 60% 42%',
      '--primary-foreground': '0 0% 100%',
      '--secondary': '160 30% 95%',
      '--secondary-foreground': '160 40% 22%',
      '--accent': '160 25% 94%',
      '--accent-foreground': '160 40% 22%',
      '--ring': '160 60% 42%',
    },
  },
  {
    id: 'morado',
    label: 'Morado',
    swatch: 'hsl(263, 60%, 55%)',
    vars: {
      '--primary': '263 60% 55%',
      '--primary-foreground': '0 0% 100%',
      '--secondary': '263 30% 95%',
      '--secondary-foreground': '263 40% 28%',
      '--accent': '263 25% 94%',
      '--accent-foreground': '263 40% 28%',
      '--ring': '263 60% 55%',
    },
  },
  {
    id: 'teal',
    label: 'Teal',
    swatch: 'hsl(175, 65%, 40%)',
    vars: {
      '--primary': '175 65% 40%',
      '--primary-foreground': '0 0% 100%',
      '--secondary': '175 30% 95%',
      '--secondary-foreground': '175 40% 22%',
      '--accent': '175 25% 94%',
      '--accent-foreground': '175 40% 22%',
      '--ring': '175 65% 40%',
    },
  },
  {
    id: 'naranja',
    label: 'Naranja',
    swatch: 'hsl(24, 85%, 53%)',
    vars: {
      '--primary': '24 85% 53%',
      '--primary-foreground': '0 0% 100%',
      '--secondary': '24 30% 95%',
      '--secondary-foreground': '24 40% 28%',
      '--accent': '24 25% 94%',
      '--accent-foreground': '24 40% 28%',
      '--ring': '24 85% 53%',
    },
  },
]

export const DEFAULT_PALETTE_ID = 'rosa'
