import type { Country, Region, SimEvent, StrategyType, UnitComposition } from '../types';
import { UNIT_SPAWN_COST, getTotalUnits } from './combat';

const TERRAIN_INCOME: Record<string, number> = {
  plains: 3,
  forest: 2,
  mountains: 1,
  desert: 1,
  coast: 4,
  ocean: 0,
};

const TERRAIN_POP_GROWTH: Record<string, number> = {
  plains: 3,
  forest: 2,
  mountains: 1,
  desert: 0.5,
  coast: 4,
  ocean: 0,
};

const TERRAIN_POP_CAP: Record<string, number> = {
  plains: 200,
  forest: 150,
  mountains: 80,
  desert: 60,
  coast: 250,
  ocean: 0,
};

const WAR_UPKEEP_PER_ARMY = 0.5;
const BASE_INCOME_PER_REGION = 2;
const POP_INCOME_FACTOR = 0.02;
const FORTIFY_COST = 50;
const MAX_FORTIFICATION = 3;
const WAR_WEARINESS_RATE = 0.002;
const WAR_WEARINESS_DECAY = 0.001;
const WAR_WEARINESS_ECON_PENALTY = 0.15;

/** Get the preferred unit composition for a strategy */
export function getStrategyUnitMix(strategy: StrategyType, totalSize: number): UnitComposition {
  switch (strategy) {
    case 'aggressive':
      // 50% heavy, 30% light, 20% levy
      return {
        heavy: Math.floor(totalSize * 0.5),
        light: Math.floor(totalSize * 0.3),
        levy: totalSize - Math.floor(totalSize * 0.5) - Math.floor(totalSize * 0.3),
      };
    case 'expansionist':
      // 20% heavy, 60% light, 20% levy
      return {
        heavy: Math.floor(totalSize * 0.2),
        light: Math.floor(totalSize * 0.6),
        levy: totalSize - Math.floor(totalSize * 0.2) - Math.floor(totalSize * 0.6),
      };
    case 'opportunist':
      // 30% heavy, 40% light, 30% levy
      return {
        heavy: Math.floor(totalSize * 0.3),
        light: Math.floor(totalSize * 0.4),
        levy: totalSize - Math.floor(totalSize * 0.3) - Math.floor(totalSize * 0.4),
      };
    case 'defensive':
      // 40% heavy, 30% light, 30% levy
      return {
        heavy: Math.floor(totalSize * 0.4),
        light: Math.floor(totalSize * 0.3),
        levy: totalSize - Math.floor(totalSize * 0.4) - Math.floor(totalSize * 0.3),
      };
    case 'turtle':
      // 20% heavy, 20% light, 60% levy (cheap)
      return {
        heavy: Math.floor(totalSize * 0.2),
        light: Math.floor(totalSize * 0.2),
        levy: totalSize - Math.floor(totalSize * 0.2) - Math.floor(totalSize * 0.2),
      };
  }
}

/** Calculate spawn cost for a unit composition */
export function getSpawnCost(units: UnitComposition): number {
  return (
    units.heavy * UNIT_SPAWN_COST.heavy +
    units.light * UNIT_SPAWN_COST.light +
    units.levy * UNIT_SPAWN_COST.levy
  );
}

