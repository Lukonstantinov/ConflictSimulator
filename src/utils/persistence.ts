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
