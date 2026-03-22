import { useEffect, useState, useCallback, useRef } from 'react';
import { useSimStore } from '../store/simStore';
import { useMapStore } from '../store/mapStore';
import type { SimEvent } from '../types';

interface Toast {
  id: number;
  message: string;
  type: SimEvent['type'];
  timestamp: number;
}

const IMPORTANT_EVENTS: Set<SimEvent['type']> = new Set([
  'war_declared',
  'country_eliminated',
  'alliance_formed',
  'peace_treaty',
]);

function eventIcon(type: SimEvent['type']): string {
  switch (type) {
    case 'war_declared': return '⚔';
    case 'country_eliminated': return '💀';
    case 'alliance_formed': return '🤝';
    case 'peace_treaty': return '🕊';
    default: return '📜';
  }
}

function toastBg(type: SimEvent['type']): string {
  switch (type) {
    case 'war_declared': return 'bg-red-900/90 border-red-600';
    case 'country_eliminated': return 'bg-gray-900/90 border-red-500';
    case 'alliance_formed': return 'bg-green-900/90 border-green-600';
    case 'peace_treaty': return 'bg-blue-900/90 border-blue-600';
    default: return 'bg-gray-800/90 border-gray-600';
  }
}

function formatToastMessage(event: SimEvent, countries: { id: string; name: string }[]): string | null {
  const d = event.details as Record<string, string | number | boolean>;
  const getName = (id: string) => countries.find((c) => c.id === id)?.name ?? 'Unknown';

  switch (event.type) {
    case 'war_declared':
      return `${d.aggressor} declared war on ${d.target}`;
    case 'country_eliminated':
      return `${d.name} has been eliminated!`;
    case 'alliance_formed':
      return `${getName(event.actors[0])} and ${getName(event.actors[1])} formed an alliance`;
    case 'peace_treaty':
      return `${d.country1} and ${d.country2} signed a peace treaty`;
    default:
      return null;
  }
}

export default function ToastNotifications() {
  const events = useSimStore((s) => s.events);
  const status = useSimStore((s) => s.status);
  const countries = useMapStore((s) => s.map?.countries ?? []);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const lastEventCount = useRef(0);
  const nextId = useRef(0);

  const addToast = useCallback((message: string, type: SimEvent['type']) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev.slice(-4), { id, message, type, timestamp: Date.now() }]);
  }, []);

  // Watch for new important events
  useEffect(() => {
    if (status !== 'running' && status !== 'paused') return;
    if (events.length <= lastEventCount.current) {
      lastEventCount.current = events.length;
      return;
    }

    const newEvents = events.slice(lastEventCount.current);
    lastEventCount.current = events.length;

    for (const evt of newEvents) {
      if (IMPORTANT_EVENTS.has(evt.type)) {
        const msg = formatToastMessage(evt, countries);
        if (msg) addToast(msg, evt.type);
      }
    }
  }, [events, status, countries, addToast]);

  // Auto-remove toasts after 4 seconds
  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setToasts((prev) => prev.filter((t) => now - t.timestamp < 4000));
    }, 500);
    return () => clearInterval(timer);
  }, [toasts.length]);

  // Reset on sim reset
  useEffect(() => {
    if (status === 'setup') {
      setToasts([]);
      lastEventCount.current = 0;
    }
  }, [status]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`${toastBg(toast.type)} border rounded-lg px-4 py-2 text-white text-sm shadow-lg animate-fade-in min-w-64 text-center`}
        >
          <span className="mr-2">{eventIcon(toast.type)}</span>
          {toast.message}
        </div>
      ))}
    </div>
  );
}
