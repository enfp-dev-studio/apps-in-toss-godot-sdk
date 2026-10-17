// 애드온의 모든 .gd에는 커밋된 .gd.uid가 있어야 한다. 없으면 addon:install --force로
// 갱신할 때마다 Godot이 새 UID를 만들어, 게임 씬이 저장한 UID가 "invalid UID" 경고를 낸다.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const addonDir = path.join(repoRoot, 'addons/apps_in_toss');
const SKIP_DIRS = new Set(['node_modules', 'dist']);

function collectGdFiles(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collectGdFiles(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.gd')) {
      out.push(full);
    }
  }
  return out;
}

describe('addon GDScript .uid files', () => {
  it('addons/apps_in_toss 아래 .gd 파일마다 고유한 .gd.uid가 있다', () => {
    const files = collectGdFiles(addonDir, []);
    assert.ok(files.length > 0, 'addon .gd files exist');
    const missing = [];
    const malformed = [];
    const seen = new Map();
    for (const file of files) {
      const uidPath = `${file}.uid`;
      const rel = path.relative(repoRoot, uidPath);
      if (!fs.existsSync(uidPath)) {
        missing.push(rel);
        continue;
      }
      const uid = fs.readFileSync(uidPath, 'utf8').trim();
      if (!/^uid:\/\/[a-z0-9]+$/.test(uid)) malformed.push(rel);
      else if (seen.has(uid)) malformed.push(`${rel} (duplicate of ${seen.get(uid)})`);
      else seen.set(uid, rel);
    }
    assert.deepEqual(missing, [], `.uid 없음: ${missing.join(', ')}`);
    assert.deepEqual(malformed, [], `.uid 형식 오류·중복: ${malformed.join(', ')}`);
  });
});
