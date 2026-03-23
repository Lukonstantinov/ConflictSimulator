# CLAUDE.md

## Project: ConflictSimulator — Fantasy War Simulator

### Version: 3.5.0

A browser-based (PWA, iOS-optimized) fantasy war simulator with Voronoi-based world maps, configurable countries, and real-time war simulation.

---

### Versioning Rule
**After every update, increment the patch version (e.g., 1.0.0 → 1.0.1). Write the new version number in this file with a brief changelog entry below.**

---

### Tech Stack
- React + TypeScript, Vite, Tailwind CSS
- PixiJS v7 (canvas rendering), d3-delaunay (Voronoi)
- Zustand (state management), IndexedDB via idb (persistence)
- SimulationRunner in-thread loop (no Web Worker), vite-plugin-pwa

---

## Project Structure & Where to Find Everything

```
src/
├── components/          # React UI components (all UI panels)
│   ├── App.tsx          # Root layout, top bar, responsive layout
│   ├── MapCanvas.tsx    # PixiJS canvas wrapper, region clicks, battle effects
│   ├── CountryPanel.tsx # Right sidebar: add/config countries, live stats
│   ├── SimControls.tsx  # Start/pause/stop/speed, victory condition selector
│   ├── EventLog.tsx     # Scrollable war event log (last 100 events)
│   ├── StatsOverlay.tsx # Live floating stats when country selected
│   ├── GodModePanel.tsx # Pause-and-modify: force wars, spawn armies, snapshots
│   ├── StatsDashboard.tsx  # Post-war stats: battles, territory charts
│   ├── ScenarioPanel.tsx   # 6 preset scenario selector (dropdown)
│   ├── TimelineReplay.tsx  # Post-game scrubber, tick-by-tick replay
│   └── ToastNotifications.tsx # Top-center transient event toasts
│
├── engine/              # Simulation logic (pure TypeScript, no DOM)
│   ├── simulation.ts    # SimulationEngine: 6-phase tick loop (main class)
│   ├── combat.ts        # resolveBattle(), updateMorale(), terrain modifiers
│   ├── ai.ts            # makeDecisions(): diplomacy, war declare, spawn, move
│   ├── economy.ts       # calculateIncome(), spawnArmy(), fortification, pop growth
│   └── worker.ts        # SimulationRunner: setInterval tick loop, state delivery
│
├── map/                 # Map generation + PixiJS rendering
│   ├── voronoi.ts       # Voronoi generation, Lloyd relaxation, region centroid calc
│   ├── terrain.ts       # Perlin noise terrain assignment, terrain type constants
│   ├── renderer.ts      # MapRenderer: PixiJS stage, regions, borders, camera
│   └── animation.ts     # ArmyOverlay, BattleEffectSystem, Minimap classes
│
├── store/               # Zustand state stores
│   ├── simStore.ts      # tick, speed, status, events[], history[], territoryHistory[]
│   ├── mapStore.ts      # map (WorldMap), savedMaps[], IndexedDB persistence
│   └── uiStore.ts       # selectedRegionId, selectedCountryId, toolMode, showCountryPanel
│
├── types/
│   └── index.ts         # ALL TypeScript interfaces: Region, Country, Army, SimEvent, etc.
│
├── utils/
│   ├── colors.ts        # generateCountryColor(), hslToHex(), TERRAIN_COLORS
│   ├── names.ts         # Procedural fantasy name generator
│   ├── scenarios.ts     # 6 preset SCENARIOS array
│   └── persistence.ts   # IndexedDB save/load, JSON export/import, file download
│
├── main.tsx             # React entry point
└── index.css            # Tailwind directives + global styles (DVH, mobile scroll)
```

---

## Core Systems

### Simulation Loop (`src/engine/simulation.ts` + `worker.ts`)
- **Entry**: `SimulationRunner` (worker.ts) runs `setInterval` at tick rate
- **Tick method**: `SimulationEngine.runTick()` — 8 sequential phases:
  1. **Economy** — income, pop growth, war weariness, upkeep, auto-fortification, resource production
  2. **Resource Deficit** — morale penalty for armies if food/metal in deficit
  3. **Supply Attrition** — armies in enemy territory with no friendly neighbors lose 2% size/tick
  4. **AI Decisions** — per-country: diplomacy, war declare, spawn armies, pick move targets
  5. **Trade Routes** — form/break trade routes every 10 ticks, apply resource transfers
  6. **Border Front Combat** — sustained per-tick combat on contested borders
  7. **Movement & Combat** — advance progress, resolve battles on arrival, capture/retreat
  8. **Victory Check** — conquest/economic/territorial win conditions
