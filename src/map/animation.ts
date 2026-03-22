import * as PIXI from 'pixi.js';
import type { Army, Country, Region, BattleEffect } from '../types';

/** Draw army markers on the map as circles with size-based radius */
export class ArmyOverlay {
  private container: PIXI.Container;
  private markers: Map<string, PIXI.Graphics> = new Map();
  private labels: Map<string, PIXI.Text> = new Map();

  constructor(parent: PIXI.Container) {
    this.container = new PIXI.Container();
    this.container.sortableChildren = true;
    parent.addChild(this.container);
  }

  update(countries: Country[], regions: Region[]): void {
    const activeIds = new Set<string>();

    for (const country of countries) {
      if (!country.isAlive) continue;

      for (const army of country.activeArmies) {
        activeIds.add(army.id);

        // Calculate interpolated position
        const pos = this.getArmyPosition(army, regions);
        if (!pos) continue;

        let marker = this.markers.get(army.id);
        let label = this.labels.get(army.id);

        if (!marker) {
          marker = new PIXI.Graphics();
          marker.zIndex = 10;
          this.container.addChild(marker);
          this.markers.set(army.id, marker);
        }

        if (!label) {
          label = new PIXI.Text('', {
            fontSize: 9,
            fill: 0xffffff,
            fontWeight: 'bold',
            stroke: 0x000000,
            strokeThickness: 2,
          });
          label.anchor.set(0.5);
          label.zIndex = 11;
          this.container.addChild(label);
          this.labels.set(army.id, label);
        }

        // Draw marker
        const radius = Math.max(4, Math.min(12, Math.sqrt(army.size) * 1.2));
        const color = this.hexFromHsl(country.color);

        marker.clear();
        marker.beginFill(color, 0.9);
        marker.lineStyle(1.5, 0xffffff, 0.8);
        marker.drawCircle(0, 0, radius);
        marker.endFill();

        // Movement direction indicator
        if (army.target !== null) {
          const targetRegion = regions.find((r) => r.id === army.target);
          if (targetRegion) {
            const dx = targetRegion.centroid.x - pos.x;
            const dy = targetRegion.centroid.y - pos.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > 0) {
              const nx = dx / len;
              const ny = dy / len;
              marker.lineStyle(2, 0xffffff, 0.6);
              marker.moveTo(nx * radius, ny * radius);
              marker.lineTo(nx * (radius + 6), ny * (radius + 6));
            }
          }
        }

        marker.x = pos.x;
        marker.y = pos.y;

        label.text = String(army.size);
        label.x = pos.x;
        label.y = pos.y - radius - 7;
      }
    }

    // Remove stale markers
    for (const [id, marker] of this.markers) {
      if (!activeIds.has(id)) {
        this.container.removeChild(marker);
        marker.destroy();
        this.markers.delete(id);
        const label = this.labels.get(id);
        if (label) {
          this.container.removeChild(label);
          label.destroy();
          this.labels.delete(id);
        }
      }
    }
  }

  private getArmyPosition(army: Army, regions: Region[]): { x: number; y: number } | null {
    const currentRegion = regions.find((r) => r.id === army.position);
    if (!currentRegion) return null;

    if (army.target !== null && army.progress > 0 && army.progress < 1) {
      const targetRegion = regions.find((r) => r.id === army.target);
      if (targetRegion) {
        const t = army.progress;
        return {
          x: currentRegion.centroid.x + (targetRegion.centroid.x - currentRegion.centroid.x) * t,
          y: currentRegion.centroid.y + (targetRegion.centroid.y - currentRegion.centroid.y) * t,
        };
      }
    }

    return { x: currentRegion.centroid.x, y: currentRegion.centroid.y };
  }

  private hexFromHsl(hsl: string): number {
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

  destroy(): void {
    this.container.destroy({ children: true });
  }
}

/** Battle flash/particle effect system */
export class BattleEffectSystem {
  private container: PIXI.Container;
  private effects: Array<{ gfx: PIXI.Graphics; startTime: number; duration: number }> = [];

  constructor(parent: PIXI.Container) {
    this.container = new PIXI.Container();
    this.container.zIndex = 20;
    parent.addChild(this.container);
  }

