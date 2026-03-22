import type { TacticalUnit } from '../types';
import { UNIT_DEFINITIONS } from '../types';
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
  type: TacticalUnit['type'],
  faction: TacticalUnit['faction'],
  x: number,
  y: number,
  squadSize?: number,
): TacticalUnit {
  const stats = { ...UNIT_DEFINITIONS[type] };
  const maxSquad = type === 'infantry' ? (squadSize ?? 10) : 1;
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
    facing: faction === 'attacker' ? 4 : 0, // attackers face south, defenders face north
    selected: false,
    lastShotTick: -100,
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

    // Attackers (north)
    createUnit('infantry', 'attacker', 20, 5, 12),
    createUnit('infantry', 'attacker', 25, 4, 12),
    createUnit('infantry', 'attacker', 30, 5, 12),
    createUnit('infantry', 'attacker', 35, 4, 12),
    createUnit('tank', 'attacker', 27, 2),
    createUnit('tank', 'attacker', 33, 2),
    createUnit('apc', 'attacker', 30, 3),
  ];

  return {
    id: 'village-assault',
    name: 'Village Assault',
    description: 'Attack or defend a Ukrainian-style village with infantry and armored units.',
    mapWidth: 60,
    mapHeight: 40,
    seed: 42,
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
];
