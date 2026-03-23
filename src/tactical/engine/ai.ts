import type { TacticalUnit, TacticalMap } from '../types';
import { TERRAIN_COVER } from '../types';
import { findPath } from './movement';
import { hasLineOfSight, tileDistance } from './los';

/** Run AI decisions for all AI-controlled units */
export function runTacticalAI(
  units: TacticalUnit[],
  map: TacticalMap,
  playerFaction: string,
  tick: number,
): void {
  const aiFaction = playerFaction === 'attacker' ? 'defender' : 'attacker';

  for (const unit of units) {
    if (unit.faction !== aiFaction) continue;
    if (unit.state === 'destroyed' || unit.state === 'surrendered') continue;

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

    // Dispatch by unit type for specialized behavior
    switch (unit.type) {
      case 'drone':
        droneAI(unit, units, map);
        break;
      case 'medic':
        medicAI(unit, units, map);
        break;
      case 'artillery':
        artilleryAI(unit, units, map);
        break;
      case 'sniper':
        sniperAI(unit, units, map);
        break;
      case 'helicopter':
        helicopterAI(unit, units, map);
        break;
      default:
        if (aiFaction === 'defender') {
          defenderAI(unit, units, map);
        } else {
          attackerAI(unit, units, map);
        }
        break;
    }
  }
}

/** Drone AI: hover near frontlines revealing enemy positions */
function droneAI(unit: TacticalUnit, units: TacticalUnit[], map: TacticalMap): void {
  if (unit.path && unit.path.length > 0) return;

  const enemies = units.filter((u) => u.faction !== unit.faction && u.state !== 'destroyed' && u.state !== 'surrendered');
  if (enemies.length === 0) return;

  // Move toward the midpoint of enemies but stay 6-8 tiles away from nearest
  const nearest = findClosestEnemy(unit, enemies);
  if (!nearest) return;

  const dist = tileDistance(unit.position, nearest.position);
  if (dist < 6) {
    // Too close — retreat
    const retreatPos = findRetreatPosition(unit, nearest, map, units);
    if (retreatPos) {
      unit.path = findPath(map, unit.position, retreatPos, unit.type, units);
      if (unit.path.length > 0) {
        unit.state = 'moving';
        unit.target = retreatPos;
      }
    }
  } else if (dist > 12) {
    // Too far — move closer
    const path = findPath(map, unit.position, nearest.position, unit.type, units);
    if (path.length > 0) {
      const trimmed = path.slice(0, Math.max(1, path.length - 6));
      unit.path = trimmed;
      unit.state = 'moving';
      unit.target = trimmed[trimmed.length - 1];
    }
  }
}

/** Medic AI: follow wounded friendly infantry */
function medicAI(unit: TacticalUnit, units: TacticalUnit[], map: TacticalMap): void {
  if (unit.path && unit.path.length > 0) return;

  // Find nearest wounded friendly squad
  let bestTarget: TacticalUnit | null = null;
  let bestDist = Infinity;

  for (const other of units) {
    if (other.faction !== unit.faction) continue;
    if (other.state === 'destroyed' || other.state === 'surrendered') continue;
    if (other.type !== 'infantry' && other.type !== 'sniper' && other.type !== 'atgm') continue;
    if (other.squadSize >= other.maxSquadSize) continue;

    const d = tileDistance(unit.position, other.position);
    if (d < bestDist) {
      bestDist = d;
      bestTarget = other;
    }
  }

  if (bestTarget && bestDist > unit.stats.range) {
    // Move toward wounded unit
    const path = findPath(map, unit.position, bestTarget.position, unit.type, units);
    if (path.length > 0) {
      const trimmed: { x: number; y: number }[] = [];
      for (const step of path) {
        trimmed.push(step);
        if (tileDistance(step, bestTarget.position) <= unit.stats.range * 0.8) break;
      }
      unit.path = trimmed;
      unit.state = 'moving';
      unit.target = trimmed[trimmed.length - 1];
    }
  }
}

