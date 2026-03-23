import type { TacticalMap, TacticalTile, Building, TacticalTerrain } from '../types';
import { TERRAIN_COVER } from '../types';
import { SeededRNG } from '../../utils/random';

export type MapPreset = 'village' | 'forest' | 'urban' | 'factory' | 'coastal';

export interface GenerationParams {
  preset: MapPreset;
  buildingDensity?: number;  // 0–1, overrides preset default
  treeDensity?: number;      // 0–1
  hasTrenches?: boolean;
  hasWater?: boolean;
}

/** Generate a procedural village map (legacy API, preserved for compatibility) */
export function generateTacticalMap(
  width: number,
  height: number,
  seed: number,
  name: string = 'Village',
): TacticalMap {
  return generateTacticalMapFromPreset(width, height, seed, { preset: 'village' }, name);
}

/** Generate a procedural map with a named preset */
export function generateTacticalMapFromPreset(
  width: number,
  height: number,
  seed: number,
  params: GenerationParams,
  name?: string,
): TacticalMap {
  const rng = new SeededRNG(seed);
  const tiles: TacticalTile[][] = [];
  const buildings: Building[] = [];

  // Initialize all tiles as open
  for (let y = 0; y < height; y++) {
    tiles[y] = [];
    for (let x = 0; x < width; x++) {
      tiles[y][x] = { x, y, terrain: 'open', elevation: 0, cover: 0, passable: true, smoke: 0 };
    }
  }

  const { preset } = params;

  if (preset === 'village') {
    placeVillageLayout(tiles, buildings, width, height, rng, params);
  } else if (preset === 'forest') {
    placeForestLayout(tiles, buildings, width, height, rng, params);
  } else if (preset === 'urban') {
    placeUrbanLayout(tiles, buildings, width, height, rng, params);
  } else if (preset === 'factory') {
    placeFactoryLayout(tiles, buildings, width, height, rng, params);
  } else if (preset === 'coastal') {
    placeCoastalLayout(tiles, buildings, width, height, rng, params);
  }

  const mapName = name ?? PRESET_NAMES[preset];
  return {
    id: `tactical-${seed}-${preset}`,
    name: mapName,
    width,
    height,
    tileSize: 32,
    tiles,
    buildings,
  };
}

const PRESET_NAMES: Record<MapPreset, string> = {
  village: 'Village',
  forest: 'Forest',
  urban: 'Urban District',
  factory: 'Factory Complex',
  coastal: 'Coastal Town',
};

// ── Village preset (original layout) ──────────────────────────────────────────
function placeVillageLayout(
  tiles: TacticalTile[][],
  buildings: Building[],
  width: number,
  height: number,
  rng: SeededRNG,
  params: GenerationParams,
): void {
  // Cross roads
  const mainRoadY = Math.floor(height / 2);
  for (let x = 0; x < width; x++) {
    setTerrain(tiles, x, mainRoadY, 'road');
    setTerrain(tiles, x, mainRoadY - 1, 'road');
  }
  const crossRoadX = Math.floor(width / 2);
  for (let y = Math.floor(height * 0.2); y < Math.floor(height * 0.8); y++) {
    setTerrain(tiles, crossRoadX, y, 'road');
    setTerrain(tiles, crossRoadX + 1, y, 'road');
  }

  // Buildings along roads
  const density = params.buildingDensity ?? 0.5;
  const buildingCount = Math.round(rng.int(6, 10) * (1 + density));
  placeRandomBuildings(tiles, buildings, width, height, rng, buildingCount, 'house');

  // Edge trees
  const treeDensity = params.treeDensity ?? 0.2;
  const edgeDepth = Math.floor(Math.min(width, height) * 0.25);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (tiles[y][x].terrain !== 'open') continue;
      const isEdge = x < edgeDepth || x >= width - edgeDepth || y < edgeDepth || y >= height - edgeDepth;
      if (isEdge && rng.next() < treeDensity) setTerrain(tiles, x, y, 'trees');
    }
  }

  // Rubble near buildings
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (tiles[y][x].terrain !== 'open') continue;
      if (hasAdjacentTerrain(tiles, x, y, 'building', width, height) && rng.next() < 0.05) {
        setTerrain(tiles, x, y, 'rubble');
      }
    }
  }

  // Optional trenches
  if (params.hasTrenches) placeTrenches(tiles, width, height, rng);
}

