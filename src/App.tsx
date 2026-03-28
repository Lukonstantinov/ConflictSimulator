import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import MapCanvas from './components/MapCanvas';
import CountryPanel from './components/CountryPanel';
import SimControls from './components/SimControls';
import EventLog from './components/EventLog';
import StatsOverlay from './components/StatsOverlay';
import GodModePanel from './components/GodModePanel';
import StatsDashboard from './components/StatsDashboard';
import ScenarioPanel from './components/ScenarioPanel';
import TimelineReplay from './components/TimelineReplay';
import ToastNotifications from './components/ToastNotifications';
import { useMapStore } from './store/mapStore';
import { useUIStore } from './store/uiStore';
import { useSimStore } from './store/simStore';
import { exportMapJSON, importMapJSON, downloadFile, readFileAsText } from './utils/persistence';
import type { VictoryConfig, VictoryCondition } from './types';

const TacticalView = lazy(() => import('./tactical/components/TacticalView'));
import TacticalBattlePrompt from './components/TacticalBattlePrompt';

const DEFAULT_REGION_COUNT = 60;

export default function App() {
  const map = useMapStore((s) => s.map);
  const generateMap = useMapStore((s) => s.generateMap);
  const saveCurrentMap = useMapStore((s) => s.saveCurrentMap);
  const loadSavedMap = useMapStore((s) => s.loadSavedMap);
  const savedMaps = useMapStore((s) => s.savedMaps);
  const refreshSavedMapsList = useMapStore((s) => s.refreshSavedMapsList);
  const deleteSavedMap = useMapStore((s) => s.deleteSavedMap);
  const showCountryPanel = useUIStore((s) => s.showCountryPanel);
  const toggleCountryPanel = useUIStore((s) => s.toggleCountryPanel);
  const selectedRegionId = useUIStore((s) => s.selectedRegionId);
  const gameMode = useUIStore((s) => s.gameMode);
  const setGameMode = useUIStore((s) => s.setGameMode);
  const simStatus = useSimStore((s) => s.status);
  const pendingTacticalBattle = useSimStore((s) => s.pendingTacticalBattle);

  const [seedInput, setSeedInput] = useState('');
  const [regionCount, setRegionCount] = useState(DEFAULT_REGION_COUNT);
  const [showLoadMenu, setShowLoadMenu] = useState(false);
  const [mapSize, setMapSize] = useState({ w: 800, h: 600 });
  const importInputRef = useRef<HTMLInputElement>(null);
  const [victoryConfig, setVictoryConfig] = useState<VictoryConfig>({
    condition: 'conquest',
    economicThreshold: 5000,
    territorialPercent: 75,
  });

  useEffect(() => {
    refreshSavedMapsList();
  }, [refreshSavedMapsList]);

  // Compute responsive map dimensions
  useEffect(() => {
    const updateSize = () => {
      const w = Math.min(window.innerWidth, 1200);
      // On mobile, cap map height to leave room for controls
      const isMobile = window.innerWidth < 768;
      const maxH = isMobile
        ? Math.round(window.innerHeight * 0.55) // Leave room for toolbars + event log
        : Math.round(w * (2 / 3)); // 3:2 aspect ratio on desktop
      const h = Math.min(Math.round(w * (2 / 3)), maxH);
      setMapSize({ w, h });
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const handleGenerate = () => {
    const seed = seedInput ? parseInt(seedInput) : undefined;
    generateMap(mapSize.w, mapSize.h, regionCount, seed);
  };

  const selectedRegion = map?.regions.find((r) => r.id === selectedRegionId);

  const handleExport = () => {
    if (!map) return;
    const json = exportMapJSON(map);
    downloadFile(json, `${map.name}.json`);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await readFileAsText(file);
    const imported = importMapJSON(text);
    if (imported) {
      useMapStore.setState({ map: imported });
    }
    // Reset input so same file can be re-imported
    if (importInputRef.current) importInputRef.current.value = '';
  };

  if (gameMode === 'tactical') {
    return (
      <div className="flex flex-col h-[100dvh] bg-gray-900 text-white overflow-hidden">
        <div className="bg-gray-800 px-2 py-1.5 md:px-3 md:py-2 flex items-center gap-2 border-b border-gray-700 flex-shrink-0">
          <h1 className="font-bold text-xs md:text-sm mr-1">ConflictSimulator</h1>
          <div className="flex gap-1">
            <button
              onClick={() => setGameMode('strategic')}
              className="bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-xs"
            >
              Strategic
            </button>
            <button
              className="bg-blue-600 px-2 py-1 rounded text-xs"
            >
              Tactical
            </button>
          </div>
        </div>
        <Suspense fallback={<div className="flex-1 flex items-center justify-center text-gray-500">Loading tactical mode...</div>}>
          <div className="flex-1 flex flex-col min-h-0">
            <TacticalView />
          </div>
        </Suspense>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row min-h-[100dvh] bg-gray-900 text-white">
      {/* Tactical Battle Prompt */}
      {pendingTacticalBattle && <TacticalBattlePrompt />}

      {/* Toast Notifications */}
      <ToastNotifications />

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <div className="bg-gray-800 px-2 py-1.5 md:px-3 md:py-2 flex flex-wrap items-center gap-1.5 md:gap-2 border-b border-gray-700">
          <h1 className="font-bold text-xs md:text-sm mr-1">ConflictSimulator</h1>
          <div className="flex gap-1">
            <button
              className="bg-blue-600 px-2 py-1 rounded text-xs"
            >
              Strategic
            </button>
            <button
              onClick={() => setGameMode('tactical')}
              className="bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-xs"
            >
              Tactical
            </button>
          </div>

          {/* Scenario Selector — visible on all devices */}
          <ScenarioPanel mapSize={mapSize} onVictoryConfigChange={setVictoryConfig} />

          <button
            onClick={handleGenerate}
            className="bg-blue-600 hover:bg-blue-500 px-2 py-1 rounded text-xs md:text-sm"
          >
            Generate
          </button>

          {/* Map gen inputs — hidden on small screens, shown on md+ */}
          <input
            type="number"
            value={seedInput}
            onChange={(e) => setSeedInput(e.target.value)}
            placeholder="Seed"
            className="hidden md:block bg-gray-700 rounded px-2 py-1 text-sm w-24 outline-none focus:ring-1 focus:ring-blue-500"
          />

          <label className="hidden md:flex text-xs text-gray-400 items-center gap-1">
            Regions:
            <input
              type="number"
              min={10}
              max={200}
              value={regionCount}
              onChange={(e) => setRegionCount(parseInt(e.target.value) || DEFAULT_REGION_COUNT)}
              className="bg-gray-700 rounded px-2 py-1 text-sm w-16 outline-none focus:ring-1 focus:ring-blue-500"
            />
          </label>

          {map && (
            <>
              <button
                onClick={() => saveCurrentMap()}
                className="hidden md:block bg-green-700 hover:bg-green-600 px-3 py-1 rounded text-sm"
              >
                Save
              </button>

              <div className="relative hidden md:block">
                <button
                  onClick={() => {
                    setShowLoadMenu(!showLoadMenu);
                    refreshSavedMapsList();
                  }}
                  className="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-sm"
                >
                  Load
                </button>
                {showLoadMenu && (
                  <div className="absolute top-8 left-0 bg-gray-700 rounded shadow-lg z-50 min-w-48">
                    {savedMaps.length === 0 ? (
                      <p className="text-xs text-gray-400 p-3">No saved maps</p>
                    ) : (
                      savedMaps.map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center justify-between px-3 py-2 hover:bg-gray-600 cursor-pointer text-sm"
                        >
                          <span
                            onClick={() => {
                              loadSavedMap(m.id);
                              setShowLoadMenu(false);
                            }}
                            className="flex-1"
                          >
                            {m.name}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteSavedMap(m.id);
                            }}
                            className="text-red-400 hover:text-red-300 text-xs ml-2"
                          >
                            x
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {map && (
            <>
              <button
                onClick={handleExport}
                className="hidden md:block bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-sm"
              >
                Export
              </button>
              <button
                onClick={() => importInputRef.current?.click()}
                className="hidden md:block bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-sm"
              >
                Import
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept=".json"
                onChange={handleImport}
                className="hidden"
              />
            </>
          )}

          <button
            onClick={toggleCountryPanel}
            className="md:ml-auto bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-xs md:text-sm"
          >
            {showCountryPanel ? 'Hide' : 'Panel'}
          </button>
        </div>

        {/* Simulation Controls */}
        {map && (
          <div className="bg-gray-800 px-3 py-2 border-b border-gray-700">
            <SimControls
              victoryConfig={victoryConfig}
              onVictoryConfigChange={setVictoryConfig}
            />
          </div>
        )}

        {/* Map Canvas */}
        <div className="relative" style={{ height: mapSize.h, maxWidth: '100%' }}>
          {map ? (
            <MapCanvas />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <p className="text-2xl mb-2">ConflictSimulator</p>
                <p className="text-sm">Generate a map or choose a scenario to get started</p>
              </div>
            </div>
          )}

          {/* Region Info Tooltip */}
          {selectedRegion && (
            <div className="absolute bottom-4 left-4 bg-gray-800 bg-opacity-90 rounded px-3 py-2 text-xs">
              <p>Region #{selectedRegion.id}</p>
              <p>Terrain: {selectedRegion.terrain}</p>
              <p>Population: {Math.floor(selectedRegion.population)}</p>
              {selectedRegion.fortification > 0 && (
                <p>Fortification: {'★'.repeat(selectedRegion.fortification)}</p>
              )}
              <p>
                Owner:{' '}
                {selectedRegion.countryId
                  ? map?.countries.find((c) => c.id === selectedRegion.countryId)?.name ?? 'Unknown'
                  : 'Unassigned'}
              </p>
            </div>
          )}

          {/* Live Stats Overlay */}
          <StatsOverlay />
        </div>

        {/* God Mode Panel */}
        <GodModePanel />

        {/* Event Log */}
        <EventLog />

        {/* Timeline Replay */}
        <TimelineReplay />

        {/* Post-War Statistics */}
        <StatsDashboard />
      </div>

      {/* Country Panel — below map on mobile, side on desktop */}
      {showCountryPanel && map && <CountryPanel />}
    </div>
  );
}
