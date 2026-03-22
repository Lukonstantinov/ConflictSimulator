import { useEffect, useRef } from 'react';
import { MapRenderer } from '../map/renderer';
import { useMapStore } from '../store/mapStore';
import { useUIStore } from '../store/uiStore';

export default function MapCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  const map = useMapStore((s) => s.map);
  const assignRegionToCountry = useMapStore((s) => s.assignRegionToCountry);
  const selectedCountryId = useUIStore((s) => s.selectedCountryId);
  const toolMode = useUIStore((s) => s.toolMode);
  const selectRegion = useUIStore((s) => s.selectRegion);

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