- **Output**: `StateDelta` sent to React stores each tick

---

### Combat System (`src/engine/combat.ts`)
- **Function**: `resolveBattle(attacker, defender, region, country)`
- **Formula**:
  ```
  attackPower = size × morale × terrainMod × RNG(0.8, 1.2)
  defendPower = size × morale × 1.1 × fortBonus × RNG(0.85, 1.15)
  fortBonus = 1 + (fortification × 0.15)   [levels 0–3 → 1.0–1.45x]
  ratio = attackPower / defendPower
  attackerLosses = floor(defenderSize × (1/ratio) × 0.3)
  defenderLosses = floor(attackerSize × ratio × 0.25)
  ```
- **Terrain combat modifiers**: Plains=1.0, Desert=0.9, Coast=0.95, Forest=0.85, Mountains=0.7, Ocean=0.5
- **Morale**: Win=+0.05, Loss=-0.10, clamped [0.3, 1.5]

---

### Army Movement (`src/engine/ai.ts` → `moveArmies()`)
- **Speed per tick by target terrain**: Plains/Coast=0.25, Desert/Forest=0.20, Mountains=0.15, Ocean=0.10
- **Progress**: 0→1 linear interpolation; at 1.0 triggers battle or capture
- **Garrison creation**: If undefended enemy region, auto-spawn garrison size `max(5, armySize × 0.2)`

---

### AI Strategies (`src/engine/ai.ts`)
Five strategy types defined in `StrategyType` union (`src/types/index.ts`):

| Strategy | War% | War Target | Army Preference | Peace Bias |
|----------|------|------------|-----------------|------------|
| aggressive | 8% | Enemy first | High count | Low |
| expansionist | 5% | Unowned first | Moderate | Low |
| opportunist | 6% (if weaker) | Weakest enemy | Conditional | Moderate |
| defensive | 1% | Border enemies | Low count | High |
| turtle | 0.5% | Border only | Min 2 armies | Very high |

- War weariness reduces all war probabilities by up to 50%
- Alliance formation: 1–4% base, 3× if shared enemy
- Alliance betrayal: 0.1–0.8% based on strategy

---

### Economy System (`src/engine/economy.ts`)
- **Income formula**: `Σ(BASE_INCOME + TERRAIN_INCOME + pop × 0.02) × economyStat × (1 - weariness × 0.15)`
- **Terrain income**: Plains=3, Coast=4, Forest=2, Mountains=1, Desert=0.5
- **Army upkeep**: `0.5/army + 0.02/troop`
- **Army spawn cost**: `size × 2` treasury
- **Fortification**: costs 50 treasury, max level 3, AI auto-builds every 20 ticks
- **Population growth**: logistic model, caps: Plains=200, Coast=250, Forest=150, Mountains=80, Desert=60

---

### Resources & Trade Routes (`src/engine/economy.ts` + `src/engine/simulation.ts`)
- **Five resource types**: food, metal, wood, salt, gold
- **Terrain base production per tick**: Plains→food(3), Mountains→metal(3), Forest→wood(3), Coast→salt(2)+food(1), Desert→salt(2)
- **Bonus deposits**: 15% chance/region at map gen; gold rare (5%); bonus adds +2 production
- **Army resource upkeep**: Heavy→food(0.03)+metal(0.02)/unit, Light→food(0.02)/unit, Levy→food(0.01)/unit
- **Deficit penalties**: Food deficit→-0.02 morale/tick + 10% income loss; Metal deficit→5% income loss
- **Gold bonus**: Gold resources directly add 2× gold production to treasury income
- **Trade routes**: Auto-form every 10 ticks between peaceful nations with complementary surpluses (surplus >5, partner <2); max 3 routes/country; transfer 1 resource/tick; broken by war
- **Visualization**: Animated color-coded dashed lines (green=food, gray=metal, brown=wood, cyan=salt, yellow=gold) with small resource dot at midpoint

---

### Map Rendering (`src/map/renderer.ts` + `animation.ts`)

