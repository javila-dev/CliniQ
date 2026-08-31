import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface SuperadminClinicaActiva {
  id: string
  nombre: string
  logo?: string | null
}

interface SuperadminClinicaState {
  clinicaActiva: SuperadminClinicaActiva | null
  _hydrated: boolean
  entrarClinica: (clinica: SuperadminClinicaActiva) => void
  salirClinica: () => void
}

export const useSuperadminClinicaStore = create<SuperadminClinicaState>()(
  persist(
    (set) => ({
      clinicaActiva: null,
      _hydrated: false,
      entrarClinica: (clinica) => set({ clinicaActiva: clinica }),
      salirClinica: () => set({ clinicaActiva: null }),
    }),
    {
      name: 'superadmin-clinica-activa',
      skipHydration: true,
      onRehydrateStorage: () => () => {
        useSuperadminClinicaStore.setState({ _hydrated: true })
      },
    }
  )
)
