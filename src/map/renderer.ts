import * as PIXI from 'pixi.js';
import type { Region, Country, BattleEffect } from '../types';
import { hslToHex, TERRAIN_COLORS } from '../utils/colors';
import { ArmyOverlay, BattleEffectSystem, Minimap } from './animation';

const TERRAIN_PATTERNS: Record<string, (gfx: PIXI.Graphics, cx: number, cy: number) => void> = {
  mountains: (gfx, cx, cy) => {
    gfx.lineStyle(1, 0x777777, 0.3);
    for (let i = -1; i <= 1; i++) {
      const ox = cx + i * 12;
      const oy = cy + i * 4;
      gfx.moveTo(ox - 6, oy + 4);
      gfx.lineTo(ox, oy - 5);
      gfx.lineTo(ox + 6, oy + 4);
    }
  },
  forest: (gfx, cx, cy) => {
    gfx.lineStyle(1, 0x2d5a1e, 0.25);
    for (let i = -1; i <= 1; i++) {
      const ox = cx + i * 10;
      gfx.drawCircle(ox, cy - 2, 4);
      gfx.moveTo(ox, cy + 2);
      gfx.lineTo(ox, cy + 5);
    }
  },
  desert: (gfx, cx, cy) => {
    gfx.lineStyle(1, 0xc4a44a, 0.2);
    gfx.moveTo(cx - 10, cy);
    gfx.bezierCurveTo(cx - 5, cy - 3, cx + 5, cy + 3, cx + 10, cy);
    gfx.moveTo(cx - 8, cy + 5);
    gfx.bezierCurveTo(cx - 3, cy + 2, cx + 3, cy + 8, cx + 8, cy + 5);
  },
  coast: (gfx, cx, cy) => {
    gfx.lineStyle(1, 0x88aacc, 0.2);
    gfx.moveTo(cx - 8, cy);
    gfx.bezierCurveTo(cx - 4, cy - 2, cx + 4, cy + 2, cx + 8, cy);
  },
};

export class MapRenderer {
  app: PIXI.Application;
  private worldContainer: PIXI.Container;
  private uiContainer: PIXI.Container;
  private regionGraphics: Map<number, PIXI.Graphics> = new Map();
  private borderGraphics: Map<string, PIXI.Graphics> = new Map();
  private onRegionClick: ((regionId: number) => void) | null = null;

  // Camera state
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  private isDragging = false;
  private lastPointer = { x: 0, y: 0 };
  private worldW: number;
  private worldH: number;

  // Overlays
  private armyOverlay: ArmyOverlay;
  private battleEffects: BattleEffectSystem;
  private minimap: Minimap;
  private animFrameId: number | null = null;

  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    this.worldW = width;
    this.worldH = height;

