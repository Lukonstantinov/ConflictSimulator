import type { Army, BattleResult, Region, TerrainType } from '../types';
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

const DEFENDER_BONUS = 1.1;
const FORTIFICATION_BONUS = 0.15;

export function getTerrainSpeed(terrain: TerrainType): number {
  return TERRAIN_SPEED[terrain] ?? 0.25;
}

export function resolveBattle(
  attacker: Army,
  defender: Army,
  region: Region,
  rng: SeededRNG,
): BattleResult {
  const terrainMod = TERRAIN_MODIFIERS[region.terrain] ?? 1.0;
  const fortBonus = 1 + (region.fortification ?? 0) * FORTIFICATION_BONUS;

  const attackPower =
    attacker.size * attacker.morale * terrainMod * rng.range(0.8, 1.2);
  const defendPower =
    defender.size * defender.morale * DEFENDER_BONUS * fortBonus * rng.range(0.85, 1.15);

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

export function updateMorale(army: Army, won: boolean, warWeariness: number = 0): Army {
  const delta = won ? 0.05 : -0.1;
  const wearinessPenalty = warWeariness * -0.02;
  const newMorale = Math.max(0.3, Math.min(1.5, army.morale + delta + wearinessPenalty));
  return { ...army, morale: newMorale };
}
