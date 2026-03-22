import type { Country, Region, Army, SimEvent, StrategyType } from '../types';
import { SeededRNG } from '../utils/random';
import { canAffordArmy, spawnArmy } from './economy';

interface AIAction {
  updatedCountry: Country;
  events: SimEvent[];
}

export function makeDecisions(
  country: Country,
  allCountries: Country[],
  regions: Region[],
  tick: number,
  rng: SeededRNG,
): AIAction {
  if (!country.isAlive) return { updatedCountry: country, events: [] };

  const events: SimEvent[] = [];
  let updated = { ...country };

  const ownedRegions = regions.filter((r) => r.countryId === country.id);
  if (ownedRegions.length === 0) return { updatedCountry: updated, events };

  const enemies = allCountries.filter(
    (c) => c.isAlive && c.id !== country.id,
  );

  // Diplomacy: form or break alliances
  updated = manageDiplomacy(updated, allCountries, regions, tick, rng, events);

  // Declare wars based on strategy
  updated = declareWars(updated, enemies, tick, rng, events);

  // Spawn armies if affordable and needed
  updated = spawnArmies(updated, ownedRegions, regions, rng);

  // Move armies toward targets
  updated = moveArmies(updated, regions, allCountries, rng);

  return { updatedCountry: updated, events };
}

function manageDiplomacy(
  country: Country,
  allCountries: Country[],
  regions: Region[],
  tick: number,
  rng: SeededRNG,
  events: SimEvent[],
): Country {
  const relations = { ...country.relations };
  const strategy = country.strategy;

  // Count how many wars we're in
  const warCount = Object.values(relations).filter((r) => r === 'at_war').length;
  const aliveOthers = allCountries.filter((c) => c.isAlive && c.id !== country.id);

  for (const other of aliveOthers) {
    const rel = relations[other.id] ?? 'neutral';

    // Form alliances: defensive and turtle strategies seek allies when at war
    if (rel === 'neutral' && warCount > 0) {
      let allianceChance = 0;
      switch (strategy) {
        case 'defensive': allianceChance = 0.03; break;
        case 'turtle': allianceChance = 0.04; break;
        case 'opportunist': allianceChance = 0.02; break;
        case 'expansionist': allianceChance = 0.01; break;
        case 'aggressive': allianceChance = 0.005; break;
      }

      // More likely to ally with someone who shares an enemy
      const sharedEnemies = Object.entries(relations)
        .filter(([, r]) => r === 'at_war')
        .some(([enemyId]) => other.relations[enemyId] === 'at_war');
      if (sharedEnemies) allianceChance *= 3;

      // Less likely if they're much stronger (threat assessment)
      const ourStrength = country.regions.length + country.activeArmies.reduce((s, a) => s + a.size, 0);
      const theirStrength = other.regions.length + other.activeArmies.reduce((s, a) => s + a.size, 0);
      if (theirStrength > ourStrength * 2) allianceChance *= 0.3;

      if (rng.next() < allianceChance) {
        relations[other.id] = 'allied';
        events.push({
          tick,
          type: 'alliance_formed',
          actors: [country.id, other.id],
          details: { country1: country.name, country2: other.name },
        });
      }
    }

    // Break alliances: aggressive and expansionist may betray allies
    if (rel === 'allied') {
      let betrayChance = 0;
      switch (strategy) {
        case 'aggressive': betrayChance = 0.008; break;
        case 'expansionist': betrayChance = 0.005; break;
        case 'opportunist': betrayChance = 0.003; break;
        default: betrayChance = 0.001; break;
      }

      // More likely to betray weak allies
      const allyStrength = other.regions.length;
      if (allyStrength < country.regions.length * 0.3) betrayChance *= 2;

      if (rng.next() < betrayChance) {
        relations[other.id] = 'neutral';
        events.push({
          tick,
          type: 'alliance_broken',
          actors: [country.id, other.id],
          details: { country1: country.name, country2: other.name },
        });
      }
    }
  }

  return { ...country, relations };
}

function declareWars(
  country: Country,
  enemies: Country[],
  tick: number,
  rng: SeededRNG,
  events: SimEvent[],
): Country {
  const relations = { ...country.relations };
  const strategy = country.strategy;

  for (const enemy of enemies) {
    const rel = relations[enemy.id] ?? 'neutral';
    if (rel === 'at_war') continue;

    let warChance = 0;
    switch (strategy) {
      case 'aggressive':
        warChance = 0.08;
        break;
      case 'expansionist':
        warChance = 0.05;
        break;
      case 'opportunist':
        // More likely to attack weaker enemies
        warChance = enemy.activeArmies.length < country.activeArmies.length ? 0.06 : 0.01;
        break;
      case 'defensive':
        warChance = 0.01;
        break;
      case 'turtle':
        warChance = 0.005;
        break;
    }

    if (rng.next() < warChance) {
      relations[enemy.id] = 'at_war';
      events.push({
        tick,
        type: 'war_declared',
        actors: [country.id, enemy.id],
        details: { aggressor: country.name, target: enemy.name },
      });
    }
  }

  return { ...country, relations };
}

