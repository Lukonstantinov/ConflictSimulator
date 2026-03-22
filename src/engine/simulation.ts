import type { Country, Region, Army, SimEvent, StateDelta } from '../types';
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

  constructor(regions: Region[], countries: Country[], seed: number) {
    this.regions = regions.map((r) => ({ ...r }));
    this.countries = countries.map((c) => ({
      ...c,
      activeArmies: [...c.activeArmies],
      relations: { ...c.relations },
    }));
    this.tick = 0;
    this.rng = new SeededRNG(seed);

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

    // 1. Economy phase
    const ecoResult = processEconomy(this.countries, this.regions, this.tick);
    this.countries = ecoResult.updatedCountries;
    events.push(...ecoResult.events);

    // 2. AI decision phase
    for (let i = 0; i < this.countries.length; i++) {
      const c = this.countries[i];
      if (!c.isAlive) continue;

      const aiResult = makeDecisions(c, this.countries, this.regions, this.tick, this.rng);
      this.countries[i] = aiResult.updatedCountry;
      events.push(...aiResult.events);

      // Sync war declarations to be bidirectional
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
            };
          }
        }
      }
    }

    // 3. Movement & Combat phase
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

              const result = resolveBattle(arrivedArmy, defArmy, targetRegion.terrain, this.rng);

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
                  this.regions[regionIdx] = { ...this.regions[regionIdx], countryId: country.id };
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
                  processedArmies.push(updateMorale({ ...arrivedArmy, size: result.attackerRemaining }, true));
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
                  processedArmies.push(updateMorale({ ...arrivedArmy, size: result.attackerRemaining, position: army.position }, false));
                }
                // Update defending army size
                if (defenderIdx >= 0 && result.defenderRemaining > 0) {
                  const defArmies = this.countries[defenderIdx].activeArmies.map((a) =>
                    a.id === defArmy!.id ? updateMorale({ ...a, size: result.defenderRemaining }, true) : a,
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

    // 4. Update country region lists & check elimination
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

    // 5. Check for winner
    const aliveCountries = this.countries.filter((c) => c.isAlive);
    const winner = aliveCountries.length === 1 ? aliveCountries[0].id : null;

    const countryUpdates = this.countries.map((c) => ({
      id: c.id,
      treasury: c.treasury,
      regions: c.regions,
      activeArmies: c.activeArmies,
      relations: c.relations,
      isAlive: c.isAlive,
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

  getSnapshot(): SimulationSnapshot {
    return {
      regions: this.regions.map((r) => ({ ...r })),
      countries: this.countries.map((c) => ({
        ...c,
        activeArmies: [...c.activeArmies],
        relations: { ...c.relations },
      })),
      tick: this.tick,
    };
  }
}
