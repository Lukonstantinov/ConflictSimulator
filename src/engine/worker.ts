import type { Region, Country, StateDelta } from '../types';
import { SimulationEngine } from './simulation';

/**
 * SimulationRunner — runs the simulation engine on the main thread
 * using setInterval. Manages start/pause/resume/speed.
 */
export class SimulationRunner {
  private engine: SimulationEngine | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private speed: number = 1;
  private onTick: ((delta: StateDelta) => void) | null = null;
  private onFinished: ((winnerId: string) => void) | null = null;

  init(regions: Region[], countries: Country[], seed: number): void {
    this.stop();
    this.engine = new SimulationEngine(regions, countries, seed);
  }

  setOnTick(handler: (delta: StateDelta) => void): void {
    this.onTick = handler;
  }

  setOnFinished(handler: (winnerId: string) => void): void {
    this.onFinished = handler;
  }

  start(): void {
    if (!this.engine) return;
    this.scheduleInterval();
  }

  pause(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  resume(): void {
    if (!this.engine) return;
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
    this.pause();
    this.engine = null;
  }

  private scheduleInterval(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
    }

    const ms = Math.max(50, Math.floor(1000 / this.speed));
    this.intervalId = setInterval(() => {
      this.tick();
    }, ms);
  }

  private tick(): void {
    if (!this.engine) return;

    const delta = this.engine.runTick();
    this.onTick?.(delta);

    if (delta.winner) {
      this.pause();
      this.onFinished?.(delta.winner);
    }
  }

  getEngine(): SimulationEngine | null {
    return this.engine;
  }
}

export const simulationRunner = new SimulationRunner();
