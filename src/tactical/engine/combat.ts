import type { TacticalUnit, TacticalMap, TacticalEvent } from '../types';
import { TERRAIN_COVER } from '../types';
import { hasLineOfSight, tileDistance } from './los';
import { SeededRNG } from '../../utils/random';

const combatRng = new SeededRNG(54321);

/** Resolve combat for one tick — includes ammo, splash, anti-armor, building damage */
export function resolveTacticalCombat(
  units: TacticalUnit[],
  map: TacticalMap,
  tick: number,
): TacticalEvent[] {
  const events: TacticalEvent[] = [];

  for (const unit of units) {
    if (unit.state === 'destroyed' || unit.state === 'retreating' || unit.state === 'surrendered') continue;

    // Drones and medics don't attack
    if (unit.type === 'drone' || unit.type === 'medic') continue;

    // No ammo — can't fire
    if (unit.ammo <= 0) continue;

    // Auto-target if no explicit target
    if (!unit.attackTarget) {
      const target = findNearestEnemy(unit, units, map);
      if (target) {
        unit.attackTarget = target.id;
      }
    }

    if (!unit.attackTarget) continue;

    const target = units.find((u) => u.id === unit.attackTarget);
    if (!target || target.state === 'destroyed' || target.state === 'surrendered') {
      unit.attackTarget = undefined;
      continue;
    }

    const dist = tileDistance(unit.position, target.position);

    // Check min range (artillery)
    if (unit.stats.minRange && dist < unit.stats.minRange) {
      unit.attackTarget = undefined;
      continue;
    }

    if (dist > unit.stats.range) {
      unit.attackTarget = undefined;
      continue;
    }

    // Artillery doesn't need direct LOS (indirect fire) — others do
    if (unit.type !== 'artillery') {
      if (!hasLineOfSight(map, unit.position, target.position)) {
        unit.attackTarget = undefined;
        continue;
      }
    }

    // Check fire rate
    if (tick - unit.lastShotTick < unit.stats.fireRate) continue;

    unit.lastShotTick = tick;
    unit.ammo--;

    if (unit.ammo <= 0) {
      events.push({
        tick,
        type: 'ammo_depleted',
        details: { unitId: unit.id },
      });
    }

    // Calculate hit chance
    const baseAccuracy = unit.type === 'sniper' ? 0.85 : 0.7;
    const distanceMod = 1 - (dist / unit.stats.range) * 0.5;
    const targetTile = map.tiles[target.position.y][target.position.x];
    const coverMod = 1 - (targetTile.smoke > 0 ? 0.7 : TERRAIN_COVER[targetTile.terrain]);
    const stateMod = unit.state === 'suppressed' ? 0.3 : 1.0;
    // Helicopters are harder to hit (flying)
    const flyingMod = target.flying ? 0.6 : 1.0;
    const hitChance = baseAccuracy * distanceMod * coverMod * stateMod * flyingMod;

    events.push({
      tick,
      type: unit.type === 'artillery' ? 'artillery_impact' : 'shot_fired',
      details: {
        attackerId: unit.id,
        targetId: target.id,
        fromX: unit.position.x,
        fromY: unit.position.y,
        toX: target.position.x,
        toY: target.position.y,
      },
    });

    if (combatRng.next() < hitChance) {
      const rawDamage = unit.stats.damage * combatRng.range(0.8, 1.2);

      // Anti-armor bonus vs armored targets
      const antiArmorMul = (unit.stats.antiArmor && target.stats.armor > 0.3)
        ? unit.stats.antiArmor
        : 1.0;

      const effectiveDamage = rawDamage * antiArmorMul * (1 - target.stats.armor);

      applyDamage(target, effectiveDamage, unit, tick, events);

      // Artillery splash damage to nearby units and buildings
      if (unit.stats.splashRadius) {
        const splashR = unit.stats.splashRadius;
        const splashDmg = effectiveDamage * 0.4;

        // Splash to other units
        for (const other of units) {
          if (other.id === target.id || other.state === 'destroyed' || other.state === 'surrendered') continue;
          const d = tileDistance(other.position, target.position);
          if (d <= splashR) {
            const falloff = 1 - d / (splashR + 1);
            applyDamage(other, splashDmg * falloff * (1 - other.stats.armor), unit, tick, events);
          }
        }

        // Splash damage to buildings
        for (const building of map.buildings) {
          if (building.destroyed) continue;
          for (const bt of building.tiles) {
            const d = tileDistance(bt, target.position);
            if (d <= splashR) {
              const bldgDmg = 15 * (1 - d / (splashR + 1));
              building.health -= bldgDmg;
              if (building.health <= 0) {
                building.health = 0;
                building.destroyed = true;
                destroyBuilding(building, map, events, tick);
              } else {
                events.push({
                  tick,
                  type: 'building_damaged',
                  details: { buildingId: building.id, health: building.health },
                });
              }
              break; // One hit per building per shot
            }
          }
        }
      }
    }

    // Update facing toward target
    const dx = target.position.x - unit.position.x;
    const dy = target.position.y - unit.position.y;
    unit.facing = Math.round((Math.atan2(dy, dx) / Math.PI * 4 + 8) % 8);
  }

  return events;
}