// ── Forest preset ─────────────────────────────────────────────────────────────
function placeForestLayout(
  tiles: TacticalTile[][],
  buildings: Building[],
  width: number,
  height: number,
  rng: SeededRNG,
  params: GenerationParams,
): void {
  // Narrow road from north to south slightly off center
  const roadX = Math.floor(width * 0.4);
  for (let y = 0; y < height; y++) {
    setTerrain(tiles, roadX, y, 'road');
    if (rng.next() < 0.3) setTerrain(tiles, roadX + 1, y, 'road');
  }
  // Short east-west branch road
  const branchY = Math.floor(height * 0.6);
  for (let x = roadX - 6; x < roadX + 8; x++) {
    setTerrain(tiles, x, branchY, 'road');
  }

  // Dense trees (60–80% of non-road open tiles)
  const treeDensity = params.treeDensity ?? 0.7;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (tiles[y][x].terrain !== 'open') continue;
      if (rng.next() < treeDensity) setTerrain(tiles, x, y, 'trees');
    }
  }

  // Few buildings near road junction
  const buildingCount = Math.round(rng.int(2, 4) * (params.buildingDensity ?? 0.5) * 2 + 2);
  placeBuildingsNearPoint(tiles, buildings, width, height, rng, roadX, branchY, buildingCount, 6, 'house');

  // Occasional rubble clearings
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (tiles[y][x].terrain !== 'open') continue;
      if (rng.next() < 0.04) setTerrain(tiles, x, y, 'rubble');
    }
  }

  if (params.hasTrenches) placeTrenches(tiles, width, height, rng);
}

// ── Urban preset ─────────────────────────────────────────────────────────────
function placeUrbanLayout(
  tiles: TacticalTile[][],
  buildings: Building[],
  width: number,
  height: number,
  rng: SeededRNG,
  params: GenerationParams,
): void {
  // Grid of roads every ~8 tiles
  const roadSpacingX = 9;
  const roadSpacingY = 9;
  for (let x = 4; x < width; x += roadSpacingX) {
    for (let y = 0; y < height; y++) setTerrain(tiles, x, y, 'road');
  }
  for (let y = 4; y < height; y += roadSpacingY) {
    for (let x = 0; x < width; x++) setTerrain(tiles, x, y, 'road');
  }

  // Dense buildings filling the blocks between roads
  const density = params.buildingDensity ?? 0.8;
  const buildingCount = Math.round(rng.int(15, 22) * density);
  placeRandomBuildings(tiles, buildings, width, height, rng, buildingCount, 'apartment');

  // Rubble patches (bomb damage)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (tiles[y][x].terrain === 'open' && rng.next() < 0.06) {
        setTerrain(tiles, x, y, 'rubble');
      }
    }
  }

  // Scattered trees (parks)
  const treeDensity = params.treeDensity ?? 0.05;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (tiles[y][x].terrain === 'open' && rng.next() < treeDensity) {
        setTerrain(tiles, x, y, 'trees');
      }
    }
  }

  if (params.hasTrenches) placeTrenches(tiles, width, height, rng);
}

