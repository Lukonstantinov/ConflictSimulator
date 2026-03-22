import { useTacticalStore } from '../store/tacticalStore';

interface Props {
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onSpeedChange: (speed: number) => void;
  onFactionChange: (faction: 'attacker' | 'defender') => void;
}

export default function TacticalControls({
  onStart, onPause, onResume, onStop, onSpeedChange, onFactionChange,
}: Props) {
  const status = useTacticalStore((s) => s.status);
  const speed = useTacticalStore((s) => s.speed);
  const playerFaction = useTacticalStore((s) => s.playerFaction);

  return (
    <div className="flex items-center gap-2 flex-wrap">
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
    </div>
  );
}
