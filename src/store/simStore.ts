import { create } from 'zustand';
import type { SimulationState, SimEvent, StateDelta, BorderFront } from '../types';

interface SimStore extends SimulationState {
  /** Recorded deltas for replay */
  history: StateDelta[];
  /** Per-tick territory counts per country for stats */
  territoryHistory: Array<Record<string, number>>;
  /** Active border fronts */
  borderFronts: BorderFront[];

  addEvent: (event: SimEvent) => void;
  setStatus: (status: SimulationState['status']) => void;
  setSpeed: (speed: number) => void;
  setTick: (tick: number) => void;
  setWinner: (winner: string | null) => void;
  recordDelta: (delta: StateDelta) => void;
  recordTerritory: (counts: Record<string, number>) => void;
  setBorderFronts: (fronts: BorderFront[]) => void;
  reset: () => void;
}

const initialState: SimulationState & { history: StateDelta[]; territoryHistory: Array<Record<string, number>>; borderFronts: BorderFront[] } = {
  tick: 0,
  speed: 10,
  status: 'setup',
  events: [],
  winner: null,
  history: [],
  territoryHistory: [],
  borderFronts: [],
};

export const useSimStore = create<SimStore>((set) => ({
  ...initialState,

  addEvent: (event) =>
    set((s) => ({ events: [...s.events, event] })),

  setStatus: (status) => set({ status }),
  setSpeed: (speed) => set({ speed }),
  setTick: (tick) => set({ tick }),
  setWinner: (winner) => set({ winner }),

  recordDelta: (delta) =>
    set((s) => ({ history: [...s.history, delta] })),

  recordTerritory: (counts) =>
    set((s) => ({ territoryHistory: [...s.territoryHistory, counts] })),

  setBorderFronts: (fronts) => set({ borderFronts: fronts }),

  reset: () => set(initialState),
}));
