import * as PIXI from 'pixi.js';
import type { Army, BorderFront, Country, Region, BattleEffect, UnitType } from '../types';
import { getTotalUnits } from '../engine/combat';

/** Draw army markers on the map with unit-type shield shapes */
export class ArmyOverlay {
  private container: PIXI.Container;
  private markers: Map<string, PIXI.Graphics> = new Map();
  private labels: Map<string, PIXI.Text> = new Map();

  constructor(parent: PIXI.Container) {
    this.container = new PIXI.Container();
    this.container.sortableChildren = true;
    parent.addChild(this.container);
  }

  update(countries: Country[], regions: Region[], borderFronts: BorderFront[] = []): void {
    const activeIds = new Set<string>();

    for (const country of countries) {
      if (!country.isAlive) continue;

      for (const army of country.activeArmies) {
        activeIds.add(army.id);

        // Calculate position — if in border front, position at border edge
        const pos = this.getArmyPosition(army, regions, borderFronts);
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

        // Determine dominant unit type for shield shape
        const dominantType = this.getDominantUnitType(army);
        const radius = Math.max(4, Math.min(12, Math.sqrt(army.size) * 1.2));
        const color = this.hexFromHsl(country.color);

        marker.clear();
        marker.lineStyle(1.5, 0xffffff, 0.8);

        this.drawShieldShape(marker, dominantType, radius, color);

        // Draw unit type letter
        const letterLabel = this.getUnitLetter(dominantType);
        // We'll put the letter in a separate small section — use lineStyle for a small mark
        if (army.size >= 10) {
          marker.lineStyle(1, 0xffffff, 0.9);
          // Small dot pattern to indicate type
        }

        // Movement direction indicator
        if (army.target !== null && !army.borderFrontId) {
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

        // Show size + unit letter in label
        label.text = `${army.size}${letterLabel}`;
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

  private drawShieldShape(gfx: PIXI.Graphics, type: UnitType, radius: number, color: number): void {
    gfx.beginFill(color, 0.9);

    switch (type) {
      case 'heavy':
        // Pentagon shield
        this.drawPentagon(gfx, radius);
        break;
      case 'light':
        // Diamond
        this.drawDiamond(gfx, radius);
        break;
      case 'levy':
        // Circle (default)
        gfx.drawCircle(0, 0, radius);
        break;
    }

    gfx.endFill();
  }

  private drawPentagon(gfx: PIXI.Graphics, radius: number): void {
    const points: number[] = [];
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
      points.push(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    gfx.drawPolygon(points);
  }

  private drawDiamond(gfx: PIXI.Graphics, radius: number): void {
    gfx.drawPolygon([
      0, -radius,
      radius * 0.7, 0,
      0, radius,
      -radius * 0.7, 0,
    ]);
  }

  private getDominantUnitType(army: Army): UnitType {
    const units = army.units ?? { heavy: 0, light: army.size, levy: 0 };
    if (units.heavy >= units.light && units.heavy >= units.levy) return 'heavy';
    if (units.light >= units.levy) return 'light';
    return 'levy';
  }

  private getUnitLetter(type: UnitType): string {
    switch (type) {
      case 'heavy': return 'H';
      case 'light': return 'L';
      case 'levy': return 'V';
    }
  }

  private getArmyPosition(
    army: Army,
    regions: Region[],
    borderFronts: BorderFront[],
  ): { x: number; y: number } | null {
    // If army is at a border front, position it at the border edge
    if (army.borderFrontId) {
      const front = borderFronts.find((f) => f.id === army.borderFrontId);
      if (front) {
        const attackerRegion = regions.find((r) => r.id === front.attackerRegionId);
        const defenderRegion = regions.find((r) => r.id === front.defenderRegionId);
        if (attackerRegion && defenderRegion) {
          const isAttacker = army.id === front.attackerArmyId;
          // Position armies at border edge, offset by front position
          const midX = (attackerRegion.centroid.x + defenderRegion.centroid.x) / 2;
          const midY = (attackerRegion.centroid.y + defenderRegion.centroid.y) / 2;
          const dx = defenderRegion.centroid.x - attackerRegion.centroid.x;
          const dy = defenderRegion.centroid.y - attackerRegion.centroid.y;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const nx = dx / len;
          const ny = dy / len;

          if (isAttacker) {
            // Attacker side: starts at attacker centroid, pushed toward border
            const t = 0.3 + front.frontPosition * 0.4;
            return {
              x: attackerRegion.centroid.x + dx * t,
              y: attackerRegion.centroid.y + dy * t,
            };
          } else {
            // Defender side: starts at defender centroid, pushed back
            const t = 0.7 + front.frontPosition * 0.2;
            return {
              x: attackerRegion.centroid.x + dx * t,
              y: attackerRegion.centroid.y + dy * t,
            };
          }
        }
      }
    }

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

/** Border front visual rendering — gradient lines on contested edges */
export class BorderFrontOverlay {
  private container: PIXI.Container;
  private frontGraphics: Map<string, PIXI.Graphics> = new Map();

  constructor(parent: PIXI.Container) {
    this.container = new PIXI.Container();
    this.container.sortableChildren = true;
    this.container.zIndex = 5;
    parent.addChild(this.container);
  }

  update(borderFronts: BorderFront[], regions: Region[], countries: Country[]): void {
    const activeFrontIds = new Set(borderFronts.map((f) => f.id));

    // Remove stale fronts
    for (const [id, gfx] of this.frontGraphics) {
      if (!activeFrontIds.has(id)) {
        this.container.removeChild(gfx);
        gfx.destroy();
        this.frontGraphics.delete(id);
      }
    }

    for (const front of borderFronts) {
      const attackerRegion = regions.find((r) => r.id === front.attackerRegionId);
      const defenderRegion = regions.find((r) => r.id === front.defenderRegionId);
      const attackerCountry = countries.find((c) => c.id === front.attackerCountryId);
      const defenderCountry = countries.find((c) => c.id === front.defenderCountryId);

      if (!attackerRegion || !defenderRegion || !attackerCountry || !defenderCountry) continue;

      let gfx = this.frontGraphics.get(front.id);
      if (!gfx) {
        gfx = new PIXI.Graphics();
        this.container.addChild(gfx);
        this.frontGraphics.set(front.id, gfx);
      }

      gfx.clear();

      const ax = attackerRegion.centroid.x;
      const ay = attackerRegion.centroid.y;
      const dx = defenderRegion.centroid.x;
      const dy = defenderRegion.centroid.y;

      // Draw contested edge as gradient line
      const attackerColor = this.hexFromHsl(attackerCountry.color);
      const defenderColor = this.hexFromHsl(defenderCountry.color);

      // Front marker position
      const frontX = ax + (dx - ax) * (0.3 + front.frontPosition * 0.4);
      const frontY = ay + (dy - ay) * (0.3 + front.frontPosition * 0.4);

      // Attacker side line
      gfx.lineStyle(3, attackerColor, 0.8);
      gfx.moveTo(ax, ay);
      gfx.lineTo(frontX, frontY);

      // Defender side line
      gfx.lineStyle(3, defenderColor, 0.8);
      gfx.moveTo(frontX, frontY);
      gfx.lineTo(dx, dy);

      // Front marker — small diamond at front position
      gfx.lineStyle(2, 0xffffff, 0.9);
      gfx.beginFill(0xffff00, 0.7);
      const ms = 4;
      gfx.drawPolygon([
        frontX, frontY - ms,
        frontX + ms, frontY,
        frontX, frontY + ms,
        frontX - ms, frontY,
      ]);
      gfx.endFill();

      // Pulsing effect via alpha
      gfx.alpha = 0.6 + Math.sin(Date.now() / 300) * 0.2;
    }
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
