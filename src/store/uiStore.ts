import { create } from 'zustand';

type ToolMode = 'view' | 'assign';
type GameMode = 'strategic' | 'tactical';

interface UIState {
  selectedRegionId: number | null;
  selectedCountryId: string | null;
  toolMode: ToolMode;
  showCountryPanel: boolean;
  gameMode: GameMode;

  selectRegion: (id: number | null) => void;
  selectCountry: (id: string | null) => void;
  setToolMode: (mode: ToolMode) => void;
  toggleCountryPanel: () => void;
  setGameMode: (mode: GameMode) => void;
}

export const useUIStore = create<UIState>((set) => ({
  selectedRegionId: null,
  selectedCountryId: null,
  toolMode: 'view',
  showCountryPanel: true,
  gameMode: 'strategic',

  selectRegion: (id) => set({ selectedRegionId: id }),
  selectCountry: (id) => set({ selectedCountryId: id }),
  setToolMode: (mode) => set({ toolMode: mode }),
  toggleCountryPanel: () => set((s) => ({ showCountryPanel: !s.showCountryPanel })),
  setGameMode: (mode) => set({ gameMode: mode }),
}));
