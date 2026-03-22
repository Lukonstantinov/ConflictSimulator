import * as PIXI from 'pixi.js';
import type { Region, Country } from '../types';
import { hslToHex, TERRAIN_COLORS } from '../utils/colors';

export class MapRenderer {
  app: PIXI.Application;
  private regionGraphics: Map<number, PIXI.Graphics> = new Map();
  private onRegionClick: ((regionId: number) => void) | null = null;

  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    this.app = new PIXI.Application({
      view: canvas,
      width,
      height,
      backgroundColor: 0x1a2a4a,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio, 2),
      autoDensity: true,
    });
  }

  setRegionClickHandler(handler: (regionId: number) => void): void {
    this.onRegionClick = handler;
  }

  drawRegions(regions: Region[], countries: Country[]): void {
    this.app.stage.removeChildren();
    this.regionGraphics.clear();

    const countryMap = new Map(countries.map((c) => [c.id, c]));

    for (const region of regions) {
      if (region.polygon.length < 3) continue;

      const gfx = new PIXI.Graphics();

      // Determine fill color
      let fillColor: number;
      if (region.countryId && countryMap.has(region.countryId)) {
        fillColor = hslToHex(countryMap.get(region.countryId)!.color);
      } else {
        fillColor = TERRAIN_COLORS[region.terrain] ?? 0x888888;
      }

      const alpha = region.terrain === 'ocean' ? 0.6 : 0.85;

      // Draw filled polygon
      gfx.beginFill(fillColor, alpha);
      gfx.moveTo(region.polygon[0].x, region.polygon[0].y);
      for (let i = 1; i < region.polygon.length; i++) {
        gfx.lineTo(region.polygon[i].x, region.polygon[i].y);
      }
      gfx.closePath();
      gfx.endFill();

      // Draw border
      gfx.lineStyle(1, 0x222222, 0.4);
      gfx.moveTo(region.polygon[0].x, region.polygon[0].y);
      for (let i = 1; i < region.polygon.length; i++) {
        gfx.lineTo(region.polygon[i].x, region.polygon[i].y);
      }
      gfx.closePath();

      // Make interactive
      gfx.eventMode = 'static';
      gfx.cursor = 'pointer';

      const points = region.polygon.flatMap((p) => [p.x, p.y]);
      gfx.hitArea = new PIXI.Polygon(points);

      const regionId = region.id;
      gfx.on('pointerdown', () => {
        this.onRegionClick?.(regionId);
      });

      this.app.stage.addChild(gfx);
      this.regionGraphics.set(region.id, gfx);
    }
  }

  highlightRegion(regionId: number | null): void {
    this.regionGraphics.forEach((gfx) => {
      gfx.alpha = 1.0;
    });

    if (regionId !== null) {
      const gfx = this.regionGraphics.get(regionId);
      if (gfx) {
        gfx.alpha = 0.7;
      }
    }
  }

  destroy(): void {
    this.app.destroy(true);
  }
}
