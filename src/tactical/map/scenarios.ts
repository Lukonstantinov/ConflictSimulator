import type { TacticalUnit, TacticalUnitType } from '../types';
import { UNIT_DEFINITIONS, UNIT_AMMO, UNIT_SMOKE } from '../types';
import { generateTacticalMap, generateTacticalMapFromPreset } from './grid';
import type { MapPreset, GenerationParams } from './grid';

export interface TacticalScenario {
  id: string;
  name: string;
  description: string;
  mapWidth: number;
  mapHeight: number;
  seed: number;
  mapPreset?: MapPreset;
  mapParams?: GenerationParams;
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

export function getForestAmbushScenario(): TacticalScenario {
  unitIdCounter = 0;

  const units: TacticalUnit[] = [
    // Defenders — ambush force hidden in forest
    createUnit('infantry', 'defender', 22, 24, 8),
    createUnit('infantry', 'defender', 28, 26, 8),
    createUnit('sniper', 'defender', 18, 22),
    createUnit('sniper', 'defender', 30, 20),
    createUnit('atgm', 'defender', 25, 28),
    createUnit('medic', 'defender', 24, 26),

    // Attackers — convoy moving south along road
    createUnit('infantry', 'attacker', 22, 4, 10),
    createUnit('infantry', 'attacker', 26, 3, 10),
    createUnit('apc', 'attacker', 23, 2),
    createUnit('apc', 'attacker', 27, 2),
    createUnit('tank', 'attacker', 24, 1),
    createUnit('drone', 'attacker', 20, 1),
    createUnit('medic', 'attacker', 25, 5),
  ];

  return {
    id: 'forest-ambush',
    name: 'Forest Ambush',
    description: 'Defend the forest road or lead a convoy through enemy-held woodland. Snipers dominate sightlines.',
    mapWidth: 50,
    mapHeight: 40,
    seed: 100,
    mapPreset: 'forest',
    mapParams: { preset: 'forest', treeDensity: 0.7, hasTrenches: false },
    units,
  };
}

export function getFactoryAssaultScenario(): TacticalScenario {
  unitIdCounter = 0;

  const units: TacticalUnit[] = [
    // Defenders — entrenched in warehouses
    createUnit('infantry', 'defender', 28, 22, 10),
    createUnit('infantry', 'defender', 35, 20, 10),
    createUnit('infantry', 'defender', 22, 26, 8),
    createUnit('tank', 'defender', 32, 28),
    createUnit('atgm', 'defender', 25, 24),
    createUnit('sniper', 'defender', 38, 18),
    createUnit('artillery', 'defender', 30, 32),
    createUnit('medic', 'defender', 30, 26),

    // Attackers — heavy armor assault
    createUnit('infantry', 'attacker', 18, 4, 12),
    createUnit('infantry', 'attacker', 25, 3, 12),
    createUnit('infantry', 'attacker', 32, 4, 12),
    createUnit('infantry', 'attacker', 40, 4, 12),
    createUnit('tank', 'attacker', 20, 2),
    createUnit('tank', 'attacker', 30, 2),
    createUnit('tank', 'attacker', 38, 2),
    createUnit('apc', 'attacker', 25, 3),
    createUnit('helicopter', 'attacker', 15, 1),
    createUnit('drone', 'attacker', 28, 1),
    createUnit('atgm', 'attacker', 35, 5),
    createUnit('medic', 'attacker', 28, 6),
  ];

  return {
    id: 'factory-assault',
    name: 'Factory Assault',
    description: 'Storm a fortified factory complex. Defenders hold warehouses while attackers push with heavy armor.',
    mapWidth: 60,
    mapHeight: 40,
    seed: 200,
    mapPreset: 'factory',
    mapParams: { preset: 'factory', buildingDensity: 0.8, hasTrenches: true },
    units,
  };
}

export function getCoastalLandingScenario(): TacticalScenario {
  unitIdCounter = 0;

  const units: TacticalUnit[] = [
    // Defenders — fortified on high ground inland
    createUnit('infantry', 'defender', 20, 10, 10),
    createUnit('infantry', 'defender', 30, 8, 10),
    createUnit('infantry', 'defender', 40, 12, 10),
    createUnit('tank', 'defender', 28, 14),
    createUnit('sniper', 'defender', 35, 8),
    createUnit('atgm', 'defender', 22, 16),
    createUnit('artillery', 'defender', 30, 5),
    createUnit('medic', 'defender', 32, 10),

    // Attackers — amphibious assault from south
    createUnit('infantry', 'attacker', 18, 28, 12),
    createUnit('infantry', 'attacker', 25, 27, 12),
    createUnit('infantry', 'attacker', 33, 28, 12),
    createUnit('infantry', 'attacker', 42, 27, 12),
    createUnit('apc', 'attacker', 20, 26),
    createUnit('apc', 'attacker', 30, 26),
    createUnit('apc', 'attacker', 40, 26),
    createUnit('tank', 'attacker', 25, 25),
    createUnit('helicopter', 'attacker', 15, 24),
    createUnit('drone', 'attacker', 28, 24),
    createUnit('medic', 'attacker', 30, 28),
  ];

  return {
    id: 'coastal-landing',
    name: 'Coastal Landing',
    description: 'Amphibious assault on a fortified coastline. Defenders hold the high ground while attackers push inland.',
    mapWidth: 60,
    mapHeight: 40,
    seed: 300,
    mapPreset: 'coastal',
    mapParams: { preset: 'coastal', buildingDensity: 0.6, treeDensity: 0.25, hasTrenches: true },
    units,
  };
}

export function loadScenario(scenario: TacticalScenario) {
  const map = scenario.mapPreset
    ? generateTacticalMapFromPreset(
        scenario.mapWidth,
        scenario.mapHeight,
        scenario.seed,
        scenario.mapParams ?? { preset: scenario.mapPreset },
        scenario.name,
      )
    : generateTacticalMap(
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
  getForestAmbushScenario,
  getFactoryAssaultScenario,
  getCoastalLandingScenario,
];