#### PixiJS Layer Stack (bottom → top):
```
worldContainer (pan/zoom)
├── Region polygons (zIndex 0)   — filled Voronoi cells, terrain textures
├── Country borders (zIndex 1)   — thick 2.5px colored edges between countries
├── TradeRouteOverlay (zIndex 3) — animated dashed lines, color-coded by resource
├── ArmyOverlay (zIndex 10-11)   — circle markers + size labels
└── BattleEffectSystem (zIndex 20) — burst animations (600ms fade+expand)
uiContainer (fixed)
└── Minimap (zIndex 100)         — top-right, yellow viewport rect
```

#### Army Rendering (`src/map/animation.ts` → `ArmyOverlay`):
- Circle radius: `clamp(sqrt(size) × 1.2, 4, 12)` px
- Color: country HSL color → hex
- Moving armies: linear lerp between region centroids based on `progress`
- Direction indicator: white line extending from circle edge toward target

#### Battle Effects (`src/map/animation.ts` → `BattleEffectSystem`):
- Red burst = attacker wins; orange = defender wins
- 15px circle + 6 rays × 20px, fades + scales 1→2.5× over 600ms

#### Camera Controls (`src/map/renderer.ts`):
- Mouse wheel zoom (0.5×–4×), zoom toward cursor
- Middle mouse or Shift+drag to pan
- Touch: pinch-to-zoom + two-finger pan

---

### State Management (`src/store/`)

| Store | Key State | Key Actions |
|-------|-----------|-------------|
| `simStore.ts` | tick, status, speed, events[], history[], winner, tradeRoutes[] | addEvent, setStatus, recordDelta, setTradeRoutes, reset |
| `mapStore.ts` | map (WorldMap), savedMaps[] | generateMap, assignRegion, addCountry, updateCountry |
| `uiStore.ts` | selectedRegionId, selectedCountryId, toolMode | selectRegion, selectCountry, setToolMode |

---

### Data Types (`src/types/index.ts`)

Key interfaces:
- `Region` — id, polygon[], centroid, neighbors[], terrain, countryId, population, fortification, resourceProduction, bonusResource?
- `Country` — id, name, color, regions[], capital, armySize, economy, strategy, treasury, activeArmies[], relations, warWeariness, resources (ResourceStockpile)
- `ResourceStockpile` — food, metal, wood, salt, gold (number each)
- `TradeRoute` — id, country1Id, country2Id, resource, amount, fromRegionId, toRegionId
- `Army` — id, size, position (regionId), target (regionId|null), morale, progress, units (UnitComposition), borderFrontId?
- `UnitComposition` — heavy, light, levy (troop counts per type)
- `BorderFront` — id, attackerRegionId, defenderRegionId, attackerCountryId, defenderCountryId, attackerArmyId, defenderArmyId, frontPosition (0→1)
- `SimEvent` — type, tick, data (typed union per event type)
- `StateDelta` — tick, regionChanges[], countryUpdates[], armyUpdates[], events[], winner, tradeRoutes[]
- `VictoryCondition` — 'conquest' | 'economic' | 'territorial'
- `ResourceType` — 'food' | 'metal' | 'wood' | 'salt' | 'gold'
- `StrategyType` — 'aggressive' | 'defensive' | 'expansionist' | 'opportunist' | 'turtle'

---

### UI Components (`src/components/`)

| Component | Location | When Visible |
|-----------|----------|--------------|
| App.tsx | Root | Always — layout container |
| MapCanvas.tsx | Center | Always — PixiJS map |
| CountryPanel.tsx | Right sidebar (desktop) / bottom (mobile) | Toggleable |
| SimControls.tsx | Top strip | Always |
| EventLog.tsx | Bottom left | Always |
| StatsOverlay.tsx | Floating top-right | During sim, country selected |
| GodModePanel.tsx | Below sim controls | Only when paused |
| StatsDashboard.tsx | Bottom | After simulation ends |
| ScenarioPanel.tsx | Top bar dropdown | Setup phase |
| TimelineReplay.tsx | Bottom right | After simulation ends |
| ToastNotifications.tsx | Top center | During sim (auto-hides 4s) |

---

### Scenarios (`src/utils/scenarios.ts`)
Six preset scenarios, each configures `regionCount`, country array, and `VictoryConfig`:
1. **Two Empires** — 2 large nations, conquest win
2. **Battle Royale** — 8 small nations, conquest win
3. **Economic Race** — 4 nations, economic win (treasury 5000)
4. **Land Grab** — 6 nations, territorial win (75%)
5. **World War** — alliance-heavy 6-nation setup
6. **The Underdog** — 1 weak vs 3 strong nations

