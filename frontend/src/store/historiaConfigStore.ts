'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type TabHistoria =
  | 'datos-generales'
  | 'motivo-consulta'
  | 'antecedentes'
  | 'examenes'
  | 'plan-manejo'
  | 'ordenes'
  | 'fotos'

interface HistoriaConfigState {
  tabsActivos: Record<TabHistoria, boolean>
  setTabActivo: (tab: TabHistoria, activo: boolean) => void
  isTabActivo: (tab: TabHistoria) => boolean
}

const DEFAULT_TABS: Record<TabHistoria, boolean> = {
  'datos-generales': true,
  'motivo-consulta': true,
  antecedentes: true,
  examenes: true,
  'plan-manejo': true,
  ordenes: true,
  fotos: true,
}

export const useHistoriaConfig = create<HistoriaConfigState>()(
  persist(
    (set, get) => ({
      tabsActivos: DEFAULT_TABS,

      setTabActivo: (tab, activo) =>
        set((state) => ({
          tabsActivos: { ...state.tabsActivos, [tab]: activo },
        })),

      isTabActivo: (tab) => get().tabsActivos[tab] ?? true,
    }),
    {
      name: 'historia-config',
    },
  ),
)
