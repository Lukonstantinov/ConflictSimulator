/**
 * Strategic-Tactical Bridge
 *
 * Converts between strategic-layer armies/regions and tactical-layer units/maps.
 * Handles launching tactical battles from strategic combat and mapping results back.
 */

import type { Army, Country, Region, TerrainType, UnitComposition } from '../types';
import type { TacticalUnit, TacticalUnitType, TacticalMap } from './types';
import { UNIT_DEFINITIONS, UNIT_AMMO, UNIT_SMOKE } from './types';
import { generateTacticalMapFromPreset } from './map/grid';
import type { MapPreset, GenerationParams } from './map/grid';

/** Describes a pending tactical battle triggered from the strategic layer */
export interface PendingTacticalBattle {
  id: string;
  attackerCountryId: string;
  defenderCountryId: string;
  attackerArmyId: string;
  defenderArmyId: string;
  regionId: number;
  /** Snapshot of attacker army at time of battle */
  attackerArmy: Army;
  /** Snapshot of defender army at time of battle */
  defenderArmy: Army;
  /** Attacker country name/color for display */
  attackerName: string;
  attackerColor: string;
  /** Defender country name/color for display */
  defenderName: string;
  defenderColor: string;
  /** Region terrain for map generation */
  terrain: TerrainType;
  /** Strategic tick when battle was triggered */
  strategicTick: number;
}

/** Result of a completed tactical battle, to apply back to strategic layer */
export interface TacticalBattleResult {
  battleId: string;
  attackerWins: boolean;
  /** Fraction of attacker army surviving (0-1) */
  attackerSurvivalRate: number;
  /** Fraction of defender army surviving (0-1) */
  defenderSurvivalRate: number;
  /** Approximate unit composition losses */
  attackerUnitLosses: UnitComposition;
  defenderUnitLosses: UnitComposition;
}

// ── Terrain → Tactical Map Preset mapping ──────────────────────────────────────

const TERRAIN_TO_PRESET: Record<TerrainType, MapPreset> = {
  plains: 'village',
  forest: 'forest',
  mountains: 'village',
  desert: 'village',
  coast: 'coastal',
  ocean: 'coastal',
};

const TERRAIN_TO_PARAMS: Record<TerrainType, GenerationParams> = {
  plains: { preset: 'village', buildingDensity: 0.5, treeDensity: 0.1 },
  forest: { preset: 'forest', treeDensity: 0.6, hasTrenches: false },
  mountains: { preset: 'village', buildingDensity: 0.3, treeDensity: 0.4 },
  desert: { preset: 'village', buildingDensity: 0.3, treeDensity: 0.05 },
  coast: { preset: 'coastal', buildingDensity: 0.4, treeDensity: 0.2, hasWater: true },
  ocean: { preset: 'coastal', buildingDensity: 0.2, treeDensity: 0.1, hasWater: true },
};

// ── Strategic Army → Tactical Units conversion ────────────────────────────────

/**
 * Convert a strategic army's UnitComposition into tactical units.
 * Scales down strategic numbers to tactical scale (~5-15 units per side).
 */
