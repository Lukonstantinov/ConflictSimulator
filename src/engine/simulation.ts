import type { Country, Region, Army, SimEvent, StateDelta, VictoryConfig, BorderFront } from '../types';
import { SeededRNG } from '../utils/random';
import { processEconomy, getStrategyUnitMix } from './economy';
import { resolveBattle, resolveBorderCombat, updateMorale, defaultUnits, applyLossesToUnits, getTotalUnits } from './combat';
import { makeDecisions } from './ai';

export interface SimulationSnapshot {
  regions: Region[];
  countries: Country[];
  tick: number;
  borderFronts: BorderFront[];
}

export class SimulationEngine {
  private regions: Region[];
  private countries: Country[];
  private tick: number;
  private rng: SeededRNG;
  private victoryConfig: VictoryConfig;
  private borderFronts: BorderFront[] = [];

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
      activeArmies: c.activeArmies.map((a) => ({
        ...a,
        units: a.units ?? defaultUnits(a.size),
      })),
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
        const units = getStrategyUnitMix(c.strategy, armySize);
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
              units,
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

    // 4. Border Front Combat — resolve ongoing border fronts
    this.resolveBorderFronts(events, regionChanges);

    // 5. Movement & Combat phase — armies arriving at enemy borders create fronts
    for (let i = 0; i < this.countries.length; i++) {
      const country = this.countries[i];
      if (!country.isAlive) continue;

      const processedArmies: Army[] = [];

      for (const army of country.activeArmies) {
        // Skip armies engaged in border fronts (handled above)
        if (army.borderFrontId) {
          processedArmies.push(army);
          continue;
        }

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
              // Create a border front instead of instant combat
              const frontId = `front-${army.position}-${targetRegion.id}-${this.tick}`;

              // Find or create a garrison defender
              let defArmy = defender.activeArmies.find((a) => a.position === targetRegion.id && !a.target && !a.borderFrontId);

              if (!defArmy) {
                // Create garrison
                const garrisonSize = Math.max(5, Math.floor(defender.armySize * 0.2));
                const garrisonUnits = getStrategyUnitMix(defender.strategy, garrisonSize);
                defArmy = {
                  id: `${defender.id}-garrison-${targetRegion.id}`,
                  size: garrisonSize,
                  position: targetRegion.id,
                  target: null,
                  morale: 0.8,
                  progress: 0,
                  units: garrisonUnits,
                  borderFrontId: frontId,
                };
                // Add garrison to defender
                if (defenderIdx >= 0) {
                  this.countries[defenderIdx] = {
                    ...this.countries[defenderIdx],
                    activeArmies: [...this.countries[defenderIdx].activeArmies, defArmy],
                  };
                }
              } else {
                // Assign existing defender to this front
                if (defenderIdx >= 0) {
                  this.countries[defenderIdx] = {
                    ...this.countries[defenderIdx],
                    activeArmies: this.countries[defenderIdx].activeArmies.map((a) =>
                      a.id === defArmy!.id ? { ...a, borderFrontId: frontId } : a,
                    ),
                  };
                }
              }

              // Create border front
              const front: BorderFront = {
                id: frontId,
                attackerRegionId: army.position,
                defenderRegionId: targetRegion.id,
                attackerCountryId: country.id,
                defenderCountryId: defenderId,
                attackerArmyId: arrivedArmy.id,
                defenderArmyId: defArmy.id,
                frontPosition: 0,
              };
              this.borderFronts.push(front);

              // Keep attacker at their side of the border
              processedArmies.push({
                ...arrivedArmy,
                position: army.position, // Stay in origin region
                borderFrontId: frontId,
              });
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

    // 6. Update country region lists & check elimination
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

        // Remove any border fronts involving eliminated country
        this.borderFronts = this.borderFronts.filter(
          (f) => f.attackerCountryId !== c.id && f.defenderCountryId !== c.id,
        );
      }
    }

    // Clean up border fronts for peace treaties
    this.cleanupPeacefulFronts();

