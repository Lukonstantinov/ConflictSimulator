# Tactical Combat Mode — Implementation Plan

## Context

ConflictSimulator v2.1.0 is a strategic fantasy war simulator with Voronoi maps, 5-strategy AI, and a deep economy/combat system. The user wants to add a **real-time tactical combat mode** with modern military units (infantry squads, tanks, APCs, artillery, drones) on grid-based maps featuring urban environments like a Zaporizhzhia-style village. The tactical mode should eventually integrate with the strategic layer, where tactical battle outcomes affect the strategic map. This is a potential paid product, so quality and polish matter.

The first deliverable is a **playable tactical scenario**: attack or defend a Ukrainian-style village with infantry and armored units on a grid map.

---

## Architecture Decision

Create the tactical mode as a **parallel system** alongside the existing strategic mode, sharing:
- PixiJS rendering infrastructure (camera controls, container patterns)
- Zustand state management patterns
- SeededRNG (`src/utils/random.ts`)
- Color utilities (`src/utils/colors.ts`)
- Build tooling (Vite, Tailwind, PWA)

New code lives under `src/tactical/` to keep clean separation.

### New Directory Structure
```
src/
├── tactical/
│   ├── types.ts              # Tactical-specific interfaces
│   ├── engine/
│   │   ├── TacticalEngine.ts # Real-time tick loop + game state
│   │   ├── combat.ts         # Tactical combat resolution
│   │   ├── movement.ts       # A* pathfinding + movement
│   │   ├── los.ts            # Line-of-sight / fog of war
│   │   └── ai.ts             # Tactical AI (defend positions, assault, flank)
│   ├── map/
│   │   ├── grid.ts           # Grid generation + terrain placement
│   │   ├── renderer.ts       # PixiJS tactical map renderer
│   │   ├── overlays.ts       # Selection, movement range, LOS indicators
│   │   └── scenarios.ts      # Village scenario definitions
│   ├── store/
│   │   └── tacticalStore.ts  # Zustand store for tactical state
│   └── components/
│       ├── TacticalView.tsx   # Main tactical mode container
│       ├── TacticalCanvas.tsx # PixiJS canvas wrapper (mirrors MapCanvas.tsx pattern)
│       ├── TacticalHUD.tsx    # Unit info, minimap, controls
│       └── TacticalControls.tsx # Play/pause, speed, scenario select
├── components/
│   └── App.tsx               # MODIFY: add mode switching (strategic/tactical)
├── store/
│   └── uiStore.ts            # MODIFY: add gameMode: 'strategic' | 'tactical'
└── ... (existing files unchanged)
```

---

## Phase 1: MVP — Village Assault Scenario

### Step 1: Type Definitions (`src/tactical/types.ts`)

