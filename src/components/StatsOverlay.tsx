import { useMapStore } from '../store/mapStore';
import { useUIStore } from '../store/uiStore';
import { useSimStore } from '../store/simStore';

export default function StatsOverlay() {
  const map = useMapStore((s) => s.map);
  const selectedCountryId = useUIStore((s) => s.selectedCountryId);
  const simStatus = useSimStore((s) => s.status);

  if (!map || simStatus === 'setup' || !selectedCountryId) return null;

  const country = map.countries.find((c) => c.id === selectedCountryId);
  if (!country) return null;

  const totalLand = map.regions.filter((r) => r.terrain !== 'ocean').length;
  const territoryPct = totalLand > 0 ? ((country.regions.length / totalLand) * 100).toFixed(1) : '0';

  const totalArmyStrength = country.activeArmies.reduce((sum, a) => sum + a.size, 0);
  const avgMorale = country.activeArmies.length > 0
    ? (country.activeArmies.reduce((sum, a) => sum + a.morale, 0) / country.activeArmies.length).toFixed(2)
    : 'N/A';

  const warsAgainst = Object.entries(country.relations)
    .filter(([, rel]) => rel === 'at_war')
    .map(([id]) => map.countries.find((c) => c.id === id)?.name ?? 'Unknown');

  const allies = Object.entries(country.relations)
    .filter(([, rel]) => rel === 'allied')
    .map(([id]) => map.countries.find((c) => c.id === id)?.name ?? 'Unknown');

  // Terrain breakdown
  const terrainCounts: Record<string, number> = {};
  for (const rId of country.regions) {
    const region = map.regions.find((r) => r.id === rId);
    if (region) {
      terrainCounts[region.terrain] = (terrainCounts[region.terrain] || 0) + 1;
    }
  }

  return (
    <div className="absolute top-4 right-4 bg-gray-800 bg-opacity-95 rounded-lg p-4 text-white text-xs w-56 z-50 shadow-lg border border-gray-600">
      <div className="flex items-center gap-2 mb-3 border-b border-gray-600 pb-2">
        <div
          className="w-4 h-4 rounded"
          style={{ backgroundColor: country.color }}
        />
        <span className="font-bold text-sm">{country.name}</span>
        {!country.isAlive && (
          <span className="text-red-500 font-bold text-xs">ELIMINATED</span>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between">
          <span className="text-gray-400">Territory:</span>
          <span>{country.regions.length} regions ({territoryPct}%)</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Treasury:</span>
          <span>{Math.floor(country.treasury)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Armies:</span>
          <span>{country.activeArmies.length}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Total strength:</span>
          <span>{totalArmyStrength}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Avg morale:</span>
          <span>{avgMorale}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Strategy:</span>
          <span className="capitalize">{country.strategy}</span>
        </div>

        {Object.keys(terrainCounts).length > 0 && (
          <div className="border-t border-gray-700 pt-1.5 mt-1.5">
            <span className="text-gray-400">Terrain:</span>
            <div className="ml-2 mt-0.5">
              {Object.entries(terrainCounts).map(([terrain, count]) => (
                <div key={terrain} className="flex justify-between">
                  <span className="capitalize text-gray-500">{terrain}</span>
                  <span>{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {warsAgainst.length > 0 && (
          <div className="border-t border-gray-700 pt-1.5 mt-1.5">
            <span className="text-red-400">At war with:</span>
            <div className="ml-2 mt-0.5">
              {warsAgainst.map((name) => (
                <div key={name} className="text-red-300">{name}</div>
              ))}
            </div>
          </div>
        )}

        {allies.length > 0 && (
          <div className="border-t border-gray-700 pt-1.5 mt-1.5">
            <span className="text-green-400">Allied with:</span>
            <div className="ml-2 mt-0.5">
              {allies.map((name) => (
                <div key={name} className="text-green-300">{name}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
