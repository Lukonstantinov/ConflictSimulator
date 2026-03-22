import { Delaunay } from 'd3-delaunay';
import type { Point, Region, TerrainType } from '../types';
import { SeededRNG } from '../utils/random';
import { generateLandmask, assignTerrain } from './terrain';

/**
 * Generate random seed points within bounds.
 */
export function generateSeedPoints(
  width: number,
  height: number,
  count: number,
  rng: SeededRNG,
): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < count; i++) {
    points.push({
      x: rng.range(10, width - 10),
      y: rng.range(10, height - 10),
    });
  }
  return points;
}

/**
 * Lloyd relaxation: move each point to the centroid of its Voronoi cell.
 * Produces more evenly-spaced cells.
 */
export function lloydRelaxation(
  points: Point[],
  width: number,
  height: number,
  iterations: number,
): Point[] {
  let current = points.map((p) => ({ ...p }));

  for (let iter = 0; iter < iterations; iter++) {
    const flat = current.flatMap((p) => [p.x, p.y]);
    const delaunay = new Delaunay(flat);
    const voronoi = delaunay.voronoi([0, 0, width, height]);

    const relaxed: Point[] = [];
    for (let i = 0; i < current.length; i++) {
      const cell = voronoi.cellPolygon(i);
      if (!cell || cell.length < 3) {
        relaxed.push(current[i]);
        continue;
      }

      // Compute centroid
      let cx = 0, cy = 0;
      for (let j = 0; j < cell.length - 1; j++) {
        cx += cell[j][0];
        cy += cell[j][1];
      }
      const n = cell.length - 1;
      relaxed.push({ x: cx / n, y: cy / n });
    }

    current = relaxed;
  }

  return current;
}

/**
 * Build a complete Voronoi map with regions, terrain, and adjacency.
 */
export function buildVoronoiMap(
  width: number,
  height: number,
  regionCount: number,
  seed: number,
): {
  sites: Point[];
  regions: Region[];
  landmask: boolean[];
} {
  const rng = new SeededRNG(seed);

  // Generate and relax points
  let sites = generateSeedPoints(width, height, regionCount, rng);
  sites = lloydRelaxation(sites, width, height, 3);

  // Build Delaunay + Voronoi
  const flat = sites.flatMap((p) => [p.x, p.y]);
  const delaunay = new Delaunay(flat);
  const voronoi = delaunay.voronoi([0, 0, width, height]);

  // Extract adjacency from Delaunay triangulation
  const neighbors: number[][] = sites.map(() => []);
  for (let i = 0; i < sites.length; i++) {
    for (const j of delaunay.neighbors(i)) {
      if (!neighbors[i].includes(j)) {
        neighbors[i].push(j);
      }
    }
  }

  // Generate landmask and terrain
  const landmask = generateLandmask(sites, width, height, seed);
  const terrainTypes = assignTerrain(sites, landmask, neighbors, width, height, seed);

  // Build regions
  const regions: Region[] = sites.map((site, i) => {
    const cell = voronoi.cellPolygon(i);
    const polygon: Point[] = cell
      ? cell.slice(0, -1).map(([x, y]) => ({ x, y }))
      : [];

    const terrain = terrainTypes[i] as TerrainType;
    const basePop: Record<string, number> = {
      plains: 100, forest: 70, mountains: 40, desert: 30, coast: 120, ocean: 0,
    };
    return {
      id: i,
      polygon,
      centroid: site,
      neighbors: neighbors[i],
      terrain,
      countryId: null,
      population: basePop[terrain] ?? 50,
      fortification: 0,
    };
  });

  return { sites, regions, landmask };
}