```typescript
// Grid tile terrain
type TacticalTerrain = 'open' | 'road' | 'building' | 'rubble' | 'trees' | 'water' | 'trench';

interface TacticalTile {
  x: number;           // grid col
  y: number;           // grid row
  terrain: TacticalTerrain;
  elevation: number;   // 0-3 (flat, raised, hill, roof)
  cover: number;       // 0-1 defense bonus
  buildingId?: string; // links tiles to same building
  passable: boolean;
  occupied?: string;   // unitId
}

interface TacticalMap {
  id: string;
  name: string;
  width: number;       // tiles
  height: number;
  tileSize: number;    // px per tile (32)
  tiles: TacticalTile[][];  // [y][x] row-major
  buildings: Building[];
}

interface Building {
  id: string;
  tiles: {x: number, y: number}[];
  type: 'house' | 'apartment' | 'warehouse' | 'church' | 'shop';
  health: number;      // 0-100, destructible
  floors: number;      // 1-3, affects elevation/LOS
}

// Unit types
type TacticalUnitType = 'infantry' | 'tank' | 'apc';

interface TacticalUnit {
  id: string;
  type: TacticalUnitType;
  faction: string;     // 'attacker' | 'defender'
  position: {x: number, y: number};
  // Squad properties (infantry)
  squadSize: number;   // current soldiers in squad (infantry: 4-12, vehicle: 1)
  maxSquadSize: number;
  // Combat stats
  health: number;      // 0-100 per unit/vehicle
  morale: number;      // 0-100
  // State
  state: 'idle' | 'moving' | 'attacking' | 'suppressed' | 'retreating' | 'destroyed';
  target?: {x: number, y: number};
  path?: {x: number, y: number}[];
  attackTarget?: string; // enemy unitId
  // Stats (from unit definition)
  stats: UnitStats;
  facing: number;      // 0-7 (8 directions)
  selected: boolean;
}

interface UnitStats {
  speed: number;       // tiles per second
  range: number;       // attack range in tiles
  damage: number;      // base damage per tick
  armor: number;       // damage reduction 0-1
  sight: number;       // LOS range in tiles
  fireRate: number;    // ticks between shots
}

// Pre-defined unit stat templates
UNIT_DEFINITIONS = {
  infantry: { speed: 1.5, range: 6, damage: 8, armor: 0.1, sight: 10, fireRate: 3 },
  tank:     { speed: 2.0, range: 10, damage: 40, armor: 0.7, sight: 8, fireRate: 8 },
  apc:      { speed: 2.5, range: 4, damage: 15, armor: 0.4, sight: 9, fireRate: 5 },
}

// Terrain modifiers
TERRAIN_COVER = {
  open: 0, road: 0, building: 0.6, rubble: 0.3, trees: 0.4, water: 0, trench: 0.5
}
TERRAIN_SPEED = {
  open: 1.0, road: 1.3, building: 0.5, rubble: 0.6, trees: 0.7, water: 0.3, trench: 0.8
}

// Game state
interface TacticalGameState {
  status: 'setup' | 'running' | 'paused' | 'victory' | 'defeat';
  tick: number;
  tickRate: number;    // ticks per second (default 10)
  speed: number;       // multiplier (0.5, 1, 2, 3)
  units: TacticalUnit[];
  map: TacticalMap;
  events: TacticalEvent[];
  selectedUnitIds: string[];
  playerFaction: 'attacker' | 'defender';
}

interface TacticalEvent {
  tick: number;
  type: 'unit_destroyed' | 'building_destroyed' | 'unit_suppressed' | 'shot_fired' | 'unit_retreating';
  details: Record<string, unknown>;
}
```

### Step 2: Grid Map Generation (`src/tactical/map/grid.ts`)

Generate a village map procedurally:
1. Create `width x height` grid of `TacticalTile` (default 60x40 tiles, 32px each)
2. Place a main road (horizontal or diagonal) through the village center
3. Generate 8-15 buildings along roads using rectangle packing:
   - Houses: 2x2 or 3x2 tiles
   - Larger buildings: 3x3 or 4x3 tiles
   - Leave 1-tile gaps between buildings (streets/alleys)
4. Scatter trees on edges (20% of remaining empty tiles on map edges)
5. Add rubble patches randomly (5% of open tiles near buildings)
6. Mark building tiles with `buildingId` linking to `Building` objects
7. Use SeededRNG for reproducibility

Also create a **hardcoded Zaporizhzhia village scenario** with hand-placed buildings for the first playable map.

### Step 3: Tactical Engine (`src/tactical/engine/TacticalEngine.ts`)

Real-time tick loop (reuses SimulationRunner pattern from `src/engine/worker.ts`):

```
TacticalEngine.tick():
  1. Process player commands (queued from UI)
  2. AI decisions (for AI-controlled units)
  3. Movement resolution (A* pathfinding, position updates)
  4. Combat resolution (range checks, damage, cover)
  5. Morale/state updates (suppression, retreat)
  6. Building damage
  7. Victory check (all enemy units destroyed/retreating, or objective held)
```

- Tick rate: 10 ticks/second at 1x speed
- Interval: `1000 / (tickRate * speed)` ms
- Uses `setInterval` like existing `SimulationRunner`
- Outputs state diff each tick to Zustand store

### Step 4: Movement System (`src/tactical/engine/movement.ts`)

- **A* pathfinding** on the tile grid
  - Heuristic: Manhattan distance (or Chebyshev for 8-dir movement)
  - Cost function: `1 / TERRAIN_SPEED[terrain]` for passable tiles
  - Impassable: water, occupied enemy tiles
  - Buildings passable only by infantry (vehicles go around)
