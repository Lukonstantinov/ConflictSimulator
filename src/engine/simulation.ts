import type { Country, Region, Army, SimEvent, StateDelta, VictoryConfig } from '../types';
import { SeededRNG } from '../utils/random';
import { processEconomy } from './economy';
import { resolveBattle, updateMorale } from './combat';
import { makeDecisions } from './ai';

export interface SimulationSnapshot {
  regions: Region[];
  countries: Country[];
  tick: number;
}

export class SimulationEngine {
  private regions: Region[];
  private countries: Country[];
  private tick: number;
  private rng: SeededRNG;
  private victoryConfig: VictoryConfig;

  constructor(
    regions: Region[],
    countries: Country[],
    seed: number,
    victoryConfig?: VictoryConfig,
  ) {
    this.regions = regions.map((r) => ({
      ...r,
      population: r.population ?? 50,
      fortification: r.fortification ?? 0,
    }));
    this.countries = countries.map((c) => ({
      ...c,
      activeArmies: [...c.activeArmies],
      relations: { ...c.relations },
      warWeariness: c.warWeariness ?? 0,
      warStartTicks: { ...(c.warStartTicks ?? {}) },
    }));
    this.tick = 0;
    this.rng = new SeededRNG(seed);
    this.victoryConfig = victoryConfig ?? {
      condition: 'conquest',
      economicThreshold: 5000,
      territorialPercent: 75,
    };

    // Initialize relations: all neutral if not set
    for (const c of this.countries) {
      for (const other of this.countries) {
        if (c.id !== other.id && !c.relations[other.id]) {
          c.relations[other.id] = 'neutral';
        }
      }
    }

    // Ensure each country with regions has at least one army
    for (let i = 0; i < this.countries.length; i++) {
      const c = this.countries[i];
      if (c.regions.length > 0 && c.activeArmies.length === 0) {
        const spawnRegion = c.regions[0];
        const armySize = Math.floor(c.armySize * 0.5) + 10;
        this.countries[i] = {
          ...c,
          activeArmies: [
            {
              id: `${c.id}-army-init`,
              size: armySize,
              position: spawnRegion,
              target: null,
              morale: 1.0,
              progress: 0,
            },
          ],
        };
      }
    }
  }

