import type { TacticalUnit, TacticalMap } from '../types';
import { TERRAIN_COVER } from '../types';
import { findPath } from './movement';
import { hasLineOfSight, tileDistance } from './los';

/** Run AI decisions for all AI-controlled units */
export function runTacticalAI(
  units: TacticalUnit[],
  map: TacticalMap,
  playerFaction: string,
): void {
  const aiFaction = playerFaction === 'attacker' ? 'defender' : 'attacker';

  for (const unit of units) {
    if (unit.faction !== aiFaction) continue;
    if (unit.state === 'destroyed') continue;

    if (unit.state === 'retreating') {
      handleRetreat(unit, units, map);
      continue;
    }

    if (unit.state === 'suppressed') {
      // Suppressed units don't make new decisions, just try to recover
      unit.morale = Math.min(100, unit.morale + 0.3);
      if (unit.morale >= 25) {
        unit.state = 'idle';
      }
      continue;
    }

    if (aiFaction === 'defender') {
      defenderAI(unit, units, map);
    } else {
      attackerAI(unit, units, map);
    }
  }
}

function defenderAI(unit: TacticalUnit, units: TacticalUnit[], map: TacticalMap): void {
  const enemies = units.filter((u) => u.faction !== unit.faction && u.state !== 'destroyed');
  if (enemies.length === 0) return;

  // Find nearest enemy in range
  const nearestEnemy = findNearestInRange(unit, enemies, map);

  if (nearestEnemy) {
    // Engage
    unit.attackTarget = nearestEnemy.id;
    unit.state = 'attacking';
    return;
  }

  // If not in a building, try to move to one for cover
  const currentTile = map.tiles[unit.position.y][unit.position.x];
  if (currentTile.terrain !== 'building' && unit.type === 'infantry') {
    if (!unit.path || unit.path.length === 0) {
      const coverTile = findNearbyCover(unit, map, units);
      if (coverTile) {
        unit.path = findPath(map, unit.position, coverTile, unit.type, units);
        if (unit.path.length > 0) {
          unit.state = 'moving';
          unit.target = coverTile;
        }
      }
    }
  } else if (unit.type === 'tank') {
    // Tanks: position behind buildings with firing lanes
    if (!unit.path || unit.path.length === 0) {
      const nearestEnemyAny = findClosestEnemy(unit, enemies);
      if (nearestEnemyAny) {
        const dist = tileDistance(unit.position, nearestEnemyAny.position);
        // If too close, back up; if too far, advance slightly
        if (dist < 5) {
          const retreatPos = findRetreatPosition(unit, nearestEnemyAny, map, units);
          if (retreatPos) {
            unit.path = findPath(map, unit.position, retreatPos, unit.type, units);
            if (unit.path.length > 0) {
              unit.state = 'moving';
              unit.target = retreatPos;
            }
          }
        }
      }
    }
  }
}

function attackerAI(unit: TacticalUnit, units: TacticalUnit[], map: TacticalMap): void {
  const enemies = units.filter((u) => u.faction !== unit.faction && u.state !== 'destroyed');
  if (enemies.length === 0) return;

  const nearestEnemy = findNearestInRange(unit, enemies, map);

  if (nearestEnemy) {
    unit.attackTarget = nearestEnemy.id;
    unit.state = 'attacking';

    // Infantry: if in the open and under fire, seek cover
    if (unit.type === 'infantry') {
      const currentTile = map.tiles[unit.position.y][unit.position.x];
      if (TERRAIN_COVER[currentTile.terrain] < 0.2 && !unit.path?.length) {
        const coverTile = findCoverTowardEnemy(unit, nearestEnemy, map, units);
        if (coverTile) {
          unit.path = findPath(map, unit.position, coverTile, unit.type, units);
          if (unit.path.length > 0) {
            unit.state = 'moving';
            unit.target = coverTile;
          }
        }
      }
    }
    return;
  }

  // No enemy in range — advance toward nearest enemy
  if (!unit.path || unit.path.length === 0) {
    const target = findClosestEnemy(unit, enemies);
    if (target) {
      // Move toward the enemy but stop at range
      const path = findPath(map, unit.position, target.position, unit.type, units);
      if (path.length > 0) {
        // Trim path to stop at attack range
        const trimmedPath: { x: number; y: number }[] = [];
        for (const step of path) {
          trimmedPath.push(step);
          const dist = tileDistance(step, target.position);
          if (dist <= unit.stats.range * 0.8) break;
        }
        unit.path = trimmedPath;
        unit.state = 'moving';
        unit.target = trimmedPath[trimmedPath.length - 1];
      }
    }
  }
}