- **Movement execution**: Each tick, unit moves `speed * TERRAIN_SPEED[terrain] / tickRate` tiles toward next waypoint
- **Collision**: Units can't stack (except infantry can enter buildings)
- **Pathfinding cache**: Recompute path only when target changes or path is blocked

### Step 5: Combat System (`src/tactical/engine/combat.ts`)

Per-tick combat resolution:
```
For each unit with an attackTarget in range:
  if (ticksSinceLastShot >= stats.fireRate):
    hitChance = baseAccuracy * distanceMod * coverMod * stateMod

    baseAccuracy = 0.7
    distanceMod = 1 - (distance / range) * 0.5  // farther = less accurate
    coverMod = 1 - targetTile.cover              // cover reduces hit chance
    stateMod = unit.state === 'suppressed' ? 0.3 : 1.0

    if (rng.next() < hitChance):
      rawDamage = stats.damage * RNG(0.8, 1.2)
      effectiveDamage = rawDamage * (1 - target.stats.armor)

      // Infantry: damage reduces squadSize
      if (target.type === 'infantry'):
        casualties = floor(effectiveDamage / 10)
        target.squadSize -= casualties
        if (target.squadSize <= 0): target.state = 'destroyed'

      // Vehicles: damage reduces health
      else:
        target.health -= effectiveDamage
        if (target.health <= 0): target.state = 'destroyed'

      // Morale impact
      target.morale -= effectiveDamage * 0.5
      if (target.morale < 20): target.state = 'suppressed'
      if (target.morale < 10): target.state = 'retreating'
```

**Auto-targeting**: Units without explicit target auto-engage nearest enemy in range and LOS.

### Step 6: Line of Sight (`src/tactical/engine/los.ts`)

- **Bresenham's line algorithm** from unit to target tile
- Blocked by: buildings (unless unit is inside), elevation differences > 1
- Trees provide partial concealment (50% chance to block LOS)
- Used for: attack eligibility, auto-targeting, fog of war display
- **Fog of war**: Tiles outside any friendly unit's sight range are dimmed

### Step 7: Tactical AI (`src/tactical/engine/ai.ts`)

Simple but functional AI for defending/attacking:

**Defender AI**:
- Position infantry inside buildings (cover bonus)
- Tanks behind buildings with clear firing lanes
- Engage nearest enemy in range
- If morale < 30, retreat to next building
- Repositions to fill gaps when allies destroyed

**Attacker AI**:
- Advance toward objectives using cover
- Infantry: move building-to-building, clear rooms
- Tanks: stay on roads, provide fire support from range
- Focus fire on threatening targets (tanks first, then infantry)
- Flank when frontal approach is too costly

AI difficulty: simple decision tree with priority-based target selection. No pathfinding optimization needed — uses same A* as player units.

### Step 8: PixiJS Renderer (`src/tactical/map/renderer.ts`)

Follows same pattern as existing `src/map/renderer.ts`:

```
PIXI.Application
└── worldContainer (pan/zoom)
    ├── GridLayer (zIndex 0) — tile fill colors + grid lines
    ├── BuildingLayer (zIndex 1) — building outlines, filled rectangles
    ├── TerrainDetailLayer (zIndex 2) — tree sprites, rubble, road markings
    ├── FOWLayer (zIndex 3) — semi-transparent dark overlay for unseen tiles
    ├── SelectionOverlay (zIndex 5) — blue highlight on selected units, green movement range
    ├── UnitLayer (zIndex 10) — unit markers (circles/squares with faction color)
    ├── ProjectileLayer (zIndex 15) — bullet/shell traces (simple lines)
    └── EffectsLayer (zIndex 20) — explosions, smoke
uiContainer (fixed)
    └── Minimap (zIndex 100)
```

**Visual style — Paper/minimal**:
- Tiles: Flat muted colors (tan for open, darker tan for road, gray for buildings, green for trees)
- Grid lines: thin, semi-transparent
- Buildings: simple filled rectangles with darker outlines, door markers
- Units: colored circles (blue=player, red=enemy) with:
  - Infantry: small circle + squad count number
  - Tank: larger square with turret line
  - APC: medium rounded rectangle
- Selected units: pulsing blue border
- Movement path: dotted line from unit to destination
- Attacks: thin red line from attacker to target (brief flash)

