import { create } from 'zustand';
import type { WorldMap, Country, Region, StrategyType } from '../types';
import { buildVoronoiMap } from '../map/voronoi';
import { generateCountryColor } from '../utils/colors';
import { randomSeed } from '../utils/random';
import { saveMap as persistSave, loadMap as persistLoad, listMaps, deleteMap as persistDelete } from '../utils/persistence';

interface MapState {
  map: WorldMap | null;
  savedMaps: Array<{ id: string; name: string }>;

  generateMap: (width: number, height: number, regionCount: number, seed?: number) => void;
  assignRegionToCountry: (regionId: number, countryId: string | null) => void;
  addCountry: (name: string) => void;
  removeCountry: (countryId: string) => void;
  updateCountry: (countryId: string, updates: Partial<Country>) => void;
  saveCurrentMap: () => Promise<void>;
  loadSavedMap: (id: string) => Promise<void>;
  refreshSavedMapsList: () => Promise<void>;
  deleteSavedMap: (id: string) => Promise<void>;
}

let countryCounter = 0;

export const useMapStore = create<MapState>((set, get) => ({
  map: null,
  savedMaps: [],

  generateMap: (width, height, regionCount, seed) => {
    const mapSeed = seed ?? randomSeed();
    const { sites, regions, landmask } = buildVoronoiMap(width, height, regionCount, mapSeed);

    countryCounter = 0;

    const map: WorldMap = {
      id: crypto.randomUUID(),
      name: `Map ${mapSeed}`,
      seed: mapSeed,
      dimensions: { w: width, h: height },
      sites,
      landmask,
      regions,
      countries: [],
    };

    set({ map });
  },

  assignRegionToCountry: (regionId, countryId) => {
    const { map } = get();
    if (!map) return;

    const regions = map.regions.map((r) => {
      if (r.id !== regionId) return r;
      return { ...r, countryId };
    });

    // Update country region lists
    const countries = map.countries.map((c) => {
      const owned = regions.filter((r) => r.countryId === c.id).map((r) => r.id);
      return { ...c, regions: owned };
    });

    set({ map: { ...map, regions, countries } });
  },

  addCountry: (name) => {
    const { map } = get();
    if (!map) return;

    const color = generateCountryColor(countryCounter++);
    const country: Country = {
      id: crypto.randomUUID(),
      name,
      color,
      regions: [],
      capital: -1,
      armySize: 50,
      economy: 50,
      strategy: 'aggressive' as StrategyType,
      treasury: 100,
      activeArmies: [],
      relations: {},
      isAlive: true,
    };

    set({ map: { ...map, countries: [...map.countries, country] } });
  },

  removeCountry: (countryId) => {
    const { map } = get();
    if (!map) return;

    const countries = map.countries.filter((c) => c.id !== countryId);
    const regions = map.regions.map((r) =>
      r.countryId === countryId ? { ...r, countryId: null } : r,
    );

    set({ map: { ...map, countries, regions } });
  },

  updateCountry: (countryId, updates) => {
    const { map } = get();
    if (!map) return;

    const countries = map.countries.map((c) =>
      c.id === countryId ? { ...c, ...updates } : c,
    );

    set({ map: { ...map, countries } });
  },

  saveCurrentMap: async () => {
    const { map } = get();
    if (!map) return;
    await persistSave(map);
    await get().refreshSavedMapsList();
  },

  loadSavedMap: async (id) => {
    const loaded = await persistLoad(id);
    if (loaded) {
      countryCounter = loaded.countries.length;
      set({ map: loaded });
    }
  },

  refreshSavedMapsList: async () => {
    const savedMaps = await listMaps();
    set({ savedMaps });
  },

  deleteSavedMap: async (id) => {
    await persistDelete(id);
    await get().refreshSavedMapsList();
  },
}));
