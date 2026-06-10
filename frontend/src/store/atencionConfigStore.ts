'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Mismos slugs que TabHistoria para reutilizar los mismos componentes
export type TabAtencion =
  | 'datos-generales'
  | 'motivo-consulta'
  | 'antecedentes'
  | 'examenes'
  | 'plan-manejo'
  | 'ordenes'
  | 'fotos'

interface AtencionConfigState {
  tabsActivos: Record<TabAtencion, boolean>
  setTabActivo: (tab: TabAtencion, activo: boolean) => void
  isTabActivo: (tab: TabAtencion) => boolean
}

const DEFAULT_TABS: Record<TabAtencion, boolean> = {
  'datos-generales': true,
  'motivo-consulta': true,
  antecedentes:      true,
  examenes:          true,
  'plan-manejo':     true,
  ordenes:           true,
  fotos:             true,
}

export const useAtencionConfig = create<AtencionConfigState>()(
  persist(
    (set, get) => ({
      tabsActivos: DEFAULT_TABS,

      setTabActivo: (tab, activo) =>
        set((state) => ({
          tabsActivos: { ...state.tabsActivos, [tab]: activo },
        })),

      isTabActivo: (tab) => get().tabsActivos[tab] ?? true,
    }),
    { name: 'atencion-config' },
  ),
)