**Camera**: Reuse same mouse wheel zoom + shift-drag pan + touch controls from existing `renderer.ts`.

### Step 9: Zustand Store (`src/tactical/store/tacticalStore.ts`)

```typescript
interface TacticalStore {
  gameState: TacticalGameState | null;

  // Actions
  initGame: (map: TacticalMap, units: TacticalUnit[], playerFaction: string) => void;
  setStatus: (status: string) => void;
  setSpeed: (speed: number) => void;
  updateUnits: (units: TacticalUnit[]) => void;
  selectUnits: (unitIds: string[]) => void;
  issueMove: (unitIds: string[], target: {x: number, y: number}) => void;
  issueAttack: (unitIds: string[], targetUnitId: string) => void;
  addEvent: (event: TacticalEvent) => void;
  reset: () => void;
}
```

### Step 10: React Components

**`src/tactical/components/TacticalView.tsx`** — Main container:
- Renders TacticalCanvas + TacticalHUD + TacticalControls
- Manages game lifecycle (init, start, cleanup)

**`src/tactical/components/TacticalCanvas.tsx`** — Canvas wrapper:
- Mirrors `src/components/MapCanvas.tsx` pattern
- Creates PixiJS app, initializes tactical renderer
- Handles click events:
  - Left click on unit: select
  - Left click on ground with selected units: move order
  - Right click on enemy: attack order
  - Shift+click: add to selection
  - Drag: box select

**`src/tactical/components/TacticalHUD.tsx`** — Info overlay:
- Selected unit info (type, squad size, health, morale)
- Minimap (top-right, same pattern as existing Minimap class)
- Kill count / units remaining per side

**`src/tactical/components/TacticalControls.tsx`** — Top bar:
- Play/Pause/Speed controls
- Scenario selector (for now just "Village Assault")
- Side selection (Attacker/Defender/Spectate)

### Step 11: App Integration

**Modify `src/store/uiStore.ts`**: Add `gameMode: 'menu' | 'strategic' | 'tactical'`

**Modify `src/components/App.tsx`**:
- Add mode switcher in top bar
- Conditionally render strategic view or `<TacticalView />`
- When `gameMode === 'tactical'`, hide all strategic components

### Step 12: Village Assault Scenario (`src/tactical/map/scenarios.ts`)

Hardcoded first scenario:
- **Map**: 60x40 grid, village center with 12 buildings, main road E-W, secondary road N-S
- **Defender** (south/village): 3 infantry squads (10 soldiers each) in buildings, 1 tank behind church
- **Attacker** (north): 4 infantry squads (12 soldiers each), 2 tanks, 1 APC on road
- **Victory**: Attacker wins by eliminating all defenders or occupying 3+ buildings for 30 seconds. Defender wins by destroying 60%+ of attacking force.

---

## Phase 2: Full Unit Roster (outline)
- Add: artillery (indirect fire, min range, area damage), mortar teams
- Add: reconnaissance drone (reveals fog, no attack, fragile)
- Add: helicopter (fast, ignores terrain, vulnerable to AA)
- Add: sniper team (long range, high damage, slow fire rate, 2-man squad)
- Add: ATGM team (anti-tank guided missile, infantry with AT capability)

## Phase 3: Advanced Mechanics (outline)
- Morale system: suppression cascades, surrender when surrounded + low morale
- Supply/ammo: units have ammo count, resupply from APC/supply truck
- Building destruction: tanks can demolish buildings, creating rubble
- Smoke grenades: block LOS temporarily
- Medic units: heal infantry casualties over time

## Phase 4: Map Editor + Procedural Generation (outline)
- Grid-based editor: paint terrain, place buildings, set spawn zones
- Procedural village generator: road network → building placement → terrain fill
- Save/load tactical maps (IndexedDB, same pattern as strategic maps)
- City size presets: hamlet (30x20), village (60x40), town (100x60)

## Phase 5: Strategic-Tactical Integration (IMPLEMENTED v3.5.0)
- ✅ Bridge module (`src/tactical/bridge.ts`): army→units, region→map, result→army
- ✅ Battle prompt dialog: Resolve Tactically / Auto-Resolve / Skip
- ✅ Army composition mapping: heavy→tanks/ATGMs, light→infantry/APCs, levy→smaller infantry
- ✅ Region terrain → tactical map preset (forest→forest, coast→coastal, etc.)
- ✅ Tactical result mapping: survival rates feed back to army size/composition
- ✅ Auto-resolve for AI-vs-AI battles
- ✅ Battle mode setting: Auto vs Ask in SimControls
- ✅ Return to Strategic Map button after tactical battle

