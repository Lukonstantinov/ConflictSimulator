import type { TacticalMap, TacticalTile, Building, TacticalTerrain } from '../types';
import { TERRAIN_COVER } from '../types';
import { SeededRNG } from '../../utils/random';

/** Generate a procedural village map */
export function generateTacticalMap(
  width: number,
  height: number,
  seed: number,
  name: string = 'Village',
): TacticalMap {
  const rng = new SeededRNG(seed);
  const tiles: TacticalTile[][] = [];
  const buildings: Building[] = [];

  // Initialize all tiles as open
  for (let y = 0; y < height; y++) {
    tiles[y] = [];
    for (let x = 0; x < width; x++) {
      tiles[y][x] = {
        x, y,
        terrain: 'open',
        elevation: 0,
        cover: 0,
        passable: true,
      };
    }
  }

  // Place main road (horizontal through center)
  const mainRoadY = Math.floor(height / 2);
  for (let x = 0; x < width; x++) {
    setTerrain(tiles, x, mainRoadY, 'road');
    setTerrain(tiles, x, mainRoadY - 1, 'road');
  }

  // Place secondary road (vertical through center)
  const crossRoadX = Math.floor(width / 2);
  for (let y = Math.floor(height * 0.2); y < Math.floor(height * 0.8); y++) {
    setTerrain(tiles, crossRoadX, y, 'road');
    setTerrain(tiles, crossRoadX + 1, y, 'road');
  }

  // Place buildings along roads
  const buildingCount = rng.int(8, 15);
  const buildingTypes: Building['type'][] = ['house', 'house', 'house', 'apartment', 'warehouse', 'shop', 'church'];

  for (let i = 0; i < buildingCount; i++) {
    const type = buildingTypes[rng.int(0, buildingTypes.length - 1)];
    const bw = type === 'house' ? rng.int(2, 3) : rng.int(3, 4);
    const bh = type === 'house' ? 2 : rng.int(2, 3);
    const floors = type === 'apartment' ? 3 : type === 'warehouse' ? 1 : 2;

    // Try to place near a road
    for (let attempt = 0; attempt < 20; attempt++) {
      const bx = rng.int(3, width - bw - 3);
      const by = rng.int(3, height - bh - 3);

      if (canPlaceBuilding(tiles, bx, by, bw, bh)) {
        const building: Building = {
          id: `building-${i}`,
          tiles: [],
          type,
          health: 100,
          floors,
        };

        for (let dy = 0; dy < bh; dy++) {
          for (let dx = 0; dx < bw; dx++) {
            const tx = bx + dx;
            const ty = by + dy;
            setTerrain(tiles, tx, ty, 'building');
            tiles[ty][tx].buildingId = building.id;
            tiles[ty][tx].elevation = floors;
            tiles[ty][tx].cover = TERRAIN_COVER.building;
            building.tiles.push({ x: tx, y: ty });
          }
        }

        buildings.push(building);
        break;
      }
    }
  }

  // Scatter trees on edges (20% of remaining empty edge tiles)
  const edgeDepth = Math.floor(Math.min(width, height) * 0.25);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (tiles[y][x].terrain !== 'open') continue;
      const isEdge = x < edgeDepth || x >= width - edgeDepth ||
                     y < edgeDepth || y >= height - edgeDepth;
      if (isEdge && rng.next() < 0.2) {
        setTerrain(tiles, x, y, 'trees');
      }
    }
  }

  // Add rubble near buildings (5% of open tiles near buildings)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (tiles[y][x].terrain !== 'open') continue;
      if (hasAdjacentTerrain(tiles, x, y, 'building', width, height) && rng.next() < 0.05) {
        setTerrain(tiles, x, y, 'rubble');
      }
    }
  }

  return {
    id: `tactical-${seed}`,
    name,
    width,
    height,
    tileSize: 32,
    tiles,
    buildings,
  };
}

function setTerrain(tiles: TacticalTile[][], x: number, y: number, terrain: TacticalTerrain): void {
  if (tiles[y]?.[x]) {
    tiles[y][x].terrain = terrain;
    tiles[y][x].cover = TERRAIN_COVER[terrain];
    tiles[y][x].passable = terrain !== 'water';
  }
}

function canPlaceBuilding(
  tiles: TacticalTile[][],
  bx: number, by: number,
  bw: number, bh: number,
): boolean {
  // Check building area + 1 tile margin
  for (let dy = -1; dy <= bh; dy++) {
    for (let dx = -1; dx <= bw; dx++) {
      const tx = bx + dx;
      const ty = by + dy;
      const tile = tiles[ty]?.[tx];
      if (!tile) continue;
      if (dy >= 0 && dy < bh && dx >= 0 && dx < bw) {
        // Building area: must be open
        if (tile.terrain !== 'open') return false;
      } else {
        // Margin: can't overlap other buildings
        if (tile.terrain === 'building') return false;
      }
    }
  }
  return true;
}

function hasAdjacentTerrain(
  tiles: TacticalTile[][],
  x: number, y: number,
  terrain: TacticalTerrain,
  width: number, height: number,
): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        if (tiles[ny][nx].terrain === terrain) return true;
      }
    }
  }
  return false;
}
