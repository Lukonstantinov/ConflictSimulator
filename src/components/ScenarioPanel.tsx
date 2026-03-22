import { useState } from 'react';
import { useMapStore } from '../store/mapStore';
import { useSimStore } from '../store/simStore';
import { SCENARIOS } from '../utils/scenarios';
import type { VictoryCondition } from '../types';

interface ScenarioPanelProps {
  mapSize: { w: number; h: number };
  onVictoryConfigChange: (config: { condition: VictoryCondition; economicThreshold: number; territorialPercent: number }) => void;
}

export default function ScenarioPanel({ mapSize, onVictoryConfigChange }: ScenarioPanelProps) {
  const generateMap = useMapStore((s) => s.generateMap);
  const addCountry = useMapStore((s) => s.addCountry);
  const updateCountry = useMapStore((s) => s.updateCountry);
  const simStatus = useSimStore((s) => s.status);
  const [showScenarios, setShowScenarios] = useState(false);

  if (simStatus !== 'setup') return null;

  const handleLoadScenario = (scenarioId: string) => {
    const scenario = SCENARIOS.find((s) => s.id === scenarioId);
    if (!scenario) return;

    // Generate map
    const seed = Math.floor(Math.random() * 999999);
    generateMap(mapSize.w, mapSize.h, scenario.regionCount, seed);

    // Need to add countries after a microtask so the map is ready
    setTimeout(() => {
      const map = useMapStore.getState().map;
      if (!map) return;

      // Add countries
      for (const countryDef of scenario.countries) {
        addCountry(countryDef.name);
      }

      // Wait for countries to be added then configure them
      setTimeout(() => {
        const updatedMap = useMapStore.getState().map;
        if (!updatedMap) return;

        // Configure countries
        for (let i = 0; i < scenario.countries.length; i++) {
          const countryDef = scenario.countries[i];
          const country = updatedMap.countries[i];
          if (!country) continue;

          updateCountry(country.id, {
            strategy: countryDef.strategy,
            armySize: countryDef.armySize,
            economy: countryDef.economy,
          });
        }

        // Auto-assign regions to countries evenly
        if (scenario.autoAssign) {
          const finalMap = useMapStore.getState().map;
          if (!finalMap) return;

          const landRegions = finalMap.regions.filter((r) => r.terrain !== 'ocean');
          const countryCount = finalMap.countries.length;
          if (countryCount === 0) return;

          const regionsPerCountry = Math.floor(landRegions.length / countryCount);

          // Shuffle regions for random assignment
          const shuffled = [...landRegions].sort(() => Math.random() - 0.5);

          for (let i = 0; i < countryCount; i++) {
            const country = finalMap.countries[i];
            const start = i * regionsPerCountry;
            const end = i === countryCount - 1 ? shuffled.length : start + regionsPerCountry;

            for (let j = start; j < end; j++) {
              useMapStore.getState().assignRegionToCountry(shuffled[j].id, country.id);
            }
          }
        }

        // Set victory config
        onVictoryConfigChange({
          condition: scenario.victoryCondition,
          economicThreshold: 5000,
          territorialPercent: 75,
        });
      }, 0);
    }, 0);

    setShowScenarios(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowScenarios(!showScenarios)}
        className="bg-purple-700 hover:bg-purple-600 px-3 py-1 rounded text-sm"
      >
        Scenarios
      </button>

      {showScenarios && (
        <div className="absolute top-8 left-0 bg-gray-800 rounded-lg shadow-xl z-50 w-80 border border-gray-600 max-h-96 overflow-y-auto">
          <div className="p-3 border-b border-gray-700">
            <h3 className="text-sm font-bold text-purple-400">Choose a Scenario</h3>
          </div>
          {SCENARIOS.map((scenario) => (
            <div
              key={scenario.id}
              onClick={() => handleLoadScenario(scenario.id)}
              className="px-3 py-3 hover:bg-gray-700 cursor-pointer border-b border-gray-700/50 last:border-b-0"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-white">{scenario.name}</span>
                <span className="text-xs text-gray-500">
                  {scenario.countries.length} nations
                </span>
              </div>
              <p className="text-xs text-gray-400">{scenario.description}</p>
              <div className="flex gap-2 mt-1">
                <span className="text-xs text-purple-400">{scenario.regionCount} regions</span>
                <span className="text-xs text-cyan-400">{scenario.victoryCondition}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
