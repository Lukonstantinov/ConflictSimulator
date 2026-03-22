export interface Point {
  x: number;
  y: number;
}

export interface WorldMap {
  id: string;
  name: string;
  seed: number;
  dimensions: { w: number; h: number };
  sites: Point[];
  landmask: boolean[];
  regions: Region[];
  countries: Country[];
}

export interface Region {
  id: number;
  polygon: Point[];
  centroid: Point;
  neighbors: number[];
  terrain: TerrainType;
  countryId: string | null;
  population: number;
  fortification: number;
}

export type TerrainType = 'plains' | 'mountains' | 'forest' | 'desert' | 'coast' | 'ocean';

export interface Country {
  id: string;
  name: string;
  color: string;
  regions: number[];
  capital: number;
  armySize: number;
  economy: number;
  strategy: StrategyType;
  treasury: number;
  activeArmies: Army[];
  relations: Record<string, Relation>;
  isAlive: boolean;
  warWeariness: number;
  warStartTicks: Record<string, number>;
}

export type StrategyType = 'aggressive' | 'defensive' | 'expansionist' | 'opportunist' | 'turtle';

export interface Army {
  id: string;
  size: number;
  position: number;
  target: number | null;
  morale: number;
  progress: number;
}

export type Relation = 'neutral' | 'hostile' | 'allied' | 'at_war';

export interface SimulationState {
  tick: number;
  speed: number;
  status: 'setup' | 'running' | 'paused' | 'finished';
  events: SimEvent[];
  winner: string | null;
}

export type SimEventType = 'war_declared' | 'battle' | 'region_captured' | 'country_eliminated'
  | 'alliance_formed' | 'alliance_broken' | 'peace_treaty' | 'fortification_built';

export interface SimEvent {
  tick: number;
  type: SimEventType;
  actors: string[];
  details: Record<string, unknown>;
}

export interface BattleResult {
  attackerWins: boolean;
  attackerRemaining: number;
  defenderRemaining: number;
}

export interface BattleEffect {
  regionId: number;
  x: number;
  y: number;
  tick: number;
  attackerWins: boolean;
}

export interface SimulationSnapshot {
  regions: Region[];
  countries: Country[];
  tick: number;
}

export type VictoryCondition = 'conquest' | 'economic' | 'territorial';

export interface VictoryConfig {
  condition: VictoryCondition;
  economicThreshold: number;
  territorialPercent: number;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  regionCount: number;
  countries: Array<{
    name: string;
    strategy: StrategyType;
    armySize: number;
    economy: number;
  }>;
  autoAssign: boolean;
  victoryCondition: VictoryCondition;
}

export interface WorkerMessage {
  type: 'init' | 'start' | 'pause' | 'resume' | 'set_speed' | 'update_state';
  payload?: unknown;
}

export interface WorkerResponse {
  type: 'tick' | 'finished' | 'error';
  payload?: unknown;
}

export interface StateDelta {
  tick: number;
  regionChanges: Array<{ regionId: number; countryId: string | null }>;
  countryUpdates: Array<Partial<Country> & { id: string }>;
  armyUpdates: Array<{ countryId: string; armies: Army[] }>;
  events: SimEvent[];
  eliminatedCountries: string[];
  winner: string | null;
}
