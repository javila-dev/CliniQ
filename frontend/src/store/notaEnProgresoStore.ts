'use client'

import { create } from 'zustand'

interface NotaEnProgresoState {
  notaId: string | null
  citaId: string | null
  setNota: (notaId: string, citaId: string) => void
  clear: () => void
}

// No persiste — se resetea al navegar fuera de la atención
export const useNotaEnProgreso = create<NotaEnProgresoState>()((set) => ({
  notaId: null,
  citaId: null,
  setNota: (notaId, citaId) => set({ notaId, citaId }),
  clear: () => set({ notaId: null, citaId: null }),
}))