// ── Factory preset ────────────────────────────────────────────────────────────
function placeFactoryLayout(
  tiles: TacticalTile[][],
  buildings: Building[],
  width: number,
  height: number,
  rng: SeededRNG,
  params: GenerationParams,
): void {
  // Perimeter road
  const perimY = Math.floor(height * 0.1);
  for (let x = 0; x < width; x++) {
    setTerrain(tiles, x, perimY, 'road');
    setTerrain(tiles, x, height - perimY - 1, 'road');
  }
  const perimX = Math.floor(width * 0.1);
  for (let y = perimY; y < height - perimY; y++) {
    setTerrain(tiles, perimX, y, 'road');
    setTerrain(tiles, width - perimX - 1, y, 'road');
  }

  // Central road
  const midX = Math.floor(width / 2);
  for (let y = perimY; y < height - perimY; y++) {
    setTerrain(tiles, midX, y, 'road');
    setTerrain(tiles, midX + 1, y, 'road');
  }

  // Large warehouse buildings
  const density = params.buildingDensity ?? 0.7;
  const warehouseCount = Math.round(rng.int(4, 7) * density);
  for (let i = 0; i < warehouseCount; i++) {
    const bw = rng.int(4, 7);
    const bh = rng.int(3, 5);
    for (let attempt = 0; attempt < 30; attempt++) {
      const bx = rng.int(perimX + 2, width - perimX - bw - 2);
      const by = rng.int(perimY + 2, height - perimY - bh - 2);
      if (canPlaceBuilding(tiles, bx, by, bw, bh)) {
        const building: Building = {
          id: `building-${buildings.length}`,
          tiles: [],
          type: 'warehouse',
          health: 100,
          floors: 1,
          destroyed: false,
        };
        for (let dy = 0; dy < bh; dy++) {
          for (let dx = 0; dx < bw; dx++) {
            const tx = bx + dx;
            const ty = by + dy;
            setTerrain(tiles, tx, ty, 'building');
            tiles[ty][tx].buildingId = building.id;
            tiles[ty][tx].elevation = 1;
            tiles[ty][tx].cover = TERRAIN_COVER.building;
            building.tiles.push({ x: tx, y: ty });
          }
        }
        buildings.push(building);
        break;
      }
    }
  }

  // Rubble (damage / debris around warehouses)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (tiles[y][x].terrain !== 'open') continue;
      if (hasAdjacentTerrain(tiles, x, y, 'building', width, height) && rng.next() < 0.15) {
        setTerrain(tiles, x, y, 'rubble');
      } else if (rng.next() < 0.03) {
        setTerrain(tiles, x, y, 'rubble');
      }
    }
  }

  // Minimal trees at edges
  const treeDensity = params.treeDensity ?? 0.08;
  const edgeDepth = Math.floor(Math.min(width, height) * 0.12);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (tiles[y][x].terrain !== 'open') continue;
      const isEdge = x < edgeDepth || x >= width - edgeDepth || y < edgeDepth || y >= height - edgeDepth;
      if (isEdge && rng.next() < treeDensity) setTerrain(tiles, x, y, 'trees');
    }
  }

  if (params.hasTrenches) placeTrenches(tiles, width, height, rng);
}

