import type { TacticalMap, TacticalTile, TacticalUnit } from '../types';
import { TERRAIN_SPEED } from '../types';

interface PathNode {
  x: number;
  y: number;
  g: number;
  h: number;
  f: number;
  parent: PathNode | null;
}

/** A* pathfinding on the tactical grid */
export function findPath(
  map: TacticalMap,
  start: { x: number; y: number },
  end: { x: number; y: number },
  unitType: TacticalUnit['type'],
  units: TacticalUnit[],
): { x: number; y: number }[] {
  const endTile = map.tiles[end.y]?.[end.x];
  if (!endTile || !endTile.passable) return [];

  // Vehicles can't enter buildings
  if (unitType !== 'infantry' && endTile.terrain === 'building') return [];

  const occupiedSet = new Set<string>();
  for (const u of units) {
    if (u.state !== 'destroyed') {
      occupiedSet.add(`${u.position.x},${u.position.y}`);
    }
  }
  // Remove start from occupied
  occupiedSet.delete(`${start.x},${start.y}`);

  const open: PathNode[] = [];
  const closed = new Set<string>();

  const h = (x: number, y: number) =>
    Math.abs(x - end.x) + Math.abs(y - end.y);

  const startNode: PathNode = {
    x: start.x, y: start.y,
    g: 0, h: h(start.x, start.y), f: h(start.x, start.y),
    parent: null,
  };
  open.push(startNode);

  const dirs = [
    { dx: 0, dy: -1 }, { dx: 1, dy: 0 },
    { dx: 0, dy: 1 }, { dx: -1, dy: 0 },
    { dx: 1, dy: -1 }, { dx: 1, dy: 1 },
    { dx: -1, dy: 1 }, { dx: -1, dy: -1 },
  ];

  let iterations = 0;
  const maxIterations = map.width * map.height;

  while (open.length > 0 && iterations < maxIterations) {
    iterations++;

    // Find lowest f
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[bestIdx].f) bestIdx = i;
    }
    const current = open.splice(bestIdx, 1)[0];
    const key = `${current.x},${current.y}`;

    if (current.x === end.x && current.y === end.y) {
      // Reconstruct path
      const path: { x: number; y: number }[] = [];
      let node: PathNode | null = current;
      while (node) {
        path.unshift({ x: node.x, y: node.y });
        node = node.parent;
      }
      return path.slice(1); // Remove start position
    }

    closed.add(key);

    for (const dir of dirs) {
      const nx = current.x + dir.dx;
      const ny = current.y + dir.dy;
      const nKey = `${nx},${ny}`;

      if (nx < 0 || nx >= map.width || ny < 0 || ny >= map.height) continue;
      if (closed.has(nKey)) continue;

      const tile = map.tiles[ny][nx];
      if (!tile.passable) continue;
      if (tile.terrain === 'water') continue;
      if (unitType !== 'infantry' && tile.terrain === 'building') continue;

      // Don't path through occupied tiles (except destination)
      if (!(nx === end.x && ny === end.y) && occupiedSet.has(nKey)) continue;

      const moveCost = 1 / TERRAIN_SPEED[tile.terrain];
      const isDiagonal = dir.dx !== 0 && dir.dy !== 0;
      const g = current.g + moveCost * (isDiagonal ? 1.414 : 1);
      const hVal = h(nx, ny);

      const existing = open.find((n) => n.x === nx && n.y === ny);
      if (existing) {
        if (g < existing.g) {
          existing.g = g;
          existing.f = g + existing.h;
          existing.parent = current;
        }
      } else {
        open.push({ x: nx, y: ny, g, h: hVal, f: g + hVal, parent: current });
      }
    }
  }

  return []; // No path found
}

/** Move a unit along its path for one tick */
export function moveUnit(
  unit: TacticalUnit,
  map: TacticalMap,
  tickRate: number,
): boolean {
  if (!unit.path || unit.path.length === 0) return true; // Already at destination

  const nextTile = unit.path[0];
  const tile = map.tiles[nextTile.y]?.[nextTile.x];
  if (!tile) {
    unit.path = [];
    return true;
  }

  const terrainSpeed = TERRAIN_SPEED[tile.terrain];
  const moveSpeed = unit.stats.speed * terrainSpeed / tickRate;

  const dx = nextTile.x - unit.position.x;
  const dy = nextTile.y - unit.position.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist <= moveSpeed) {
    // Arrived at next waypoint
    // Clear old occupied
    const oldTile = map.tiles[unit.position.y]?.[unit.position.x];
    if (oldTile && oldTile.occupied === unit.id) {
      oldTile.occupied = undefined;
    }

    unit.position = { x: nextTile.x, y: nextTile.y };
    tile.occupied = unit.id;
    unit.path.shift();

    // Update facing
    if (dx !== 0 || dy !== 0) {
      unit.facing = Math.round((Math.atan2(dy, dx) / Math.PI * 4 + 8) % 8);
    }

    return unit.path.length === 0;
  }

  return false; // Still moving
}
