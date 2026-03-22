import { create } from 'zustand';

type ToolMode = 'view' | 'assign';

interface UIState {
  selectedRegionId: number | null;
  selectedCountryId: string | null;
  toolMode: ToolMode;
  showCountryPanel: boolean;

  selectRegion: (id: number | null) => void;
  selectCountry: (id: string | null) => void;
  setToolMode: (mode: ToolMode) => void;
  toggleCountryPanel: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  selectedRegionId: null,
  selectedCountryId: null,
  toolMode: 'view',
  showCountryPanel: true,

  selectRegion: (id) => set({ selectedRegionId: id }),
  selectCountry: (id) => set({ selectedCountryId: id }),
  setToolMode: (mode) => set({ toolMode: mode }),
  toggleCountryPanel: () => set((s) => ({ showCountryPanel: !s.showCountryPanel })),
}));
