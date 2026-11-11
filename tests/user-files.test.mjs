// 저장 미러링(Unity PlayerPrefs 미러링 대응): 브리지가 엔진 시작 전에 IndexedDB(/userfs)에 없는 user:// 파일을
// Storage에서 되살리는지, 이미 있는 파일은 두는지, 하위 폴더 항목을 만드는지 작은 가짜 IndexedDB로 본다.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const require = createRequire(path.join(repoRoot, 'bridge/package.json'));
const ts = require(path.join(repoRoot, 'bridge/node_modules/typescript'));

function load() {
  const js = ts.transpileModule(fs.readFileSync(path.join(repoRoot, 'bridge/src/user-files.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  new Function('exports', 'module', 'atob', js)(mod.exports, mod, (s) => Buffer.from(s, 'base64').toString('binary'));
  return mod.exports;
}

// IDBFS가 쓰는 만큼만 흉내 낸다: open(이름, 판)·업그레이드·objectStore get/put·index 이름.
function fakeIndexedDB() {
  const dbs = new Map();
  const later = (fn) => setTimeout(fn, 0);
  const req = (run) => {
    const r = {};
    later(() => {
      try {
        r.result = run();
        r.onsuccess?.();
      } catch (error) {
        r.error = error;
        r.onerror?.();
      }
    });
    return r;
  };
  return {
    dbs,
    open(name, version) {
      const r = {};
      later(() => {
        let db = dbs.get(name);
        const fresh = !db;
        if (!db) {
          db = { name, version, stores: new Map(), indexes: new Set() };
          dbs.set(name, db);
        }
        const store = (n) => ({
          indexNames: { contains: (i) => db.indexes.has(i) },
          createIndex: (i) => db.indexes.add(i),
          get: (key) => req(() => db.stores.get(n)?.get(key)),
          put: (value, key) => req(() => db.stores.get(n).set(key, value)),
        });
        const handle = {
          objectStoreNames: { contains: (n) => db.stores.has(n) },
          createObjectStore: (n) => { db.stores.set(n, new Map()); return store(n); },
          transaction: () => ({ objectStore: store }),
          close() {},
        };
        r.result = handle;
        if (fresh) {
          r.transaction = { objectStore: store };
          r.onupgradeneeded?.();
        }
        r.onsuccess?.();
      });
      return r;
    },
  };
}

describe('user:// 파일 되살리기', () => {
  const { restoreUserFiles, userFilesFromPage, USER_FILE_KEY_PREFIX } = load();

  it('reads userFiles from the page config and drops unsafe paths', () => {
    const doc = { getElementById: () => ({ textContent: JSON.stringify({ userFiles: ['user://a.cfg', 'user://save/p.json', 'res://x', 'user://../etc', 3] }) }) };
    assert.deepEqual(userFilesFromPage(doc), ['a.cfg', 'save/p.json']);
    assert.deepEqual(userFilesFromPage({ getElementById: () => null }), []);
  });

  it('restores only missing files from Storage, with IDBFS schema and parent folders', async () => {
    const idb = fakeIndexedDB();
    const stored = {
      [`${USER_FILE_KEY_PREFIX}a.cfg`]: Buffer.from('volume=3').toString('base64'),
      [`${USER_FILE_KEY_PREFIX}save/p.json`]: Buffer.from('{"lv":2}').toString('base64'),
    };
    const storage = { getItem: async (key) => stored[key] ?? null };
    const restored = await restoreUserFiles(storage, idb, ['a.cfg', 'save/p.json', 'none.txt']);
    assert.deepEqual(restored, ['a.cfg', 'save/p.json']);
    const db = idb.dbs.get('/userfs');
    assert.equal(db.version, 21);
    assert.ok(db.indexes.has('timestamp'));
    const files = db.stores.get('FILE_DATA');
    assert.equal(Buffer.from(files.get('/userfs/a.cfg').contents).toString(), 'volume=3');
    assert.equal(files.get('/userfs/a.cfg').mode, 0o100666);
    assert.equal(files.get('/userfs/save').mode, 0o40777);
    assert.ok(files.get('/userfs/save/p.json').timestamp instanceof Date);

    // 이미 IndexedDB에 있으면 Storage 값으로 덮지 않는다
    stored[`${USER_FILE_KEY_PREFIX}a.cfg`] = Buffer.from('volume=9').toString('base64');
    assert.deepEqual(await restoreUserFiles(storage, idb, ['a.cfg']), []);
    assert.equal(Buffer.from(files.get('/userfs/a.cfg').contents).toString(), 'volume=3');
  });
});