  addBattleEffect(effect: BattleEffect, regions: Region[]): void {
    const region = regions.find((r) => r.id === effect.regionId);
    if (!region) return;

    const gfx = new PIXI.Graphics();
    const color = effect.attackerWins ? 0xff4444 : 0xffaa00;

    // Burst circle
    gfx.beginFill(color, 0.6);
    gfx.drawCircle(0, 0, 15);
    gfx.endFill();

    // Cross/star burst
    gfx.lineStyle(2, 0xffffff, 0.8);
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      gfx.moveTo(0, 0);
      gfx.lineTo(Math.cos(angle) * 20, Math.sin(angle) * 20);
    }

    gfx.x = region.centroid.x;
    gfx.y = region.centroid.y;
    this.container.addChild(gfx);

    this.effects.push({ gfx, startTime: Date.now(), duration: 600 });
  }

  update(): void {
    const now = Date.now();
    this.effects = this.effects.filter(({ gfx, startTime, duration }) => {
      const elapsed = now - startTime;
      if (elapsed >= duration) {
        this.container.removeChild(gfx);
        gfx.destroy();
        return false;
      }
      const t = elapsed / duration;
      gfx.alpha = 1 - t;
      gfx.scale.set(1 + t * 1.5);
      return true;
    });
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}

/** Minimap showing full world view */
export class Minimap {
  private container: PIXI.Container;
  private mapGraphics: PIXI.Graphics;
  private viewportRect: PIXI.Graphics;
  private size: number;
  private worldW: number;
  private worldH: number;

  constructor(parent: PIXI.Container, worldW: number, worldH: number, size: number = 150) {
    this.size = size;
    this.worldW = worldW;
    this.worldH = worldH;

    this.container = new PIXI.Container();
    this.container.zIndex = 100;
    parent.addChild(this.container);

    // Background
    const bg = new PIXI.Graphics();
    bg.beginFill(0x111111, 0.8);
    bg.lineStyle(1, 0x555555);
    bg.drawRect(0, 0, size, size * (worldH / worldW));
    bg.endFill();
    this.container.addChild(bg);

    this.mapGraphics = new PIXI.Graphics();
    this.container.addChild(this.mapGraphics);

    this.viewportRect = new PIXI.Graphics();
    this.container.addChild(this.viewportRect);
  }

  setPosition(x: number, y: number): void {
    this.container.x = x;
    this.container.y = y;
  }

  updateRegions(regions: Region[], countries: Country[]): void {
    this.mapGraphics.clear();
    const scaleX = this.size / this.worldW;
    const scaleY = (this.size * (this.worldH / this.worldW)) / this.worldH;
    const countryMap = new Map(countries.map((c) => [c.id, c]));

    for (const region of regions) {
      if (region.polygon.length < 3) continue;

      let fillColor: number;
      if (region.countryId && countryMap.has(region.countryId)) {
        const country = countryMap.get(region.countryId)!;
        if (!country.isAlive) {
          fillColor = 0x444444;
        } else {
          fillColor = this.hexFromHsl(country.color);
        }
      } else {
        fillColor = region.terrain === 'ocean' ? 0x2a4a7a : 0x556644;
      }

      this.mapGraphics.beginFill(fillColor, 0.9);
      this.mapGraphics.moveTo(region.polygon[0].x * scaleX, region.polygon[0].y * scaleY);
      for (let i = 1; i < region.polygon.length; i++) {
        this.mapGraphics.lineTo(region.polygon[i].x * scaleX, region.polygon[i].y * scaleY);
      }
      this.mapGraphics.closePath();
      this.mapGraphics.endFill();
    }
  }

  updateViewport(viewX: number, viewY: number, viewW: number, viewH: number, zoom: number): void {
    const scaleX = this.size / this.worldW;
    const scaleY = (this.size * (this.worldH / this.worldW)) / this.worldH;

    this.viewportRect.clear();
    this.viewportRect.lineStyle(1.5, 0xffff00, 0.8);
    this.viewportRect.drawRect(
      -viewX * scaleX / zoom,
      -viewY * scaleY / zoom,
      viewW * scaleX / zoom,
      viewH * scaleY / zoom,
    );
  }

  private hexFromHsl(hsl: string): number {
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

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
