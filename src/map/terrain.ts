import type { Point, TerrainType } from '../types';
import { SeededRNG } from '../utils/random';

/**
 * Simple 2D Perlin-like noise using value noise with interpolation.
 */
export class SimplexNoise {
  private perm: number[];

  constructor(rng: SeededRNG) {
    this.perm = [];
    for (let i = 0; i < 256; i++) this.perm[i] = i;
    rng.shuffle(this.perm);
    this.perm = [...this.perm, ...this.perm];
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }

  private grad(hash: number, x: number, y: number): number {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  noise2D(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = this.fade(xf);
    const v = this.fade(yf);

    const aa = this.perm[this.perm[X] + Y];
    const ab = this.perm[this.perm[X] + Y + 1];
    const ba = this.perm[this.perm[X + 1] + Y];
    const bb = this.perm[this.perm[X + 1] + Y + 1];

    return this.lerp(
      this.lerp(this.grad(aa, xf, yf), this.grad(ba, xf - 1, yf), u),
      this.lerp(this.grad(ab, xf, yf - 1), this.grad(bb, xf - 1, yf - 1), u),
      v,
    );
  }

  /** Multi-octave noise, returns value in roughly [-1, 1] */
  fbm(x: number, y: number, octaves = 4): number {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      value += this.noise2D(x * frequency, y * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }

    return value / maxValue;
  }
}

/**
 * Generate land/ocean mask based on Perlin noise.
 * Returns true for land cells, false for ocean.
 */
export function generateLandmask(
  sites: Point[],
  width: number,
  height: number,
  seed: number,
): boolean[] {
  const rng = new SeededRNG(seed + 1000);
  const noise = new SimplexNoise(rng);
  const scale = 0.005;

  return sites.map((site) => {
    // Distance from center creates island-like shapes
    const dx = (site.x / width - 0.5) * 2;
    const dy = (site.y / height - 0.5) * 2;
    const distFromCenter = Math.sqrt(dx * dx + dy * dy);

    const noiseVal = noise.fbm(site.x * scale, site.y * scale, 4);
    // Bias toward land in center, ocean at edges
    const elevation = noiseVal * 0.7 + (1 - distFromCenter) * 0.5 - 0.15;

    return elevation > 0;
  });
}

/**
 * Assign terrain types to regions based on noise and coastal proximity.
 */
export function assignTerrain(
  sites: Point[],
  landmask: boolean[],
  neighbors: number[][],
  width: number,
  height: number,
  seed: number,
): TerrainType[] {
  const rng = new SeededRNG(seed + 2000);
  const noise = new SimplexNoise(rng);
  const scale = 0.008;

  return sites.map((site, i) => {
    if (!landmask[i]) return 'ocean';

    // Check if any neighbor is ocean → coast
    const isCoastal = neighbors[i].some((n) => !landmask[n]);
    if (isCoastal) return 'coast';

    const elevation = noise.fbm(site.x * scale, site.y * scale, 3);
    const moisture = noise.fbm(site.x * scale + 100, site.y * scale + 100, 3);

    if (elevation > 0.35) return 'mountains';
    if (moisture > 0.2) return 'forest';
    if (moisture < -0.25) return 'desert';
    return 'plains';
  });
}
