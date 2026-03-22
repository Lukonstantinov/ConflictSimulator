import { useMemo } from 'react';
import { useSimStore } from '../store/simStore';
import { useMapStore } from '../store/mapStore';

export default function StatsDashboard() {
  const status = useSimStore((s) => s.status);
  const events = useSimStore((s) => s.events);
  const territoryHistory = useSimStore((s) => s.territoryHistory);
  const map = useMapStore((s) => s.map);
  const tick = useSimStore((s) => s.tick);

  const stats = useMemo(() => {
    if (!map) return null;

    const countries = map.countries;

    // Battle stats
    const battlesByCountry: Record<string, { wins: number; losses: number; captures: number }> = {};
    for (const c of countries) {
      battlesByCountry[c.id] = { wins: 0, losses: 0, captures: 0 };
    }

    let totalBattles = 0;

    for (const evt of events) {
      if (evt.type === 'battle') {
        totalBattles++;
        const details = evt.details as Record<string, unknown>;
        const attackerId = evt.actors[0];
        const defenderId = evt.actors[1];
        if (details.attackerWins) {
          if (battlesByCountry[attackerId]) battlesByCountry[attackerId].wins++;
          if (battlesByCountry[defenderId]) battlesByCountry[defenderId].losses++;
        } else {
          if (battlesByCountry[attackerId]) battlesByCountry[attackerId].losses++;
          if (battlesByCountry[defenderId]) battlesByCountry[defenderId].wins++;
        }
      }
      if (evt.type === 'region_captured') {
        const capturer = evt.actors[0];
        if (battlesByCountry[capturer]) battlesByCountry[capturer].captures++;
      }
    }

    const warDeclarations = events.filter((e) => e.type === 'war_declared').length;
    const eliminations = events.filter((e) => e.type === 'country_eliminated').length;
    const alliances = events.filter((e) => e.type === 'alliance_formed').length;
    const peaceTreaties = events.filter((e) => e.type === 'peace_treaty').length;
    const fortifications = events.filter((e) => e.type === 'fortification_built').length;

    // Peak territory for each country
    const peakTerritory: Record<string, number> = {};
    for (const c of countries) peakTerritory[c.id] = c.regions.length;
    for (const snapshot of territoryHistory) {
      for (const [id, count] of Object.entries(snapshot)) {
        if (count > (peakTerritory[id] ?? 0)) peakTerritory[id] = count;
      }
    }

    return {
      countries,
      battlesByCountry,
      totalBattles,
      warDeclarations,
      eliminations,
      alliances,
      peaceTreaties,
      fortifications,
      peakTerritory,
    };
  }, [events, map, territoryHistory]);

  if (status !== 'finished' || !stats) return null;

  // Territory chart (simple ASCII-style bar chart)
  const maxPeak = Math.max(...Object.values(stats.peakTerritory), 1);

  return (
    <div className="bg-gray-800 border-t border-gray-700 p-4">
      <h3 className="text-sm font-bold text-yellow-400 mb-3 uppercase tracking-wide">
        Post-War Statistics — {tick} ticks
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        {/* Summary */}
        <div className="bg-gray-750 rounded p-3">
          <h4 className="font-bold mb-2 text-gray-300">Summary</h4>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-400">Total battles:</span>
              <span>{stats.totalBattles}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Wars declared:</span>
              <span>{stats.warDeclarations}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Alliances formed:</span>
              <span>{stats.alliances}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Countries eliminated:</span>
              <span>{stats.eliminations}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Peace treaties:</span>
              <span>{stats.peaceTreaties}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Fortifications built:</span>
              <span>{stats.fortifications}</span>
            </div>
          </div>
        </div>

        {/* Battle Records */}
        <div className="bg-gray-750 rounded p-3">
          <h4 className="font-bold mb-2 text-gray-300">Battle Records</h4>
          <div className="space-y-1.5">
            {stats.countries.map((c) => {
              const b = stats.battlesByCountry[c.id];
              if (!b) return null;
              return (
                <div key={c.id} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded" style={{ backgroundColor: c.color }} />
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="text-green-400">{b.wins}W</span>
                  <span className="text-red-400">{b.losses}L</span>
                  <span className="text-blue-400">{b.captures}C</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Territory Chart */}
        <div className="bg-gray-750 rounded p-3">
          <h4 className="font-bold mb-2 text-gray-300">Peak Territory</h4>
          <div className="space-y-1.5">
            {stats.countries
              .sort((a, b) => (stats.peakTerritory[b.id] ?? 0) - (stats.peakTerritory[a.id] ?? 0))
              .map((c) => {
                const peak = stats.peakTerritory[c.id] ?? 0;
                const pct = (peak / maxPeak) * 100;
                return (
                  <div key={c.id}>
                    <div className="flex items-center gap-2 mb-0.5">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: c.color }} />
                      <span className="flex-1 truncate">{c.name}</span>
                      <span>{peak}</span>
                    </div>
                    <div className="bg-gray-700 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: c.color }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}
