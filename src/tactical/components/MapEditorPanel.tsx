import { useCallback, useRef } from 'react';
import { useTacticalStore } from '../store/tacticalStore';
import type { EditorTool } from '../store/tacticalStore';
import type { TacticalTerrain, TacticalUnitType } from '../types';
import { generateTacticalMapFromPreset } from '../map/grid';
import type { MapPreset } from '../map/grid';

const TERRAIN_OPTIONS: { terrain: TacticalTerrain; label: string; color: string }[] = [
  { terrain: 'open',     label: 'Open',     color: '#d4c89a' },
  { terrain: 'road',     label: 'Road',     color: '#b0a47a' },
  { terrain: 'building', label: 'Building', color: '#8a8a8a' },
  { terrain: 'rubble',   label: 'Rubble',   color: '#9a9080' },
  { terrain: 'trees',    label: 'Trees',    color: '#6a9a5a' },
  { terrain: 'water',    label: 'Water',    color: '#5a8aaa' },
  { terrain: 'trench',   label: 'Trench',   color: '#7a7060' },
];

const UNIT_OPTIONS: { type: TacticalUnitType; label: string }[] = [
  { type: 'infantry',   label: 'Infantry' },
  { type: 'tank',       label: 'Tank' },
  { type: 'apc',        label: 'APC' },
  { type: 'artillery',  label: 'Artillery' },
  { type: 'sniper',     label: 'Sniper' },
  { type: 'atgm',       label: 'ATGM' },
  { type: 'drone',      label: 'Drone' },
  { type: 'helicopter', label: 'Helicopter' },
  { type: 'medic',      label: 'Medic' },
];

const PRESET_OPTIONS: { preset: MapPreset; label: string }[] = [
  { preset: 'village',  label: 'Village' },
  { preset: 'forest',   label: 'Forest' },
  { preset: 'urban',    label: 'Urban District' },
  { preset: 'factory',  label: 'Factory Complex' },
  { preset: 'coastal',  label: 'Coastal Town' },
];