// ── Coastal preset ────────────────────────────────────────────────────────────
function placeCoastalLayout(
  tiles: TacticalTile[][],
  buildings: Building[],
  width: number,
  height: number,
  rng: SeededRNG,
  params: GenerationParams,
): void {
  // Water band on the south
  const waterRows = Math.floor(height * 0.18);
  for (let y = height - waterRows; y < height; y++) {
    for (let x = 0; x < width; x++) {
      setTerrain(tiles, x, y, 'water');
    }
  }

  // Beach row (rubble/open at waterline)
  const beachY = height - waterRows - 1;
  for (let x = 0; x < width; x++) {
    if (tiles[beachY][x].terrain === 'open') setTerrain(tiles, x, beachY, 'rubble');
  }

  // Coastal road parallel to water
  const coastRoadY = height - waterRows - 3;
  for (let x = 0; x < width; x++) {
    setTerrain(tiles, x, coastRoadY, 'road');
    setTerrain(tiles, x, coastRoadY - 1, 'road');
  }

  // Perpendicular roads from coast road going north
  for (let xr of [Math.floor(width * 0.3), Math.floor(width * 0.6)]) {
    for (let y = Math.floor(height * 0.1); y <= coastRoadY; y++) {
      setTerrain(tiles, xr, y, 'road');
    }
  }

  // Buildings inland
  const density = params.buildingDensity ?? 0.6;
  const buildingCount = Math.round(rng.int(8, 14) * density);
  placeRandomBuildings(tiles, buildings, width, Math.floor(height * 0.8), rng, buildingCount, 'house');

  // Trees in north section
  const treeDensity = params.treeDensity ?? 0.25;
  for (let y = 0; y < Math.floor(height * 0.35); y++) {
    for (let x = 0; x < width; x++) {
      if (tiles[y][x].terrain === 'open' && rng.next() < treeDensity) {
        setTerrain(tiles, x, y, 'trees');
      }
    }
  }

  if (params.hasTrenches) {
    // Trenches along coast road (defensive positions)
    const trenchY = coastRoadY - 4;
    for (let x = 2; x < width - 2; x += rng.int(2, 4)) {
      setTerrain(tiles, x, trenchY, 'trench');
    }
  }
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

function placeRandomBuildings(
  tiles: TacticalTile[][],
  buildings: Building[],
  width: number,
  height: number,
  rng: SeededRNG,
  count: number,
  preferredType: Building['type'],
): void {
  const buildingTypes: Building['type'][] = [preferredType, preferredType, 'house', 'apartment', 'warehouse', 'shop', 'church'];
  for (let i = 0; i < count; i++) {
    const type = buildingTypes[rng.int(0, buildingTypes.length - 1)];
    const bw = type === 'house' ? rng.int(2, 3) : rng.int(3, 4);
    const bh = type === 'house' ? 2 : rng.int(2, 3);
    const floors = type === 'apartment' ? 3 : type === 'warehouse' ? 1 : 2;

    for (let attempt = 0; attempt < 20; attempt++) {
      const bx = rng.int(3, width - bw - 3);
      const by = rng.int(3, height - bh - 3);

      if (canPlaceBuilding(tiles, bx, by, bw, bh)) {
        const building: Building = {
          id: `building-${buildings.length}`,
          tiles: [],
          type,
          health: 100,
          floors,
          destroyed: false,
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
}

function placeBuildingsNearPoint(
  tiles: TacticalTile[][],
  buildings: Building[],
  width: number,
  height: number,
  rng: SeededRNG,
  cx: number,
  cy: number,
  count: number,
  radius: number,
  preferredType: Building['type'],
): void {
  const buildingTypes: Building['type'][] = [preferredType, 'house', 'apartment', 'shop'];
  for (let i = 0; i < count; i++) {
    const type = buildingTypes[rng.int(0, buildingTypes.length - 1)];
    const bw = type === 'house' ? rng.int(2, 3) : rng.int(2, 3);
    const bh = 2;
    const floors = type === 'apartment' ? 3 : 2;

    for (let attempt = 0; attempt < 25; attempt++) {
      const bx = Math.max(3, Math.min(width - bw - 3, cx + rng.int(-radius, radius)));
      const by = Math.max(3, Math.min(height - bh - 3, cy + rng.int(-radius, radius)));

      if (canPlaceBuilding(tiles, bx, by, bw, bh)) {
        const building: Building = {
          id: `building-${buildings.length}`,
          tiles: [],
          type,
          health: 100,
          floors,
          destroyed: false,
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
}

function placeTrenches(
  tiles: TacticalTile[][],
  width: number,
  height: number,
  rng: SeededRNG,
): void {
  // Horizontal trench line roughly 60% down the map
  const trenchY = Math.floor(height * 0.6);
  for (let x = 2; x < width - 2; x++) {
    const tile = tiles[trenchY]?.[x];
    if (tile && tile.terrain === 'open') setTerrain(tiles, x, trenchY, 'trench');
  }
  // Scattered foxholes
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (tiles[y][x].terrain !== 'open') continue;
      if (Math.abs(y - trenchY) <= 3 && rng.next() < 0.15) {
        setTerrain(tiles, x, y, 'trench');
      }
    }
  }
}

export function setTerrain(tiles: TacticalTile[][], x: number, y: number, terrain: TacticalTerrain): void {
  if (tiles[y]?.[x]) {
    tiles[y][x].terrain = terrain;
    tiles[y][x].cover = TERRAIN_COVER[terrain];
    tiles[y][x].passable = terrain !== 'water';
  }
}

export function canPlaceBuilding(
  tiles: TacticalTile[][],
  bx: number, by: number,
  bw: number, bh: number,
): boolean {
  for (let dy = -1; dy <= bh; dy++) {
    for (let dx = -1; dx <= bw; dx++) {
      const tx = bx + dx;
      const ty = by + dy;
      const tile = tiles[ty]?.[tx];
      if (!tile) continue;
      if (dy >= 0 && dy < bh && dx >= 0 && dx < bw) {
        if (tile.terrain !== 'open') return false;
      } else {
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
