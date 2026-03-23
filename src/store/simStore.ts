import { create } from 'zustand';
import type { SimulationState, SimEvent, StateDelta, BorderFront, TradeRoute, TacticalBattleMode, PendingTacticalBattleInfo } from '../types';

interface SimStore extends SimulationState {
  /** Recorded deltas for replay */
  history: StateDelta[];
  /** Per-tick territory counts per country for stats */
  territoryHistory: Array<Record<string, number>>;
  /** Active border fronts */
  borderFronts: BorderFront[];
  /** Active trade routes */
  tradeRoutes: TradeRoute[];

  addEvent: (event: SimEvent) => void;
  setStatus: (status: SimulationState['status']) => void;
  setSpeed: (speed: number) => void;
  setTick: (tick: number) => void;
  setWinner: (winner: string | null) => void;
  recordDelta: (delta: StateDelta) => void;
  recordTerritory: (counts: Record<string, number>) => void;
  setBorderFronts: (fronts: BorderFront[]) => void;
  setTradeRoutes: (routes: TradeRoute[]) => void;
  setTacticalBattleMode: (mode: TacticalBattleMode) => void;
  setPendingTacticalBattle: (battle: PendingTacticalBattleInfo | null) => void;
  reset: () => void;
}

const initialState: SimulationState & { history: StateDelta[]; territoryHistory: Array<Record<string, number>>; borderFronts: BorderFront[]; tradeRoutes: TradeRoute[] } = {
  tick: 0,
  speed: 10,
  status: 'setup',
  events: [],
  winner: null,
  tacticalBattleMode: 'player_choice',
  pendingTacticalBattle: null,
  history: [],
  territoryHistory: [],
  borderFronts: [],
  tradeRoutes: [],
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
  setTradeRoutes: (routes) => set({ tradeRoutes: routes }),
  setTacticalBattleMode: (mode) => set({ tacticalBattleMode: mode }),
  setPendingTacticalBattle: (battle) => set({ pendingTacticalBattle: battle }),

  reset: () => set(initialState),
}));
