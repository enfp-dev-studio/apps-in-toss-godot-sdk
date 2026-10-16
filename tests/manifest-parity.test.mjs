// Source/embedded parity + upstream 3.8.0 version pins.
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

describe('bridge source/embedded parity + 3.8.0 pins', () => {
  it('both api-manifest.json copies carry the latest mapped APIs', () => {
    const expected = [
      { name: 'navigation_bar_set_options', path: 'NavigationBar.setOptions', args: ['options'] },
      { name: 'migration_get_origin_storage', path: 'Migration.getOriginStorage', args: [] },
      { name: 'user_create_anonymous_key_auth_code', path: 'User.createAnonymousKeyAuthCode', args: [] },
      { name: 'share_create_link', path: 'Share.createLink', args: ['options'] },
    ];
    for (const p of ['bridge/api-manifest.json', 'addons/apps_in_toss/tools/bridge/api-manifest.json']) {
      const manifest = readJson(p);
      for (const entry of expected) {
        assert.deepEqual(manifest.find((e) => e.name === entry.name), entry, p);
      }
    }
  });

  it('source and embedded bridge copies are exactly in parity', () => {
    const pairs = [
      ['bridge/api-manifest.json', 'addons/apps_in_toss/tools/bridge/api-manifest.json'],
      ['bridge/package.json', 'addons/apps_in_toss/tools/bridge/package.json'],
      ['bridge/package-lock.json', 'addons/apps_in_toss/tools/bridge/package-lock.json'],
      ['bridge/src/index.ts', 'addons/apps_in_toss/tools/bridge/src/index.ts'],
      ['bridge/src/debug-console.ts', 'addons/apps_in_toss/tools/bridge/src/debug-console.ts'],
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

  it('generated GDScript matches the manifest (38 APIs)', () => {
    const manifest = readJson('bridge/api-manifest.json');
    assert.equal(manifest.length, 38);
    const api = read('addons/apps_in_toss/generated/ait_generated_api.gd');
    const catalog = read('addons/apps_in_toss/generated/ait_generated_catalog.gd');
    for (const entry of manifest) {
      assert.ok(api.includes(`func ${entry.name}(`), `generated api has ${entry.name}`);
      assert.ok(api.includes(`_core.invoke("${entry.path}"`), `generated api invokes ${entry.path}`);
      assert.ok(catalog.includes(`"name": "${entry.name}"`), `catalog has ${entry.name}`);
    }
  });

  it('web-framework and devtools are pinned to 3.8.0 everywhere', () => {
    for (const p of ['bridge/package.json', 'addons/apps_in_toss/tools/bridge/package.json']) {
      const pkg = readJson(p);
      assert.equal(pkg.dependencies['@apps-in-toss/web-framework'], '3.8.0', p);
      assert.equal(pkg.devDependencies['@apps-in-toss/devtools'], '3.8.0', p);
    }
    const lock = readJson('addons/apps_in_toss/tools/templates/platform.lock.json');
    assert.equal(lock.webFramework.version, '3.8.0');
    assert.equal(lock.unitySdk.packageVersion, '3.8.0');
    assert.equal(lock.unitySdk.commit, '18814fe5b5a2af5cd2a11a7a5bae53403fafa15e');
    assert.equal(read('addons/apps_in_toss/plugin.cfg').match(/version="([^"]+)"/)[1], '0.2.0');
  });

  it('platform.lock apiManifestSha256 matches the embedded manifest', () => {
    const lock = readJson('addons/apps_in_toss/tools/templates/platform.lock.json');
    const sha = crypto.createHash('sha256')
      .update(read('addons/apps_in_toss/tools/bridge/api-manifest.json')).digest('hex');
    assert.equal(lock.aitGodotSdk.apiManifestSha256, sha);
  });
});