  runTick(): StateDelta {
    this.tick++;

    const events: SimEvent[] = [];
    const regionChanges: StateDelta['regionChanges'] = [];
    const eliminatedCountries: string[] = [];

    // 1. Economy phase (includes population growth, war weariness, fortification)
    const ecoResult = processEconomy(this.countries, this.regions, this.tick);
    this.countries = ecoResult.updatedCountries;
    this.regions = ecoResult.updatedRegions;
    events.push(...ecoResult.events);

    // 2. Supply line attrition: armies far from friendly territory suffer losses
    this.applySupplyAttrition();

    // 3. AI decision phase
    for (let i = 0; i < this.countries.length; i++) {
      const c = this.countries[i];
      if (!c.isAlive) continue;

      const aiResult = makeDecisions(c, this.countries, this.regions, this.tick, this.rng);
      this.countries[i] = aiResult.updatedCountry;
      this.regions = aiResult.updatedRegions;
      events.push(...aiResult.events);

      // Sync war declarations and peace treaties to be bidirectional
      for (const evt of aiResult.events) {
        if (evt.type === 'war_declared') {
          const targetId = evt.actors[1];
          const targetIdx = this.countries.findIndex((cc) => cc.id === targetId);
          if (targetIdx >= 0) {
            this.countries[targetIdx] = {
              ...this.countries[targetIdx],
              relations: {
                ...this.countries[targetIdx].relations,
                [c.id]: 'at_war',
              },
              warStartTicks: {
                ...this.countries[targetIdx].warStartTicks,
                [c.id]: this.tick,
              },
            };
          }
        }
        if (evt.type === 'peace_treaty') {
          const targetId = evt.actors[1];
          const targetIdx = this.countries.findIndex((cc) => cc.id === targetId);
          if (targetIdx >= 0) {
            const newWarStartTicks = { ...this.countries[targetIdx].warStartTicks };
            delete newWarStartTicks[c.id];
            this.countries[targetIdx] = {
              ...this.countries[targetIdx],
              relations: {
                ...this.countries[targetIdx].relations,
                [c.id]: 'neutral',
              },
              warStartTicks: newWarStartTicks,
            };
          }
        }
      }
    }

    // 4. Movement & Combat phase
    for (let i = 0; i < this.countries.length; i++) {
      const country = this.countries[i];
      if (!country.isAlive) continue;

      const processedArmies: Army[] = [];

      for (const army of country.activeArmies) {
        // Army arrived at target
        if (army.target !== null && army.progress >= 1) {
          const targetRegion = this.regions.find((r) => r.id === army.target);
          if (!targetRegion) {
            processedArmies.push({ ...army, target: null, progress: 0 });
            continue;
          }

          const arrivedArmy = { ...army, position: army.target, target: null, progress: 0 };

          // Check if target is owned by an enemy
          if (targetRegion.countryId && targetRegion.countryId !== country.id) {
            const defenderId = targetRegion.countryId;
            const defenderIdx = this.countries.findIndex((c) => c.id === defenderId);
            const defender = defenderIdx >= 0 ? this.countries[defenderIdx] : null;

            if (defender && defender.isAlive) {
              // Find defending army on this region
              let defArmy = defender.activeArmies.find((a) => a.position === targetRegion.id && a.target === null);

              if (!defArmy) {
                // Create garrison
                defArmy = {
                  id: `${defender.id}-garrison-${targetRegion.id}`,
                  size: Math.max(5, Math.floor(defender.armySize * 0.2)),
                  position: targetRegion.id,
                  target: null,
                  morale: 0.8,
                  progress: 0,
                };
              }

              const result = resolveBattle(arrivedArmy, defArmy, targetRegion, this.rng);

              events.push({
                tick: this.tick,
                type: 'battle',
                actors: [country.id, defenderId],
                details: {
                  region: targetRegion.id,
                  attackerName: country.name,
                  defenderName: defender.name,
                  attackerWins: result.attackerWins,
                  attackerRemaining: result.attackerRemaining,
                  defenderRemaining: result.defenderRemaining,
                },
              });

              if (result.attackerWins) {
                // Attacker captures region
                const regionIdx = this.regions.findIndex((r) => r.id === targetRegion.id);
                if (regionIdx >= 0) {
                  // Reduce fortification on capture
                  this.regions[regionIdx] = {
                    ...this.regions[regionIdx],
                    countryId: country.id,
                    fortification: Math.max(0, this.regions[regionIdx].fortification - 1),
                  };
                  regionChanges.push({ regionId: targetRegion.id, countryId: country.id });
                }

                events.push({
                  tick: this.tick,
                  type: 'region_captured',
                  actors: [country.id, defenderId],
                  details: {
                    region: targetRegion.id,
                    capturedBy: country.name,
                    capturedFrom: defender.name,
                  },
                });

                // Update attacker army
                if (result.attackerRemaining > 0) {
                  processedArmies.push(updateMorale({ ...arrivedArmy, size: result.attackerRemaining }, true, country.warWeariness));
                }

                // Update defender armies — remove destroyed garrison
                if (defenderIdx >= 0) {
                  const defArmies = this.countries[defenderIdx].activeArmies.filter(
                    (a) => a.id !== defArmy!.id,
                  );
                  if (result.defenderRemaining > 0) {
                    // Retreated defender survives with fewer troops — pick random owned neighbor
                    const retreatRegions = this.regions.filter(
                      (r) => r.countryId === defenderId && r.id !== targetRegion.id,
                    );
                    if (retreatRegions.length > 0) {
                      const retreatTo = retreatRegions[this.rng.int(0, retreatRegions.length - 1)];
                      defArmies.push(
                        updateMorale(
                          { ...defArmy!, size: result.defenderRemaining, position: retreatTo.id, target: null, progress: 0 },
                          false,
                          defender.warWeariness,
                        ),
                      );
                    }
                  }
                  this.countries[defenderIdx] = {
                    ...this.countries[defenderIdx],
                    activeArmies: defArmies,
                  };
                }
              } else {
                // Attacker repelled
                if (result.attackerRemaining > 0) {
                  processedArmies.push(updateMorale({ ...arrivedArmy, size: result.attackerRemaining, position: army.position }, false, country.warWeariness));
                }
                // Update defending army size
                if (defenderIdx >= 0 && result.defenderRemaining > 0) {
                  const defArmies = this.countries[defenderIdx].activeArmies.map((a) =>
                    a.id === defArmy!.id ? updateMorale({ ...a, size: result.defenderRemaining }, true, defender.warWeariness) : a,
                  );
                  this.countries[defenderIdx] = {
                    ...this.countries[defenderIdx],
                    activeArmies: defArmies,
                  };
                }
              }
            } else {
              // No active defender — capture undefended
              const regionIdx = this.regions.findIndex((r) => r.id === targetRegion.id);
              if (regionIdx >= 0) {
                this.regions[regionIdx] = { ...this.regions[regionIdx], countryId: country.id };
                regionChanges.push({ regionId: targetRegion.id, countryId: country.id });
              }
              processedArmies.push(arrivedArmy);
            }
          } else if (!targetRegion.countryId) {
            // Capture unowned region
            const regionIdx = this.regions.findIndex((r) => r.id === targetRegion.id);
            if (regionIdx >= 0) {
              this.regions[regionIdx] = { ...this.regions[regionIdx], countryId: country.id };
              regionChanges.push({ regionId: targetRegion.id, countryId: country.id });
            }
            processedArmies.push(arrivedArmy);
          } else {
            // Friendly region, just move in
            processedArmies.push(arrivedArmy);
          }
        } else {
          // Army still moving or idle
          processedArmies.push(army);
        }
      }

      // Remove dead armies (size <= 0)
      this.countries[i] = {
        ...this.countries[i],
        activeArmies: processedArmies.filter((a) => a.size > 0),
      };
    }

    // 5. Update country region lists & check elimination
    for (let i = 0; i < this.countries.length; i++) {
      const c = this.countries[i];
      if (!c.isAlive) continue;

      const owned = this.regions.filter((r) => r.countryId === c.id).map((r) => r.id);
      this.countries[i] = { ...this.countries[i], regions: owned };

      if (owned.length === 0) {
        this.countries[i] = {
          ...this.countries[i],
          isAlive: false,
          activeArmies: [],
        };
        eliminatedCountries.push(c.id);
        events.push({
          tick: this.tick,
          type: 'country_eliminated',
          actors: [c.id],
          details: { name: c.name },
        });
      }
    }

    // 6. Check for winner based on victory condition
    const winner = this.checkVictory();

    const countryUpdates = this.countries.map((c) => ({
      id: c.id,
      treasury: c.treasury,
      regions: c.regions,
      activeArmies: c.activeArmies,
      relations: c.relations,
      isAlive: c.isAlive,
      warWeariness: c.warWeariness,
      warStartTicks: c.warStartTicks,
    }));

    const armyUpdates = this.countries
      .filter((c) => c.isAlive)
      .map((c) => ({ countryId: c.id, armies: c.activeArmies }));

    return {
      tick: this.tick,
      regionChanges,
      countryUpdates,
      armyUpdates,
      events,
      eliminatedCountries,
      winner,
    };
  }

