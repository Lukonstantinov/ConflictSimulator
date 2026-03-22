import { useState } from 'react';
import { useMapStore } from '../store/mapStore';
import { useSimStore } from '../store/simStore';
import { simulationRunner } from '../engine/worker';
import type { Relation, StrategyType } from '../types';

const STRATEGIES: StrategyType[] = ['aggressive', 'defensive', 'expansionist', 'opportunist', 'turtle'];

export default function GodModePanel() {
  const map = useMapStore((s) => s.map);
  const updateCountry = useMapStore((s) => s.updateCountry);
  const simStatus = useSimStore((s) => s.status);

  const [selectedA, setSelectedA] = useState<string>('');
  const [selectedB, setSelectedB] = useState<string>('');
  const [spawnCountry, setSpawnCountry] = useState<string>('');
  const [spawnSize, setSpawnSize] = useState(30);
  const [modifyCountry, setModifyCountry] = useState<string>('');
  const [modifyTreasury, setModifyTreasury] = useState(0);
  const [modifyArmy, setModifyArmy] = useState(50);
  const [modifyStrategy, setModifyStrategy] = useState<StrategyType>('aggressive');

  if (!map || simStatus === 'setup') return null;

  const aliveCountries = map.countries.filter((c) => c.isAlive);

  const handleForceWar = () => {
    if (!selectedA || !selectedB || selectedA === selectedB) return;
    updateCountry(selectedA, {
      relations: {
        ...map.countries.find((c) => c.id === selectedA)!.relations,
        [selectedB]: 'at_war' as Relation,
      },
    });
    updateCountry(selectedB, {
      relations: {
        ...map.countries.find((c) => c.id === selectedB)!.relations,
        [selectedA]: 'at_war' as Relation,
      },
    });
  };

  const handleForceAlliance = () => {
    if (!selectedA || !selectedB || selectedA === selectedB) return;
    updateCountry(selectedA, {
      relations: {
        ...map.countries.find((c) => c.id === selectedA)!.relations,
        [selectedB]: 'allied' as Relation,
      },
    });
    updateCountry(selectedB, {
      relations: {
        ...map.countries.find((c) => c.id === selectedB)!.relations,
        [selectedA]: 'allied' as Relation,
      },
    });
  };

  const handleForcePeace = () => {
    if (!selectedA || !selectedB || selectedA === selectedB) return;
    updateCountry(selectedA, {
      relations: {
        ...map.countries.find((c) => c.id === selectedA)!.relations,
        [selectedB]: 'neutral' as Relation,
      },
    });
    updateCountry(selectedB, {
      relations: {
        ...map.countries.find((c) => c.id === selectedB)!.relations,
        [selectedA]: 'neutral' as Relation,
      },
    });
  };

  const handleSpawnReinforcements = () => {
    if (!spawnCountry) return;
    const country = map.countries.find((c) => c.id === spawnCountry);
    if (!country || !country.isAlive || country.regions.length === 0) return;

    const spawnRegion = country.regions[Math.floor(Math.random() * country.regions.length)];
    const newArmy = {
      id: `${country.id}-god-${Date.now()}`,
      size: spawnSize,
      position: spawnRegion,
      target: null,
      morale: 1.0,
      progress: 0,
    };

    updateCountry(spawnCountry, {
      activeArmies: [...country.activeArmies, newArmy],
    });
  };

  const handleModifyCountry = () => {
    if (!modifyCountry) return;
    updateCountry(modifyCountry, {
      treasury: modifyTreasury,
      armySize: modifyArmy,
      strategy: modifyStrategy,
    });
  };

  const handleSaveSnapshot = () => {
    const engine = simulationRunner.getEngine();
    if (!engine) return;
    const snapshot = engine.getSnapshot();
    // Store in session storage for what-if branching
    sessionStorage.setItem('sim-snapshot', JSON.stringify(snapshot));
    sessionStorage.setItem('sim-snapshot-tick', String(useSimStore.getState().tick));
  };

  const handleLoadSnapshot = () => {
    const stored = sessionStorage.getItem('sim-snapshot');
    if (!stored) return;
    try {
      const snapshot = JSON.parse(stored);
      simulationRunner.stop();
      simulationRunner.init(snapshot.regions, snapshot.countries, Date.now());

      // Update map store
      for (const region of snapshot.regions) {
        useMapStore.getState().assignRegionToCountry(region.id, region.countryId);
      }
      for (const country of snapshot.countries) {
        updateCountry(country.id, country);
      }

      const tick = parseInt(sessionStorage.getItem('sim-snapshot-tick') ?? '0');
      useSimStore.getState().setTick(tick);
      useSimStore.getState().setStatus('paused');
    } catch {
      // ignore parse errors
    }
  };

  const hasSnapshot = sessionStorage.getItem('sim-snapshot') !== null;

  // Only show interventions when paused
  const canIntervene = simStatus === 'paused';

  return (
    <div className="bg-gray-800 border-t border-gray-700 px-3 py-2">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-xs font-bold text-purple-400 uppercase tracking-wide">God Mode</h3>
        {!canIntervene && simStatus === 'running' && (
          <span className="text-xs text-gray-500">(Pause to intervene)</span>
        )}
      </div>

      {/* What-if branching */}
      <div className="flex gap-1 mb-2">
        <button
          onClick={handleSaveSnapshot}
          className="bg-purple-700 hover:bg-purple-600 px-2 py-0.5 rounded text-xs"
        >
          Save Snapshot
        </button>
        <button
          onClick={handleLoadSnapshot}
          disabled={!hasSnapshot}
          className={`px-2 py-0.5 rounded text-xs ${
            hasSnapshot
              ? 'bg-purple-700 hover:bg-purple-600'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          Load Snapshot
        </button>
      </div>

      {canIntervene && (
        <div className="space-y-2">
          {/* Diplomacy Controls */}
          <div className="bg-gray-750 rounded p-2">
            <p className="text-xs text-gray-400 mb-1">Diplomacy</p>
            <div className="flex gap-1 mb-1">
              <select
                value={selectedA}
                onChange={(e) => setSelectedA(e.target.value)}
                className="flex-1 bg-gray-700 rounded px-1 py-0.5 text-xs text-white"
              >
                <option value="">Country A</option>
                {aliveCountries.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <select
                value={selectedB}
                onChange={(e) => setSelectedB(e.target.value)}
                className="flex-1 bg-gray-700 rounded px-1 py-0.5 text-xs text-white"
              >
                <option value="">Country B</option>
                {aliveCountries.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-1">
              <button onClick={handleForceWar} className="bg-red-700 hover:bg-red-600 px-2 py-0.5 rounded text-xs flex-1">
                War
              </button>
              <button onClick={handleForceAlliance} className="bg-green-700 hover:bg-green-600 px-2 py-0.5 rounded text-xs flex-1">
                Alliance
              </button>
              <button onClick={handleForcePeace} className="bg-blue-700 hover:bg-blue-600 px-2 py-0.5 rounded text-xs flex-1">
                Peace
              </button>
            </div>
          </div>

          {/* Spawn Reinforcements */}
          <div className="bg-gray-750 rounded p-2">
            <p className="text-xs text-gray-400 mb-1">Spawn Reinforcements</p>
            <div className="flex gap-1">
              <select
                value={spawnCountry}
                onChange={(e) => setSpawnCountry(e.target.value)}
                className="flex-1 bg-gray-700 rounded px-1 py-0.5 text-xs text-white"
              >
                <option value="">Select country</option>
                {aliveCountries.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <input
                type="number"
                min={5}
                max={200}
                value={spawnSize}
                onChange={(e) => setSpawnSize(parseInt(e.target.value) || 30)}
                className="w-16 bg-gray-700 rounded px-1 py-0.5 text-xs text-white"
              />
              <button
                onClick={handleSpawnReinforcements}
                className="bg-yellow-700 hover:bg-yellow-600 px-2 py-0.5 rounded text-xs"
              >
                Spawn
              </button>
            </div>
          </div>

          {/* Modify Country */}
          <div className="bg-gray-750 rounded p-2">
            <p className="text-xs text-gray-400 mb-1">Modify Country</p>
            <select
              value={modifyCountry}
              onChange={(e) => {
                setModifyCountry(e.target.value);
                const c = map.countries.find((cc) => cc.id === e.target.value);
                if (c) {
                  setModifyTreasury(Math.floor(c.treasury));
                  setModifyArmy(c.armySize);
                  setModifyStrategy(c.strategy);
                }
              }}
              className="w-full bg-gray-700 rounded px-1 py-0.5 text-xs text-white mb-1"
            >
              <option value="">Select country</option>
              {aliveCountries.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {modifyCountry && (
              <div className="space-y-1">
                <label className="flex items-center gap-1 text-xs text-gray-400">
                  Treasury:
                  <input
                    type="number"
                    value={modifyTreasury}
                    onChange={(e) => setModifyTreasury(parseInt(e.target.value) || 0)}
                    className="flex-1 bg-gray-700 rounded px-1 py-0.5 text-xs text-white"
                  />
                </label>
                <label className="flex items-center gap-1 text-xs text-gray-400">
                  Army stat:
                  <input
                    type="range"
                    min={1}
                    max={100}
                    value={modifyArmy}
                    onChange={(e) => setModifyArmy(parseInt(e.target.value))}
                    className="flex-1 h-1"
                  />
                  <span className="text-white w-6 text-right">{modifyArmy}</span>
                </label>
                <label className="flex items-center gap-1 text-xs text-gray-400">
                  Strategy:
                  <select
                    value={modifyStrategy}
                    onChange={(e) => setModifyStrategy(e.target.value as StrategyType)}
                    className="flex-1 bg-gray-700 rounded px-1 py-0.5 text-xs text-white"
                  >
                    {STRATEGIES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <button
                  onClick={handleModifyCountry}
                  className="bg-indigo-700 hover:bg-indigo-600 px-2 py-0.5 rounded text-xs w-full"
                >
                  Apply Changes
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
