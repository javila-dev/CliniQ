'use client'

import { useEffect } from 'react'
import { useThemeStore } from '@/store/themeStore'
import { PALETTES, DEFAULT_PALETTE_ID } from '@/lib/themes'

export function ThemeApplier() {
  const paletteId = useThemeStore(s => s.paletteId)

  useEffect(() => {
    const palette = PALETTES.find(p => p.id === paletteId) ?? PALETTES.find(p => p.id === DEFAULT_PALETTE_ID)!
    const root = document.documentElement
    Object.entries(palette.vars).forEach(([key, value]) => {
      root.style.setProperty(key, value)
    })
  }, [paletteId])

  return null
}