---

### Persistence (`src/utils/persistence.ts`)
- **IndexedDB** (via `idb`) for named map save slots
- **JSON export/import** — full WorldMap serialization/deserialization
- **Browser download** — `downloadFile(content, filename)` triggers file download
- **Saved maps** listed in `mapStore.savedMaps[]`, loaded via `loadSavedMap(id)`

---

## Tactical Combat Mode (`src/tactical/`)

Parallel game mode alongside the strategic simulator. Grid-based real-time tactical combat with modern military units.

### Directory Structure
```
src/tactical/
├── types.ts              # Tactical interfaces (TacticalTile, TacticalUnit, etc.)
├── bridge.ts             # Strategic-tactical bridge (army↔units, region↔map, results)
├── engine/
│   ├── TacticalEngine.ts # Real-time tick loop (10 ticks/sec), 10-phase processing
│   ├── combat.ts         # Hit chance, damage, cover, morale/suppression
│   ├── movement.ts       # A* pathfinding on grid, terrain speed modifiers
│   ├── los.ts            # Bresenham line-of-sight, fog of war computation
│   └── ai.ts             # Defender/attacker AI decision trees
├── map/
│   ├── grid.ts           # Procedural village map generation
│   ├── renderer.ts       # PixiJS tactical renderer (grid, units, effects, touch)
│   ├── overlays.ts       # Fog of war, movement range overlays
│   └── scenarios.ts      # 6 tactical scenarios + tutorial
├── store/
│   └── tacticalStore.ts  # Zustand store for tactical + editor + bridge state
└── components/
    ├── TacticalView.tsx   # Main tactical mode container
    ├── TacticalCanvas.tsx # PixiJS canvas wrapper with click handling
    ├── TacticalHUD.tsx    # Unit info, kill counts, victory banner, return-to-strategic
    ├── TacticalControls.tsx # Play/pause/speed, faction select, help button
    ├── MapEditorPanel.tsx # In-browser map editor UI
    ├── KeyboardShortcuts.tsx # Keyboard shortcuts handler + help modal
    └── TutorialOverlay.tsx   # Tutorial tips for guided scenario
```

### Unit Types
- **Infantry**: Squad-based (4-12 soldiers), enters buildings, range 6
- **Tank**: High armor (0.7), high damage (40), range 10, turret facing
- **APC**: Fast (2.5 speed), medium armor (0.4), range 4
- **Artillery**: Indirect fire (no LOS needed), range 18, min range 5, splash damage radius 2, slow fire rate
- **Sniper**: 2-man team, range 14, high accuracy (0.85), sight 16, priority targeting (ATGM>medics>snipers)
- **ATGM**: 3-man anti-tank team, range 12, 2.5x anti-armor bonus, enters buildings
- **Drone**: Unarmed recon, flying (ignores terrain), sight 20, fragile
- **Helicopter**: Flying, range 8, 1.5x anti-armor, speed 3.5
- **Medic**: 2-man team, heals nearby wounded infantry squads, no attack

### Terrain Types
- open, road, building, rubble, trees, water, trench
- Each has cover (0-0.6) and speed modifiers (0.3-1.3)

### Combat System
- Hit chance = baseAccuracy(0.7) × distanceMod × coverMod × stateMod
- Suppression at morale <20, retreat at morale <10
- Auto-targeting nearest enemy in range + LOS

### Advanced Mechanics (Phase 3)
- **Ammo system**: Each unit has limited ammo; depleted units cannot fire; low ammo warning in HUD
- **Building destruction**: Artillery splash damages buildings; destroyed buildings become rubble terrain
- **Smoke grenades**: Player-deployable smoke (blocks LOS, 50 tick duration, radius 2); UI smoke mode button
- **Medic healing**: Medic units restore casualties to nearby friendly infantry squads
- **Surrender**: Units with morale <10 surrounded by 2:1 enemies surrender (white flag state)