function handleRetreat(unit: TacticalUnit, units: TacticalUnit[], map: TacticalMap): void {
  if (unit.path && unit.path.length > 0) return; // Already retreating

  // Find direction away from nearest enemy
  const enemies = units.filter((u) => u.faction !== unit.faction && u.state !== 'destroyed');
  const nearest = findClosestEnemy(unit, enemies);
  if (!nearest) return;

  const retreatPos = findRetreatPosition(unit, nearest, map, units);
  if (retreatPos) {
    unit.path = findPath(map, unit.position, retreatPos, unit.type, units);
    unit.target = retreatPos;
  }
}

function findNearestInRange(
  unit: TacticalUnit,
  enemies: TacticalUnit[],
  map: TacticalMap,
): TacticalUnit | null {
  let nearest: TacticalUnit | null = null;
  let nearestDist = Infinity;

  for (const enemy of enemies) {
    const dist = tileDistance(unit.position, enemy.position);
    if (dist > unit.stats.range) continue;
    if (dist >= nearestDist) continue;
    if (hasLineOfSight(map, unit.position, enemy.position)) {
      nearest = enemy;
      nearestDist = dist;
    }
  }

  return nearest;
}

function findClosestEnemy(unit: TacticalUnit, enemies: TacticalUnit[]): TacticalUnit | null {
  let closest: TacticalUnit | null = null;
  let closestDist = Infinity;
  for (const e of enemies) {
    const d = tileDistance(unit.position, e.position);
    if (d < closestDist) {
      closestDist = d;
      closest = e;
    }
  }
  return closest;
}

function findNearbyCover(
  unit: TacticalUnit,
  map: TacticalMap,
  units: TacticalUnit[],
): { x: number; y: number } | null {
  let bestTile: { x: number; y: number } | null = null;
  let bestDist = Infinity;

  const searchRadius = 8;
  for (let dy = -searchRadius; dy <= searchRadius; dy++) {
    for (let dx = -searchRadius; dx <= searchRadius; dx++) {
      const tx = unit.position.x + dx;
      const ty = unit.position.y + dy;
      if (tx < 0 || tx >= map.width || ty < 0 || ty >= map.height) continue;

      const tile = map.tiles[ty][tx];
      if (!tile.passable) continue;
      if (TERRAIN_COVER[tile.terrain] < 0.3) continue;
      if (tile.occupied && tile.occupied !== unit.id) continue;

      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist < bestDist) {
        bestDist = dist;
        bestTile = { x: tx, y: ty };
      }
    }
  }

  return bestTile;
}

function findCoverTowardEnemy(
  unit: TacticalUnit,
  enemy: TacticalUnit,
  map: TacticalMap,
  units: TacticalUnit[],
): { x: number; y: number } | null {
  let bestTile: { x: number; y: number } | null = null;
  let bestScore = -Infinity;

  const searchRadius = 6;
  for (let dy = -searchRadius; dy <= searchRadius; dy++) {
    for (let dx = -searchRadius; dx <= searchRadius; dx++) {
      const tx = unit.position.x + dx;
      const ty = unit.position.y + dy;
      if (tx < 0 || tx >= map.width || ty < 0 || ty >= map.height) continue;

      const tile = map.tiles[ty][tx];
      if (!tile.passable) continue;
      if (TERRAIN_COVER[tile.terrain] < 0.2) continue;
      if (tile.occupied && tile.occupied !== unit.id) continue;

      const distToEnemy = tileDistance({ x: tx, y: ty }, enemy.position);
      const cover = TERRAIN_COVER[tile.terrain];
      // Score: prefer closer to enemy AND with cover
      const score = cover * 10 - distToEnemy * 0.5;
      if (score > bestScore) {
        bestScore = score;
        bestTile = { x: tx, y: ty };
      }
    }
  }

  return bestTile;
}

function findRetreatPosition(
  unit: TacticalUnit,
  enemy: TacticalUnit,
  map: TacticalMap,
  units: TacticalUnit[],
): { x: number; y: number } | null {
  const dx = unit.position.x - enemy.position.x;
  const dy = unit.position.y - enemy.position.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;

  // Try to retreat 5 tiles away from enemy
  const tx = Math.round(unit.position.x + (dx / len) * 5);
  const ty = Math.round(unit.position.y + (dy / len) * 5);

  const cx = Math.max(0, Math.min(map.width - 1, tx));
  const cy = Math.max(0, Math.min(map.height - 1, ty));

  const tile = map.tiles[cy]?.[cx];
  if (tile && tile.passable && !tile.occupied) {
    return { x: cx, y: cy };
  }

  // Search nearby for a valid retreat tile
  for (let r = 1; r <= 3; r++) {
    for (let ddy = -r; ddy <= r; ddy++) {
      for (let ddx = -r; ddx <= r; ddx++) {
        const nx = cx + ddx;
        const ny = cy + ddy;
        if (nx < 0 || nx >= map.width || ny < 0 || ny >= map.height) continue;
        const t = map.tiles[ny][nx];
        if (t.passable && !t.occupied) return { x: nx, y: ny };
      }
    }
  }

  return null;
}