/** Artillery AI: stay back, fire at enemies in range */
function artilleryAI(unit: TacticalUnit, units: TacticalUnit[], map: TacticalMap): void {
  if (unit.ammo <= 0) return;

  const enemies = units.filter((u) => u.faction !== unit.faction && u.state !== 'destroyed' && u.state !== 'surrendered');
  if (enemies.length === 0) return;

  // Prioritize groups of enemies (splash value)
  let bestTarget: TacticalUnit | null = null;
  let bestScore = -Infinity;

  for (const enemy of enemies) {
    const dist = tileDistance(unit.position, enemy.position);
    if (dist < (unit.stats.minRange ?? 0) || dist > unit.stats.range) continue;

    // Score: prefer clustered enemies
    let nearbyCount = 0;
    for (const other of enemies) {
      if (other.id !== enemy.id && tileDistance(other.position, enemy.position) <= 3) {
        nearbyCount++;
      }
    }

    // Prefer tanks and buildings
    const typeBonus = enemy.type === 'tank' ? 2 : enemy.type === 'apc' ? 1.5 : 1;
    const score = nearbyCount * 3 + typeBonus - dist * 0.1;

    if (score > bestScore) {
      bestScore = score;
      bestTarget = enemy;
    }
  }

  if (bestTarget) {
    unit.attackTarget = bestTarget.id;
    unit.state = 'attacking';
  } else {
    // Try to reposition if no targets in range
    const closest = findClosestEnemy(unit, enemies);
    if (closest && !unit.path?.length) {
      const dist = tileDistance(unit.position, closest.position);
      if (dist > unit.stats.range) {
        // Move closer but keep distance
        const path = findPath(map, unit.position, closest.position, unit.type, units);
        if (path.length > 0) {
          const trimmed: { x: number; y: number }[] = [];
          for (const step of path) {
            trimmed.push(step);
            const d = tileDistance(step, closest.position);
            if (d <= unit.stats.range * 0.7) break;
          }
          unit.path = trimmed;
          unit.state = 'moving';
          unit.target = trimmed[trimmed.length - 1];
        }
      }
    }
  }
}

/** Sniper AI: find cover position with long sight lines, pick high-value targets */
function sniperAI(unit: TacticalUnit, units: TacticalUnit[], map: TacticalMap): void {
  if (unit.ammo <= 0) return;

  const enemies = units.filter((u) => u.faction !== unit.faction && u.state !== 'destroyed' && u.state !== 'surrendered');
  if (enemies.length === 0) return;

  // Prioritize: atgm teams > medics > snipers > infantry > others
  let bestTarget: TacticalUnit | null = null;
  let bestPriority = -Infinity;

  const priorityMap: Record<string, number> = {
    atgm: 5, medic: 4, sniper: 3, infantry: 2, artillery: 1, apc: 0, tank: -1, drone: -2, helicopter: -2,
  };

  for (const enemy of enemies) {
    const dist = tileDistance(unit.position, enemy.position);
    if (dist > unit.stats.range) continue;
    if (!hasLineOfSight(map, unit.position, enemy.position)) continue;

    const priority = (priorityMap[enemy.type] ?? 0) - dist * 0.05;
    if (priority > bestPriority) {
      bestPriority = priority;
      bestTarget = enemy;
    }
  }

  if (bestTarget) {
    unit.attackTarget = bestTarget.id;
    unit.state = 'attacking';
    return;
  }

  // Seek cover with good sight lines if not in cover
  const currentTile = map.tiles[unit.position.y][unit.position.x];
  if (TERRAIN_COVER[currentTile.terrain] < 0.3 && (!unit.path || unit.path.length === 0)) {
    const coverTile = findNearbyCover(unit, map, units);
    if (coverTile) {
      unit.path = findPath(map, unit.position, coverTile, unit.type, units);
      if (unit.path.length > 0) {
        unit.state = 'moving';
        unit.target = coverTile;
      }
    }
  }
}

