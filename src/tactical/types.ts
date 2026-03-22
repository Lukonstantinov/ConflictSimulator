// Grid tile terrain
export type TacticalTerrain = 'open' | 'road' | 'building' | 'rubble' | 'trees' | 'water' | 'trench';

export interface TacticalTile {
  x: number;
  y: number;
  terrain: TacticalTerrain;
  elevation: number;   // 0-3
  cover: number;       // 0-1 defense bonus
  buildingId?: string;
  passable: boolean;
  occupied?: string;   // unitId
}

export interface TacticalMap {
  id: string;
  name: string;
  width: number;
  height: number;
  tileSize: number;    // px per tile (32)
  tiles: TacticalTile[][];  // [y][x] row-major
  buildings: Building[];
}

export interface Building {
  id: string;
  tiles: { x: number; y: number }[];
  type: 'house' | 'apartment' | 'warehouse' | 'church' | 'shop';
  health: number;
  floors: number;
}

// Unit types
export type TacticalUnitType = 'infantry' | 'tank' | 'apc';

export interface TacticalUnit {
  id: string;
  type: TacticalUnitType;
  faction: 'attacker' | 'defender';
  position: { x: number; y: number };
  squadSize: number;
  maxSquadSize: number;
  health: number;
  morale: number;
  state: 'idle' | 'moving' | 'attacking' | 'suppressed' | 'retreating' | 'destroyed';
  target?: { x: number; y: number };
  path?: { x: number; y: number }[];
  attackTarget?: string;
  stats: UnitStats;
  facing: number;
  selected: boolean;
  lastShotTick: number;
}

export interface UnitStats {
  speed: number;
  range: number;
  damage: number;
  armor: number;
  sight: number;
  fireRate: number;
}

export const UNIT_DEFINITIONS: Record<TacticalUnitType, UnitStats> = {
  infantry: { speed: 1.5, range: 6, damage: 8, armor: 0.1, sight: 10, fireRate: 3 },
  tank: { speed: 2.0, range: 10, damage: 40, armor: 0.7, sight: 8, fireRate: 8 },
  apc: { speed: 2.5, range: 4, damage: 15, armor: 0.4, sight: 9, fireRate: 5 },
};

export const TERRAIN_COVER: Record<TacticalTerrain, number> = {
  open: 0, road: 0, building: 0.6, rubble: 0.3, trees: 0.4, water: 0, trench: 0.5,
};

export const TERRAIN_SPEED: Record<TacticalTerrain, number> = {
  open: 1.0, road: 1.3, building: 0.5, rubble: 0.6, trees: 0.7, water: 0.3, trench: 0.8,
};

export type TacticalStatus = 'setup' | 'running' | 'paused' | 'victory' | 'defeat';

export interface TacticalGameState {
  status: TacticalStatus;
  tick: number;
  tickRate: number;
  speed: number;
  units: TacticalUnit[];
  map: TacticalMap;
  events: TacticalEvent[];
  selectedUnitIds: string[];
  playerFaction: 'attacker' | 'defender';
}

export interface TacticalEvent {
  tick: number;
  type: 'unit_destroyed' | 'building_destroyed' | 'unit_suppressed' | 'shot_fired' | 'unit_retreating';
  details: Record<string, unknown>;
}

export interface PlayerCommand {
  type: 'move' | 'attack';
  unitIds: string[];
  target: { x: number; y: number };
  targetUnitId?: string;
}
