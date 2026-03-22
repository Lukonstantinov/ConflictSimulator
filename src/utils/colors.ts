const COUNTRY_HUES = [0, 30, 60, 120, 180, 210, 240, 270, 300, 330];

/**
 * Generate a visually distinct HSL color for a country.
 */
export function generateCountryColor(index: number): string {
  const hue = COUNTRY_HUES[index % COUNTRY_HUES.length];
  const saturation = 60 + (index % 3) * 10;
  const lightness = 45 + (index % 2) * 10;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/** Convert HSL string to hex for PixiJS */
export function hslToHex(hsl: string): number {
  const match = hsl.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
  if (!match) return 0x888888;

  const h = parseInt(match[1]) / 360;
  const s = parseInt(match[2]) / 100;
  const l = parseInt(match[3]) / 100;

  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  const toHex = (c: number) => Math.round(c * 255);
  return (toHex(r) << 16) | (toHex(g) << 8) | toHex(b);
}

/** Terrain colors for rendering */
export const TERRAIN_COLORS: Record<string, number> = {
  plains: 0x8fbc5a,
  mountains: 0x9e9e9e,
  forest: 0x4a7c3f,
  desert: 0xd4b96a,
  coast: 0xc2d68a,
  ocean: 0x3a6faa,
};
