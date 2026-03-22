import { useState } from 'react';
import { useMapStore } from '../store/mapStore';
import { useUIStore } from '../store/uiStore';
import { useSimStore } from '../store/simStore';
import type { StrategyType } from '../types';
import { generateCountryName } from '../utils/names';

const STRATEGIES: StrategyType[] = ['aggressive', 'defensive', 'expansionist', 'opportunist', 'turtle'];

export default function CountryPanel() {
  const map = useMapStore((s) => s.map);
  const addCountry = useMapStore((s) => s.addCountry);
  const removeCountry = useMapStore((s) => s.removeCountry);
  const updateCountry = useMapStore((s) => s.updateCountry);
  const selectedCountryId = useUIStore((s) => s.selectedCountryId);
  const selectCountry = useUIStore((s) => s.selectCountry);
  const toolMode = useUIStore((s) => s.toolMode);
  const setToolMode = useUIStore((s) => s.setToolMode);
  const simStatus = useSimStore((s) => s.status);
  const [newName, setNewName] = useState('');

  const isSimRunning = simStatus !== 'setup';

  if (!map) return null;

  const handleAdd = () => {
    const name = newName.trim() || generateCountryName(map.countries.length, map.seed);
    addCountry(name);
    setNewName('');
  };

  return (
    <div className="w-full md:w-72 bg-gray-800 text-white p-4 overflow-y-auto flex flex-col gap-3 md:h-[100dvh]">
      <h2 className="text-lg font-bold border-b border-gray-600 pb-2">Countries</h2>

      {/* Tool Mode Toggle */}
      {!isSimRunning && (
        <div className="flex gap-2">
          <button
            onClick={() => setToolMode('view')}
            className={`flex-1 px-2 py-1 rounded text-sm ${
              toolMode === 'view' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            View
          </button>
          <button
            onClick={() => setToolMode('assign')}
            className={`flex-1 px-2 py-1 rounded text-sm ${
              toolMode === 'assign' ? 'bg-green-600' : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            Assign Regions
          </button>
        </div>
      )}

      {toolMode === 'assign' && selectedCountryId && (
        <p className="text-xs text-green-400">
          Click regions on map to assign to selected country
        </p>
      )}

      {/* Add Country */}
      {!isSimRunning && (
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Country name..."
            className="flex-1 bg-gray-700 rounded px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-blue-500"
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <button
            onClick={handleAdd}
            className="bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded text-sm"
          >
            Add
          </button>
        </div>
      )}

      {/* Country List */}
      {map.countries.map((country) => (
        <div
          key={country.id}
          onClick={() => selectCountry(country.id)}
          className={`p-3 rounded cursor-pointer transition ${
            selectedCountryId === country.id
              ? 'bg-gray-600 ring-1 ring-blue-400'
              : 'bg-gray-700 hover:bg-gray-650'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded"
                style={{ backgroundColor: country.color }}
              />
              <span className="font-medium text-sm">{country.name}</span>
            </div>
            {!isSimRunning && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeCountry(country.id);
                  if (selectedCountryId === country.id) selectCountry(null);
                }}
                className="text-red-400 hover:text-red-300 text-xs"
              >
                Remove
              </button>
            )}
          </div>

          <div className="text-xs text-gray-400 mb-1">
            Regions: {country.regions.length}
            {isSimRunning && (
              <>
                {' | '}Treasury: {Math.floor(country.treasury)}
                {' | '}Armies: {country.activeArmies.length}
                {!country.isAlive && (
                  <span className="text-red-500 font-bold ml-1">ELIMINATED</span>
                )}
              </>
            )}
          </div>

          {/* Army Size */}
          <label className="block text-xs text-gray-400 mt-1">
            Army: {country.armySize}
            <input
              type="range"
              min={1}
              max={100}
              value={country.armySize}
              onChange={(e) =>
                updateCountry(country.id, { armySize: parseInt(e.target.value) })
              }
              onClick={(e) => e.stopPropagation()}
              disabled={isSimRunning}
              className="w-full h-1 mt-1"
            />
          </label>

          {/* Economy */}
          <label className="block text-xs text-gray-400 mt-1">
            Economy: {country.economy}
            <input
              type="range"
              min={1}
              max={100}
              value={country.economy}
              onChange={(e) =>
                updateCountry(country.id, { economy: parseInt(e.target.value) })
              }
              onClick={(e) => e.stopPropagation()}
              disabled={isSimRunning}
              className="w-full h-1 mt-1"
            />
          </label>

          {/* Strategy */}
          <label className="block text-xs text-gray-400 mt-1">
            Strategy:
            <select
              value={country.strategy}
              onChange={(e) =>
                updateCountry(country.id, { strategy: e.target.value as StrategyType })
              }
              onClick={(e) => e.stopPropagation()}
              disabled={isSimRunning}
              className="w-full bg-gray-600 rounded px-1 py-0.5 mt-1 text-white text-xs"
            >
              {STRATEGIES.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </label>
        </div>
      ))}

      {map.countries.length === 0 && (
        <p className="text-gray-500 text-sm text-center py-4">
          No countries yet. Add one above.
        </p>
      )}
    </div>
  );
}