    // 7. Check for winner based on victory condition
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
      borderFronts: [...this.borderFronts],
    };
  }

  private resolveBorderFronts(events: SimEvent[], regionChanges: StateDelta['regionChanges']): void {
    const resolvedFronts: string[] = [];

    for (const front of this.borderFronts) {
      const attackerIdx = this.countries.findIndex((c) => c.id === front.attackerCountryId);
      const defenderIdx = this.countries.findIndex((c) => c.id === front.defenderCountryId);
      if (attackerIdx < 0 || defenderIdx < 0) {
        resolvedFronts.push(front.id);
        continue;
      }

      const attacker = this.countries[attackerIdx];
      const defender = this.countries[defenderIdx];
      if (!attacker.isAlive || !defender.isAlive) {
        resolvedFronts.push(front.id);
        continue;
      }

      const attackerArmy = attacker.activeArmies.find((a) => a.id === front.attackerArmyId);
      let defenderArmy = defender.activeArmies.find((a) => a.id === front.defenderArmyId);

      if (!attackerArmy) {
        resolvedFronts.push(front.id);
        // Free up defender
        if (defenderArmy) {
          this.countries[defenderIdx] = {
            ...this.countries[defenderIdx],
            activeArmies: this.countries[defenderIdx].activeArmies.map((a) =>
              a.id === defenderArmy!.id ? { ...a, borderFrontId: undefined } : a,
            ),
          };
        }
        continue;
      }

      if (!defenderArmy) {
        // Defender destroyed — breakthrough
        front.frontPosition = 1.0;
      }

      const defenderRegion = this.regions.find((r) => r.id === front.defenderRegionId);
      if (!defenderRegion) {
        resolvedFronts.push(front.id);
        continue;
      }

      if (defenderArmy && front.frontPosition < 1.0) {
        // Resolve one tick of sustained border combat
        const result = resolveBorderCombat(attackerArmy, defenderArmy, defenderRegion, front, this.rng);

        front.frontPosition = Math.max(0, Math.min(1, front.frontPosition + result.frontDelta));

        // Apply losses
        if (result.attackerLosses > 0) {
          const newUnits = applyLossesToUnits(attackerArmy.units ?? defaultUnits(attackerArmy.size), attackerArmy.size, result.attackerLosses);
          const newSize = Math.max(0, attackerArmy.size - result.attackerLosses);
          this.countries[attackerIdx] = {
            ...this.countries[attackerIdx],
            activeArmies: this.countries[attackerIdx].activeArmies.map((a) =>
              a.id === attackerArmy!.id ? { ...a, size: newSize, units: newUnits } : a,
            ),
          };
        }

        if (result.defenderLosses > 0) {
          const newUnits = applyLossesToUnits(defenderArmy.units ?? defaultUnits(defenderArmy.size), defenderArmy.size, result.defenderLosses);
          const newSize = Math.max(0, defenderArmy.size - result.defenderLosses);
          this.countries[defenderIdx] = {
            ...this.countries[defenderIdx],
            activeArmies: this.countries[defenderIdx].activeArmies.map((a) =>
              a.id === defenderArmy!.id ? { ...a, size: newSize, units: newUnits } : a,
            ),
          };

          // Check if defender destroyed
          if (newSize <= 0) {
            front.frontPosition = 1.0;
          }
        }

        // Check if attacker destroyed
        const updatedAttacker = this.countries[attackerIdx].activeArmies.find((a) => a.id === front.attackerArmyId);
        if (updatedAttacker && updatedAttacker.size <= 0) {
          // Attacker destroyed — front collapses, defender wins
          resolvedFronts.push(front.id);
          // Free defender
          this.countries[defenderIdx] = {
            ...this.countries[defenderIdx],
            activeArmies: this.countries[defenderIdx].activeArmies
              .filter((a) => a.size > 0)
              .map((a) => a.id === front.defenderArmyId ? { ...a, borderFrontId: undefined } : a),
          };
          // Remove dead attacker
          this.countries[attackerIdx] = {
            ...this.countries[attackerIdx],
            activeArmies: this.countries[attackerIdx].activeArmies.filter((a) => a.size > 0),
          };
          events.push({
            tick: this.tick,
            type: 'border_clash',
            actors: [front.attackerCountryId, front.defenderCountryId],
            details: {
              region: front.defenderRegionId,
              attackerName: attacker.name,
              defenderName: defender.name,
              attackerWins: false,
            },
          });
          continue;
        }

        // Emit border clash event periodically
        if (this.tick % 5 === 0) {
          events.push({
            tick: this.tick,
            type: 'border_clash',
            actors: [front.attackerCountryId, front.defenderCountryId],
            details: {
              region: front.defenderRegionId,
              attackerName: attacker.name,
              defenderName: defender.name,
              frontPosition: front.frontPosition,
              attackerWins: front.frontPosition > 0.5,
            },
          });
        }
      }

      // Check for breakthrough — region captured
      if (front.frontPosition >= 1.0) {
        resolvedFronts.push(front.id);

        const regionIdx = this.regions.findIndex((r) => r.id === front.defenderRegionId);
        if (regionIdx >= 0) {
          this.regions[regionIdx] = {
            ...this.regions[regionIdx],
            countryId: front.attackerCountryId,
            fortification: Math.max(0, this.regions[regionIdx].fortification - 1),
          };
          regionChanges.push({ regionId: front.defenderRegionId, countryId: front.attackerCountryId });
        }

        events.push({
          tick: this.tick,
          type: 'border_breakthrough',
          actors: [front.attackerCountryId, front.defenderCountryId],
          details: {
            region: front.defenderRegionId,
            attackerName: attacker.name,
            defenderName: defender.name,
          },
        });

        events.push({
          tick: this.tick,
          type: 'region_captured',
          actors: [front.attackerCountryId, front.defenderCountryId],
          details: {
            region: front.defenderRegionId,
            capturedBy: attacker.name,
            capturedFrom: defender.name,
          },
        });

        // Free attacker army — move into captured region
        this.countries[attackerIdx] = {
          ...this.countries[attackerIdx],
          activeArmies: this.countries[attackerIdx].activeArmies.map((a) =>
            a.id === front.attackerArmyId
              ? updateMorale({ ...a, position: front.defenderRegionId, borderFrontId: undefined }, true, attacker.warWeariness)
              : a,
          ),
        };

        // Defender retreats or is destroyed
        const finalDefArmy = this.countries[defenderIdx].activeArmies.find((a) => a.id === front.defenderArmyId);
        if (finalDefArmy && finalDefArmy.size > 0) {
          // Retreat to a friendly region
          const retreatRegions = this.regions.filter(
            (r) => r.countryId === front.defenderCountryId && r.id !== front.defenderRegionId,
          );
          if (retreatRegions.length > 0) {
            const retreatTo = retreatRegions[this.rng.int(0, retreatRegions.length - 1)];
            this.countries[defenderIdx] = {
              ...this.countries[defenderIdx],
              activeArmies: this.countries[defenderIdx].activeArmies.map((a) =>
                a.id === front.defenderArmyId
                  ? updateMorale({ ...a, position: retreatTo.id, borderFrontId: undefined }, false, defender.warWeariness)
                  : a,
              ),
            };
          } else {
            // No retreat possible
            this.countries[defenderIdx] = {
              ...this.countries[defenderIdx],
              activeArmies: this.countries[defenderIdx].activeArmies.filter((a) => a.id !== front.defenderArmyId),
            };
          }
        } else {
          // Defender was destroyed
          this.countries[defenderIdx] = {
            ...this.countries[defenderIdx],
            activeArmies: this.countries[defenderIdx].activeArmies.filter((a) => a.id !== front.defenderArmyId),
          };
        }
      }

      // Check if front pushed back to 0 (attacker repelled)
      if (front.frontPosition <= 0 && defenderArmy) {
        // Give defender a chance to repel — if front stays at 0 for extended time
        // For now, just keep it at 0 (stalemate at the border)
        front.frontPosition = 0;
      }
    }

    this.borderFronts = this.borderFronts.filter((f) => !resolvedFronts.includes(f.id));
  }

  private cleanupPeacefulFronts(): void {
    const toRemove: string[] = [];

    for (const front of this.borderFronts) {
      const attacker = this.countries.find((c) => c.id === front.attackerCountryId);
      const defender = this.countries.find((c) => c.id === front.defenderCountryId);

      if (!attacker || !defender) {
        toRemove.push(front.id);
        continue;
      }

      // If no longer at war, dissolve the front
      if (attacker.relations[front.defenderCountryId] !== 'at_war') {
        toRemove.push(front.id);
        // Free armies
        this.countries = this.countries.map((c) => ({
          ...c,
          activeArmies: c.activeArmies.map((a) =>
            a.borderFrontId === front.id ? { ...a, borderFrontId: undefined } : a,
          ),
        }));
      }
    }

    this.borderFronts = this.borderFronts.filter((f) => !toRemove.includes(f.id));
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
          const newUnits = applyLossesToUnits(army.units ?? defaultUnits(army.size), army.size, attrition);
          return {
            ...army,
            size: Math.max(1, army.size - attrition),
            morale: Math.max(0.3, army.morale - 0.01),
            units: newUnits,
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
        activeArmies: c.activeArmies.map((a) => ({ ...a, units: { ...a.units } })),
        relations: { ...c.relations },
        warStartTicks: { ...(c.warStartTicks ?? {}) },
      })),
      tick: this.tick,
      borderFronts: this.borderFronts.map((f) => ({ ...f })),
    };
  }
}
