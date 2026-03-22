import { create } from 'zustand';
import type { TacticalUnit, TacticalMap, TacticalEvent, TacticalStatus } from '../types';

interface TacticalStore {
  // State
  status: TacticalStatus;
  tick: number;
  speed: number;
  units: TacticalUnit[];
  map: TacticalMap | null;
  events: TacticalEvent[];
  selectedUnitIds: string[];
  playerFaction: 'attacker' | 'defender';

  // Actions
  initGame: (map: TacticalMap, units: TacticalUnit[], playerFaction: 'attacker' | 'defender') => void;
  setStatus: (status: TacticalStatus) => void;
  setSpeed: (speed: number) => void;
  updateState: (units: TacticalUnit[], tick: number, status: TacticalStatus, events: TacticalEvent[]) => void;
  selectUnits: (unitIds: string[]) => void;
  addToSelection: (unitId: string) => void;
  clearSelection: () => void;
  reset: () => void;
}

export const useTacticalStore = create<TacticalStore>((set) => ({
  status: 'setup',
  tick: 0,
  speed: 1,
  units: [],
  map: null,
  events: [],
  selectedUnitIds: [],
  playerFaction: 'attacker',

  initGame: (map, units, playerFaction) => set({
    map,
    units,
    playerFaction,
    status: 'setup',
    tick: 0,
    events: [],
    selectedUnitIds: [],
  }),

  setStatus: (status) => set({ status }),
  setSpeed: (speed) => set({ speed }),

  updateState: (units, tick, status, events) => set({
    units,
    tick,
    status,
    events,
  }),

  selectUnits: (unitIds) => set({ selectedUnitIds: unitIds }),
  addToSelection: (unitId) => set((s) => ({
    selectedUnitIds: s.selectedUnitIds.includes(unitId)
      ? s.selectedUnitIds
      : [...s.selectedUnitIds, unitId],
  })),
  clearSelection: () => set({ selectedUnitIds: [] }),

  reset: () => set({
    status: 'setup',
    tick: 0,
    speed: 1,
    units: [],
    map: null,
    events: [],
    selectedUnitIds: [],
    playerFaction: 'attacker',
  }),
}));