export function armyToTacticalUnits(
  army: Army,
  faction: 'attacker' | 'defender',
  mapWidth: number,
  mapHeight: number,
): TacticalUnit[] {
  const units: TacticalUnit[] = [];
  const comp = army.units;
  const total = comp.heavy + comp.light + comp.levy;
  if (total === 0) return units;

  // Scale: for every ~20 strategic troops, create 1 tactical unit
  // Minimum 2 units per side, maximum ~12
  const scaleFactor = Math.max(1, Math.floor(total / 12));

  const heavyCount = Math.max(0, Math.round(comp.heavy / scaleFactor));
  const lightCount = Math.max(1, Math.round(comp.light / scaleFactor));
  const levyCount = Math.max(0, Math.round(comp.levy / scaleFactor));

  // Map strategic unit types to tactical unit types
  // heavy → tanks + ATGMs
  // light → infantry + APCs
  // levy → infantry (smaller squads)

  let idCounter = faction === 'attacker' ? 0 : 500;

  const spawnY = faction === 'attacker' ? 3 : mapHeight - 5;
  let spawnX = Math.floor(mapWidth * 0.2);
  const spacing = Math.max(2, Math.floor((mapWidth * 0.6) / Math.max(1, heavyCount + lightCount + levyCount)));

  // Heavy units → tanks and ATGMs
  const tanksFromHeavy = Math.ceil(heavyCount * 0.7);
  const atgmsFromHeavy = heavyCount - tanksFromHeavy;

  for (let i = 0; i < tanksFromHeavy; i++) {
    units.push(createBridgeUnit(`bridge-${faction}-${idCounter++}`, 'tank', faction, spawnX, spawnY));
    spawnX += spacing;
  }
  for (let i = 0; i < atgmsFromHeavy; i++) {
    units.push(createBridgeUnit(`bridge-${faction}-${idCounter++}`, 'atgm', faction, spawnX, spawnY));
    spawnX += spacing;
  }

  // Light units → infantry + APCs
  const infantryFromLight = Math.ceil(lightCount * 0.6);
  const apcsFromLight = Math.min(3, lightCount - infantryFromLight);

  for (let i = 0; i < infantryFromLight; i++) {
    units.push(createBridgeUnit(`bridge-${faction}-${idCounter++}`, 'infantry', faction, spawnX, spawnY + (i % 2)));
    spawnX += spacing;
  }
  for (let i = 0; i < apcsFromLight; i++) {
    units.push(createBridgeUnit(`bridge-${faction}-${idCounter++}`, 'apc', faction, spawnX, spawnY));
    spawnX += spacing;
  }

  // Levy → infantry with smaller squads
  for (let i = 0; i < levyCount; i++) {
    const unit = createBridgeUnit(`bridge-${faction}-${idCounter++}`, 'infantry', faction, spawnX, spawnY + (i % 2));
    unit.squadSize = Math.max(4, unit.squadSize - 4); // Smaller squads for levy
    unit.maxSquadSize = unit.squadSize;
    units.push(unit);
    spawnX += spacing;
  }

  // Add a medic if army has 50+ troops
  if (total >= 50) {
    units.push(createBridgeUnit(`bridge-${faction}-${idCounter++}`, 'medic', faction,
      Math.floor(mapWidth / 2), spawnY + (faction === 'attacker' ? 2 : -2)));
  }

  // Apply morale from strategic layer (map 0-1.5 strategic → 30-100 tactical)
  const tacticalMorale = Math.round(Math.min(100, Math.max(30, army.morale * 66)));
  for (const u of units) {
    u.morale = tacticalMorale;
  }

  return units;
}

function createBridgeUnit(
  id: string,
  type: TacticalUnitType,
  faction: 'attacker' | 'defender',
  x: number,
  y: number,
): TacticalUnit {
  const stats = { ...UNIT_DEFINITIONS[type] };
  const isSquadType = type === 'infantry' || type === 'sniper' || type === 'atgm' || type === 'medic';
  const maxSquad = isSquadType
    ? (type === 'sniper' ? 2 : type === 'atgm' ? 3 : type === 'medic' ? 2 : 10)
    : 1;
  const isFlying = type === 'drone' || type === 'helicopter';

  return {
    id,
    type,
    faction,
    position: { x, y },
    squadSize: maxSquad,
    maxSquadSize: maxSquad,
    health: 100,
    morale: 100,
    state: 'idle',
    stats,
    facing: faction === 'attacker' ? 4 : 0,
    selected: false,
    lastShotTick: -100,
    ammo: UNIT_AMMO[type],
    maxAmmo: UNIT_AMMO[type],
    smokeCharges: UNIT_SMOKE[type],
    flying: isFlying,
  };
}

// ── Region → Tactical Map generation ───────────────────────────────────────────

/**
 * Generate a tactical map based on a strategic region's terrain.
 */
export function regionToTacticalMap(region: Region, seed?: number): TacticalMap {
  const preset = TERRAIN_TO_PRESET[region.terrain];
  const params = { ...TERRAIN_TO_PARAMS[region.terrain] };
  const mapSeed = seed ?? (region.id * 7919 + 42);

  return generateTacticalMapFromPreset(
    60, 40, mapSeed, params,
    `Battle at Region #${region.id}`,
  );
}

// ── Tactical Result → Strategic Army update ────────────────────────────────────

/**
 * Compute a TacticalBattleResult from the final state of tactical units.
 */
