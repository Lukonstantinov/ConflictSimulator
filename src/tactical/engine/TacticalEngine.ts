import type { TacticalUnit, TacticalMap, TacticalEvent, TacticalStatus, PlayerCommand } from '../types';
import { resolveTacticalCombat, resolveMedicHealing } from './combat';
import { moveUnit, findPath } from './movement';
import { runTacticalAI } from './ai';

export class TacticalEngine {
  private units: TacticalUnit[];
  private map: TacticalMap;
  private tick = 0;
  private tickRate = 10;
  private speed = 1;
  private status: TacticalStatus = 'setup';
  private playerFaction: 'attacker' | 'defender';
  private commandQueue: PlayerCommand[] = [];
  private events: TacticalEvent[] = [];

  private intervalId: ReturnType<typeof setInterval> | null = null;
  private onUpdate: ((state: TacticalEngineState) => void) | null = null;

  constructor(
    map: TacticalMap,
    units: TacticalUnit[],
    playerFaction: 'attacker' | 'defender',
  ) {
    this.map = map;
    this.units = units;
    this.playerFaction = playerFaction;

    // Place units on the map (non-flying only)
    for (const unit of this.units) {
      if (!unit.flying) {
        const tile = this.map.tiles[unit.position.y]?.[unit.position.x];
        if (tile) tile.occupied = unit.id;
      }
    }
  }

  setOnUpdate(handler: (state: TacticalEngineState) => void): void {
    this.onUpdate = handler;
  }

  start(): void {
    this.status = 'running';
    this.scheduleInterval();
  }

  pause(): void {
    this.status = 'paused';
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.emitState();
  }

  resume(): void {
    this.status = 'running';
    this.scheduleInterval();
  }

