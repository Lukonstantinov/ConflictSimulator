# Fantasy War Simulator — Implementation Plan

## Overview
A browser-based (PWA, iOS-optimized) fantasy war simulator where users generate or hand-craft Voronoi-based world maps, assign countries with configurable attributes, and watch — or intervene in — real-time wars that reshape borders, destroy economies, and crown victors.

---

## Phase 1 — Foundation (Map Generation + Country Assignment)

**Goal:** Render a Voronoi map, assign countries, see colored regions.

- [ ] Project scaffolding: Vite + React + TypeScript + Tailwind + PixiJS
- [ ] TypeScript interfaces for all data models
- [ ] Utility modules: seeded RNG, color generation, IndexedDB persistence
- [ ] Voronoi map generation using d3-delaunay
  - Random seed points within canvas bounds
  - Lloyd relaxation (2-3 passes) for even cell sizes
  - Land/ocean mask using Perlin noise threshold
- [ ] Canvas renderer: draw Voronoi cells with fill colors and borders (PixiJS)
- [ ] Country assignment UI: click regions to assign to countries
- [ ] Country config panel: name, color, army/economy/strategy sliders
- [ ] Map save/load to IndexedDB

**Deliverable:** Generate a map, paint countries, configure them, save/load.

---

## Phase 2 — Simulation Core (War Engine)

**Goal:** Wars happen. Borders change. Countries die.

- [ ] Web Worker setup with message protocol
- [ ] Tick loop: economy → AI → movement → combat → elimination
- [ ] Economy system: income, terrain bonuses, war upkeep
- [ ] Basic AI per strategy type (aggressive, defensive, expansionist, opportunist, turtle)
- [ ] Combat resolution with terrain modifiers and defender bonus
- [ ] Region ownership transfer on capture
- [ ] State delta system (worker → main thread)
- [ ] Play / Pause / Speed controls
- [ ] War event log (scrollable sidebar)

**Deliverable:** Click "Start" and watch countries fight to the death.

---

## Phase 3 — Visual Polish (Animations + Effects)

**Goal:** It looks alive. Armies move. Borders animate. It feels like a living world.

- [ ] Animated army sprites moving between regions (PixiJS sprites)
- [ ] Smooth border transitions when territory changes (lerp polygon vertices)
- [ ] Battle effects (flash, shake, particle burst on combat)
- [ ] Country elimination animation (fade to grey/conquered color)
- [ ] Minimap for large maps
- [ ] Terrain rendering (texture fills or procedural patterns per terrain type)
- [ ] Camera controls: pan, zoom (pinch on iOS)

**Deliverable:** Visually compelling simulation that's satisfying to watch.

---

## Phase 4 — User Intervention (God Mode)

**Goal:** The user isn't just watching — they can shape history.

- [ ] Pause and modify: adjust army sizes, economy mid-sim
- [ ] Force alliances / declare wars between countries
- [ ] Spawn reinforcements (god-mode)
- [ ] "What-if" branching: save simulation state, fork, compare outcomes
- [ ] Speed control slider (0.5x → 10x)
- [ ] Click on country for live stats overlay

**Deliverable:** Full interactive simulation with user agency.

---

## Phase 5 — PWA & Mobile Polish

**Goal:** Feels native on iOS Safari.

- [ ] PWA manifest + service worker (vite-plugin-pwa)
- [ ] Touch-optimized UI panels (bottom sheets, swipe gestures)
- [ ] Responsive layout: full-screen canvas + slide-out panels
- [ ] Safe area insets for iOS notch
- [ ] Add to Home Screen prompt
- [ ] Performance profiling for 30+ regions on mobile

**Deliverable:** Installable PWA that feels native on mobile.

---

## Phase 6 — Advanced Features (Depth + Replayability)

**Goal:** Depth and replayability.

- [ ] Procedural country name generator (fantasy-themed)
- [ ] Terrain effects on movement and combat
- [ ] Morale system (winning streaks boost, losses drain)
- [ ] Diplomacy AI (alliances form/break based on threat assessment)
- [ ] Replay/timeline system: scrub back through simulation history
- [ ] Map export (PNG/JSON) and import
- [ ] Statistics dashboard post-simulation (charts, kill counts, territory over time)

