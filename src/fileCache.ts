export interface CachedFileRecord {
  name: string;
  relativePath: string;
  type: string;
  lastModified: number;
  blob: Blob;
}

const DB_NAME = 'ComparadorWebFoxProCache';
const DB_VERSION = 1;
const STORE_NAME = 'files_store';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveFilesToCache(key: string, files: FileList | File[]): Promise<void> {
  try {
    const db = await openDB();
    const records: CachedFileRecord[] = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      records.push({
        name: f.name,
        relativePath: (f as any).webkitRelativePath || f.name,
        type: f.type,
        lastModified: f.lastModified,
        blob: f
      });
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(records, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('Erro ao salvar no cache IndexedDB:', err);
  }
}

export async function getFilesFromCache(key: string): Promise<File[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        const records = req.result as CachedFileRecord[] | undefined;
        if (!records || !Array.isArray(records)) {
          resolve([]);
          return;
        }
        const restored: File[] = records.map(r => {
          const file = new File([r.blob], r.name, { type: r.type, lastModified: r.lastModified });
          Object.defineProperty(file, 'webkitRelativePath', {
            value: r.relativePath || r.name,
            writable: false,
            configurable: true
          });
          return file;
        });
        resolve(restored);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('Erro ao ler do cache IndexedDB:', err);
    return [];
  }
}

export async function clearCacheKey(key: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('Erro ao limpar cache IndexedDB:', err);
  }
}
