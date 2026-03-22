import type { Country, Region, SimEvent } from '../types';

const TERRAIN_INCOME: Record<string, number> = {
  plains: 3,
  forest: 2,
  mountains: 1,
  desert: 1,
  coast: 4,
  ocean: 0,
};

const WAR_UPKEEP_PER_ARMY = 0.5;
const BASE_INCOME_PER_REGION = 2;

export function processEconomy(
  countries: Country[],
  regions: Region[],
  tick: number,
): { updatedCountries: Country[]; events: SimEvent[] } {
  const events: SimEvent[] = [];

  const updatedCountries = countries.map((country) => {
    if (!country.isAlive) return country;

    // Calculate income from owned regions
    const ownedRegions = regions.filter((r) => r.countryId === country.id);
    let income = 0;
    for (const region of ownedRegions) {
      income += BASE_INCOME_PER_REGION + (TERRAIN_INCOME[region.terrain] ?? 0);
    }

    // Economy stat scales income (1-100 → 0.5x-1.5x)
    income *= 0.5 + (country.economy / 100);

    // War upkeep: active armies cost money
    const armyUpkeep = country.activeArmies.length * WAR_UPKEEP_PER_ARMY;
    const totalArmySize = country.activeArmies.reduce((sum, a) => sum + a.size, 0);
    const sizeUpkeep = totalArmySize * 0.02;

    const netIncome = income - armyUpkeep - sizeUpkeep;
    const newTreasury = Math.max(0, country.treasury + netIncome);

    return { ...country, treasury: newTreasury };
  });

  return { updatedCountries, events };
}

export function canAffordArmy(country: Country, size: number): boolean {
  return country.treasury >= size * 2;
}

export function spawnArmy(country: Country, regionId: number, size: number): Country {
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
