import type { TacticalUnit, TacticalUnitType } from '../types';
import { UNIT_DEFINITIONS, UNIT_AMMO, UNIT_SMOKE } from '../types';
import { generateTacticalMap } from './grid';

export interface TacticalScenario {
  id: string;
  name: string;
  description: string;
  mapWidth: number;
  mapHeight: number;
  seed: number;
  units: TacticalUnit[];
}

let unitIdCounter = 0;
function createUnit(
  type: TacticalUnitType,
  faction: TacticalUnit['faction'],
  x: number,
  y: number,
  squadSize?: number,
): TacticalUnit {
  const stats = { ...UNIT_DEFINITIONS[type] };
  const isSquadType = type === 'infantry' || type === 'sniper' || type === 'atgm' || type === 'medic';
  const maxSquad = isSquadType ? (squadSize ?? (type === 'sniper' ? 2 : type === 'atgm' ? 3 : type === 'medic' ? 2 : 10)) : 1;
  const isFlying = type === 'drone' || type === 'helicopter';

  return {
    id: `unit-${unitIdCounter++}`,
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

export function getVillageAssaultScenario(): TacticalScenario {
  unitIdCounter = 0;

  const units: TacticalUnit[] = [
    // Defenders (south/village center)
    createUnit('infantry', 'defender', 28, 22, 10),
    createUnit('infantry', 'defender', 32, 20, 10),
    createUnit('infantry', 'defender', 25, 18, 10),
    createUnit('tank', 'defender', 30, 24),
    createUnit('sniper', 'defender', 35, 18),
    createUnit('atgm', 'defender', 26, 24),

    // Attackers (north)
    createUnit('infantry', 'attacker', 20, 5, 12),
    createUnit('infantry', 'attacker', 25, 4, 12),
    createUnit('infantry', 'attacker', 30, 5, 12),
    createUnit('infantry', 'attacker', 35, 4, 12),
    createUnit('tank', 'attacker', 27, 2),
    createUnit('tank', 'attacker', 33, 2),
    createUnit('apc', 'attacker', 30, 3),
    createUnit('medic', 'attacker', 28, 6),
  ];

  return {
    id: 'village-assault',
    name: 'Village Assault',
    description: 'Attack or defend a Ukrainian-style village with infantry, armor, and support units.',
    mapWidth: 60,
    mapHeight: 40,
    seed: 42,
    units,
  };
}

export function getUrbanDefenseScenario(): TacticalScenario {
  unitIdCounter = 0;

  const units: TacticalUnit[] = [
    // Defenders — dug in with diverse units
    createUnit('infantry', 'defender', 30, 28, 10),
    createUnit('infantry', 'defender', 25, 25, 10),
    createUnit('infantry', 'defender', 35, 26, 10),
    createUnit('sniper', 'defender', 28, 30),
    createUnit('sniper', 'defender', 38, 28),
    createUnit('atgm', 'defender', 32, 30),
    createUnit('tank', 'defender', 30, 32),
    createUnit('medic', 'defender', 27, 28),
    createUnit('artillery', 'defender', 30, 36),

    // Attackers — combined arms assault
    createUnit('infantry', 'attacker', 20, 4, 12),
    createUnit('infantry', 'attacker', 25, 3, 12),
    createUnit('infantry', 'attacker', 30, 4, 12),
    createUnit('infantry', 'attacker', 35, 3, 12),
    createUnit('infantry', 'attacker', 40, 5, 12),
    createUnit('tank', 'attacker', 22, 2),
    createUnit('tank', 'attacker', 33, 2),
    createUnit('apc', 'attacker', 28, 2),
    createUnit('apc', 'attacker', 37, 2),
    createUnit('artillery', 'attacker', 25, 1),
    createUnit('helicopter', 'attacker', 15, 1),
    createUnit('drone', 'attacker', 30, 1),
    createUnit('medic', 'attacker', 30, 5),
    createUnit('atgm', 'attacker', 38, 4),
  ];

  return {
    id: 'urban-defense',
    name: 'Urban Defense',
    description: 'Full combined-arms assault with artillery, helicopters, drones, snipers, and ATGM teams.',
    mapWidth: 60,
    mapHeight: 40,
    seed: 77,
    units,
  };
}

export function loadScenario(scenario: TacticalScenario) {
  const map = generateTacticalMap(
    scenario.mapWidth,
    scenario.mapHeight,
    scenario.seed,
    scenario.name,
  );
  return { map, units: scenario.units };
}

export const TACTICAL_SCENARIOS = [
  getVillageAssaultScenario,
  getUrbanDefenseScenario,
];