/** Helicopter AI: strafe runs on armored targets, stay mobile */
function helicopterAI(unit: TacticalUnit, units: TacticalUnit[], map: TacticalMap): void {
  if (unit.ammo <= 0) {
    // Out of ammo — retreat to friendly edge
    if (!unit.path || unit.path.length === 0) {
      const retreatY = unit.faction === 'attacker' ? 1 : map.height - 2;
      const retreatPos = { x: unit.position.x, y: retreatY };
      unit.path = findPath(map, unit.position, retreatPos, unit.type, units);
      if (unit.path.length > 0) {
        unit.state = 'moving';
        unit.target = retreatPos;
      }
    }
    return;
  }

  const enemies = units.filter((u) => u.faction !== unit.faction && u.state !== 'destroyed' && u.state !== 'surrendered');
  if (enemies.length === 0) return;

  // Prioritize armored targets
  let bestTarget: TacticalUnit | null = null;
  let bestScore = -Infinity;

  for (const enemy of enemies) {
    const dist = tileDistance(unit.position, enemy.position);
    if (dist > unit.stats.range) continue;

    const armorBonus = enemy.stats.armor > 0.3 ? 5 : 0;
    const score = armorBonus + (enemy.type === 'tank' ? 3 : 0) - dist * 0.2;
    if (score > bestScore) {
      bestScore = score;
      bestTarget = enemy;
    }
  }

  if (bestTarget) {
    unit.attackTarget = bestTarget.id;
    unit.state = 'attacking';
  } else {
    // Advance toward enemies
    const nearest = findClosestEnemy(unit, enemies);
    if (nearest && (!unit.path || unit.path.length === 0)) {
      const path = findPath(map, unit.position, nearest.position, unit.type, units);
      if (path.length > 0) {
        const trimmed = path.slice(0, Math.max(1, path.length - Math.floor(unit.stats.range * 0.7)));
        unit.path = trimmed;
        unit.state = 'moving';
        unit.target = trimmed[trimmed.length - 1];
      }
    }
  }
}

function defenderAI(unit: TacticalUnit, units: TacticalUnit[], map: TacticalMap): void {
  const enemies = units.filter((u) => u.faction !== unit.faction && u.state !== 'destroyed' && u.state !== 'surrendered');
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
  const isInfantryLike = unit.type === 'infantry' || unit.type === 'atgm' || unit.type === 'medic' || unit.type === 'sniper';

  if (currentTile.terrain !== 'building' && isInfantryLike) {
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
        // If too close, back up
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
  const enemies = units.filter((u) => u.faction !== unit.faction && u.state !== 'destroyed' && u.state !== 'surrendered');
  if (enemies.length === 0) return;

  const nearestEnemy = findNearestInRange(unit, enemies, map);

  if (nearestEnemy) {
    unit.attackTarget = nearestEnemy.id;
    unit.state = 'attacking';

    // Infantry: if in the open and under fire, seek cover
    const isInfantryLike = unit.type === 'infantry' || unit.type === 'atgm';
    if (isInfantryLike) {
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

  const enemies = units.filter((u) => u.faction !== unit.faction && u.state !== 'destroyed' && u.state !== 'surrendered');
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
  _units: TacticalUnit[],
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
  _units: TacticalUnit[],
): { x: number; y: number } | null {
  const dx = unit.position.x - enemy.position.x;
  const dy = unit.position.y - enemy.position.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;

  const tx = Math.round(unit.position.x + (dx / len) * 5);
  const ty = Math.round(unit.position.y + (dy / len) * 5);

  const cx = Math.max(0, Math.min(map.width - 1, tx));
  const cy = Math.max(0, Math.min(map.height - 1, ty));

  const tile = map.tiles[cy]?.[cx];
  if (tile && tile.passable && !tile.occupied) {
    return { x: cx, y: cy };
  }

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