### Strategic-Tactical Integration (Phase 5)
- **Tactical Bridge** (`src/tactical/bridge.ts`): Converts strategic armies to tactical units and maps tactical results back
- **Battle Prompt**: When a border front forms, player can choose: Resolve Tactically, Auto-Resolve, or Skip
- **Army→Units**: Strategic UnitComposition (heavy/light/levy) maps to tactical units (tanks/infantry/APCs)
- **Region→Map**: Strategic region terrain generates appropriate tactical map (forest→forest preset, coast→coastal, etc.)
- **Result Mapping**: Tactical victory/casualties feed back as army size/composition changes
- **Auto-Resolve**: AI-vs-AI battles can be auto-resolved without tactical play
- **Battle Mode Setting**: Player can choose "Auto" (all auto-resolved) or "Ask" (prompted for each battle)

### Mobile & Tutorial (Phase 6)
- **Touch controls**: Pinch-to-zoom, two-finger pan, tap-to-select, long-press for attack
- **Keyboard shortcuts**: Space (play/pause), 1-4 (speed), Tab (cycle units), Ctrl+A (select all), ? (help)
- **Help modal**: Full shortcut reference accessible via ? key or toolbar button
- **Tutorial scenario**: Guided "Basic Commands" scenario with step-by-step tips (select, move, attack)
- **Tutorial overlay**: Contextual tips that auto-advance based on player actions

### Planned Features (Not Yet Implemented)

- Phase 7: Multiplayer (WebSocket/WebRTC)

---

## Commands
```bash
npm run dev        # Start dev server
npm run build      # Production build
npm run preview    # Preview production build
npx tsc --noEmit   # Type check
```

---