function applyDamage(
  target: TacticalUnit,
  effectiveDamage: number,
  attacker: TacticalUnit,
  tick: number,
  events: TacticalEvent[],
): void {
  if (target.state === 'destroyed' || target.state === 'surrendered') return;

  if (target.type === 'infantry' || target.type === 'sniper' || target.type === 'atgm' || target.type === 'medic') {
    const casualties = Math.max(1, Math.floor(effectiveDamage / 10));
    target.squadSize -= casualties;
    if (target.squadSize <= 0) {
      target.squadSize = 0;
      target.state = 'destroyed';
      events.push({
        tick,
        type: 'unit_destroyed',
        details: { unitId: target.id, killedBy: attacker.id },
      });
      return;
    }
  } else if (target.type === 'drone') {
    // Drones are very fragile
    target.health -= effectiveDamage * 3;
    if (target.health <= 0) {
      target.health = 0;
      target.state = 'destroyed';
      events.push({
        tick,
        type: 'unit_destroyed',
        details: { unitId: target.id, killedBy: attacker.id },
      });
      return;
    }
  } else {
    target.health -= effectiveDamage;
    if (target.health <= 0) {
      target.health = 0;
      target.state = 'destroyed';
      events.push({
        tick,
        type: 'unit_destroyed',
        details: { unitId: target.id, killedBy: attacker.id },
      });
      return;
    }
  }

  // Morale impact
  target.morale -= effectiveDamage * 0.5;
  if (target.morale < 0) target.morale = 0;

  if (target.morale < 10) {
    target.state = 'retreating';
    events.push({
      tick,
      type: 'unit_retreating',
      details: { unitId: target.id },
    });
  } else if (target.morale < 20) {
    if (target.state !== 'suppressed') {
      target.state = 'suppressed';
      events.push({
        tick,
        type: 'unit_suppressed',
        details: { unitId: target.id },
      });
    }
  }
}

/** Destroy a building: convert tiles to rubble */
function destroyBuilding(
  building: Building,
  map: TacticalMap,
  events: TacticalEvent[],
  tick: number,
): void {
  for (const bt of building.tiles) {
    const tile = map.tiles[bt.y]?.[bt.x];
    if (tile) {
      tile.terrain = 'rubble';
      tile.cover = TERRAIN_COVER.rubble;
      tile.buildingId = undefined;
    }
  }
  events.push({
    tick,
    type: 'building_destroyed',
    details: { buildingId: building.id },
  });
}

/** Medic healing: heal nearby friendly infantry */
export function resolveMedicHealing(
  units: TacticalUnit[],
  map: TacticalMap,
  tick: number,
): TacticalEvent[] {
  const events: TacticalEvent[] = [];

  for (const unit of units) {
    if (unit.state === 'destroyed' || unit.state === 'surrendered') continue;
    if (unit.type !== 'medic') continue;
    if (!unit.stats.canHeal) continue;

    // Check fire rate for healing
    if (tick - unit.lastShotTick < unit.stats.fireRate) continue;

    // Find nearest wounded friendly infantry in range
    let bestTarget: TacticalUnit | null = null;
    let bestDist = Infinity;

    for (const other of units) {
      if (other.faction !== unit.faction) continue;
      if (other.state === 'destroyed' || other.state === 'surrendered') continue;
      if (other.type !== 'infantry' && other.type !== 'sniper' && other.type !== 'atgm') continue;
      if (other.squadSize >= other.maxSquadSize) continue;

      const d = tileDistance(unit.position, other.position);
      if (d <= unit.stats.range && d < bestDist) {
        bestDist = d;
        bestTarget = other;
      }
    }

    if (bestTarget) {
      unit.lastShotTick = tick;
      bestTarget.squadSize = Math.min(bestTarget.maxSquadSize, bestTarget.squadSize + 1);
      bestTarget.morale = Math.min(100, bestTarget.morale + 5);
      events.push({
        tick,
        type: 'unit_healed',
        details: { medicId: unit.id, targetId: bestTarget.id, newSquadSize: bestTarget.squadSize },
      });
    }
  }

  return events;
}

function findNearestEnemy(
  unit: TacticalUnit,
  units: TacticalUnit[],
  map: TacticalMap,
): TacticalUnit | null {
  let nearest: TacticalUnit | null = null;
  let nearestDist = Infinity;

  for (const other of units) {
    if (other.faction === unit.faction) continue;
    if (other.state === 'destroyed' || other.state === 'surrendered') continue;

    const dist = tileDistance(unit.position, other.position);

    // Respect min range
    if (unit.stats.minRange && dist < unit.stats.minRange) continue;
    if (dist > unit.stats.range) continue;
    if (dist >= nearestDist) continue;

    // Artillery doesn't need LOS
    if (unit.type === 'artillery') {
      nearest = other;
      nearestDist = dist;
    } else if (hasLineOfSight(map, unit.position, other.position)) {
      nearest = other;
      nearestDist = dist;
    }
  }

  return nearest;
}

// Re-export for use by Building type
import type { Building } from '../types';