## Phase 6: UI Polish + Mobile (IMPLEMENTED v3.5.0)
- ✅ Mobile touch controls: pinch-to-zoom, two-finger pan, tap-to-select, long-press for attack
- ✅ Keyboard shortcuts: Space, 1-4, Tab, Ctrl+A, Escape, ?
- ✅ Help modal with full controls reference
- ✅ Tutorial scenario: "Basic Commands" with guided overlay
- Remaining: sound effects, parchment textures (deferred to future)

## Phase 7: Multiplayer Foundation (outline)
- Player vs Player over network (WebSocket or WebRTC)
- Lobby system, game rooms
- Synchronized tick loop

---

## Files to Create (Phase 1)

| File | Purpose | ~Lines |
|------|---------|--------|
| `src/tactical/types.ts` | All tactical interfaces | ~150 |
| `src/tactical/engine/TacticalEngine.ts` | Tick loop, game state management | ~250 |
| `src/tactical/engine/combat.ts` | Damage, accuracy, cover calculations | ~150 |
| `src/tactical/engine/movement.ts` | A* pathfinding, unit movement | ~200 |
| `src/tactical/engine/los.ts` | Line of sight, fog of war | ~100 |
| `src/tactical/engine/ai.ts` | Defender/attacker AI decision trees | ~250 |
| `src/tactical/map/grid.ts` | Grid generation, building placement | ~200 |
| `src/tactical/map/renderer.ts` | PixiJS tactical renderer | ~400 |
| `src/tactical/map/overlays.ts` | Selection, range, path overlays | ~200 |
| `src/tactical/map/scenarios.ts` | Village assault scenario definition | ~100 |
| `src/tactical/store/tacticalStore.ts` | Zustand tactical state | ~80 |
| `src/tactical/components/TacticalView.tsx` | Main tactical container | ~100 |
| `src/tactical/components/TacticalCanvas.tsx` | PixiJS canvas wrapper | ~150 |
| `src/tactical/components/TacticalHUD.tsx` | Unit info, minimap, stats | ~120 |
| `src/tactical/components/TacticalControls.tsx` | Play/pause, speed, scenario | ~80 |

## Files to Modify (Phase 1)

| File | Change |
|------|--------|
| `src/store/uiStore.ts` | Add `gameMode` state |
| `src/components/App.tsx` | Add mode switcher, conditional render |
| `CLAUDE.md` | Update version to 3.0.0, add tactical mode docs |

## Existing Code to Reuse

| What | From | Used For |
|------|------|----------|
| SeededRNG class | `src/utils/random.ts` | Deterministic combat/AI rolls |
| Color utilities | `src/utils/colors.ts` | Faction colors, terrain colors |
| Camera controls pattern | `src/map/renderer.ts` | Pan/zoom on tactical map |
| Canvas component pattern | `src/components/MapCanvas.tsx` | TacticalCanvas structure |
| Store pattern | `src/store/simStore.ts` | TacticalStore structure |
| Tick loop pattern | `src/engine/worker.ts` | TacticalEngine interval |

## Verification Plan

1. **Build check**: `npx tsc --noEmit` — no type errors
2. **Dev server**: `npm run dev` — app loads without console errors
3. **Mode switching**: Click "Tactical" button in top bar → tactical view renders
4. **Map renders**: 60x40 grid visible with buildings, roads, trees
5. **Unit rendering**: Blue (player) and red (enemy) unit markers visible with squad counts
6. **Selection**: Click unit → highlights, shows info in HUD
7. **Movement**: Select unit → click destination → unit pathfinds and moves
8. **Combat**: Units in range auto-engage; damage visible as squad count decreases
9. **AI**: Enemy units defend positions, engage approaching player units
10. **Victory**: Game ends when win condition met, displays result
11. **Camera**: Zoom/pan works on tactical map
12. **Production build**: `npm run build` — builds successfully
