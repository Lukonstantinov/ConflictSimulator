import { useSimStore } from '../store/simStore';
import { useMapStore } from '../store/mapStore';
import { simulationRunner } from '../engine/worker';
import type { VictoryConfig, VictoryCondition } from '../types';

const SPEED_OPTIONS = [0.5, 1, 2, 5, 10];

interface SimControlsProps {
  victoryConfig: VictoryConfig;
  onVictoryConfigChange: (config: VictoryConfig) => void;
}

export default function SimControls({ victoryConfig, onVictoryConfigChange }: SimControlsProps) {
  const status = useSimStore((s) => s.status);
  const speed = useSimStore((s) => s.speed);
  const tick = useSimStore((s) => s.tick);
  const winner = useSimStore((s) => s.winner);
  const setStatus = useSimStore((s) => s.setStatus);
  const setSpeed = useSimStore((s) => s.setSpeed);
  const setTick = useSimStore((s) => s.setTick);
  const setWinner = useSimStore((s) => s.setWinner);
  const addEvent = useSimStore((s) => s.addEvent);
  const recordDelta = useSimStore((s) => s.recordDelta);
  const recordTerritory = useSimStore((s) => s.recordTerritory);
  const setBorderFronts = useSimStore((s) => s.setBorderFronts);
  const setTradeRoutes = useSimStore((s) => s.setTradeRoutes);
  const reset = useSimStore((s) => s.reset);

  const map = useMapStore((s) => s.map);
  const updateCountry = useMapStore((s) => s.updateCountry);
  const assignRegionToCountry = useMapStore((s) => s.assignRegionToCountry);

  const countries = map?.countries ?? [];
  const winnerCountry = winner ? countries.find((c) => c.id === winner) : null;

  const canStart = map && countries.length >= 2 && countries.some((c) => c.regions.length > 0);

  const handleStart = () => {
    if (!map || !canStart) return;

    reset();
    simulationRunner.init(map.regions, map.countries, map.seed, victoryConfig);

    simulationRunner.setOnTick((delta) => {
      setTick(delta.tick);

      // Apply region changes to map store
      for (const rc of delta.regionChanges) {
        assignRegionToCountry(rc.regionId, rc.countryId);
      }

      // Apply country updates
      for (const cu of delta.countryUpdates) {
        updateCountry(cu.id, cu);
      }

      // Add events
      for (const evt of delta.events) {
        addEvent(evt);
      }

      // Update border fronts and trade routes
      setBorderFronts(delta.borderFronts);
      setTradeRoutes(delta.tradeRoutes);

      // Record for replay & stats
      recordDelta(delta);
      const terrCounts: Record<string, number> = {};
      for (const cu of delta.countryUpdates) {
        if (cu.regions) terrCounts[cu.id] = cu.regions.length;
      }
      recordTerritory(terrCounts);

      // Handle eliminations
      for (const elimId of delta.eliminatedCountries) {
        updateCountry(elimId, { isAlive: false, activeArmies: [] });
      }
    });

    simulationRunner.setOnFinished((winnerId) => {
      setWinner(winnerId);
      setStatus('finished');
    });

    simulationRunner.setSpeed(speed);
    simulationRunner.start();
    setStatus('running');
  };

  const handlePause = () => {
    simulationRunner.pause();
    setStatus('paused');
  };

  const handleResume = () => {
    simulationRunner.resume();
    setStatus('running');
  };

  const handleStop = () => {
    simulationRunner.stop();
    reset();
  };

  const handleSpeedChange = (newSpeed: number) => {
    setSpeed(newSpeed);
    simulationRunner.setSpeed(newSpeed);
  };

  const victoryLabel: Record<VictoryCondition, string> = {
    conquest: 'Conquest',
    economic: 'Economic',
    territorial: 'Territorial',
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Victory Condition Selector (only in setup) */}
      {status === 'setup' && (
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-400">Victory:</span>
          {(['conquest', 'economic', 'territorial'] as VictoryCondition[]).map((vc) => (
            <button
              key={vc}
              onClick={() => onVictoryConfigChange({ ...victoryConfig, condition: vc })}
              className={`px-2 py-0.5 rounded text-xs ${
                victoryConfig.condition === vc
                  ? 'bg-cyan-600 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`}
            >
              {victoryLabel[vc]}
            </button>
          ))}
        </div>
      )}

      {status === 'setup' && (
        <button
          onClick={handleStart}
          disabled={!canStart}
          className={`px-3 py-1 rounded text-sm font-medium ${
            canStart
              ? 'bg-red-600 hover:bg-red-500 text-white'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          Start War
        </button>
      )}

      {status === 'running' && (
        <button
          onClick={handlePause}
          className="bg-yellow-600 hover:bg-yellow-500 px-3 py-1 rounded text-sm"
        >
          Pause
        </button>
      )}

      {status === 'paused' && (
        <button
          onClick={handleResume}
          className="bg-green-600 hover:bg-green-500 px-3 py-1 rounded text-sm"
        >
          Resume
        </button>
      )}

      {(status === 'running' || status === 'paused' || status === 'finished') && (
        <button
          onClick={handleStop}
          className="bg-gray-600 hover:bg-gray-500 px-3 py-1 rounded text-sm"
        >
          Stop
        </button>
      )}

      {/* Speed Control */}
      {status !== 'setup' && (
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-400">Speed:</span>
          {SPEED_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => handleSpeedChange(s)}
              className={`px-2 py-0.5 rounded text-xs ${
                speed === s ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      )}

      {/* Tick counter & victory condition */}
      {status !== 'setup' && (
        <span className="text-xs text-gray-400 ml-1">
          Tick: {tick}
          <span className="text-gray-600 ml-1">({victoryLabel[victoryConfig.condition]})</span>
        </span>
      )}

      {/* Winner */}
      {status === 'finished' && winnerCountry && (
        <span className="text-sm font-bold text-yellow-400 ml-2">
          {winnerCountry.name} wins! ({victoryLabel[victoryConfig.condition]})
        </span>
      )}
    </div>
  );
}
