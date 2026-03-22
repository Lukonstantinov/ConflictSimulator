import type { Army, BattleResult, BorderFront, Region, TerrainType, UnitComposition, UnitType } from '../types';
import { SeededRNG } from '../utils/random';

const TERRAIN_MODIFIERS: Record<TerrainType, number> = {
  plains: 1.0,
  forest: 0.85,
  mountains: 0.7,
  desert: 0.9,
  coast: 0.95,
  ocean: 0.5,
};

const TERRAIN_SPEED: Record<TerrainType, number> = {
  plains: 0.25,
  coast: 0.25,
  desert: 0.20,
  forest: 0.20,
  mountains: 0.15,
  ocean: 0.10,
};

/** Unit type combat multipliers (attack and defense) */
const UNIT_COMBAT_MULT: Record<UnitType, number> = {
  heavy: 1.5,
  light: 1.0,
  levy: 0.6,
};

/** Unit type movement speed multipliers applied to terrain speed */
const UNIT_SPEED: Record<UnitType, number> = {
  heavy: 0.15,
  light: 0.25,
  levy: 0.20,
};

/** Spawn cost per troop by unit type */
export const UNIT_SPAWN_COST: Record<UnitType, number> = {
  heavy: 5,
  light: 3,
  levy: 1,
};

const DEFENDER_BONUS = 1.1;
const FORTIFICATION_BONUS = 0.15;

/** Calculate effective combat power for unit composition */
export function getEffectivePower(units: UnitComposition): number {
  return (
    units.heavy * UNIT_COMBAT_MULT.heavy +
    units.light * UNIT_COMBAT_MULT.light +
    units.levy * UNIT_COMBAT_MULT.levy
  );
}

/** Get total unit count from composition */
export function getTotalUnits(units: UnitComposition): number {
  return units.heavy + units.light + units.levy;
}

/** Create default unit composition (all light for backward compatibility) */
export function defaultUnits(size: number): UnitComposition {
  return { heavy: 0, light: size, levy: 0 };
}

/** Get army movement speed — limited by slowest unit type present */
export function getArmySpeed(army: Army, terrain: TerrainType): number {
  const units = army.units ?? defaultUnits(army.size);
  // Speed is determined by the slowest unit type present in the army
  let slowest = Infinity;
  if (units.heavy > 0) slowest = Math.min(slowest, UNIT_SPEED.heavy);
  if (units.light > 0) slowest = Math.min(slowest, UNIT_SPEED.light);
  if (units.levy > 0) slowest = Math.min(slowest, UNIT_SPEED.levy);

  if (slowest === Infinity) slowest = UNIT_SPEED.light;

  // Scale by terrain ratio (terrain speed / baseline plains speed)
  const terrainFactor = (TERRAIN_SPEED[terrain] ?? 0.25) / 0.25;
  return slowest * terrainFactor;
}

export function getTerrainSpeed(terrain: TerrainType): number {
  return TERRAIN_SPEED[terrain] ?? 0.25;
}

/** Apply proportional losses to unit composition */
export function applyLossesToUnits(units: UnitComposition, totalSize: number, losses: number): UnitComposition {
  if (totalSize <= 0 || losses <= 0) return { ...units };
  const ratio = Math.min(1, losses / totalSize);
  return {
    heavy: Math.max(0, Math.round(units.heavy * (1 - ratio))),
    light: Math.max(0, Math.round(units.light * (1 - ratio))),
    levy: Math.max(0, Math.round(units.levy * (1 - ratio))),
  };
}

export function resolveBattle(
  attacker: Army,
  defender: Army,
  region: Region,
  rng: SeededRNG,
): BattleResult {
  const terrainMod = TERRAIN_MODIFIERS[region.terrain] ?? 1.0;
  const fortBonus = 1 + (region.fortification ?? 0) * FORTIFICATION_BONUS;

  const attackerUnits = attacker.units ?? defaultUnits(attacker.size);
  const defenderUnits = defender.units ?? defaultUnits(defender.size);

  const attackEffective = getEffectivePower(attackerUnits);
  const defendEffective = getEffectivePower(defenderUnits);

  const attackPower =
    attackEffective * attacker.morale * terrainMod * rng.range(0.8, 1.2);
  const defendPower =
    defendEffective * defender.morale * DEFENDER_BONUS * fortBonus * rng.range(0.85, 1.15);

  const ratio = attackPower / defendPower;

  const attackerLosses = Math.floor(defender.size * (1 / ratio) * 0.3);
  const defenderLosses = Math.floor(attacker.size * ratio * 0.25);

  const attackerRemaining = Math.max(0, attacker.size - attackerLosses);
  const defenderRemaining = Math.max(0, defender.size - defenderLosses);

  return {
    attackerWins: defenderRemaining === 0 || (attackerRemaining > 0 && ratio > 1),
    attackerRemaining,
    defenderRemaining,
  };
}

/** Resolve one tick of sustained border front combat (small per-tick losses) */
export function resolveBorderCombat(
  attacker: Army,
  defender: Army,
  region: Region,
  front: BorderFront,
  rng: SeededRNG,
): { frontDelta: number; attackerLosses: number; defenderLosses: number } {
  const terrainMod = TERRAIN_MODIFIERS[region.terrain] ?? 1.0;
  const fortBonus = 1 + (region.fortification ?? 0) * FORTIFICATION_BONUS;

  const attackerUnits = attacker.units ?? defaultUnits(attacker.size);
  const defenderUnits = defender.units ?? defaultUnits(defender.size);

  const attackEffective = getEffectivePower(attackerUnits);
  const defendEffective = getEffectivePower(defenderUnits);

  const attackPower = attackEffective * attacker.morale * terrainMod * rng.range(0.9, 1.1);
  const defendPower = defendEffective * defender.morale * DEFENDER_BONUS * fortBonus * rng.range(0.9, 1.1);

  const ratio = attackPower / (defendPower || 1);

  // Front movement: positive = attacker pushes forward
  const frontDelta = (ratio - 1) * 0.02;

  // Small sustained losses each tick
  const attackerLosses = Math.max(0, Math.floor(defender.size * (1 / Math.max(ratio, 0.1)) * 0.03));
  const defenderLosses = Math.max(0, Math.floor(attacker.size * ratio * 0.025));

  return { frontDelta, attackerLosses, defenderLosses };
}

export function updateMorale(army: Army, won: boolean, warWeariness: number = 0): Army {
  const delta = won ? 0.05 : -0.1;
  const wearinessPenalty = warWeariness * -0.02;
  const newMorale = Math.max(0.3, Math.min(1.5, army.morale + delta + wearinessPenalty));
  return { ...army, morale: newMorale };
}