export default function MapEditorPanel() {
  const editorTool    = useTacticalStore((s) => s.editorTool);
  const editorTerrain = useTacticalStore((s) => s.editorTerrain);
  const editorUnitType= useTacticalStore((s) => s.editorUnitType);
  const editorFaction = useTacticalStore((s) => s.editorFaction);
  const editorBrushSize = useTacticalStore((s) => s.editorBrushSize);
  const map           = useTacticalStore((s) => s.map);
  const units         = useTacticalStore((s) => s.units);

  const setEditorTool     = useTacticalStore((s) => s.setEditorTool);
  const setEditorTerrain  = useTacticalStore((s) => s.setEditorTerrain);
  const setEditorUnitType = useTacticalStore((s) => s.setEditorUnitType);
  const setEditorFaction  = useTacticalStore((s) => s.setEditorFaction);
  const setEditorBrushSize= useTacticalStore((s) => s.setEditorBrushSize);
  const clearEditorMap    = useTacticalStore((s) => s.clearEditorMap);
  const setMap            = useTacticalStore((s) => s.setMap);
  const setEditorMode     = useTacticalStore((s) => s.setEditorMode);

  const presetSelectRef = useRef<HTMLSelectElement>(null);

  const handleGeneratePreset = useCallback(() => {
    if (!map || !presetSelectRef.current) return;
    const preset = presetSelectRef.current.value as MapPreset;
    const seed = Math.floor(Math.random() * 9999);
    const newMap = generateTacticalMapFromPreset(map.width, map.height, seed, { preset }, preset);
    setMap(newMap);
  }, [map, setMap]);

  const handleExport = useCallback(() => {
    if (!map) return;
    const data = JSON.stringify({ map, units }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${map.name.toLowerCase().replace(/\s+/g, '-')}-map.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [map, units]);

  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const parsed = JSON.parse(ev.target?.result as string);
          if (parsed.map) {
            setMap(parsed.map);
            if (parsed.units) {
              useTacticalStore.setState({ units: parsed.units });
            }
          }
        } catch {
          alert('Invalid map file.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [setMap]);

  const handleDone = useCallback(() => {
    setEditorMode(false);
  }, [setEditorMode]);

  const toolBtn = (tool: EditorTool, label: string) => (
    <button
      key={tool}
      onClick={() => setEditorTool(tool)}
      className={`px-2 py-1 rounded text-xs font-medium ${
        editorTool === tool ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="bg-gray-900 border-l border-gray-700 w-52 flex flex-col text-white text-xs overflow-y-auto flex-shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700">
        <span className="font-bold text-sm">Map Editor</span>
        <button
          onClick={handleDone}
          className="bg-green-700 hover:bg-green-600 px-2 py-0.5 rounded text-xs"
        >
          Done
        </button>
      </div>

      <div className="flex flex-col gap-3 p-3">
        {/* Tool selector */}
        <div>
          <div className="text-gray-400 mb-1 font-semibold uppercase tracking-wide" style={{ fontSize: 10 }}>Tool</div>
          <div className="flex gap-1">
            {toolBtn('terrain', 'Terrain')}
            {toolBtn('unit', 'Unit')}
            {toolBtn('erase', 'Erase')}
          </div>
        </div>

        {/* Brush size */}
        {(editorTool === 'terrain' || editorTool === 'erase') && (
          <div>
            <div className="text-gray-400 mb-1 font-semibold uppercase tracking-wide" style={{ fontSize: 10 }}>Brush Size</div>
            <div className="flex gap-1">
              {([1, 3, 5] as const).map((size) => (
                <button
                  key={size}
                  onClick={() => setEditorBrushSize(size)}
                  className={`px-2 py-1 rounded text-xs ${
                    editorBrushSize === size ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {size}×{size}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Terrain palette */}
        {editorTool === 'terrain' && (
          <div>
            <div className="text-gray-400 mb-1 font-semibold uppercase tracking-wide" style={{ fontSize: 10 }}>Terrain Type</div>
            <div className="flex flex-col gap-1">
              {TERRAIN_OPTIONS.map(({ terrain, label, color }) => (
                <button
                  key={terrain}
                  onClick={() => setEditorTerrain(terrain)}
                  className={`flex items-center gap-2 px-2 py-1 rounded text-left ${
                    editorTerrain === terrain ? 'ring-1 ring-blue-400 bg-gray-700' : 'bg-gray-800 hover:bg-gray-700'
                  }`}
                >
                  <div className="w-4 h-4 rounded flex-shrink-0 border border-gray-600" style={{ backgroundColor: color }} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Unit palette */}
        {editorTool === 'unit' && (
          <div>
            <div className="text-gray-400 mb-1 font-semibold uppercase tracking-wide" style={{ fontSize: 10 }}>Faction</div>
            <div className="flex gap-1 mb-2">
              <button
                onClick={() => setEditorFaction('attacker')}
                className={`flex-1 py-1 rounded text-xs ${editorFaction === 'attacker' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
              >
                Attacker
              </button>
              <button
                onClick={() => setEditorFaction('defender')}
                className={`flex-1 py-1 rounded text-xs ${editorFaction === 'defender' ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
              >
                Defender
              </button>
            </div>
            <div className="text-gray-400 mb-1 font-semibold uppercase tracking-wide" style={{ fontSize: 10 }}>Unit Type</div>
            <div className="flex flex-col gap-1">
              {UNIT_OPTIONS.map(({ type, label }) => (
                <button
                  key={type}
                  onClick={() => setEditorUnitType(type)}
                  className={`px-2 py-1 rounded text-left ${
                    editorUnitType === type ? 'ring-1 ring-blue-400 bg-gray-700' : 'bg-gray-800 hover:bg-gray-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Divider */}
        <hr className="border-gray-700" />

        {/* Generate from preset */}
        <div>
          <div className="text-gray-400 mb-1 font-semibold uppercase tracking-wide" style={{ fontSize: 10 }}>Generate Preset</div>
          <select
            ref={presetSelectRef}
            className="w-full bg-gray-700 text-white text-xs rounded px-2 py-1 mb-2"
            defaultValue="village"
          >
            {PRESET_OPTIONS.map(({ preset, label }) => (
              <option key={preset} value={preset}>{label}</option>
            ))}
          </select>
          <button
            onClick={handleGeneratePreset}
            className="w-full bg-purple-700 hover:bg-purple-600 px-2 py-1 rounded text-xs"
          >
            Regenerate Map
          </button>
          <p className="text-gray-500 mt-1" style={{ fontSize: 10 }}>Uses a random seed each time.</p>
        </div>

        {/* Divider */}
        <hr className="border-gray-700" />

        {/* Danger zone */}
        <div>
          <div className="text-gray-400 mb-1 font-semibold uppercase tracking-wide" style={{ fontSize: 10 }}>Map Actions</div>
          <div className="flex flex-col gap-1">
            <button
              onClick={handleExport}
              className="bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-xs text-left"
            >
              Export JSON
            </button>
            <button
              onClick={handleImport}
              className="bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-xs text-left"
            >
              Import JSON
            </button>
            <button
              onClick={clearEditorMap}
              className="bg-red-900 hover:bg-red-800 px-2 py-1 rounded text-xs text-left"
            >
              Clear Map
            </button>
          </div>
        </div>

        {/* Map info */}
        {map && (
          <div className="text-gray-500" style={{ fontSize: 10 }}>
            {map.width}×{map.height} grid · {map.buildings.length} buildings · {units.length} units
          </div>
        )}
      </div>
    </div>
  );
}
