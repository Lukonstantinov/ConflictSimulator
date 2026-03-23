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
  smoke: number;       // 0 = no smoke, >0 = ticks remaining
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
  health: number;      // 0-100
  floors: number;
  destroyed: boolean;
}

// Unit types — Phase 1 + Phase 2
export type TacticalUnitType =
  | 'infantry' | 'tank' | 'apc'
  | 'artillery' | 'sniper' | 'atgm' | 'drone' | 'helicopter' | 'medic';

export interface TacticalUnit {
  id: string;
  type: TacticalUnitType;
  faction: 'attacker' | 'defender';
  position: { x: number; y: number };
  squadSize: number;
  maxSquadSize: number;
  health: number;
  morale: number;
  state: 'idle' | 'moving' | 'attacking' | 'suppressed' | 'retreating' | 'destroyed' | 'surrendered';
  target?: { x: number; y: number };
  path?: { x: number; y: number }[];
  attackTarget?: string;
  stats: UnitStats;
  facing: number;
  selected: boolean;
  lastShotTick: number;
  // Phase 3: Ammo/supply
  ammo: number;
  maxAmmo: number;
  // Phase 3: Smoke ability
  smokeCharges: number;
  // Flying flag (drones/helicopters ignore terrain for movement)
  flying: boolean;
}

export interface UnitStats {
  speed: number;
  range: number;
  damage: number;
  armor: number;
  sight: number;
  fireRate: number;
  // Phase 2 extras
  minRange?: number;      // artillery min range
  splashRadius?: number;  // artillery splash damage radius
  antiArmor?: number;     // bonus multiplier vs armored targets (atgm, sniper)
  canHeal?: boolean;      // medic healing ability
}

export const UNIT_DEFINITIONS: Record<TacticalUnitType, UnitStats> = {
  infantry:   { speed: 1.5, range: 6, damage: 8, armor: 0.1, sight: 10, fireRate: 3 },
  tank:       { speed: 2.0, range: 10, damage: 40, armor: 0.7, sight: 8, fireRate: 8 },
  apc:        { speed: 2.5, range: 4, damage: 15, armor: 0.4, sight: 9, fireRate: 5 },
  artillery:  { speed: 0.8, range: 18, damage: 50, armor: 0.2, sight: 6, fireRate: 15, minRange: 5, splashRadius: 2 },
  sniper:     { speed: 1.2, range: 14, damage: 35, armor: 0.05, sight: 16, fireRate: 12, antiArmor: 0.3 },
  atgm:       { speed: 1.0, range: 12, damage: 60, armor: 0.1, sight: 10, fireRate: 14, antiArmor: 2.5 },
  drone:      { speed: 3.0, range: 0, damage: 0, armor: 0.0, sight: 20, fireRate: 999 },
  helicopter: { speed: 3.5, range: 8, damage: 30, armor: 0.3, sight: 14, fireRate: 6, antiArmor: 1.5 },
  medic:      { speed: 1.4, range: 3, damage: 0, armor: 0.05, sight: 8, fireRate: 5, canHeal: true },
};

// Default ammo by unit type
export const UNIT_AMMO: Record<TacticalUnitType, number> = {
  infantry: 60,
  tank: 20,
  apc: 30,
  artillery: 12,
  sniper: 15,
  atgm: 6,
  drone: 0,
  helicopter: 24,
  medic: 0,
};

// Default smoke charges
export const UNIT_SMOKE: Record<TacticalUnitType, number> = {
  infantry: 2,
  tank: 1,
  apc: 1,
  artillery: 3,
  sniper: 1,
  atgm: 1,
  drone: 0,
  helicopter: 2,
  medic: 1,
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
  type: 'unit_destroyed' | 'building_destroyed' | 'unit_suppressed' | 'shot_fired'
    | 'unit_retreating' | 'unit_surrendered' | 'smoke_deployed' | 'artillery_impact'
    | 'unit_healed' | 'ammo_depleted' | 'building_damaged';
  details: Record<string, unknown>;
}

export interface PlayerCommand {
  type: 'move' | 'attack' | 'smoke';
  unitIds: string[];
  target: { x: number; y: number };
  targetUnitId?: string;
}
