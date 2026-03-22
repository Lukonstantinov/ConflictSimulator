import { useState, useEffect } from 'react';
import MapCanvas from './components/MapCanvas';
import CountryPanel from './components/CountryPanel';
import { useMapStore } from './store/mapStore';
import { useUIStore } from './store/uiStore';

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

  const [seedInput, setSeedInput] = useState('');
  const [regionCount, setRegionCount] = useState(DEFAULT_REGION_COUNT);
  const [showLoadMenu, setShowLoadMenu] = useState(false);
  const [mapSize, setMapSize] = useState({ w: 800, h: 600 });

  useEffect(() => {
    refreshSavedMapsList();
  }, [refreshSavedMapsList]);

  // Compute responsive map dimensions
  useEffect(() => {
    const updateSize = () => {
      const w = Math.min(window.innerWidth, 1200);
      const h = Math.round(w * (2 / 3)); // 3:2 aspect ratio
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

  return (
    <div className="flex flex-col md:flex-row min-h-[100dvh] bg-gray-900 text-white">
      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <div className="bg-gray-800 px-3 py-2 flex flex-wrap items-center gap-2 border-b border-gray-700">
          <h1 className="font-bold text-sm mr-1">ConflictSimulator</h1>

          <input
            type="number"
            value={seedInput}
            onChange={(e) => setSeedInput(e.target.value)}
            placeholder="Seed (random)"
            className="bg-gray-700 rounded px-2 py-1 text-sm w-28 outline-none focus:ring-1 focus:ring-blue-500"
          />

          <label className="text-xs text-gray-400 flex items-center gap-1">
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

          <button
            onClick={handleGenerate}
            className="bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded text-sm"
          >
            Generate
          </button>

          {map && (
            <>
              <button
                onClick={() => saveCurrentMap()}
                className="bg-green-700 hover:bg-green-600 px-3 py-1 rounded text-sm"
              >
                Save
              </button>

              <div className="relative">
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

          <button
            onClick={toggleCountryPanel}
            className="md:ml-auto bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-sm"
          >
            {showCountryPanel ? 'Hide Panel' : 'Show Panel'}
          </button>
        </div>

        {/* Map Canvas */}
        <div className="relative" style={{ height: mapSize.h, maxWidth: '100%' }}>
          {map ? (
            <MapCanvas />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <p className="text-2xl mb-2">ConflictSimulator</p>
                <p className="text-sm">Generate a map to get started</p>
              </div>
            </div>
          )}

          {/* Region Info Tooltip */}
          {selectedRegion && (
            <div className="absolute bottom-4 left-4 bg-gray-800 bg-opacity-90 rounded px-3 py-2 text-xs">
              <p>Region #{selectedRegion.id}</p>
              <p>Terrain: {selectedRegion.terrain}</p>
              <p>
                Owner:{' '}
                {selectedRegion.countryId
                  ? map?.countries.find((c) => c.id === selectedRegion.countryId)?.name ?? 'Unknown'
                  : 'Unassigned'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Country Panel — below map on mobile, side on desktop */}
      {showCountryPanel && map && <CountryPanel />}
    </div>
  );
}
