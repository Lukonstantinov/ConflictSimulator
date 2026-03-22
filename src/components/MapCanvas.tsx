import { useEffect, useRef } from 'react';
import { MapRenderer } from '../map/renderer';
import { useMapStore } from '../store/mapStore';
import { useUIStore } from '../store/uiStore';
import { useSimStore } from '../store/simStore';
import type { BattleEffect } from '../types';

export default function MapCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  const map = useMapStore((s) => s.map);
  const assignRegionToCountry = useMapStore((s) => s.assignRegionToCountry);
  const selectedCountryId = useUIStore((s) => s.selectedCountryId);
  const toolMode = useUIStore((s) => s.toolMode);
  const selectRegion = useUIStore((s) => s.selectRegion);
  const simStatus = useSimStore((s) => s.status);
  const events = useSimStore((s) => s.events);
  const lastProcessedEvent = useRef(0);

  // Initialize renderer once when map dimensions are known
  useEffect(() => {
    if (!canvasRef.current || !map) return;

    // Destroy previous renderer if any
    if (rendererRef.current) {
      rendererRef.current.destroy();
    }

    const renderer = new MapRenderer(
      canvasRef.current,
      map.dimensions.w,
      map.dimensions.h,
    );
    rendererRef.current = renderer;
    lastProcessedEvent.current = 0;

    return () => {
      renderer.destroy();
      rendererRef.current = null;
    };
  }, [map?.id]); // Re-init only when map identity changes

  // Draw regions when map data changes
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !map) return;

    renderer.setRegionClickHandler((regionId) => {
      selectRegion(regionId);

      if (toolMode === 'assign' && selectedCountryId) {
        const region = map.regions.find((r) => r.id === regionId);
        if (region?.countryId === selectedCountryId) {
          assignRegionToCountry(regionId, null);
        } else if (region?.terrain !== 'ocean') {
          assignRegionToCountry(regionId, selectedCountryId);
        }
      }
    });

    renderer.drawRegions(map.regions, map.countries);
  }, [map, toolMode, selectedCountryId, selectRegion, assignRegionToCountry]);

  // Update army overlays during simulation
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !map || simStatus === 'setup') return;

    renderer.updateSimulation(map.countries, map.regions);
  }, [map, simStatus]);

  // Process battle events for effects
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !map) return;

    const newEvents = events.slice(lastProcessedEvent.current);
    lastProcessedEvent.current = events.length;

    for (const evt of newEvents) {
      if (evt.type === 'battle') {
        const details = evt.details as Record<string, unknown>;
        const regionId = details.region as number;
        const region = map.regions.find((r) => r.id === regionId);
        if (region) {
          const effect: BattleEffect = {
            regionId,
            x: region.centroid.x,
            y: region.centroid.y,
            tick: evt.tick,
            attackerWins: details.attackerWins as boolean,
          };
          renderer.addBattleEffect(effect, map.regions);
        }
      }
    }
  }, [events.length, map]);

  return (
    <div ref={containerRef} className="w-full h-full overflow-hidden">
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ touchAction: 'none', objectFit: 'contain' }}
      />
    </div>
  );
}