function spawnArmies(
  country: Country,
  ownedRegions: Region[],
  allRegions: Region[],
  rng: SeededRNG,
): Country {
  let updated = { ...country };
  const strategy = country.strategy;

  // Determine spawn size based on strategy and stats
  const baseSize = Math.floor(country.armySize * 0.3) + 5;

  // Limit total armies
  const maxArmies = strategy === 'turtle' ? 2 : strategy === 'defensive' ? 3 : 5;
  if (updated.activeArmies.length >= maxArmies) return updated;

  // Check if we have enemies at war with us
  const atWar = Object.entries(updated.relations).some(([, rel]) => rel === 'at_war');

  // Spawn conditions based on strategy
  let shouldSpawn = false;
  switch (strategy) {
    case 'aggressive':
      shouldSpawn = atWar || rng.next() < 0.1;
      break;
    case 'expansionist':
      shouldSpawn = atWar || rng.next() < 0.06;
      break;
    case 'opportunist':
      shouldSpawn = atWar && rng.next() < 0.15;
      break;
    case 'defensive':
      shouldSpawn = atWar && rng.next() < 0.08;
      break;
    case 'turtle':
      shouldSpawn = atWar && rng.next() < 0.04;
      break;
  }

  if (shouldSpawn && canAffordArmy(updated, baseSize)) {
    // Spawn from a border region (one that has enemy neighbors)
    const borderRegions = ownedRegions.filter((r) =>
      r.neighbors.some((nId) => {
        const neighbor = allRegions.find((rr) => rr.id === nId);
        return neighbor && neighbor.countryId !== country.id && neighbor.terrain !== 'ocean';
      }),
    );

    const spawnRegion = borderRegions.length > 0
      ? borderRegions[rng.int(0, borderRegions.length - 1)]
      : ownedRegions[rng.int(0, ownedRegions.length - 1)];

    updated = spawnArmy(updated, spawnRegion.id, baseSize);
  }

  return updated;
}

function moveArmies(
  country: Country,
  regions: Region[],
  allCountries: Country[],
  rng: SeededRNG,
): Country {
  const strategy = country.strategy;
  const atWarWith = new Set(
    Object.entries(country.relations)
      .filter(([, rel]) => rel === 'at_war')
      .map(([id]) => id),
  );

  const updatedArmies = country.activeArmies.map((army) => {
    // If army is moving, continue movement
    if (army.target !== null && army.progress < 1) {
      return { ...army, progress: army.progress + 0.25 };
    }

    // If army arrived, reset progress
    if (army.target !== null && army.progress >= 1) {
      return { ...army, position: army.target, target: null, progress: 0 };
    }

    // Pick a target region
    const currentRegion = regions.find((r) => r.id === army.position);
    if (!currentRegion) return army;

    const neighborRegions = currentRegion.neighbors
      .map((nId) => regions.find((r) => r.id === nId))
      .filter((r): r is Region => r !== undefined && r.terrain !== 'ocean');

    if (neighborRegions.length === 0) return army;

    // Find enemy regions among neighbors
    const enemyRegions = neighborRegions.filter(
      (r) => r.countryId !== null && r.countryId !== country.id && atWarWith.has(r.countryId),
    );

    // Find neutral/unowned regions
    const unownedRegions = neighborRegions.filter(
      (r) => r.countryId === null || r.countryId !== country.id,
    );

    let targetRegion: Region | null = null;

    switch (strategy) {
      case 'aggressive':
        // Prioritize enemy regions
        targetRegion = enemyRegions.length > 0
          ? enemyRegions[rng.int(0, enemyRegions.length - 1)]
          : unownedRegions.length > 0
            ? unownedRegions[rng.int(0, unownedRegions.length - 1)]
            : null;
        break;

      case 'expansionist':
        // Prioritize unowned, then enemies
        targetRegion = unownedRegions.length > 0
          ? unownedRegions[rng.int(0, unownedRegions.length - 1)]
          : enemyRegions.length > 0
            ? enemyRegions[rng.int(0, enemyRegions.length - 1)]
            : null;
        break;

      case 'opportunist':
        // Attack weakest neighbor
        if (enemyRegions.length > 0) {
          const withDefenders = enemyRegions.map((r) => {
            const owner = allCountries.find((c) => c.id === r.countryId);
            const defenders = owner?.activeArmies.filter((a) => a.position === r.id) ?? [];
            const defenseStr = defenders.reduce((sum, a) => sum + a.size, 0);
            return { region: r, defenseStr };
          });
          withDefenders.sort((a, b) => a.defenseStr - b.defenseStr);
          targetRegion = withDefenders[0].region;
        }
        break;

      case 'defensive':
      case 'turtle':
        // Only attack if enemies are on our borders
        if (enemyRegions.length > 0 && rng.next() < 0.3) {
          targetRegion = enemyRegions[rng.int(0, enemyRegions.length - 1)];
        }
        break;
    }

    if (targetRegion) {
      return { ...army, target: targetRegion.id, progress: 0 };
    }

    return army;
  });

  return { ...country, activeArmies: updatedArmies };
}
