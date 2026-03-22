import { useEffect, useRef } from 'react';
import { useSimStore } from '../store/simStore';
import { useMapStore } from '../store/mapStore';
import type { SimEvent } from '../types';

function getCountryName(id: string, countries: { id: string; name: string }[]): string {
  return countries.find((c) => c.id === id)?.name ?? 'Unknown';
}

function formatEvent(event: SimEvent, countries: { id: string; name: string }[]): string {
  const d = event.details as Record<string, string | number | boolean>;
  switch (event.type) {
    case 'war_declared':
      return `${d.aggressor} declared war on ${d.target}`;
    case 'battle': {
      const result = d.attackerWins ? 'won' : 'lost';
      return `${d.attackerName} ${result} battle vs ${d.defenderName} (region #${d.region})`;
    }
    case 'region_captured':
      return `${d.capturedBy} captured region #${d.region} from ${d.capturedFrom}`;
    case 'country_eliminated':
      return `${d.name} has been eliminated!`;
    case 'alliance_formed':
      return `${getCountryName(event.actors[0], countries)} allied with ${getCountryName(event.actors[1], countries)}`;
    case 'alliance_broken':
      return `Alliance broken: ${getCountryName(event.actors[0], countries)} & ${getCountryName(event.actors[1], countries)}`;
    default:
      return 'Unknown event';
  }
}

function eventColor(type: SimEvent['type']): string {
  switch (type) {
    case 'war_declared':
      return 'text-red-400';
    case 'battle':
      return 'text-orange-300';
    case 'region_captured':
      return 'text-blue-300';
    case 'country_eliminated':
      return 'text-red-500 font-bold';
    case 'alliance_formed':
      return 'text-green-400';
    case 'alliance_broken':
      return 'text-yellow-400';
    default:
      return 'text-gray-400';
  }
}

export default function EventLog() {
  const events = useSimStore((s) => s.events);
  const status = useSimStore((s) => s.status);
  const countries = useMapStore((s) => s.map?.countries ?? []);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length]);

  if (status === 'setup') return null;

  // Show last 100 events
  const recentEvents = events.slice(-100);

  return (
    <div className="bg-gray-800 border-t md:border-t-0 md:border-l border-gray-700">
      <div className="px-3 py-2 border-b border-gray-700 flex items-center justify-between">
        <h3 className="text-sm font-bold">War Log</h3>
        <span className="text-xs text-gray-500">{events.length} events</span>
      </div>
      <div
        ref={scrollRef}
        className="overflow-y-auto p-2 space-y-1"
        style={{ maxHeight: '300px' }}
      >
        {recentEvents.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-4">Waiting for events...</p>
        ) : (
          recentEvents.map((evt, i) => (
            <div key={i} className="text-xs leading-tight">
              <span className="text-gray-600 mr-1">[{evt.tick}]</span>
              <span className={eventColor(evt.type)}>
                {formatEvent(evt, countries)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