export function processEconomy(
  countries: Country[],
  regions: Region[],
  tick: number,
): { updatedCountries: Country[]; updatedRegions: Region[]; events: SimEvent[] } {
  const events: SimEvent[] = [];
  const updatedRegions = regions.map((r) => ({ ...r }));

  // Population growth for all owned regions
  for (const region of updatedRegions) {
    if (region.terrain === 'ocean' || !region.countryId) continue;
    const growth = TERRAIN_POP_GROWTH[region.terrain] ?? 1;
    const cap = TERRAIN_POP_CAP[region.terrain] ?? 100;
    // Logistic growth: slower as population approaches cap
    const growthRate = growth * (1 - region.population / cap);
    region.population = Math.min(cap, Math.max(0, region.population + growthRate));
  }

  const updatedCountries = countries.map((country) => {
    if (!country.isAlive) return country;

    // Calculate income from owned regions
    const ownedRegions = updatedRegions.filter((r) => r.countryId === country.id);
    let income = 0;
    for (const region of ownedRegions) {
      income += BASE_INCOME_PER_REGION + (TERRAIN_INCOME[region.terrain] ?? 0);
      // Population contributes to income
      income += region.population * POP_INCOME_FACTOR;
    }

    // Economy stat scales income (1-100 -> 0.5x-1.5x)
    income *= 0.5 + (country.economy / 100);

    // War weariness penalty
    const warCount = Object.values(country.relations).filter((r) => r === 'at_war').length;
    let warWeariness = country.warWeariness ?? 0;

    if (warCount > 0) {
      warWeariness = Math.min(1, warWeariness + WAR_WEARINESS_RATE * warCount);
    } else {
      warWeariness = Math.max(0, warWeariness - WAR_WEARINESS_DECAY);
    }

    income *= 1 - (warWeariness * WAR_WEARINESS_ECON_PENALTY);

    // War upkeep: active armies cost money — heavier units cost more
    const armyUpkeep = country.activeArmies.length * WAR_UPKEEP_PER_ARMY;
    let sizeUpkeep = 0;
    for (const army of country.activeArmies) {
      const units = army.units ?? { heavy: 0, light: army.size, levy: 0 };
      sizeUpkeep += units.heavy * 0.04 + units.light * 0.02 + units.levy * 0.01;
    }

    const netIncome = income - armyUpkeep - sizeUpkeep;
    const newTreasury = Math.max(0, country.treasury + netIncome);

    // AI auto-fortify border regions (every 20 ticks, if can afford)
    let treasury = newTreasury;
    const updatedWarStartTicks = { ...(country.warStartTicks ?? {}) };

    // Track war start ticks
    for (const [otherId, rel] of Object.entries(country.relations)) {
      if (rel === 'at_war' && !updatedWarStartTicks[otherId]) {
        updatedWarStartTicks[otherId] = tick;
      }
      if (rel !== 'at_war' && updatedWarStartTicks[otherId]) {
        delete updatedWarStartTicks[otherId];
      }
    }

    if (tick % 20 === 0 && warCount > 0 && treasury >= FORTIFY_COST) {
      // Find border regions with enemies and low fortification
      const borderRegions = ownedRegions.filter((r) =>
        r.fortification < MAX_FORTIFICATION &&
        r.neighbors.some((nId) => {
          const neighbor = updatedRegions.find((rr) => rr.id === nId);
          return neighbor && neighbor.countryId !== country.id && neighbor.countryId !== null;
        }),
      );

      if (borderRegions.length > 0) {
        // Fortify the least fortified border region
        const toFortify = borderRegions.sort((a, b) => a.fortification - b.fortification)[0];
        const regionIdx = updatedRegions.findIndex((r) => r.id === toFortify.id);
        if (regionIdx >= 0) {
          updatedRegions[regionIdx] = {
            ...updatedRegions[regionIdx],
            fortification: updatedRegions[regionIdx].fortification + 1,
          };
          treasury -= FORTIFY_COST;
          events.push({
            tick,
            type: 'fortification_built',
            actors: [country.id],
            details: {
              region: toFortify.id,
              level: updatedRegions[regionIdx].fortification,
              countryName: country.name,
            },
          });
        }
      }
    }

    return {
      ...country,
      treasury,
      warWeariness,
      warStartTicks: updatedWarStartTicks,
    };
  });

  return { updatedCountries, updatedRegions, events };
}

export function canAffordArmy(country: Country, units: UnitComposition): boolean {
  return country.treasury >= getSpawnCost(units);
}

export function spawnArmy(
  country: Country,
  regionId: number,
  units: UnitComposition,
  regions: Region[],
): Country {
  const totalSize = getTotalUnits(units);
  // Recruitment depletes population
  const region = regions.find((r) => r.id === regionId);
  if (region) {
    region.population = Math.max(0, region.population - totalSize * 0.5);
  }

  const army = {
    id: `${country.id}-army-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    size: totalSize,
    position: regionId,
    target: null as number | null,
    morale: 1.0,
    progress: 0,
    units,
  };

  return {
    ...country,
    treasury: country.treasury - getSpawnCost(units),
    activeArmies: [...country.activeArmies, army],
  };
}
