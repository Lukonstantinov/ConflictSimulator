import type { TacticalUnit, TacticalMap, TacticalEvent } from '../types';
import { TERRAIN_COVER } from '../types';
import { hasLineOfSight, tileDistance } from './los';
import { SeededRNG } from '../../utils/random';

const combatRng = new SeededRNG(54321);

/** Resolve combat for one tick */
export function resolveTacticalCombat(
  units: TacticalUnit[],
  map: TacticalMap,
  tick: number,
): TacticalEvent[] {
  const events: TacticalEvent[] = [];

  for (const unit of units) {
    if (unit.state === 'destroyed' || unit.state === 'retreating') continue;

    // Auto-target if no explicit target
    if (!unit.attackTarget) {
      const target = findNearestEnemy(unit, units, map);
      if (target) {
        unit.attackTarget = target.id;
      }
    }

    if (!unit.attackTarget) continue;

    const target = units.find((u) => u.id === unit.attackTarget);
    if (!target || target.state === 'destroyed') {
      unit.attackTarget = undefined;
      continue;
    }

    const dist = tileDistance(unit.position, target.position);
    if (dist > unit.stats.range) {
      // Out of range - clear target so auto-targeting can find closer enemy
      unit.attackTarget = undefined;
      continue;
    }

    if (!hasLineOfSight(map, unit.position, target.position)) {
      unit.attackTarget = undefined;
      continue;
    }

    // Check fire rate
    if (tick - unit.lastShotTick < unit.stats.fireRate) continue;

    unit.lastShotTick = tick;

    // Calculate hit chance
    const baseAccuracy = 0.7;
    const distanceMod = 1 - (dist / unit.stats.range) * 0.5;
    const targetTile = map.tiles[target.position.y][target.position.x];
    const coverMod = 1 - TERRAIN_COVER[targetTile.terrain];
    const stateMod = unit.state === 'suppressed' ? 0.3 : 1.0;
    const hitChance = baseAccuracy * distanceMod * coverMod * stateMod;

    events.push({
      tick,
      type: 'shot_fired',
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
      const effectiveDamage = rawDamage * (1 - target.stats.armor);

      if (target.type === 'infantry') {
        const casualties = Math.max(1, Math.floor(effectiveDamage / 10));
        target.squadSize -= casualties;
        if (target.squadSize <= 0) {
          target.squadSize = 0;
          target.state = 'destroyed';
          events.push({
            tick,
            type: 'unit_destroyed',
            details: { unitId: target.id, killedBy: unit.id },
          });
        }
      } else {
        target.health -= effectiveDamage;
        if (target.health <= 0) {
          target.health = 0;
          target.state = 'destroyed';
          events.push({
            tick,
            type: 'unit_destroyed',
            details: { unitId: target.id, killedBy: unit.id },
          });
        }
      }

      // Morale impact
      target.morale -= effectiveDamage * 0.5;
      if (target.morale < 0) target.morale = 0;

      if (target.state !== 'destroyed') {
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

      // Update facing toward target
      const dx = target.position.x - unit.position.x;
      const dy = target.position.y - unit.position.y;
      unit.facing = Math.round((Math.atan2(dy, dx) / Math.PI * 4 + 8) % 8);
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
    if (other.state === 'destroyed') continue;

    const dist = tileDistance(unit.position, other.position);
    if (dist > unit.stats.range) continue;
    if (dist >= nearestDist) continue;

    if (hasLineOfSight(map, unit.position, other.position)) {
      nearest = other;
      nearestDist = dist;
    }
  }

  return nearest;
}
