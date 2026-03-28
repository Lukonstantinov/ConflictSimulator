import * as PIXI from 'pixi.js';
import type { TacticalMap, TacticalTile, TacticalUnit, TacticalEvent } from '../types';
import { SimplexNoise } from '../../map/terrain';
import { SeededRNG } from '../../utils/random';

// HSL-based terrain palette for noise modulation (satellite/topographic style)
const TERRAIN_HSL: Record<string, { h: number; s: number; l: number }> = {
  open:     { h: 85,  s: 35, l: 52 },
  road:     { h: 35,  s: 20, l: 42 },
  building: { h: 220, s: 8,  l: 50 },
  rubble:   { h: 30,  s: 15, l: 45 },
  trees:    { h: 120, s: 40, l: 32 },
  water:    { h: 210, s: 55, l: 40 },
  trench:   { h: 35,  s: 25, l: 35 },
};

/** Fast HSL (degrees, percent, percent) to 0xRRGGBB */
function hslNum(h: number, s: number, l: number): number {
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  const hh = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((hh / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (hh < 60)       { r = c; g = x; }
  else if (hh < 120) { r = x; g = c; }
  else if (hh < 180) { g = c; b = x; }
  else if (hh < 240) { g = x; b = c; }
  else if (hh < 300) { r = x; b = c; }
  else               { r = c; b = x; }
  const ri = Math.round((r + m) * 255);
  const gi = Math.round((g + m) * 255);
  const bi = Math.round((b + m) * 255);
  return (ri << 16) | (gi << 8) | bi;
}

const FACTION_COLORS = {
  attacker: 0x4488ff,
  defender: 0xff4444,
};

export class TacticalRenderer {
  app: PIXI.Application;
  private worldContainer: PIXI.Container;
  private gridLayer: PIXI.Graphics;
  private buildingLayer: PIXI.Graphics;
  private smokeLayer: PIXI.Graphics;
  private fowLayer: PIXI.Graphics;
  private unitLayer: PIXI.Container;
  private effectsLayer: PIXI.Container;
  private selectionLayer: PIXI.Graphics;

  private unitSprites: Map<string, PIXI.Container> = new Map();
  private shotLines: PIXI.Graphics[] = [];

  // Camera state
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  private isDragging = false;
  private lastPointer = { x: 0, y: 0 };
  private hasUserZoomed = false;

  // Resize
  private containerEl: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;

  // Terrain noise + caching
  private noise: SimplexNoise;
  private lastDrawnMap: TacticalMap | null = null;

  // Callbacks
  private onTileClick: ((x: number, y: number, button: number, shift: boolean) => void) | null = null;
  private onUnitClick: ((unitId: string, shift: boolean) => void) | null = null;

  private tileSize = 32;
  private mapWidth = 0;
  private mapHeight = 0;

  constructor(canvas: HTMLCanvasElement, map: TacticalMap) {
    this.tileSize = map.tileSize;
    this.mapWidth = map.width;
    this.mapHeight = map.height;

    // Noise for terrain variation
    let seed = 42;
    for (let i = 0; i < map.id.length; i++) seed = seed * 31 + map.id.charCodeAt(i);
    this.noise = new SimplexNoise(new SeededRNG(seed));

    // Start with container size (or fallback to reasonable default)
    this.containerEl = canvas.parentElement;
    const initW = this.containerEl?.clientWidth || 800;
    const initH = this.containerEl?.clientHeight || 600;

    this.app = new PIXI.Application({
      view: canvas,
      width: initW,
      height: initH,
      backgroundColor: 0x1a2a1a,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio, 2),
      autoDensity: true,
    });

    this.worldContainer = new PIXI.Container();
    this.app.stage.addChild(this.worldContainer);

    this.gridLayer = new PIXI.Graphics();
    this.gridLayer.zIndex = 0;
    this.worldContainer.addChild(this.gridLayer);

    this.buildingLayer = new PIXI.Graphics();
    this.buildingLayer.zIndex = 1;
    this.worldContainer.addChild(this.buildingLayer);

    this.smokeLayer = new PIXI.Graphics();
    this.smokeLayer.zIndex = 2;
    this.worldContainer.addChild(this.smokeLayer);

    this.selectionLayer = new PIXI.Graphics();
    this.selectionLayer.zIndex = 5;
    this.worldContainer.addChild(this.selectionLayer);

    this.fowLayer = new PIXI.Graphics();
    this.fowLayer.zIndex = 3;
    this.worldContainer.addChild(this.fowLayer);

    this.unitLayer = new PIXI.Container();
    this.unitLayer.zIndex = 10;
    this.worldContainer.addChild(this.unitLayer);

    this.effectsLayer = new PIXI.Container();
    this.effectsLayer.zIndex = 20;
    this.worldContainer.addChild(this.effectsLayer);

    this.worldContainer.sortableChildren = true;

    this.setupCameraControls(canvas);
    this.setupClickHandlers(canvas);
    this.drawMap(map);

    // Auto-fit map into viewport
    this.resizeToContainer();

    // Watch for container size changes (orientation, window resize)
    this.resizeObserver = new ResizeObserver(() => this.resizeToContainer());
    if (this.containerEl) this.resizeObserver.observe(this.containerEl);
  }

  private resizeToContainer(): void {
    if (!this.containerEl) return;
    const { clientWidth: w, clientHeight: h } = this.containerEl;
    if (w === 0 || h === 0) return;

    this.app.renderer.resize(w, h);

    if (!this.hasUserZoomed) {
      const mapPxW = this.mapWidth * this.tileSize;
      const mapPxH = this.mapHeight * this.tileSize;
      this.zoom = Math.min(w / mapPxW, h / mapPxH);
      this.panX = (w - mapPxW * this.zoom) / 2;
      this.panY = (h - mapPxH * this.zoom) / 2;
      this.applyCamera();
    }
  }

  setOnTileClick(handler: (x: number, y: number, button: number, shift: boolean) => void): void {
    this.onTileClick = handler;
  }

  setOnUnitClick(handler: (unitId: string, shift: boolean) => void): void {
    this.onUnitClick = handler;
  }

  /** Convert canvas screen coordinates to tile grid coordinates */
  screenToTile(screenX: number, screenY: number): { x: number; y: number } {
    const worldX = (screenX - this.panX) / this.zoom;
    const worldY = (screenY - this.panY) / this.zoom;
    return {
      x: Math.floor(worldX / this.tileSize),
      y: Math.floor(worldY / this.tileSize),
    };
  }

  drawMap(map: TacticalMap): void {
    // Skip full terrain redraw if same map object (only buildings change during play)
    if (map === this.lastDrawnMap) {
      this.drawBuildings(map);
      return;
    }
    this.lastDrawnMap = map;

    // Draw terrain directly on gridLayer
    this.gridLayer.clear();
    const ts = this.tileSize;

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tile = map.tiles[y][x];
        const px = x * ts;
        const py = y * ts;

        // Noise-varied base color
        const base = TERRAIN_HSL[tile.terrain] ?? TERRAIN_HSL.open;
        const n = this.noise.noise2D(x * 0.15, y * 0.15);
        const color = hslNum(base.h, base.s + n * 5, base.l + n * 8);

        this.gridLayer.beginFill(color);
        this.gridLayer.drawRect(px, py, ts, ts);
        this.gridLayer.endFill();

        // Elevation shading
        if (tile.elevation > 1) {
          this.gridLayer.beginFill(0xffffff, (tile.elevation - 1) * 0.04);
          this.gridLayer.drawRect(px, py, ts, ts);
          this.gridLayer.endFill();
        } else if (tile.elevation < 1 && tile.terrain !== 'water') {
          this.gridLayer.beginFill(0x000000, 0.03);
          this.gridLayer.drawRect(px, py, ts, ts);
          this.gridLayer.endFill();
        }

        // Terrain detail patterns
        this.drawTerrainDetail(this.gridLayer, tile, px, py);
      }
    }

    // Grid lines (very subtle)
    this.gridLayer.lineStyle(1, 0x000000, 0.05);
    for (let x = 0; x <= map.width; x++) {
      this.gridLayer.moveTo(x * ts, 0);
      this.gridLayer.lineTo(x * ts, map.height * ts);
    }
    for (let y = 0; y <= map.height; y++) {
      this.gridLayer.moveTo(0, y * ts);
      this.gridLayer.lineTo(map.width * ts, y * ts);
    }

    // Contour lines between different elevations
    this.gridLayer.lineStyle(0.8, 0x000000, 0.12);
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const elev = map.tiles[y][x].elevation;
        if (x < map.width - 1 && map.tiles[y][x + 1].elevation !== elev) {
          this.gridLayer.moveTo((x + 1) * ts, y * ts);
          this.gridLayer.lineTo((x + 1) * ts, (y + 1) * ts);
        }
        if (y < map.height - 1 && map.tiles[y + 1][x].elevation !== elev) {
          this.gridLayer.moveTo(x * ts, (y + 1) * ts);
          this.gridLayer.lineTo((x + 1) * ts, (y + 1) * ts);
        }
      }
    }

    // Draw buildings on top
    this.drawBuildings(map);
  }

  private drawTerrainDetail(gfx: PIXI.Graphics, tile: TacticalTile, px: number, py: number): void {
    const ts = this.tileSize;
    const cx = px + ts / 2;
    const cy = py + ts / 2;

    switch (tile.terrain) {
      case 'trees': {
        const count = 2 + Math.floor(Math.abs(this.noise.noise2D(tile.x * 3, tile.y * 3)) * 3);
        for (let i = 0; i < count; i++) {
          const ox = this.noise.noise2D(tile.x * 5 + i, tile.y * 5) * ts * 0.32;
          const oy = this.noise.noise2D(tile.x * 5, tile.y * 5 + i) * ts * 0.32;
          const r = 3 + Math.abs(this.noise.noise2D(tile.x + i * 10, tile.y)) * 3;
          gfx.beginFill(hslNum(110 + i * 8, 45, 22 + i * 4), 0.7);
          gfx.drawCircle(cx + ox, cy + oy, r);
          gfx.endFill();
        }
        break;
      }
      case 'water': {
        gfx.lineStyle(0.5, 0xffffff, 0.12);
        for (let i = 0; i < 3; i++) {
          const yOff = py + ts * 0.2 + i * ts * 0.28;
          gfx.moveTo(px + 2, yOff);
          gfx.quadraticCurveTo(
            cx, yOff + this.noise.noise2D(tile.x + i, tile.y) * 3,
            px + ts - 2, yOff,
          );
        }
        break;
      }
      case 'road': {
        gfx.lineStyle(1, 0xcccc99, 0.25);
        const horiz = Math.abs(this.noise.noise2D(tile.x * 0.5, tile.y * 0.5)) > 0.3;
        if (horiz) {
          for (let d = 0; d < ts; d += 6) {
            gfx.moveTo(px + d, cy);
            gfx.lineTo(px + Math.min(d + 3, ts), cy);
          }
        } else {
          for (let d = 0; d < ts; d += 6) {
            gfx.moveTo(cx, py + d);
            gfx.lineTo(cx, py + Math.min(d + 3, ts));
          }
        }
        break;
      }
      case 'trench': {
        gfx.lineStyle(0.7, 0x000000, 0.18);
        for (let d = -ts; d < ts * 2; d += 5) {
          gfx.moveTo(Math.max(px, px + d), py);
          gfx.lineTo(Math.min(px + ts, px + d + ts * 0.3), py + ts);
        }
        break;
      }
      case 'rubble': {
        for (let i = 0; i < 5; i++) {
          const ox = this.noise.noise2D(tile.x * 7 + i, tile.y * 7) * ts * 0.35;
          const oy = this.noise.noise2D(tile.x * 7, tile.y * 7 + i) * ts * 0.35;
          gfx.beginFill(0x666666, 0.35);
          gfx.drawRect(cx + ox - 1, cy + oy - 1, 2 + Math.abs(ox) * 0.3, 2);
          gfx.endFill();
        }
        break;
      }
      case 'open': {
        gfx.lineStyle(0.5, 0x5a8a3a, 0.1);
        for (let i = 0; i < 3; i++) {
          const ox = this.noise.noise2D(tile.x * 4 + i, tile.y * 4) * ts * 0.3;
          const oy = this.noise.noise2D(tile.x * 4, tile.y * 4 + i) * ts * 0.3;
          gfx.moveTo(cx + ox, cy + oy);
          gfx.lineTo(cx + ox + 2, cy + oy - 4);
        }
        break;
      }
    }
  }

  private drawBuildings(map: TacticalMap): void {
    this.buildingLayer.clear();
    for (const building of map.buildings) {
      if (building.tiles.length === 0 || building.destroyed) continue;

      const minX = Math.min(...building.tiles.map((t) => t.x));
      const minY = Math.min(...building.tiles.map((t) => t.y));
      const maxX = Math.max(...building.tiles.map((t) => t.x));
      const maxY = Math.max(...building.tiles.map((t) => t.y));

      const px = minX * this.tileSize;
      const py = minY * this.tileSize;
      const pw = (maxX - minX + 1) * this.tileSize;
      const ph = (maxY - minY + 1) * this.tileSize;

      const healthPct = building.health / 100;
      const alpha = 0.15 + (1 - healthPct) * 0.3;
      const borderColor = healthPct > 0.5 ? 0x555555 : 0x884444;

      this.buildingLayer.lineStyle(2, borderColor, 0.8);
      this.buildingLayer.beginFill(0x777777, alpha);
      this.buildingLayer.drawRect(px, py, pw, ph);
      this.buildingLayer.endFill();

      // Door marker
      const doorX = px + pw / 2 - 3;
      const doorY = py + ph - 2;
      this.buildingLayer.lineStyle(1, 0x444444, 0.6);
      this.buildingLayer.drawRect(doorX, doorY, 6, 2);
    }
  }

  updateSmoke(map: TacticalMap): void {
    this.smokeLayer.clear();
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tile = map.tiles[y][x];
        if (tile.smoke > 0) {
          const px = x * this.tileSize;
          const py = y * this.tileSize;
          const alpha = Math.min(0.6, tile.smoke / 50 * 0.6);
          this.smokeLayer.beginFill(0xcccccc, alpha);
          this.smokeLayer.drawRect(px, py, this.tileSize, this.tileSize);
          this.smokeLayer.endFill();
        }
      }
    }
  }

  updateUnits(units: TacticalUnit[], selectedIds: string[]): void {
    // Remove stale sprites
    for (const [id, sprite] of this.unitSprites) {
      if (!units.find((u) => u.id === id)) {
        this.unitLayer.removeChild(sprite);
        sprite.destroy();
        this.unitSprites.delete(id);
      }
    }

    for (const unit of units) {
      if (unit.state === 'destroyed') {
        const existing = this.unitSprites.get(unit.id);
        if (existing) {
          this.unitLayer.removeChild(existing);
          existing.destroy();
          this.unitSprites.delete(unit.id);
        }
        continue;
      }

      let container = this.unitSprites.get(unit.id);
      if (!container) {
        container = new PIXI.Container();
        this.unitLayer.addChild(container);
        this.unitSprites.set(unit.id, container);
      }

      // Clear and redraw
      container.removeChildren();

      const gfx = new PIXI.Graphics();
      const px = unit.position.x * this.tileSize + this.tileSize / 2;
      const py = unit.position.y * this.tileSize + this.tileSize / 2;
      const color = FACTION_COLORS[unit.faction];
      const isSelected = selectedIds.includes(unit.id);

      this.drawUnitShape(gfx, unit, color, isSelected);

      // Health bar for vehicles
      if (unit.type !== 'infantry' && unit.type !== 'sniper' && unit.type !== 'atgm' && unit.type !== 'medic' && unit.health < 100) {
        const barWidth = 20;
        const barHeight = 3;
        gfx.beginFill(0x333333, 0.6);
        gfx.drawRect(-barWidth / 2, 14, barWidth, barHeight);
        gfx.endFill();
        gfx.beginFill(unit.health > 50 ? 0x44ff44 : 0xff4444, 0.8);
        gfx.drawRect(-barWidth / 2, 14, barWidth * (unit.health / 100), barHeight);
        gfx.endFill();
      }

      // Ammo indicator (low ammo warning)
      if (unit.ammo <= 3 && unit.maxAmmo > 0) {
        const text = new PIXI.Text('!', { fontSize: 8, fill: 0xffaa00, fontWeight: 'bold' });
        text.anchor.set(0.5);
        text.x = 10;
        text.y = -10;
        container.addChild(text);
      }

      // State indicators
      if (unit.state === 'suppressed') {
        gfx.lineStyle(1, 0xffff00, 0.6);
        gfx.drawCircle(0, 0, 14);
      } else if (unit.state === 'retreating') {
        gfx.lineStyle(1, 0xff8800, 0.6);
        gfx.drawCircle(0, 0, 14);
      } else if (unit.state === 'surrendered') {
        // White flag indicator
        gfx.lineStyle(1, 0xffffff, 0.8);
        gfx.moveTo(6, -6);
        gfx.lineTo(6, -14);
        gfx.beginFill(0xffffff, 0.7);
        gfx.drawRect(6, -14, 6, 4);
        gfx.endFill();
      }

      container.addChild(gfx);
      container.x = px;
      container.y = py;

      // Flying units float above
      if (unit.flying) {
        container.y = py - 6;
        // Shadow
        const shadow = new PIXI.Graphics();
        shadow.beginFill(0x000000, 0.2);
        shadow.drawEllipse(0, 6, 8, 4);
        shadow.endFill();
        container.addChildAt(shadow, 0);
      }

      // Make clickable
      container.eventMode = 'static';
      container.cursor = 'pointer';
      container.hitArea = new PIXI.Circle(0, 0, 16);
      const unitId = unit.id;
      container.removeAllListeners();
      container.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
        e.stopPropagation();
        this.onUnitClick?.(unitId, e.shiftKey);
      });
    }

    // Draw movement paths for selected units
    this.selectionLayer.clear();
    for (const unit of units) {
      if (!selectedIds.includes(unit.id)) continue;
      if (!unit.path || unit.path.length === 0) continue;

      this.selectionLayer.lineStyle(1.5, 0x00ffff, 0.4);
      const startX = unit.position.x * this.tileSize + this.tileSize / 2;
      const startY = unit.position.y * this.tileSize + this.tileSize / 2;
      this.selectionLayer.moveTo(startX, startY);

      for (const step of unit.path) {
        const sx = step.x * this.tileSize + this.tileSize / 2;
        const sy = step.y * this.tileSize + this.tileSize / 2;
        this.selectionLayer.lineTo(sx, sy);
      }
    }
  }

  private drawUnitShape(gfx: PIXI.Graphics, unit: TacticalUnit, color: number, isSelected: boolean): void {
    const selLine = isSelected ? 2 : 1;
    const selColor = isSelected ? 0x00ffff : 0xffffff;
    const selAlpha = isSelected ? 0.8 : 0.3;

    switch (unit.type) {
      case 'infantry': {
        gfx.lineStyle(selLine, selColor, selAlpha);
        gfx.beginFill(color, 0.85);
        gfx.drawCircle(0, 0, 8);
        gfx.endFill();
        // Squad count
        const text = new PIXI.Text(String(unit.squadSize), { fontSize: 9, fill: 0xffffff, fontWeight: 'bold' });
        text.anchor.set(0.5);
        text.y = -1;
        (gfx.parent || gfx).addChild?.(text);
        break;
      }
      case 'tank': {
        gfx.lineStyle(selLine, selColor, selAlpha);
        gfx.beginFill(color, 0.85);
        gfx.drawRect(-12, -12, 24, 24);
        gfx.endFill();
        const facingAngle = (unit.facing / 8) * Math.PI * 2 - Math.PI / 2;
        gfx.lineStyle(2, 0xffffff, 0.7);
        gfx.moveTo(0, 0);
        gfx.lineTo(Math.cos(facingAngle) * 14, Math.sin(facingAngle) * 14);
        break;
      }
      case 'apc': {
        gfx.lineStyle(selLine, selColor, selAlpha);
        gfx.beginFill(color, 0.85);
        gfx.drawRoundedRect(-10, -8, 20, 16, 4);
        gfx.endFill();
        break;
      }
      case 'artillery': {
        // Diamond shape
        gfx.lineStyle(selLine, selColor, selAlpha);
        gfx.beginFill(color, 0.85);
        gfx.moveTo(0, -12);
        gfx.lineTo(10, 0);
        gfx.lineTo(0, 12);
        gfx.lineTo(-10, 0);
        gfx.closePath();
        gfx.endFill();
        // Barrel line
        const facingA = (unit.facing / 8) * Math.PI * 2 - Math.PI / 2;
        gfx.lineStyle(3, 0xffffff, 0.6);
        gfx.moveTo(0, 0);
        gfx.lineTo(Math.cos(facingA) * 16, Math.sin(facingA) * 16);
        break;
      }
      case 'sniper': {
        // Small triangle
        gfx.lineStyle(selLine, selColor, selAlpha);
        gfx.beginFill(color, 0.85);
        gfx.moveTo(0, -8);
        gfx.lineTo(7, 6);
        gfx.lineTo(-7, 6);
        gfx.closePath();
        gfx.endFill();
        // Crosshair indicator
        gfx.lineStyle(1, 0xffffff, 0.5);
        gfx.drawCircle(0, -1, 5);
        gfx.moveTo(-2, -1);
        gfx.lineTo(2, -1);
        gfx.moveTo(0, -3);
        gfx.lineTo(0, 1);
        break;
      }
      case 'atgm': {
        // Pentagon shape
        gfx.lineStyle(selLine, selColor, selAlpha);
        gfx.beginFill(color, 0.85);
        const sides = 5;
        for (let i = 0; i < sides; i++) {
          const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
          const px = Math.cos(angle) * 8;
          const py = Math.sin(angle) * 8;
          if (i === 0) gfx.moveTo(px, py);
          else gfx.lineTo(px, py);
        }
        gfx.closePath();
        gfx.endFill();
        // Squad count
        const atText = new PIXI.Text(String(unit.squadSize), { fontSize: 8, fill: 0xffffff, fontWeight: 'bold' });
        atText.anchor.set(0.5);
        atText.y = -1;
        (gfx.parent || gfx).addChild?.(atText);
        break;
      }
      case 'drone': {
        // X-shape (quadcopter)
        gfx.lineStyle(selLine, selColor, selAlpha);
        gfx.beginFill(color, 0.7);
        gfx.drawCircle(0, 0, 5);
        gfx.endFill();
        gfx.lineStyle(2, color, 0.6);
        gfx.moveTo(-8, -8); gfx.lineTo(8, 8);
        gfx.moveTo(8, -8); gfx.lineTo(-8, 8);
        // Rotor circles at tips
        gfx.lineStyle(1, 0xffffff, 0.3);
        gfx.drawCircle(-8, -8, 3);
        gfx.drawCircle(8, -8, 3);
        gfx.drawCircle(-8, 8, 3);
        gfx.drawCircle(8, 8, 3);
        break;
      }
      case 'helicopter': {
        // Teardrop/heli shape
        gfx.lineStyle(selLine, selColor, selAlpha);
        gfx.beginFill(color, 0.85);
        gfx.moveTo(0, -10);
        gfx.lineTo(8, 2);
        gfx.lineTo(4, 10);
        gfx.lineTo(-4, 10);
        gfx.lineTo(-8, 2);
        gfx.closePath();
        gfx.endFill();
        // Rotor line
        gfx.lineStyle(1.5, 0xffffff, 0.4);
        gfx.moveTo(-12, 0);
        gfx.lineTo(12, 0);
        break;
      }
      case 'medic': {
        // Circle with cross
        gfx.lineStyle(selLine, selColor, selAlpha);
        gfx.beginFill(color, 0.85);
        gfx.drawCircle(0, 0, 8);
        gfx.endFill();
        // Red/white cross
        gfx.lineStyle(2, 0xffffff, 0.9);
        gfx.moveTo(-4, 0); gfx.lineTo(4, 0);
        gfx.moveTo(0, -4); gfx.lineTo(0, 4);
        break;
      }
    }
  }

  showShotEffects(events: TacticalEvent[]): void {
    // Clear old shot lines
    for (const line of this.shotLines) {
      this.effectsLayer.removeChild(line);
      line.destroy();
    }
    this.shotLines = [];

    const recentEvents = events.slice(-30);

    for (const evt of recentEvents) {
      if (evt.type !== 'shot_fired' && evt.type !== 'artillery_impact') continue;

      const d = evt.details;
      const fromX = (d.fromX as number) * this.tileSize + this.tileSize / 2;
      const fromY = (d.fromY as number) * this.tileSize + this.tileSize / 2;
      const toX = (d.toX as number) * this.tileSize + this.tileSize / 2;
      const toY = (d.toY as number) * this.tileSize + this.tileSize / 2;

      const line = new PIXI.Graphics();

      if (evt.type === 'artillery_impact') {
        // Artillery: arc + explosion
        line.lineStyle(1.5, 0xff8800, 0.6);
        line.moveTo(fromX, fromY);
        // Simplified arc
        const midX = (fromX + toX) / 2;
        const midY = Math.min(fromY, toY) - 40;
        line.quadraticCurveTo(midX, midY, toX, toY);
        // Explosion burst at target
        line.lineStyle(2, 0xff4400, 0.7);
        line.drawCircle(toX, toY, 12);
        line.lineStyle(1, 0xff6600, 0.4);
        line.drawCircle(toX, toY, 20);
      } else {
        line.lineStyle(1, 0xff4444, 0.5);
        line.moveTo(fromX, fromY);
        line.lineTo(toX, toY);
      }

      this.effectsLayer.addChild(line);
      this.shotLines.push(line);

      // Auto-remove
      const duration = evt.type === 'artillery_impact' ? 500 : 300;
      setTimeout(() => {
        this.effectsLayer.removeChild(line);
        line.destroy();
        const idx = this.shotLines.indexOf(line);
        if (idx >= 0) this.shotLines.splice(idx, 1);
      }, duration);
    }
  }

  private setupClickHandlers(canvas: HTMLCanvasElement): void {
    // Long-press timer for mobile "right-click" equivalent
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    let longPressTriggered = false;
    let pointerDownPos = { x: 0, y: 0 };

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.shiftKey) return;

      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      pointerDownPos = { x: e.clientX, y: e.clientY };
      longPressTriggered = false;

      const worldX = (mx - this.panX) / this.zoom;
      const worldY = (my - this.panY) / this.zoom;
      const tileX = Math.floor(worldX / this.tileSize);
      const tileY = Math.floor(worldY / this.tileSize);

      // Start long-press timer (500ms) for mobile attack command
      if (e.pointerType === 'touch') {
        longPressTimer = setTimeout(() => {
          longPressTriggered = true;
          if (tileX >= 0 && tileX < this.mapWidth && tileY >= 0 && tileY < this.mapHeight) {
            this.onTileClick?.(tileX, tileY, 2, false); // Simulate right-click
          }
        }, 500);
      }

      if (tileX >= 0 && tileX < this.mapWidth && tileY >= 0 && tileY < this.mapHeight) {
        if (e.pointerType !== 'touch') {
          setTimeout(() => {
            this.onTileClick?.(tileX, tileY, e.button, e.shiftKey);
          }, 10);
        }
      }
    });

    canvas.addEventListener('pointerup', (e) => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }

      // Touch tap (not long-press, not drag)
      if (e.pointerType === 'touch' && !longPressTriggered) {
        const moved = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
        if (moved < 10) {
          const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
          const mx = e.clientX - rect.left;
          const my = e.clientY - rect.top;
          const worldX = (mx - this.panX) / this.zoom;
          const worldY = (my - this.panY) / this.zoom;
          const tileX = Math.floor(worldX / this.tileSize);
          const tileY = Math.floor(worldY / this.tileSize);

          if (tileX >= 0 && tileX < this.mapWidth && tileY >= 0 && tileY < this.mapHeight) {
            this.onTileClick?.(tileX, tileY, 0, false);
          }
        }
      }
    });

    canvas.addEventListener('pointermove', (e) => {
      // Cancel long-press if finger moved too far
      if (longPressTimer && e.pointerType === 'touch') {
        const moved = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
        if (moved > 10) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      }
    });

    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const worldX = (mx - this.panX) / this.zoom;
      const worldY = (my - this.panY) / this.zoom;
      const tileX = Math.floor(worldX / this.tileSize);
      const tileY = Math.floor(worldY / this.tileSize);

      if (tileX >= 0 && tileX < this.mapWidth && tileY >= 0 && tileY < this.mapHeight) {
        this.onTileClick?.(tileX, tileY, 2, e.shiftKey);
      }
    });
  }

  private setupCameraControls(canvas: HTMLCanvasElement): void {
    // Mouse wheel zoom
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.hasUserZoomed = true;
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const newZoom = Math.max(0.5, Math.min(4, this.zoom * zoomFactor));

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

    // Middle mouse or shift+drag to pan
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

    canvas.addEventListener('pointerup', () => { this.isDragging = false; });
    canvas.addEventListener('pointerleave', () => { this.isDragging = false; });

    // Touch: pinch-to-zoom + two-finger pan
    let lastTouchDist = 0;
    let lastTouchCenter = { x: 0, y: 0 };
    let isTouchPanning = false;

    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        isTouchPanning = true;
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        lastTouchDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        lastTouchCenter = {
          x: (t1.clientX + t2.clientX) / 2,
          y: (t1.clientY + t2.clientY) / 2,
        };
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && isTouchPanning) {
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];

        // Pinch zoom
        const newDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        if (lastTouchDist > 0) {
          this.hasUserZoomed = true;
          const scale = newDist / lastTouchDist;
          const rect = canvas.getBoundingClientRect();
          const cx = (t1.clientX + t2.clientX) / 2 - rect.left;
          const cy = (t1.clientY + t2.clientY) / 2 - rect.top;

          const worldXBefore = (cx - this.panX) / this.zoom;
          const worldYBefore = (cy - this.panY) / this.zoom;

          this.zoom = Math.max(0.5, Math.min(4, this.zoom * scale));
          this.panX = cx - worldXBefore * this.zoom;
          this.panY = cy - worldYBefore * this.zoom;
        }
        lastTouchDist = newDist;

        // Two-finger pan
        const newCenter = {
          x: (t1.clientX + t2.clientX) / 2,
          y: (t1.clientY + t2.clientY) / 2,
        };
        this.panX += newCenter.x - lastTouchCenter.x;
        this.panY += newCenter.y - lastTouchCenter.y;
        lastTouchCenter = newCenter;

        this.applyCamera();
      }
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) {
        isTouchPanning = false;
        lastTouchDist = 0;
      }
    });
  }

  private applyCamera(): void {
    this.worldContainer.scale.set(this.zoom);
    this.worldContainer.x = this.panX;
    this.worldContainer.y = this.panY;
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.containerEl = null;
    this.lastDrawnMap = null;

    for (const line of this.shotLines) {
      line.destroy();
    }
    this.shotLines = [];
    for (const [, sprite] of this.unitSprites) {
      sprite.destroy();
    }
    this.unitSprites.clear();

    try {
      // destroy(false) = don't remove the canvas element (we reuse it across scenarios)
      this.app.destroy(false);
    } catch {
      // PixiJS may throw if context is already lost
    }
  }
}
