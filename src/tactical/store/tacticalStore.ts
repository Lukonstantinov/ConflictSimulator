import { create } from 'zustand';
import type { TacticalUnit, TacticalMap, TacticalEvent, TacticalStatus, TacticalTerrain, TacticalUnitType } from '../types';
import { TERRAIN_COVER, UNIT_DEFINITIONS, UNIT_AMMO, UNIT_SMOKE } from '../types';
import type { Army } from '../../types';

export type EditorTool = 'terrain' | 'unit' | 'erase';

interface TacticalStore {
  // Simulation state
  status: TacticalStatus;
  tick: number;
  speed: number;
  units: TacticalUnit[];
  map: TacticalMap | null;
  events: TacticalEvent[];
  selectedUnitIds: string[];
  playerFaction: 'attacker' | 'defender';

  // Strategic bridge context (set when launched from strategic mode)
  strategicBattleId: string | null;
  strategicAttackerArmy: Army | null;
  strategicDefenderArmy: Army | null;

  // Editor state
  editorMode: boolean;
  editorTool: EditorTool;
  editorTerrain: TacticalTerrain;
  editorUnitType: TacticalUnitType;
  editorFaction: 'attacker' | 'defender';
  editorBrushSize: 1 | 3 | 5;

  // Simulation actions
  initGame: (map: TacticalMap, units: TacticalUnit[], playerFaction: 'attacker' | 'defender') => void;
  setStatus: (status: TacticalStatus) => void;
  setSpeed: (speed: number) => void;
  updateState: (units: TacticalUnit[], tick: number, status: TacticalStatus, events: TacticalEvent[]) => void;
  selectUnits: (unitIds: string[]) => void;
  addToSelection: (unitId: string) => void;
  clearSelection: () => void;
  reset: () => void;

  // Editor actions
  setEditorMode: (mode: boolean) => void;
  setEditorTool: (tool: EditorTool) => void;
  setEditorTerrain: (terrain: TacticalTerrain) => void;
  setEditorUnitType: (type: TacticalUnitType) => void;
  setEditorFaction: (faction: 'attacker' | 'defender') => void;
  setEditorBrushSize: (size: 1 | 3 | 5) => void;
  paintTiles: (cx: number, cy: number) => void;
  placeEditorUnit: (x: number, y: number) => void;
  eraseAt: (cx: number, cy: number) => void;
  clearEditorMap: () => void;
  setMap: (map: TacticalMap) => void;
}

let editorUnitCounter = 9000;