  setSpeed(speed: number): void {
    this.speed = speed;
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.scheduleInterval();
    }
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.status = 'setup';
  }

  queueCommand(command: PlayerCommand): void {
    this.commandQueue.push(command);
  }

  private scheduleInterval(): void {
    if (this.intervalId !== null) clearInterval(this.intervalId);
    const ms = Math.max(16, Math.floor(1000 / (this.tickRate * this.speed)));
    this.intervalId = setInterval(() => this.runTick(), ms);
  }

  private runTick(): void {
    if (this.status !== 'running') return;

    this.tick++;
    const tickEvents: TacticalEvent[] = [];

    // 1. Process player commands
    this.processCommands(tickEvents);

    // 2. AI decisions
    runTacticalAI(this.units, this.map, this.playerFaction, this.tick);

    // 3. Movement resolution
    for (const unit of this.units) {
      if (unit.state === 'destroyed' || unit.state === 'surrendered') continue;
      if (unit.state === 'moving' || unit.state === 'retreating') {
        const arrived = moveUnit(unit, this.map, this.tickRate);
        if (arrived && unit.state === 'moving') {
          unit.state = 'idle';
        }
      }
    }

    // 4. Combat resolution
    const combatEvents = resolveTacticalCombat(this.units, this.map, this.tick);
    tickEvents.push(...combatEvents);

    // 5. Medic healing
    const healEvents = resolveMedicHealing(this.units, this.map, this.tick);
    tickEvents.push(...healEvents);

    // 6. Morale recovery for idle units
    for (const unit of this.units) {
      if (unit.state === 'destroyed' || unit.state === 'surrendered') continue;
      if (unit.state === 'idle' || unit.state === 'attacking') {
        unit.morale = Math.min(100, unit.morale + 0.1);
      }
    }

    // 7. Surrender check — surrounded + low morale
    this.checkSurrenders(tickEvents);

    // 8. Smoke decay
    this.decaySmoke();

    // 9. Clear occupied for destroyed/surrendered units
    for (const unit of this.units) {
      if (unit.state === 'destroyed' || unit.state === 'surrendered') {
        if (!unit.flying) {
          const tile = this.map.tiles[unit.position.y]?.[unit.position.x];
          if (tile && tile.occupied === unit.id) {
            tile.occupied = undefined;
          }
        }
      }
    }

    // 10. Victory check
    const result = this.checkVictory();
    if (result) {
      this.status = result;
      if (this.intervalId !== null) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
    }

    this.events.push(...tickEvents);
    this.emitState();
  }

  private processCommands(tickEvents: TacticalEvent[]): void {
    while (this.commandQueue.length > 0) {
      const cmd = this.commandQueue.shift()!;

      for (const unitId of cmd.unitIds) {
        const unit = this.units.find((u) => u.id === unitId);
        if (!unit || unit.state === 'destroyed' || unit.state === 'surrendered' || unit.faction !== this.playerFaction) continue;

        if (cmd.type === 'smoke') {
          // Deploy smoke grenade
          if (unit.smokeCharges > 0) {
            unit.smokeCharges--;
            this.deploySmoke(cmd.target, tickEvents);
          }
          continue;
        }

        if (cmd.type === 'move') {
          const path = findPath(this.map, unit.position, cmd.target, unit.type, this.units);
          if (path.length > 0) {
            unit.path = path;
            unit.target = cmd.target;
            unit.state = 'moving';
            unit.attackTarget = undefined;
          }
        } else if (cmd.type === 'attack' && cmd.targetUnitId) {
          unit.attackTarget = cmd.targetUnitId;
          unit.state = 'attacking';

          // Move toward target if out of range
          const target = this.units.find((u) => u.id === cmd.targetUnitId);
          if (target) {
            const dist = Math.sqrt(
              (unit.position.x - target.position.x) ** 2 +
              (unit.position.y - target.position.y) ** 2,
            );
            if (dist > unit.stats.range) {
              const path = findPath(this.map, unit.position, target.position, unit.type, this.units);
              if (path.length > 0) {
                // Trim to get within range
                const trimmed: { x: number; y: number }[] = [];
                for (const step of path) {
                  trimmed.push(step);
                  const d = Math.sqrt(
                    (step.x - target.position.x) ** 2 +
                    (step.y - target.position.y) ** 2,
                  );
                  if (d <= unit.stats.range * 0.8) break;
                }
                unit.path = trimmed;
                unit.state = 'moving';
              }
            }
          }
        }
      }
    }
  }

  private deploySmoke(target: { x: number; y: number }, events: TacticalEvent[]): void {
    const radius = 2;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const tx = target.x + dx;
        const ty = target.y + dy;
        if (tx < 0 || tx >= this.map.width || ty < 0 || ty >= this.map.height) continue;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= radius) {
          this.map.tiles[ty][tx].smoke = 50; // 50 ticks = 5 seconds at 10tps
        }
      }
    }
    events.push({
      tick: this.tick,
      type: 'smoke_deployed',
      details: { x: target.x, y: target.y },
    });
  }

  private decaySmoke(): void {
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        if (this.map.tiles[y][x].smoke > 0) {
          this.map.tiles[y][x].smoke--;
        }
      }
    }
  }

  private checkSurrenders(events: TacticalEvent[]): void {
    for (const unit of this.units) {
      if (unit.state === 'destroyed' || unit.state === 'surrendered') continue;
      if (unit.morale > 15) continue;

      // Check if surrounded: count nearby enemies vs allies within 5 tiles
      let nearbyEnemies = 0;
      let nearbyAllies = 0;

      for (const other of this.units) {
        if (other.state === 'destroyed' || other.state === 'surrendered') continue;
        const dx = other.position.x - unit.position.x;
        const dy = other.position.y - unit.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 5) continue;

        if (other.faction === unit.faction && other.id !== unit.id) {
          nearbyAllies++;
        } else if (other.faction !== unit.faction) {
          nearbyEnemies++;
        }
      }

      // Surrender if outnumbered 2:1 and low morale
      if (nearbyEnemies >= 2 && nearbyEnemies > nearbyAllies * 2 && unit.morale < 10) {
        unit.state = 'surrendered';
        events.push({
          tick: this.tick,
          type: 'unit_surrendered',
          details: { unitId: unit.id },
        });
      }
    }
  }

  private checkVictory(): 'victory' | 'defeat' | null {
    const attackerUnits = this.units.filter(
      (u) => u.faction === 'attacker' && u.state !== 'destroyed' && u.state !== 'surrendered',
    );
    const defenderUnits = this.units.filter(
      (u) => u.faction === 'defender' && u.state !== 'destroyed' && u.state !== 'surrendered',
    );

    // All defenders destroyed/surrendered = attacker wins
    if (defenderUnits.length === 0) {
      return this.playerFaction === 'attacker' ? 'victory' : 'defeat';
    }

    // All attackers destroyed/surrendered = defender wins
    if (attackerUnits.length === 0) {
      return this.playerFaction === 'defender' ? 'victory' : 'defeat';
    }

    // 60%+ of attacking force destroyed/surrendered = defender wins
    const totalAttackers = this.units.filter((u) => u.faction === 'attacker').length;
    const activeAttackers = attackerUnits.length;
    const lostAttackers = totalAttackers - activeAttackers;
    if (lostAttackers / totalAttackers >= 0.6) {
      return this.playerFaction === 'defender' ? 'victory' : 'defeat';
    }

    return null;
  }

  private emitState(): void {
    this.onUpdate?.({
      status: this.status,
      tick: this.tick,
      speed: this.speed,
      units: this.units.map((u) => ({ ...u })),
      events: [...this.events],
      map: this.map,
    });
  }

  getUnits(): TacticalUnit[] {
    return this.units;
  }

  getMap(): TacticalMap {
    return this.map;
  }
}

export interface TacticalEngineState {
  status: TacticalStatus;
  tick: number;
  speed: number;
  units: TacticalUnit[];
  events: TacticalEvent[];
  map: TacticalMap;
}