export function computeBattleResult(
  battleId: string,
  units: TacticalUnit[],
  originalAttackerArmy: Army,
  originalDefenderArmy: Army,
): TacticalBattleResult {
  const attackerUnits = units.filter((u) => u.faction === 'attacker');
  const defenderUnits = units.filter((u) => u.faction === 'defender');

  const attackerAlive = attackerUnits.filter(
    (u) => u.state !== 'destroyed' && u.state !== 'surrendered',
  );
  const defenderAlive = defenderUnits.filter(
    (u) => u.state !== 'destroyed' && u.state !== 'surrendered',
  );

  const attackerSurvivalRate = attackerUnits.length > 0
    ? attackerAlive.length / attackerUnits.length
    : 0;
  const defenderSurvivalRate = defenderUnits.length > 0
    ? defenderAlive.length / defenderUnits.length
    : 0;

  // Determine winner: whoever has more surviving units by ratio
  const attackerWins = defenderAlive.length === 0 ||
    (attackerAlive.length > 0 && attackerSurvivalRate > defenderSurvivalRate);

  // Calculate proportional losses to apply to strategic army
  const attackerLossRate = 1 - attackerSurvivalRate;
  const defenderLossRate = 1 - defenderSurvivalRate;

  const attackerUnitLosses: UnitComposition = {
    heavy: Math.round(originalAttackerArmy.units.heavy * attackerLossRate),
    light: Math.round(originalAttackerArmy.units.light * attackerLossRate),
    levy: Math.round(originalAttackerArmy.units.levy * attackerLossRate),
  };

  const defenderUnitLosses: UnitComposition = {
    heavy: Math.round(originalDefenderArmy.units.heavy * defenderLossRate),
    light: Math.round(originalDefenderArmy.units.light * defenderLossRate),
    levy: Math.round(originalDefenderArmy.units.levy * defenderLossRate),
  };

  return {
    battleId,
    attackerWins,
    attackerSurvivalRate,
    defenderSurvivalRate,
    attackerUnitLosses,
    defenderUnitLosses,
  };
}

/**
 * Auto-resolve a battle without tactical play (for AI-vs-AI).
 * Runs a simplified tactical simulation for a fixed number of ticks.
 */
export function autoResolveTacticalBattle(
  pending: PendingTacticalBattle,
): TacticalBattleResult {
  // Use the strategic combat formula but add some variance
  const attackerTotal = pending.attackerArmy.units.heavy + pending.attackerArmy.units.light + pending.attackerArmy.units.levy;
  const defenderTotal = pending.defenderArmy.units.heavy + pending.defenderArmy.units.light + pending.defenderArmy.units.levy;

  if (attackerTotal === 0 && defenderTotal === 0) {
    return {
      battleId: pending.id,
      attackerWins: false,
      attackerSurvivalRate: 0,
      defenderSurvivalRate: 0,
      attackerUnitLosses: { heavy: 0, light: 0, levy: 0 },
      defenderUnitLosses: { heavy: 0, light: 0, levy: 0 },
    };
  }

  // Weighted effective power
  const attackPower = pending.attackerArmy.units.heavy * 1.5 +
    pending.attackerArmy.units.light * 1.0 +
    pending.attackerArmy.units.levy * 0.6;
  const defendPower = (pending.defenderArmy.units.heavy * 1.5 +
    pending.defenderArmy.units.light * 1.0 +
    pending.defenderArmy.units.levy * 0.6) * 1.1; // defender bonus

  const ratio = attackPower / (defendPower || 1);
  const attackerWins = ratio > 1;

  // Losses scale with how close the fight was
  const attackerLossRate = Math.min(0.95, 0.15 + (1 / Math.max(ratio, 0.1)) * 0.25);
  const defenderLossRate = Math.min(0.95, 0.15 + ratio * 0.2);

  const attackerSurvivalRate = 1 - attackerLossRate;
  const defenderSurvivalRate = attackerWins ? 0 : 1 - defenderLossRate;

  return {
    battleId: pending.id,
    attackerWins,
    attackerSurvivalRate,
    defenderSurvivalRate,
    attackerUnitLosses: {
      heavy: Math.round(pending.attackerArmy.units.heavy * attackerLossRate),
      light: Math.round(pending.attackerArmy.units.light * attackerLossRate),
      levy: Math.round(pending.attackerArmy.units.levy * attackerLossRate),
    },
    defenderUnitLosses: {
      heavy: Math.round(pending.defenderArmy.units.heavy * defenderLossRate),
      light: Math.round(pending.defenderArmy.units.light * defenderLossRate),
      levy: Math.round(pending.defenderArmy.units.levy * defenderLossRate),
    },
  };
}