export const useTacticalStore = create<TacticalStore>((set, get) => ({
  // Simulation defaults
  status: 'setup',
  tick: 0,
  speed: 1,
  units: [],
  map: null,
  events: [],
  selectedUnitIds: [],
  playerFaction: 'attacker',

  // Strategic bridge defaults
  strategicBattleId: null,
  strategicAttackerArmy: null,
  strategicDefenderArmy: null,

  // Editor defaults
  editorMode: false,
  editorTool: 'terrain',
  editorTerrain: 'road',
  editorUnitType: 'infantry',
  editorFaction: 'attacker',
  editorBrushSize: 1,

  // ── Simulation actions ──────────────────────────────────────────────────────

  initGame: (map, units, playerFaction) => set({
    map,
    units,
    playerFaction,
    status: 'setup',
    tick: 0,
    events: [],
    selectedUnitIds: [],
    editorMode: false,
  }),

  setStatus: (status) => set({ status }),
  setSpeed: (speed) => set({ speed }),

  updateState: (units, tick, status, events) => set({ units, tick, status, events }),

  selectUnits: (unitIds) => set({ selectedUnitIds: unitIds }),
  addToSelection: (unitId) => set((s) => ({
    selectedUnitIds: s.selectedUnitIds.includes(unitId)
      ? s.selectedUnitIds
      : [...s.selectedUnitIds, unitId],
  })),
  clearSelection: () => set({ selectedUnitIds: [] }),

  reset: () => set({
    status: 'setup',
    tick: 0,
    speed: 1,
    units: [],
    map: null,
    events: [],
    selectedUnitIds: [],
    playerFaction: 'attacker',
    strategicBattleId: null,
    strategicAttackerArmy: null,
    strategicDefenderArmy: null,
    editorMode: false,
  }),

  // ── Editor actions ──────────────────────────────────────────────────────────

  setEditorMode: (mode) => set({ editorMode: mode }),
  setEditorTool: (tool) => set({ editorTool: tool }),
  setEditorTerrain: (terrain) => set({ editorTerrain: terrain }),
  setEditorUnitType: (type) => set({ editorUnitType: type }),
  setEditorFaction: (faction) => set({ editorFaction: faction }),
  setEditorBrushSize: (size) => set({ editorBrushSize: size }),

  paintTiles: (cx, cy) => {
    const { map, editorTerrain, editorBrushSize } = get();
    if (!map) return;

    const half = Math.floor(editorBrushSize / 2);
    const newTiles = map.tiles.map((row) => row.map((t) => ({ ...t })));

    for (let dy = -half; dy <= half; dy++) {
      for (let dx = -half; dx <= half; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || x >= map.width || y < 0 || y >= map.height) continue;
        const tile = newTiles[y][x];
        // Remove building reference when painting over building tiles
        if (tile.terrain === 'building') {
          tile.buildingId = undefined;
          tile.elevation = 0;
        }
        tile.terrain = editorTerrain;
        tile.cover = TERRAIN_COVER[editorTerrain];
        tile.passable = editorTerrain !== 'water';
      }
    }

    // Remove buildings whose tiles were overwritten
    const newBuildings = map.buildings.filter((b) =>
      b.tiles.every((bt) => newTiles[bt.y]?.[bt.x]?.terrain === 'building'),
    );

    set({ map: { ...map, tiles: newTiles, buildings: newBuildings } });
  },

  placeEditorUnit: (x, y) => {
    const { map, units, editorUnitType, editorFaction } = get();
    if (!map) return;
    const tile = map.tiles[y]?.[x];
    if (!tile || !tile.passable) return;
    // Don't stack units
    if (units.some((u) => u.position.x === x && u.position.y === y && u.state !== 'destroyed')) return;

    const type = editorUnitType;
    const isSquadType = type === 'infantry' || type === 'sniper' || type === 'atgm' || type === 'medic';
    const maxSquad = isSquadType ? (type === 'sniper' ? 2 : type === 'atgm' ? 3 : type === 'medic' ? 2 : 8) : 1;
    const isFlying = type === 'drone' || type === 'helicopter';

    const newUnit: TacticalUnit = {
      id: `editor-unit-${editorUnitCounter++}`,
      type,
      faction: editorFaction,
      position: { x, y },
      squadSize: maxSquad,
      maxSquadSize: maxSquad,
      health: 100,
      morale: 100,
      state: 'idle',
      stats: { ...UNIT_DEFINITIONS[type] },
      facing: editorFaction === 'attacker' ? 4 : 0,
      selected: false,
      lastShotTick: -100,
      ammo: UNIT_AMMO[type],
      maxAmmo: UNIT_AMMO[type],
      smokeCharges: UNIT_SMOKE[type],
      flying: isFlying,
    };
    set({ units: [...units, newUnit] });
  },

  eraseAt: (cx, cy) => {
    const { map, units, editorBrushSize } = get();
    if (!map) return;

    const half = Math.floor(editorBrushSize / 2);

    // Erase units in brush area
    const removedUnitIds = new Set<string>();
    for (let dy = -half; dy <= half; dy++) {
      for (let dx = -half; dx <= half; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        units.forEach((u) => {
          if (u.position.x === x && u.position.y === y) removedUnitIds.add(u.id);
        });
      }
    }

    // Paint erased tiles as 'open'
    const newTiles = map.tiles.map((row) => row.map((t) => ({ ...t })));
    for (let dy = -half; dy <= half; dy++) {
      for (let dx = -half; dx <= half; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || x >= map.width || y < 0 || y >= map.height) continue;
        const tile = newTiles[y][x];
        if (tile.terrain === 'building') tile.buildingId = undefined;
        tile.terrain = 'open';
        tile.cover = 0;
        tile.passable = true;
        tile.elevation = 0;
      }
    }

    const newBuildings = map.buildings.filter((b) =>
      b.tiles.every((bt) => newTiles[bt.y]?.[bt.x]?.terrain === 'building'),
    );

    set({
      map: { ...map, tiles: newTiles, buildings: newBuildings },
      units: removedUnitIds.size > 0 ? units.filter((u) => !removedUnitIds.has(u.id)) : units,
    });
  },

  clearEditorMap: () => {
    const { map } = get();
    if (!map) return;
    const newTiles = map.tiles.map((row) =>
      row.map((t) => ({ ...t, terrain: 'open' as TacticalTerrain, cover: 0, passable: true, buildingId: undefined, elevation: 0 })),
    );
    set({ map: { ...map, tiles: newTiles, buildings: [] }, units: [] });
  },

  setMap: (map) => set({ map }),
}));
