// Embedded generator must write to the owning addon's generated/ even without
// AIT_ADDON_DIR (npm prepare path) — no stray tools/addons/... tree.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

describe('embedded generate-gdscript.mjs output location', () => {
  it('writes to addon generated/ with no env set', () => {
    const script = path.join(repoRoot, 'addons/apps_in_toss/tools/bridge/scripts/generate-gdscript.mjs');
    const env = { ...process.env };
    delete env.AIT_ADDON_DIR;
    execFileSync(process.execPath, [script], { cwd: path.join(repoRoot, 'addons/apps_in_toss/tools/bridge'), env, encoding: 'utf8' });
    assert.ok(!fs.existsSync(path.join(repoRoot, 'addons/apps_in_toss/tools/addons')), 'no stray tools/addons tree');
    const api = fs.readFileSync(path.join(repoRoot, 'addons/apps_in_toss/generated/ait_generated_api.gd'), 'utf8');
    assert.ok(api.includes('func navigation_bar_set_options('));
  });
});
