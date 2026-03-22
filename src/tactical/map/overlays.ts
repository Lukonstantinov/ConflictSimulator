import * as PIXI from 'pixi.js';
import type { TacticalMap, TacticalUnit } from '../types';
import { computeFactionVisibility } from '../engine/los';

/** Renders fog of war overlay */
export class FogOfWarOverlay {
  private graphics: PIXI.Graphics;
  private tileSize: number;

  constructor(parent: PIXI.Container, tileSize: number) {
    this.graphics = new PIXI.Graphics();
    this.graphics.zIndex = 3;
    this.tileSize = tileSize;
    parent.addChild(this.graphics);
  }

  update(map: TacticalMap, units: TacticalUnit[], playerFaction: string): void {
    this.graphics.clear();

    const visible = computeFactionVisibility(map, units, playerFaction);

    this.graphics.beginFill(0x000000, 0.5);
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (!visible.has(`${x},${y}`)) {
          this.graphics.drawRect(
            x * this.tileSize,
            y * this.tileSize,
            this.tileSize,
            this.tileSize,
          );
        }
      }
    }
    this.graphics.endFill();
  }

  destroy(): void {
    this.graphics.destroy();
  }
}

/** Renders movement range highlight for selected units */
export class MovementRangeOverlay {
  private graphics: PIXI.Graphics;
  private tileSize: number;

  constructor(parent: PIXI.Container, tileSize: number) {
    this.graphics = new PIXI.Graphics();
    this.graphics.zIndex = 4;
    this.tileSize = tileSize;
    parent.addChild(this.graphics);
  }

  update(selectedUnits: TacticalUnit[], map: TacticalMap): void {
    this.graphics.clear();

    if (selectedUnits.length === 0) return;

    // Highlight tiles the selected unit can reach (simplified: just show passable tiles in range)
    for (const unit of selectedUnits) {
      const range = Math.ceil(unit.stats.speed * 5); // Approx move range
      this.graphics.beginFill(0x00ff88, 0.08);

      for (let dy = -range; dy <= range; dy++) {
        for (let dx = -range; dx <= range; dx++) {
          const tx = unit.position.x + dx;
          const ty = unit.position.y + dy;
          if (tx < 0 || tx >= map.width || ty < 0 || ty >= map.height) continue;

          const dist = Math.abs(dx) + Math.abs(dy);
          if (dist > range) continue;

          const tile = map.tiles[ty][tx];
          if (!tile.passable) continue;

          this.graphics.drawRect(
            tx * this.tileSize,
            ty * this.tileSize,
            this.tileSize,
            this.tileSize,
          );
        }
      }

      this.graphics.endFill();
    }
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
