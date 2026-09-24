// Source/embedded parity + upstream 3.5.0 version pins.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const read = (p) => fs.readFileSync(path.join(repoRoot, p), 'utf8');
const readJson = (p) => JSON.parse(read(p));

describe('bridge source/embedded parity + 3.5.0 pins', () => {
  it('both api-manifest.json copies carry navigation_bar_set_options', () => {
    for (const p of ['bridge/api-manifest.json', 'addons/apps_in_toss/tools/bridge/api-manifest.json']) {
      const manifest = readJson(p);
      assert.deepEqual(
        manifest.find((e) => e.name === 'navigation_bar_set_options'),
        { name: 'navigation_bar_set_options', path: 'NavigationBar.setOptions', args: ['options'] },
        p,
      );
    }
  });

  it('source and embedded bridge copies are exactly in parity', () => {
    const pairs = [
      ['bridge/api-manifest.json', 'addons/apps_in_toss/tools/bridge/api-manifest.json'],
      ['bridge/package.json', 'addons/apps_in_toss/tools/bridge/package.json'],
      ['bridge/src/index.ts', 'addons/apps_in_toss/tools/bridge/src/index.ts'],
      ['bridge/vite.config.ts', 'addons/apps_in_toss/tools/bridge/vite.config.ts'],
      ['bridge/tsconfig.json', 'addons/apps_in_toss/tools/bridge/tsconfig.json'],
      ['bridge/scripts/patch-export.mjs', 'addons/apps_in_toss/tools/bridge/scripts/patch-export.mjs'],
    ];
    for (const [a, b] of pairs) {
      assert.equal(read(a), read(b), `${a} === ${b} (byte-identical)`);
    }
    // JSON deep-compare as well, so field-level drift is caught with a clear diff.
    assert.deepEqual(
      readJson('bridge/api-manifest.json'),
      readJson('addons/apps_in_toss/tools/bridge/api-manifest.json'),
    );
    assert.deepEqual(
      readJson('bridge/package.json'),
      readJson('addons/apps_in_toss/tools/bridge/package.json'),
    );
  });

  it('generated GDScript matches the manifest (35 APIs)', () => {
    const manifest = readJson('bridge/api-manifest.json');
    assert.equal(manifest.length, 35);
    const api = read('addons/apps_in_toss/generated/ait_generated_api.gd');
    const catalog = read('addons/apps_in_toss/generated/ait_generated_catalog.gd');
    for (const entry of manifest) {
      assert.ok(api.includes(`func ${entry.name}(`), `generated api has ${entry.name}`);
      assert.ok(api.includes(`_core.invoke("${entry.path}"`), `generated api invokes ${entry.path}`);
      assert.ok(catalog.includes(`"name": "${entry.name}"`), `catalog has ${entry.name}`);
    }
  });

  it('web-framework is pinned to 3.5.0 everywhere, devtools not downgraded', () => {
    for (const p of ['bridge/package.json', 'addons/apps_in_toss/tools/bridge/package.json']) {
      const pkg = readJson(p);
      assert.equal(pkg.dependencies['@apps-in-toss/web-framework'], '3.5.0', p);
      assert.equal(pkg.devDependencies['@apps-in-toss/devtools'], '3.2.0', `${p} keeps devtools 3.2.0`);
    }
    const lock = readJson('addons/apps_in_toss/tools/templates/platform.lock.json');
    assert.equal(lock.webFramework.version, '3.5.0');
    assert.equal(lock.unitySdk.packageVersion, '3.5.0');
    assert.equal(lock.unitySdk.commit, '29682a9cbc9ff35bf3008d3fb2b790111d34887e');
    assert.equal(read('addons/apps_in_toss/plugin.cfg').match(/version="([^"]+)"/)[1], '0.2.0');
  });

  it('platform.lock apiManifestSha256 matches the embedded manifest', () => {
    const lock = readJson('addons/apps_in_toss/tools/templates/platform.lock.json');
    const sha = crypto.createHash('sha256')
      .update(read('addons/apps_in_toss/tools/bridge/api-manifest.json')).digest('hex');
    assert.equal(lock.aitGodotSdk.apiManifestSha256, sha);
  });
});
