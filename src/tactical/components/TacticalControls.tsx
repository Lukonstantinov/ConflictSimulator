import { useTacticalStore } from '../store/tacticalStore';

interface Props {
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onSpeedChange: (speed: number) => void;
  onFactionChange: (faction: 'attacker' | 'defender') => void;
  onScenarioChange?: (scenarioIndex: number) => void;
  scenarioIndex?: number;
  smokeMode?: boolean;
  onToggleSmokeMode?: () => void;
}

export default function TacticalControls({
  onStart, onPause, onResume, onStop, onSpeedChange, onFactionChange,
  onScenarioChange, scenarioIndex = 0,
  smokeMode, onToggleSmokeMode,
}: Props) {
  const status = useTacticalStore((s) => s.status);
  const speed = useTacticalStore((s) => s.speed);
  const playerFaction = useTacticalStore((s) => s.playerFaction);
  const units = useTacticalStore((s) => s.units);
  const selectedUnitIds = useTacticalStore((s) => s.selectedUnitIds);
  const editorMode = useTacticalStore((s) => s.editorMode);
  const setEditorMode = useTacticalStore((s) => s.setEditorMode);

  const selectedUnits = units.filter((u) => selectedUnitIds.includes(u.id));
  const hasSmokeCharges = selectedUnits.some((u) => u.smokeCharges > 0);

  const scenarioNames = ['Village Assault', 'Urban Defense', 'Forest Ambush', 'Factory Assault', 'Coastal Landing'];

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Scenario selector (only in setup) */}
      {status === 'setup' && onScenarioChange && (
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-400">Scenario:</span>
          <select
            value={scenarioIndex}
            onChange={(e) => onScenarioChange(Number(e.target.value))}
            className="bg-gray-700 text-white text-xs rounded px-2 py-1"
          >
            {scenarioNames.map((name, i) => (
              <option key={i} value={i}>{name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Faction selector (only in setup) */}
      {status === 'setup' && (
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-400">Play as:</span>
          <button
            onClick={() => onFactionChange('attacker')}
            className={`px-2 py-1 rounded text-xs ${
              playerFaction === 'attacker'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300'
            }`}
          >
            Attacker
          </button>
          <button
            onClick={() => onFactionChange('defender')}
            className={`px-2 py-1 rounded text-xs ${
              playerFaction === 'defender'
                ? 'bg-red-600 text-white'
                : 'bg-gray-700 text-gray-300'
            }`}
          >
            Defender
          </button>
        </div>
      )}

      {/* Edit Map button (setup only) */}
      {status === 'setup' && (
        <button
          onClick={() => setEditorMode(!editorMode)}
          className={`px-2 py-1 rounded text-xs ${
            editorMode ? 'bg-orange-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
          title="Open map editor to paint terrain, place units, and generate presets"
        >
          {editorMode ? 'Editing...' : 'Edit Map'}
        </button>
      )}

      {/* Play controls */}
      {status === 'setup' && (
        <button
          onClick={onStart}
          className="bg-green-600 hover:bg-green-500 px-3 py-1 rounded text-sm"
        >
          Start
        </button>
      )}

      {status === 'running' && (
        <button
          onClick={onPause}
          className="bg-yellow-600 hover:bg-yellow-500 px-3 py-1 rounded text-sm"
        >
          Pause
        </button>
      )}

      {status === 'paused' && (
        <button
          onClick={onResume}
          className="bg-green-600 hover:bg-green-500 px-3 py-1 rounded text-sm"
        >
          Resume
        </button>
      )}

      {(status === 'running' || status === 'paused') && (
        <button
          onClick={onStop}
          className="bg-red-700 hover:bg-red-600 px-3 py-1 rounded text-sm"
        >
          Stop
        </button>
      )}

      {(status === 'victory' || status === 'defeat') && (
        <button
          onClick={onStop}
          className="bg-gray-600 hover:bg-gray-500 px-3 py-1 rounded text-sm"
        >
          New Game
        </button>
      )}

      {/* Speed controls */}
      {(status === 'running' || status === 'paused') && (
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-400">Speed:</span>
          {[0.5, 1, 2, 3].map((s) => (
            <button
              key={s}
              onClick={() => onSpeedChange(s)}
              className={`px-2 py-1 rounded text-xs ${
                speed === s ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      )}

      {/* Smoke ability button */}
      {(status === 'running' || status === 'paused') && hasSmokeCharges && onToggleSmokeMode && (
        <button
          onClick={onToggleSmokeMode}
          className={`px-2 py-1 rounded text-xs ${
            smokeMode ? 'bg-gray-400 text-gray-900' : 'bg-gray-700 hover:bg-gray-600'
          }`}
          title="Deploy smoke grenade (click tile to place)"
        >
          Smoke
        </button>
      )}
    </div>
  );
}
