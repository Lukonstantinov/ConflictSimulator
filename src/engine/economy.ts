import type { Country, Region, SimEvent } from '../types';

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

    // War upkeep: active armies cost money
    const armyUpkeep = country.activeArmies.length * WAR_UPKEEP_PER_ARMY;
    const totalArmySize = country.activeArmies.reduce((sum, a) => sum + a.size, 0);
    const sizeUpkeep = totalArmySize * 0.02;

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

export function canAffordArmy(country: Country, size: number): boolean {
  return country.treasury >= size * 2;
}

export function spawnArmy(country: Country, regionId: number, size: number, regions: Region[]): Country {
  // Recruitment depletes population
  const region = regions.find((r) => r.id === regionId);
  if (region) {
    region.population = Math.max(0, region.population - size * 0.5);
  }

  const army = {
    id: `${country.id}-army-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    size,
    position: regionId,
    target: null,
    morale: 1.0,
    progress: 0,
  };

  return {
    ...country,
    treasury: country.treasury - size * 2,
    activeArmies: [...country.activeArmies, army],
  };
}