  private applySupplyAttrition(): void {
    for (let i = 0; i < this.countries.length; i++) {
      const country = this.countries[i];
      if (!country.isAlive) continue;

      const ownedSet = new Set(country.regions);

      const updatedArmies = country.activeArmies.map((army) => {
        // If army is in friendly territory, no attrition
        if (ownedSet.has(army.position)) return army;

        // Check how far from friendly territory (simple: is any neighbor friendly?)
        const currentRegion = this.regions.find((r) => r.id === army.position);
        if (!currentRegion) return army;

        const hasNearbySupply = currentRegion.neighbors.some((nId) => ownedSet.has(nId));

        if (!hasNearbySupply) {
          // Deep in enemy territory: suffer attrition
          const attrition = Math.max(1, Math.floor(army.size * 0.02));
          return {
            ...army,
            size: Math.max(1, army.size - attrition),
            morale: Math.max(0.3, army.morale - 0.01),
          };
        }

        return army;
      });

      this.countries[i] = { ...this.countries[i], activeArmies: updatedArmies };
    }
  }

  private checkVictory(): string | null {
    const aliveCountries = this.countries.filter((c) => c.isAlive);

    // Conquest: last country standing
    if (this.victoryConfig.condition === 'conquest') {
      return aliveCountries.length === 1 ? aliveCountries[0].id : null;
    }

    // Economic: first to accumulate threshold treasury
    if (this.victoryConfig.condition === 'economic') {
      const winner = aliveCountries.find((c) => c.treasury >= this.victoryConfig.economicThreshold);
      return winner?.id ?? null;
    }

    // Territorial: first to control X% of land
    if (this.victoryConfig.condition === 'territorial') {
      const totalLand = this.regions.filter((r) => r.terrain !== 'ocean').length;
      const threshold = Math.floor(totalLand * (this.victoryConfig.territorialPercent / 100));
      const winner = aliveCountries.find((c) => c.regions.length >= threshold);
      return winner?.id ?? null;
    }

    return aliveCountries.length === 1 ? aliveCountries[0].id : null;
  }

  getSnapshot(): SimulationSnapshot {
    return {
      regions: this.regions.map((r) => ({ ...r })),
      countries: this.countries.map((c) => ({
        ...c,
        activeArmies: [...c.activeArmies],
        relations: { ...c.relations },
        warStartTicks: { ...(c.warStartTicks ?? {}) },
      })),
      tick: this.tick,
    };
  }
}