    this.app = new PIXI.Application({
      view: canvas,
      width,
      height,
      backgroundColor: 0x1a2a4a,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio, 2),
      autoDensity: true,
    });

    // World container for pan/zoom
    this.worldContainer = new PIXI.Container();
    this.app.stage.addChild(this.worldContainer);

    // Fixed UI container (minimap, etc.)
    this.uiContainer = new PIXI.Container();
    this.app.stage.addChild(this.uiContainer);

    // Overlays
    this.armyOverlay = new ArmyOverlay(this.worldContainer);
    this.battleEffects = new BattleEffectSystem(this.worldContainer);
    this.minimap = new Minimap(this.uiContainer, width, height, 130);
    this.minimap.setPosition(width - 140, 10);

    // Camera controls
    this.setupCameraControls(canvas);

    // Start animation loop
    this.startAnimationLoop();
  }

  private setupCameraControls(canvas: HTMLCanvasElement): void {
    // Mouse wheel zoom
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const newZoom = Math.max(0.5, Math.min(4, this.zoom * zoomFactor));

      // Zoom toward cursor position
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const worldXBefore = (mx - this.panX) / this.zoom;
      const worldYBefore = (my - this.panY) / this.zoom;

      this.zoom = newZoom;

      this.panX = mx - worldXBefore * this.zoom;
      this.panY = my - worldYBefore * this.zoom;

      this.applyCamera();
    }, { passive: false });

    // Pan with middle mouse or shift+drag
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
        this.isDragging = true;
        this.lastPointer = { x: e.clientX, y: e.clientY };
        e.preventDefault();
      }
    });

    canvas.addEventListener('pointermove', (e) => {
      if (this.isDragging) {
        this.panX += e.clientX - this.lastPointer.x;
        this.panY += e.clientY - this.lastPointer.y;
        this.lastPointer = { x: e.clientX, y: e.clientY };
        this.applyCamera();
      }
    });

    canvas.addEventListener('pointerup', () => {
      this.isDragging = false;
    });

    canvas.addEventListener('pointerleave', () => {
      this.isDragging = false;
    });

    // Touch pinch zoom
    let lastTouchDist = 0;
    let lastTouchCenter = { x: 0, y: 0 };

    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastTouchDist = Math.sqrt(dx * dx + dy * dy);
        lastTouchCenter = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        };
      }
    }, { passive: true });

    canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const center = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        };

        if (lastTouchDist > 0) {
          const scale = dist / lastTouchDist;
          const newZoom = Math.max(0.5, Math.min(4, this.zoom * scale));

          const rect = canvas.getBoundingClientRect();
          const mx = center.x - rect.left;
          const my = center.y - rect.top;

          const worldXBefore = (mx - this.panX) / this.zoom;
          const worldYBefore = (my - this.panY) / this.zoom;

          this.zoom = newZoom;
          this.panX = mx - worldXBefore * this.zoom;
          this.panY = my - worldYBefore * this.zoom;

          // Also pan
          this.panX += center.x - lastTouchCenter.x;
          this.panY += center.y - lastTouchCenter.y;

          this.applyCamera();
        }

        lastTouchDist = dist;
        lastTouchCenter = center;
      }
    }, { passive: false });

    canvas.addEventListener('touchend', () => {
      lastTouchDist = 0;
    });
  }

  private applyCamera(): void {
    this.worldContainer.scale.set(this.zoom);
    this.worldContainer.x = this.panX;
    this.worldContainer.y = this.panY;

    this.minimap.updateViewport(this.panX, this.panY, this.worldW, this.worldH, this.zoom);
  }

  resetCamera(): void {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.applyCamera();
  }

  setRegionClickHandler(handler: (regionId: number) => void): void {
    this.onRegionClick = handler;
  }

  drawRegions(regions: Region[], countries: Country[]): void {
    // Clear old region graphics but keep overlays
    for (const [, gfx] of this.regionGraphics) {
      this.worldContainer.removeChild(gfx);
      gfx.destroy();
    }
    this.regionGraphics.clear();
    for (const [, gfx] of this.borderGraphics) {
      this.worldContainer.removeChild(gfx);
      gfx.destroy();
    }
    this.borderGraphics.clear();

    const countryMap = new Map(countries.map((c) => [c.id, c]));

    for (const region of regions) {
      if (region.polygon.length < 3) continue;

      const gfx = new PIXI.Graphics();

      // Determine fill color
      let fillColor: number;
      let isCountryOwned = false;
      if (region.countryId && countryMap.has(region.countryId)) {
        const country = countryMap.get(region.countryId)!;
        if (country.isAlive) {
          fillColor = hslToHex(country.color);
          isCountryOwned = true;
        } else {
          fillColor = 0x444444; // Eliminated country — gray
        }
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

      // Draw terrain pattern overlay (subtle texture)
      if (!isCountryOwned && region.terrain !== 'ocean') {
        const pattern = TERRAIN_PATTERNS[region.terrain];
        if (pattern) {
          pattern(gfx, region.centroid.x, region.centroid.y);
        }
      }

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

      this.worldContainer.addChildAt(gfx, 0);
      this.regionGraphics.set(region.id, gfx);
    }

    // Draw thick country borders
    this.drawCountryBorders(regions, countries);

    // Update minimap
    this.minimap.updateRegions(regions, countries);
  }

  private drawCountryBorders(regions: Region[], countries: Country[]): void {
    const countryMap = new Map(countries.map((c) => [c.id, c]));

    for (const region of regions) {
      if (!region.countryId) continue;
      const country = countryMap.get(region.countryId);
      if (!country || !country.isAlive) continue;

      for (const neighborId of region.neighbors) {
        const neighbor = regions.find((r) => r.id === neighborId);
        if (!neighbor) continue;
        if (neighbor.countryId === region.countryId) continue;

        // Find shared edge (approximate: draw line between centroids projected to edge)
        const edgeKey = `${Math.min(region.id, neighborId)}-${Math.max(region.id, neighborId)}`;
        if (this.borderGraphics.has(edgeKey)) continue;

        const shared = this.findSharedEdge(region, neighbor);
        if (shared.length < 2) continue;

        const borderGfx = new PIXI.Graphics();
        const color = hslToHex(country.color);
        borderGfx.lineStyle(2.5, color, 0.7);
        borderGfx.moveTo(shared[0].x, shared[0].y);
        for (let i = 1; i < shared.length; i++) {
          borderGfx.lineTo(shared[i].x, shared[i].y);
        }

        this.worldContainer.addChild(borderGfx);
        this.borderGraphics.set(edgeKey, borderGfx);
      }
    }
  }

  private findSharedEdge(
    a: Region,
    b: Region,
  ): Array<{ x: number; y: number }> {
    const shared: Array<{ x: number; y: number }> = [];
    const threshold = 1.5;

    for (const pa of a.polygon) {
      for (const pb of b.polygon) {
        const dx = pa.x - pb.x;
        const dy = pa.y - pb.y;
        if (dx * dx + dy * dy < threshold * threshold) {
          shared.push({ x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 });
        }
      }
    }

    return shared;
  }

  /** Update army positions and effects during simulation */
  updateSimulation(countries: Country[], regions: Region[]): void {
    this.armyOverlay.update(countries, regions);
    this.minimap.updateRegions(regions, countries);
  }

  addBattleEffect(effect: BattleEffect, regions: Region[]): void {
    this.battleEffects.addBattleEffect(effect, regions);
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

  private startAnimationLoop(): void {
    const animate = () => {
      this.battleEffects.update();
      this.animFrameId = requestAnimationFrame(animate);
    };
    this.animFrameId = requestAnimationFrame(animate);
  }

  destroy(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
    }
    this.armyOverlay.destroy();
    this.battleEffects.destroy();
    this.minimap.destroy();
    this.app.destroy(true);
  }
}
