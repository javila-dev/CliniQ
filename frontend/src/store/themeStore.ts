import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_PALETTE_ID } from '@/lib/themes'

interface ThemeState {
  paletteId: string
  setPalette: (id: string) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      paletteId: DEFAULT_PALETTE_ID,
      setPalette: (id) => set({ paletteId: id }),
    }),
    { name: 'theme-preferences' }
  )
)
