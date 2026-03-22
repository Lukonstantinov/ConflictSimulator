import type { TacticalMap } from '../types';
import { SeededRNG } from '../../utils/random';

const losRng = new SeededRNG(12345);

/** Bresenham's line algorithm - check if line of sight exists between two tiles */
export function hasLineOfSight(
  map: TacticalMap,
  from: { x: number; y: number },
  to: { x: number; y: number },
): boolean {
  let x0 = from.x;
  let y0 = from.y;
  const x1 = to.x;
  const y1 = to.y;

  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (x0 !== x1 || y0 !== y1) {
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }

    // Skip checking the target tile itself
    if (x0 === x1 && y0 === y1) break;

    const tile = map.tiles[y0]?.[x0];
    if (!tile) return false;

    // Buildings block LOS
    if (tile.terrain === 'building') return false;

    // Trees have 50% chance to block
    if (tile.terrain === 'trees' && losRng.next() < 0.5) return false;

    // Elevation difference > 1 blocks
    const fromTile = map.tiles[from.y][from.x];
    if (Math.abs(tile.elevation - fromTile.elevation) > 1) return false;
  }

  return true;
}

/** Get distance between two grid positions */
export function tileDistance(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Compute visible tiles from a position with a given sight range */
export function computeVisibleTiles(
  map: TacticalMap,
  from: { x: number; y: number },
  sightRange: number,
): Set<string> {
  const visible = new Set<string>();
  visible.add(`${from.x},${from.y}`);

  // Cast rays in all directions
  const steps = Math.ceil(sightRange * 8);
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const tx = Math.round(from.x + Math.cos(angle) * sightRange);
    const ty = Math.round(from.y + Math.sin(angle) * sightRange);

    // Trace ray
    let x0 = from.x;
    let y0 = from.y;
    const dx = Math.abs(tx - x0);
    const dy = Math.abs(ty - y0);
    const sx = x0 < tx ? 1 : -1;
    const sy = y0 < ty ? 1 : -1;
    let err = dx - dy;

    while (true) {
      if (x0 < 0 || x0 >= map.width || y0 < 0 || y0 >= map.height) break;

      const dist = tileDistance(from, { x: x0, y: y0 });
      if (dist > sightRange) break;

      visible.add(`${x0},${y0}`);

      const tile = map.tiles[y0]?.[x0];
      if (tile && tile.terrain === 'building' && !(x0 === from.x && y0 === from.y)) break;

      if (x0 === tx && y0 === ty) break;

      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  }

  return visible;
}

/** Get all visible tiles for a faction */
export function computeFactionVisibility(
  map: TacticalMap,
  units: { position: { x: number; y: number }; stats: { sight: number }; state: string; faction: string }[],
  faction: string,
): Set<string> {
  const visible = new Set<string>();
  for (const unit of units) {
    if (unit.faction !== faction || unit.state === 'destroyed') continue;
    const unitVisible = computeVisibleTiles(map, unit.position, unit.stats.sight);
    for (const key of unitVisible) {
      visible.add(key);
    }
  }
  return visible;
}
