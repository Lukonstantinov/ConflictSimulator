import { useState, useMemo } from 'react';
import { useSimStore } from '../store/simStore';
import { useMapStore } from '../store/mapStore';

export default function TimelineReplay() {
  const status = useSimStore((s) => s.status);
  const history = useSimStore((s) => s.history);
  const territoryHistory = useSimStore((s) => s.territoryHistory);
  const map = useMapStore((s) => s.map);
  const assignRegionToCountry = useMapStore((s) => s.assignRegionToCountry);
  const updateCountry = useMapStore((s) => s.updateCountry);

  const [replayTick, setReplayTick] = useState(0);
  const [isReplaying, setIsReplaying] = useState(false);

  const maxTick = history.length;

  const countries = useMemo(() => map?.countries ?? [], [map]);

  // Build cumulative territory state for the territory mini-chart
  const territoryAtTick = useMemo(() => {
    if (!isReplaying || territoryHistory.length === 0) return null;
    const tick = Math.min(replayTick, territoryHistory.length - 1);
    return territoryHistory[tick] ?? {};
  }, [isReplaying, replayTick, territoryHistory]);

  const handleStartReplay = () => {
    setIsReplaying(true);
    setReplayTick(0);
  };

  const handleStopReplay = () => {
    setIsReplaying(false);
    // Restore to final state
    if (history.length > 0) {
      applyStateAtTick(history.length);
    }
  };

  const handleTickChange = (newTick: number) => {
    setReplayTick(newTick);
    applyStateAtTick(newTick);
  };

  const applyStateAtTick = (targetTick: number) => {
    if (!map || history.length === 0) return;

    // Replay all deltas from the beginning up to targetTick
    // First, get the initial region/country states from history
    // We need to reconstruct state by replaying deltas
    const clampedTick = Math.min(targetTick, history.length);

    // Apply all region changes up to the target tick
    // Build a map of regionId -> countryId from all deltas up to targetTick
    const regionOwnership: Record<number, string | null> = {};
    // Initialize with null for all regions
    for (const r of map.regions) {
      regionOwnership[r.id] = null;
    }

    for (let i = 0; i < clampedTick; i++) {
      const delta = history[i];
      for (const rc of delta.regionChanges) {
        regionOwnership[rc.regionId] = rc.countryId;
      }
    }

    // Apply region ownership to map
    for (const [regionId, countryId] of Object.entries(regionOwnership)) {
      const currentRegion = map.regions.find((r) => r.id === parseInt(regionId));
      if (currentRegion && currentRegion.countryId !== countryId) {
        assignRegionToCountry(parseInt(regionId), countryId);
      }
    }

    // Apply the latest country updates from the target tick
    if (clampedTick > 0) {
      const latestDelta = history[clampedTick - 1];
      for (const cu of latestDelta.countryUpdates) {
        updateCountry(cu.id, cu);
      }
    }
  };

  // Events at current replay tick
  const eventsAtTick = useMemo(() => {
    if (!isReplaying || replayTick <= 0 || replayTick > history.length) return [];
    return history[replayTick - 1]?.events ?? [];
  }, [isReplaying, replayTick, history]);

  if (status !== 'finished' || history.length === 0) return null;

  return (
    <div className="bg-gray-800 border-t border-gray-700 px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wide">Timeline Replay</h3>
        {!isReplaying ? (
          <button
            onClick={handleStartReplay}
            className="bg-cyan-700 hover:bg-cyan-600 px-3 py-1 rounded text-xs"
          >
            Start Replay
          </button>
        ) : (
          <button
            onClick={handleStopReplay}
            className="bg-gray-600 hover:bg-gray-500 px-3 py-1 rounded text-xs"
          >
            Exit Replay
          </button>
        )}
      </div>

      {isReplaying && (
        <div className="space-y-2">
          {/* Scrubber */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400 w-16">Tick {replayTick}</span>
            <input
              type="range"
              min={0}
              max={maxTick}
              value={replayTick}
              onChange={(e) => handleTickChange(parseInt(e.target.value))}
              className="flex-1 h-1.5 accent-cyan-500"
            />
            <span className="text-xs text-gray-500 w-12 text-right">/ {maxTick}</span>
          </div>

          {/* Step controls */}
          <div className="flex gap-1">
            <button
              onClick={() => handleTickChange(0)}
              className="bg-gray-700 hover:bg-gray-600 px-2 py-0.5 rounded text-xs"
            >
              ⏮
            </button>
            <button
              onClick={() => handleTickChange(Math.max(0, replayTick - 10))}
              className="bg-gray-700 hover:bg-gray-600 px-2 py-0.5 rounded text-xs"
            >
              ⏪ -10
            </button>
            <button
              onClick={() => handleTickChange(Math.max(0, replayTick - 1))}
              className="bg-gray-700 hover:bg-gray-600 px-2 py-0.5 rounded text-xs"
            >
              ◀ -1
            </button>
            <button
              onClick={() => handleTickChange(Math.min(maxTick, replayTick + 1))}
              className="bg-gray-700 hover:bg-gray-600 px-2 py-0.5 rounded text-xs"
            >
              +1 ▶
            </button>
            <button
              onClick={() => handleTickChange(Math.min(maxTick, replayTick + 10))}
              className="bg-gray-700 hover:bg-gray-600 px-2 py-0.5 rounded text-xs"
            >
              +10 ⏩
            </button>
            <button
              onClick={() => handleTickChange(maxTick)}
              className="bg-gray-700 hover:bg-gray-600 px-2 py-0.5 rounded text-xs"
            >
              ⏭
            </button>
          </div>

          {/* Territory snapshot at tick */}
          {territoryAtTick && (
            <div className="flex gap-2 flex-wrap">
              {countries
                .filter((c) => (territoryAtTick[c.id] ?? 0) > 0)
                .sort((a, b) => (territoryAtTick[b.id] ?? 0) - (territoryAtTick[a.id] ?? 0))
                .map((c) => (
                  <div key={c.id} className="flex items-center gap-1 text-xs">
                    <div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: c.color }} />
                    <span className="text-gray-300">{c.name}: {territoryAtTick[c.id] ?? 0}</span>
                  </div>
                ))}
            </div>
          )}

          {/* Events at this tick */}
          {eventsAtTick.length > 0 && (
            <div className="bg-gray-750 rounded p-2 max-h-20 overflow-y-auto">
              {eventsAtTick.map((evt, i) => (
                <div key={i} className="text-xs text-gray-300">
                  <span className="text-gray-500 mr-1">[{evt.type}]</span>
                  {JSON.stringify(evt.details)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
