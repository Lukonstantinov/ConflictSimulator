import { useMapStore } from '../store/mapStore';
import { useUIStore } from '../store/uiStore';
import { useSimStore } from '../store/simStore';
import type { ResourceType } from '../types';

const RESOURCE_LABELS: Record<ResourceType, { label: string; color: string }> = {
  food: { label: 'Food', color: 'text-green-400' },
  metal: { label: 'Metal', color: 'text-gray-300' },
  wood: { label: 'Wood', color: 'text-amber-600' },
  salt: { label: 'Salt', color: 'text-cyan-300' },
  gold: { label: 'Gold', color: 'text-yellow-400' },
};

const UNIT_STATS = {
  heavy: { combat: '1.5x', speed: '0.15', cost: '5g', upkeep: 'Food + Metal', shape: 'Pentagon' },
  light: { combat: '1.0x', speed: '0.25', cost: '3g', upkeep: 'Food', shape: 'Diamond' },
  levy: { combat: '0.6x', speed: '0.20', cost: '1g', upkeep: 'Food (low)', shape: 'Circle' },
};

export default function StatsOverlay() {
  const map = useMapStore((s) => s.map);
  const selectedCountryId = useUIStore((s) => s.selectedCountryId);
  const selectedRegionId = useUIStore((s) => s.selectedRegionId);
  const simStatus = useSimStore((s) => s.status);
  const tradeRoutes = useSimStore((s) => s.tradeRoutes);

  if (!map || simStatus === 'setup' || !selectedCountryId) return null;

  const country = map.countries.find((c) => c.id === selectedCountryId);
  if (!country) return null;

  const totalLand = map.regions.filter((r) => r.terrain !== 'ocean').length;
  const territoryPct = totalLand > 0 ? ((country.regions.length / totalLand) * 100).toFixed(1) : '0';

  const totalArmyStrength = country.activeArmies.reduce((sum, a) => sum + a.size, 0);
  const avgMorale = country.activeArmies.length > 0
    ? (country.activeArmies.reduce((sum, a) => sum + a.morale, 0) / country.activeArmies.length).toFixed(2)
    : 'N/A';

  // Unit type breakdown
  let totalHeavy = 0, totalLight = 0, totalLevy = 0;
  for (const army of country.activeArmies) {
    const units = army.units ?? { heavy: 0, light: army.size, levy: 0 };
    totalHeavy += units.heavy;
    totalLight += units.light;
    totalLevy += units.levy;
  }

  const warsAgainst = Object.entries(country.relations)
    .filter(([, rel]) => rel === 'at_war')
    .map(([id]) => map.countries.find((c) => c.id === id)?.name ?? 'Unknown');

  const allies = Object.entries(country.relations)
    .filter(([, rel]) => rel === 'allied')
    .map(([id]) => map.countries.find((c) => c.id === id)?.name ?? 'Unknown');

  // Terrain breakdown
  const terrainCounts: Record<string, number> = {};
  let totalPop = 0;
  let totalForts = 0;
  for (const rId of country.regions) {
    const region = map.regions.find((r) => r.id === rId);
    if (region) {
      terrainCounts[region.terrain] = (terrainCounts[region.terrain] || 0) + 1;
      totalPop += region.population;
      totalForts += region.fortification;
    }
  }

  const warWeariness = country.warWeariness ?? 0;

  return (
    <div className="absolute top-4 right-4 bg-gray-800 bg-opacity-95 rounded-lg p-4 text-white text-xs w-56 z-50 shadow-lg border border-gray-600 max-h-[80vh] overflow-y-auto">
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
          <span className="text-gray-400">Population:</span>
          <span>{Math.floor(totalPop)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Armies:</span>
          <span>{country.activeArmies.length}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Total strength:</span>
          <span>{totalArmyStrength}</span>
        </div>
        {totalArmyStrength > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-400">Units:</span>
            <span className="text-xs">
              {totalHeavy > 0 && <span className="text-red-300">{totalHeavy}H </span>}
              {totalLight > 0 && <span className="text-blue-300">{totalLight}L </span>}
              {totalLevy > 0 && <span className="text-green-300">{totalLevy}V</span>}
            </span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-gray-400">Avg morale:</span>
          <span>{avgMorale}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Strategy:</span>
          <span className="capitalize">{country.strategy}</span>
        </div>

        {/* War Weariness */}
        {warWeariness > 0 && (
          <div className="flex justify-between">
            <span className="text-orange-400">War weariness:</span>
            <span className="text-orange-300">{(warWeariness * 100).toFixed(0)}%</span>
          </div>
        )}

        {/* Fortifications */}
        {totalForts > 0 && (
          <div className="flex justify-between">
            <span className="text-yellow-400">Fortifications:</span>
            <span className="text-yellow-300">{totalForts} total</span>
          </div>
        )}

        {/* Resources */}
        {country.resources && (
          <div className="border-t border-gray-700 pt-1.5 mt-1.5">
            <span className="text-gray-400">Resources:</span>
            <div className="ml-2 mt-0.5">
              {(Object.entries(RESOURCE_LABELS) as Array<[ResourceType, { label: string; color: string }]>).map(
                ([res, info]) => {
                  const val = country.resources?.[res] ?? 0;
                  return (
                    <div key={res} className="flex justify-between">
                      <span className={info.color}>{info.label}</span>
                      <span className={val < 0 ? 'text-red-400' : ''}>{Math.floor(val)}</span>
                    </div>
                  );
                },
              )}
            </div>
          </div>
        )}

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

        {/* Trade Routes */}
        {tradeRoutes.filter((r) => r.country1Id === country.id || r.country2Id === country.id).length > 0 && (
          <div className="border-t border-gray-700 pt-1.5 mt-1.5">
            <span className="text-cyan-400">Trade Routes:</span>
            <div className="ml-2 mt-0.5">
              {tradeRoutes
                .filter((r) => r.country1Id === country.id || r.country2Id === country.id)
                .map((route) => {
                  const partnerId = route.country1Id === country.id ? route.country2Id : route.country1Id;
                  const partner = map.countries.find((c) => c.id === partnerId);
                  const rInfo = RESOURCE_LABELS[route.resource];
                  return (
                    <div key={route.id} className="flex justify-between">
                      <span className={rInfo.color}>{rInfo.label}</span>
                      <span className="text-gray-400">{partner?.name ?? '?'}</span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* Region Info — shown when a region is selected */}
        {selectedRegionId !== null && (() => {
          const region = map.regions.find((r) => r.id === selectedRegionId);
          if (!region) return null;
          return (
            <div className="border-t border-gray-700 pt-1.5 mt-1.5">
              <span className="text-purple-400 capitalize">
                Region #{selectedRegionId} ({region.terrain})
              </span>
              <div className="ml-2 mt-0.5">
                <div className="flex justify-between">
                  <span className="text-gray-400">Population</span>
                  <span>{Math.floor(region.population)}</span>
                </div>
                {region.fortification > 0 && (
                  <div className="flex justify-between">
                    <span className="text-yellow-400">Fort level</span>
                    <span>{region.fortification}</span>
                  </div>
                )}
                {region.bonusResource && (
                  <div className="flex justify-between">
                    <span className={RESOURCE_LABELS[region.bonusResource].color}>
                      Bonus: {RESOURCE_LABELS[region.bonusResource].label}
                    </span>
                    <span>+2</span>
                  </div>
                )}
                {region.resourceProduction && Object.keys(region.resourceProduction).length > 0 && (
                  <div className="mt-0.5">
                    <span className="text-gray-500">Produces:</span>
                    {(Object.entries(region.resourceProduction) as Array<[ResourceType, number]>).map(([res, amt]) => (
                      <span key={res} className={`ml-1 ${RESOURCE_LABELS[res]?.color ?? ''}`}>
                        {amt}{res[0].toUpperCase()}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* All armies in this region from all countries */}
              {(() => {
                const allArmiesHere: Array<{ army: typeof country.activeArmies[0]; ownerName: string; ownerColor: string }> = [];
                for (const c of map.countries) {
                  if (!c.isAlive) continue;
                  for (const a of c.activeArmies) {
                    if (a.position === selectedRegionId) {
                      allArmiesHere.push({ army: a, ownerName: c.name, ownerColor: c.color });
                    }
                  }
                }
                if (allArmiesHere.length === 0) return null;
                return (
                  <div className="mt-1">
                    <span className="text-gray-400">Armies here:</span>
                    {allArmiesHere.map(({ army, ownerName, ownerColor }) => {
                      const u = army.units ?? { heavy: 0, light: army.size, levy: 0 };
                      return (
                        <div key={army.id} className="ml-1 mt-1 bg-gray-700 rounded p-1.5">
                          <div className="flex items-center gap-1 mb-0.5">
                            <div className="w-2 h-2 rounded" style={{ backgroundColor: ownerColor }} />
                            <span className="text-gray-300 font-medium">{ownerName}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Size</span>
                            <span>{army.size}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Morale</span>
                            <span className={army.morale < 0.6 ? 'text-red-400' : army.morale > 1.0 ? 'text-green-400' : ''}>
                              {army.morale.toFixed(2)}
                            </span>
                          </div>
                          {u.heavy > 0 && (
                            <div className="flex justify-between">
                              <span className="text-red-300">Heavy ({UNIT_STATS.heavy.combat})</span>
                              <span>{u.heavy}</span>
                            </div>
                          )}
                          {u.light > 0 && (
                            <div className="flex justify-between">
                              <span className="text-blue-300">Light ({UNIT_STATS.light.combat})</span>
                              <span>{u.light}</span>
                            </div>
                          )}
                          {u.levy > 0 && (
                            <div className="flex justify-between">
                              <span className="text-green-300">Levy ({UNIT_STATS.levy.combat})</span>
                              <span>{u.levy}</span>
                            </div>
                          )}
                          {army.target !== null && (
                            <div className="flex justify-between">
                              <span className="text-gray-500">Moving</span>
                              <span className="text-gray-400">{(army.progress * 100).toFixed(0)}%</span>
                            </div>
                          )}
                          {army.borderFrontId && (
                            <div className="text-yellow-400 text-center mt-0.5">In combat</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
