// 애드온 GDScript에는 JavaScriptBridge.eval이 없어야 한다 (출시 체크리스트 금지).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const addonDir = path.join(repoRoot, 'addons/apps_in_toss');

function collectGdFiles(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectGdFiles(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.gd')) {
      out.push(full);
    }
  }
  return out;
}

describe('no JavaScriptBridge.eval in addon GDScript', () => {
  it('addons/apps_in_toss 아래 .gd 파일에 eval이 없다', () => {
    const files = collectGdFiles(addonDir, []);
    assert.ok(files.length > 0, 'addon .gd files exist');
    const offenders = [];
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      if (text.includes('JavaScriptBridge.eval')) {
        offenders.push(path.relative(repoRoot, file));
      }
    }
    assert.deepEqual(offenders, [], `eval 사용 파일: ${offenders.join(', ')}`);
  });
});
