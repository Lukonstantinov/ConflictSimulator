import type { TacticalUnit, TacticalMap, TacticalEvent, TacticalStatus, PlayerCommand } from '../types';
import { resolveTacticalCombat } from './combat';
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

    // Place units on the map
    for (const unit of this.units) {
      const tile = this.map.tiles[unit.position.y]?.[unit.position.x];
      if (tile) tile.occupied = unit.id;
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
    this.processCommands();

    // 2. AI decisions
    runTacticalAI(this.units, this.map, this.playerFaction);

    // 3. Movement resolution
    for (const unit of this.units) {
      if (unit.state === 'destroyed') continue;
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

    // 5. Morale recovery for idle units
    for (const unit of this.units) {
      if (unit.state === 'destroyed') continue;
      if (unit.state === 'idle' || unit.state === 'attacking') {
        unit.morale = Math.min(100, unit.morale + 0.1);
      }
    }

    // 6. Clear occupied for destroyed units
    for (const unit of this.units) {
      if (unit.state === 'destroyed') {
        const tile = this.map.tiles[unit.position.y]?.[unit.position.x];
        if (tile && tile.occupied === unit.id) {
          tile.occupied = undefined;
        }
      }
    }

    // 7. Victory check
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

  private processCommands(): void {
    while (this.commandQueue.length > 0) {
      const cmd = this.commandQueue.shift()!;

      for (const unitId of cmd.unitIds) {
        const unit = this.units.find((u) => u.id === unitId);
        if (!unit || unit.state === 'destroyed' || unit.faction !== this.playerFaction) continue;

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

  private checkVictory(): 'victory' | 'defeat' | null {
    const attackerUnits = this.units.filter(
      (u) => u.faction === 'attacker' && u.state !== 'destroyed',
    );
    const defenderUnits = this.units.filter(
      (u) => u.faction === 'defender' && u.state !== 'destroyed',
    );

    // All defenders destroyed = attacker wins
    if (defenderUnits.length === 0) {
      return this.playerFaction === 'attacker' ? 'victory' : 'defeat';
    }

    // All attackers destroyed = defender wins
    if (attackerUnits.length === 0) {
      return this.playerFaction === 'defender' ? 'victory' : 'defeat';
    }

    // 60%+ of attacking force destroyed = defender wins
    const totalAttackers = this.units.filter((u) => u.faction === 'attacker').length;
    const destroyedAttackers = totalAttackers - attackerUnits.length;
    if (destroyedAttackers / totalAttackers >= 0.6) {
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