**Deliverable:** Rich, replayable simulation with intelligent AI.

---

## Phase 7 — Population & Warfare Mechanics

**Goal:** Deeper strategic gameplay with population, supply, fortifications, and war weariness.

- [x] Region population system: terrain-based growth (logistic), population caps
- [x] Army recruitment depletes population (cost = size × 0.5)
- [x] Population contributes to regional income (+0.02 per pop)
- [x] Terrain movement speed modifiers (plains=0.25, mountains=0.15, forest=0.20)
- [x] Supply line attrition: armies deep in enemy territory lose troops each tick
- [x] War weariness: prolonged wars reduce economy (-15% max) and morale
- [x] War weariness reduces willingness to declare new wars
- [x] Fortification system: AI auto-builds forts on border regions (cost: 50 gold)
- [x] Fortification defense bonus (+15% per level, max 3)
- [x] Fortification reduced on capture (-1 level)
- [x] Peace treaty AI: war-weary nations negotiate peace after 50+ ticks

**Deliverable:** Strategic depth with resource management and logistics.

---

## Phase 8 — Scenarios, Timeline Replay & Victory Conditions

**Goal:** Replayability, varied game modes, and polish.

- [x] 6 preset scenarios (Two Empires, Battle Royale, Economic Race, Land Grab, World War, The Underdog)
- [x] Scenario auto-assigns regions evenly to countries
- [x] Victory conditions: conquest (last standing), economic (5000 gold), territorial (75% land)
- [x] Timeline replay scrubber: tick-by-tick navigation with step controls
- [x] Territory snapshot display during replay
- [x] Toast notification system for major events (war declarations, eliminations, alliances, peace)
- [x] Updated stats dashboard with peace treaties and fortifications count
- [x] Region tooltip shows population and fortification level
- [x] Stats overlay shows war weariness, population, fortification total

**Deliverable:** Multiple game modes, full replay capability, polished UX.

---

## Data Models

```typescript
interface WorldMap {
  id: string; name: string; seed: number;
  dimensions: { w: number; h: number };
  sites: Point[]; landmask: boolean[];
  regions: Region[]; countries: Country[];
}

interface Region {
  id: number; polygon: Point[]; centroid: Point;
  neighbors: number[]; terrain: TerrainType;
  countryId: string | null;
  population: number; fortification: number;
}

interface Country {
  id: string; name: string; color: string;
  regions: number[]; capital: number;
  armySize: number; economy: number; strategy: StrategyType;
  treasury: number; activeArmies: Army[];
  relations: Record<string, Relation>; isAlive: boolean;
  warWeariness: number; warStartTicks: Record<string, number>;
}

interface Army {
  id: string; size: number; position: number;
  target: number | null; morale: number; progress: number;
}

type TerrainType = 'plains' | 'mountains' | 'forest' | 'desert' | 'coast' | 'ocean';
type StrategyType = 'aggressive' | 'defensive' | 'expansionist' | 'opportunist' | 'turtle';
type Relation = 'neutral' | 'hostile' | 'allied' | 'at_war';
```

## Combat Formula

```
attackPower = army_size × morale × terrain_modifier × random(0.8, 1.2)
defendPower = army_size × morale × 1.1 × fortification_bonus × random(0.85, 1.15)
ratio = attackPower / defendPower
attackerLosses = defender_size × (1/ratio) × 0.3
defenderLosses = attacker_size × ratio × 0.25
```

## Estimated Timeline

| Phase | Duration |
|-------|----------|
| 1 — Foundation | 2 weeks |
| 2 — Simulation Core | 2 weeks |
| 3 — Visual Polish | 2 weeks |
| 4 — Intervention | 1.5 weeks |
| 5 — PWA/Mobile | 1 week |
| 6 — Advanced | Ongoing |
| 7 — Population & Warfare | 1 week |
| 8 — Scenarios & Replay | 1 week |

**MVP (Phases 1-4): ~8 weeks**
