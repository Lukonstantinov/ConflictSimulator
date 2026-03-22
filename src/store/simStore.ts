import { create } from 'zustand';
import type { SimulationState, SimEvent } from '../types';

interface SimStore extends SimulationState {
  addEvent: (event: SimEvent) => void;
  setStatus: (status: SimulationState['status']) => void;
  setSpeed: (speed: number) => void;
  setTick: (tick: number) => void;
  setWinner: (winner: string | null) => void;
  reset: () => void;
}

const initialState: SimulationState = {
  tick: 0,
  speed: 10,
  status: 'setup',
  events: [],
  winner: null,
};

export const useSimStore = create<SimStore>((set) => ({
  ...initialState,

  addEvent: (event) =>
    set((s) => ({ events: [...s.events, event] })),

  setStatus: (status) => set({ status }),
  setSpeed: (speed) => set({ speed }),
  setTick: (tick) => set({ tick }),
  setWinner: (winner) => set({ winner }),

  reset: () => set(initialState),
}));
