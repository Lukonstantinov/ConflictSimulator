import { openDB, type IDBPDatabase } from 'idb';
import type { WorldMap } from '../types';

const DB_NAME = 'conflict-simulator';
const DB_VERSION = 1;
const MAP_STORE = 'maps';

async function getDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(MAP_STORE)) {
        db.createObjectStore(MAP_STORE, { keyPath: 'id' });
      }
    },
  });
}

export async function saveMap(map: WorldMap): Promise<void> {
  const db = await getDB();
  await db.put(MAP_STORE, map);
}

export async function loadMap(id: string): Promise<WorldMap | undefined> {
  const db = await getDB();
  return db.get(MAP_STORE, id);
}

export async function listMaps(): Promise<Array<{ id: string; name: string }>> {
  const db = await getDB();
  const all = await db.getAll(MAP_STORE);
  return all.map((m: WorldMap) => ({ id: m.id, name: m.name }));
}

export async function deleteMap(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(MAP_STORE, id);
}

/** Export map as JSON string for sharing */
export function exportMapJSON(map: WorldMap): string {
  return JSON.stringify(map, null, 2);
}

/** Import map from JSON string */
export function importMapJSON(json: string): WorldMap | null {
  try {
    const parsed = JSON.parse(json);
    // Basic validation
    if (!parsed.id || !parsed.regions || !parsed.countries || !parsed.dimensions) {
      return null;
    }
    return parsed as WorldMap;
  } catch {
    return null;
  }
}

/** Trigger a file download */
export function downloadFile(content: string, filename: string, mimeType: string = 'application/json'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Read file from input event */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