## Changelog
- **3.5.0** — Tactical Phases 5+6: Strategic-Tactical Integration & Mobile/Tutorial: tactical bridge module converts strategic armies (heavy/light/levy) to tactical units (tanks/infantry/APCs) and maps region terrain to tactical map presets, battle prompt dialog when border fronts form (Resolve Tactically / Auto-Resolve / Skip), tactical battle results feed back as army size/composition changes, auto-resolve option for AI-vs-AI battles, battle mode setting (Auto/Ask) in SimControls, "Return to Strategic Map" button after tactical battle ends; mobile touch controls (pinch-to-zoom, two-finger pan, tap-to-select, long-press for attack), keyboard shortcuts (Space=play/pause, 1-4=speed, Tab=cycle units, Ctrl+A=select all, ?=help), help modal with full controls reference, tutorial "Basic Commands" scenario with 3 attacker vs 2 defender units, tutorial overlay with auto-advancing contextual tips (select→move→attack→fight), 6 tactical scenarios total (Tutorial, Village Assault, Urban Defense, Forest Ambush, Factory Assault, Coastal Landing)
- **3.3.0** — Tactical Phase 4: Map Editor & Procedural Generation Presets: in-browser map editor (terrain paint, unit placement, erase tools with 1×/3×/5× brush sizes), 5 procedural map presets (Village, Forest, Urban District, Factory Complex, Coastal Town) with configurable building/tree density and optional trenches/water, 3 new tactical scenarios (Forest Ambush with dense woodland snipers/ATGM, Factory Assault with heavy armor vs fortified warehouses, Coastal Landing with amphibious assault), map export/import as JSON, regenerate-from-preset button with random seed, editor side panel with terrain palette and unit roster
- **3.2.0** — Tactical Phases 2+3: Full unit roster (artillery with indirect fire/splash damage, sniper teams with priority targeting/high accuracy, ATGM anti-tank teams with 2.5x armor bonus, recon drones with flying/20-tile sight, helicopters with anti-armor strikes, medic units with squad healing), ammo/supply system (per-unit ammo tracking, depleted units can't fire, HUD warnings), building destruction (artillery splash damages buildings, destroyed buildings become rubble), smoke grenades (player-deployable LOS-blocking smoke with 50-tick duration), surrender mechanic (surrounded low-morale units surrender with white flag), flying unit movement (drones/helicopters ignore terrain), smoke blocks LOS, aerial sight (drones see over buildings), specialized AI per unit type (drone recon AI, medic follow-wounded AI, artillery cluster-targeting AI, sniper priority-targeting AI, helicopter strafe-run AI), Urban Defense scenario with combined-arms forces, scenario selector dropdown, unique PixiJS shapes per unit type (diamond/triangle/pentagon/X-shape/teardrop/cross)
- **3.0.0** — Tactical Combat Mode: grid-based real-time tactical combat with modern military units (infantry squads, tanks, APCs), A* pathfinding, Bresenham line-of-sight, fog of war, cover/terrain system, tactical AI (defender positions in buildings, attacker advances with cover), Village Assault scenario (60x40 grid, procedural village), PixiJS renderer with unit markers and shot effects, play/pause/speed controls, faction selection, mode switcher in top bar (Strategic/Tactical), lazy-loaded tactical view
- **2.1.0** — Phase 11 Resources & Trade Routes + Unit Stats: five resource types (food, metal, wood, salt, gold) with terrain-based production (Plains→food, Mountains→metal, Forest→wood, Coast→salt+food, Desert→salt), random bonus deposits at map gen (15% chance/region, gold rare 5%), army resource upkeep (Heavy needs food+metal, Light/Levy need food), resource deficit morale/income penalties, trade routes auto-form between peaceful nations with complementary surpluses (max 3/country), war breaks trade routes, animated color-coded dashed lines on map for trade routes, resource stockpile shown in CountryPanel and StatsOverlay, region resource info on click, detailed per-army unit stats display (combat multiplier, speed, composition) when clicking regions with armies, bonus resource indicators on regions
- **2.0.0** — Phase 9 & 10 Multi-Type Units & Border Combat: three unit types per army (Heavy 1.5× combat/pentagon, Light 1× baseline/diamond, Levy 0.6× cheap/circle), strategy-based unit mix (aggressive→heavy, expansionist→light, turtle→levy), unit-type spawn costs (Heavy=5, Light=3, Levy=1), army speed limited by slowest unit type, shield-shaped PixiJS markers with H/L/V labels, unit breakdown in CountryPanel and StatsOverlay; border front combat system with push mechanic (armies stop at contested borders, sustained per-tick combat with frontDelta=(ratio-1)×0.02), BorderFront visual overlay with gradient lines and front position marker, region captured on breakthrough (frontPosition≥1.0), defender retreat/garrison mechanics, peace treaty front cleanup
- **1.8.0** — Phase 8 Scenarios & Replay: 6 preset scenarios (Two Empires, Battle Royale, Economic Race, Land Grab, World War, The Underdog), timeline replay scrubber with tick-by-tick navigation, victory conditions (conquest/economic/territorial), toast notification system for major events
- **1.7.0** — Phase 7 Population & Warfare: region population system (growth, recruitment, income), terrain movement speed modifiers, supply line attrition for deep-territory armies, war weariness mechanic (economic/morale penalty), fortification system (AI auto-builds, defense bonus, reduced on capture), peace treaty AI (war-weary nations negotiate peace), combat fortification bonus
- **1.6.0** — Phase 6 Advanced Features: procedural fantasy country name generator, diplomacy AI (alliance formation/betrayal based on threat assessment), replay history recording, post-war statistics dashboard (battle records, territory charts), map export/import (JSON)
- **1.5.0** — Phase 5 PWA & Mobile: vite-plugin-pwa integration, web app manifest, service worker with offline caching, iOS safe area insets, touch-optimized viewport, Add to Home Screen support
- **1.4.0** — Phase 4 God Mode: pause-and-modify intervention (adjust army/economy/strategy mid-sim), force wars/alliances/peace between countries, spawn reinforcements, live country stats overlay, what-if branching (save/load simulation snapshots)
- **1.3.0** — Phase 3 Visual Polish: animated army sprites with interpolated movement, battle burst effects (flash + particles), terrain texture patterns (mountains/forest/desert/coast), country border highlighting, minimap with viewport indicator, camera pan/zoom (mouse wheel + shift-drag + touch pinch)
- **1.2.0** — Phase 2 Simulation Core: war engine with economy system, combat resolution (terrain modifiers + defender bonus), 5-strategy AI (aggressive/defensive/expansionist/opportunist/turtle), tick-based simulation loop, play/pause/speed controls, war event log, real-time border changes
- **1.1.2** — Fix mobile/iPhone layout: responsive map sizing, scrollable UI, stacking layout on small screens
- **1.1.1** — Add GitHub Actions workflow for GitHub Pages deployment, set Vite base path
- **1.1.0** — Phase 1 Foundation: Vite + React + TS scaffold, Voronoi map generation (d3-delaunay + Lloyd relaxation + Perlin noise terrain), PixiJS renderer, country assignment UI, config panel, Zustand stores, IndexedDB persistence, implementation plan
- **1.0.0** — Initial project setup, CLAUDE.md created
