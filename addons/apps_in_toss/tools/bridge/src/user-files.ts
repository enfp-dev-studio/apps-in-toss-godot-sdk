// 저장 미러링(Unity SDK 3.9.0 ait-playerprefs.js 대응, 코드는 이 SDK가 새로 씀).
// Godot 웹의 user://는 IndexedDB(/userfs)에 있는데, 토스 WebView(iOS ITP 등)에서는 IndexedDB가 지워질 수 있다.
// 게임 매니페스트 userFiles에 적은 파일만 앱인토스 Storage에 복사해 두고(AITUserFiles가 실행 중에 올림),
// 엔진이 뜨기 전에 IndexedDB에 없는 파일을 Storage에서 되살린다. 셸은 engine.startGame 전에 userFilesReady()를 기다린다.
// 어떤 실패도 부팅을 막지 않는다(되살리지 못하면 Godot이 원래대로 IndexedDB만 쓴다).

const DB_NAME = '/userfs';
const DB_VERSION = 21; // Emscripten IDBFS와 같아야 Godot이 열 때 스키마를 다시 만들지 않는다
const STORE = 'FILE_DATA';
const FILE_MODE = 0o100666;
const DIR_MODE = 0o40777;
export const USER_FILE_KEY_PREFIX = 'ait:userfile:';

interface StorageLike {
  getItem(key: string): Promise<string | null | undefined>;
}

// ait-app-config(빌드가 index.html에 넣은 JSON)의 userFiles: ["user://settings.cfg", …] → ["settings.cfg", …]
export function userFilesFromPage(doc: Document | undefined): string[] {
  const tag = doc?.getElementById('ait-app-config');
  if (!tag?.textContent) return [];
  try {
    const config = JSON.parse(tag.textContent) as { userFiles?: unknown };
    if (!Array.isArray(config.userFiles)) return [];
    return config.userFiles
      .filter((p): p is string => typeof p === 'string' && p.startsWith('user://'))
      .map((p) => p.slice('user://'.length))
      .filter((p) => p !== '' && !p.split('/').includes('..'));
  } catch {
    return [];
  }
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function openDb(idb: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = idb.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const store = db.objectStoreNames.contains(STORE)
        ? (req.transaction as IDBTransaction).objectStore(STORE)
        : db.createObjectStore(STORE);
      if (!store.indexNames.contains('timestamp')) store.createIndex('timestamp', 'timestamp', { unique: false });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// 되살린 파일의 상대 경로 목록을 돌려준다.
export async function restoreUserFiles(storage: StorageLike, idb: IDBFactory, paths: string[]): Promise<string[]> {
  if (paths.length === 0) return [];
  const db = await openDb(idb);
  const restored: string[] = [];
  try {
    for (const rel of paths) {
      const key = `${DB_NAME}/${rel}`;
      const existing = await request(db.transaction(STORE, 'readonly').objectStore(STORE).get(key));
      if (existing !== undefined) continue;
      const value = await storage.getItem(`${USER_FILE_KEY_PREFIX}${rel}`);
      if (typeof value !== 'string' || value === '') continue;
      const contents = decodeBase64(value);
      const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
      const parts = rel.split('/');
      for (let i = 1; i < parts.length; i += 1) {
        const dir = `${DB_NAME}/${parts.slice(0, i).join('/')}`;
        if ((await request(store.get(dir))) === undefined) {
          await request(store.put({ timestamp: new Date(), mode: DIR_MODE }, dir));
        }
      }
      await request(store.put({ timestamp: new Date(), mode: FILE_MODE, contents }, key));
      restored.push(rel);
    }
  } finally {
    db.close();
  }
  return restored;
}
