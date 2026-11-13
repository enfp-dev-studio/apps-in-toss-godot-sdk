// Real CLI 3.10.0 packaging: metadata must survive serialization, and installed files stay unchanged.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertPackageMetadata, expectedIsGame, resolveMetadataCli, RUNTIME_VERSION } from '../addons/apps_in_toss/tools/scripts/ait-package-metadata.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bridge = path.join(root, 'bridge');
const aitBin = path.join(bridge, 'node_modules/.bin/ait');
const { AITReader, AITWriter } = createRequire(path.join(bridge, 'package.json'))('@apps-in-toss/ait-format');
const pipeline = path.join(root, 'addons/apps_in_toss/tools/scripts/pipeline-package.mjs');
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function gameFixture(appType) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ait-metadata-test-'));
  fs.mkdirSync(path.join(dir, '.ait'));
  fs.mkdirSync(path.join(dir, 'web'));
  fs.writeFileSync(path.join(dir, '.ait/game.manifest.json'), JSON.stringify({ gameId: 'metadata-test', appType }));
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"metadata-test","version":"0.0.0","type":"module"}');
  fs.writeFileSync(path.join(dir, 'apps-in-toss.config.ts'), "export default {appName:'metadata-test',permissions:[],webBundleDir:'web'};\n");
  fs.writeFileSync(path.join(dir, 'web/index.html'), '<!doctype html><title>metadata</title>');
  return dir;
}

function runPackage(game) {
  return spawnSync(process.execPath, [pipeline], {
    cwd: game,
    env: { ...process.env, GODOT_PROJECT_DIR: game, AIT_BRIDGE_DIR: bridge, AIT_BIN: aitBin },
    encoding: 'utf8',
    timeout: 30_000,
  });
}

describe('official CLI packaging metadata', () => {
  for (const [appType, isGame] of [['game', true], ['nongame', false], [undefined, true]]) {
    it(`serializes ${appType ?? 'unset (default game)'} without rewriting the installed CLI`, () => {
      const game = gameFixture(appType);
      const { entry } = resolveMetadataCli(aitBin, game);
      const before = sha(entry);
      try {
        const result = runPackage(game);
        assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
        const reader = AITReader.fromBuffer(new Uint8Array(fs.readFileSync(path.join(game, 'metadata-test.ait'))));
        assertPackageMetadata(reader, isGame);
        assert.equal(reader.appName, 'metadata-test');
        assert.equal(reader.metadata.runtimeVersion, '0.84.0');
        assert.equal(new TextDecoder().decode(reader.readZipBlob().slice(0, 2)), 'PK');
        assert.ok(reader.listEntries().includes('sources/index.html'));
        assert.equal(sha(entry), before, 'original CLI bytes stay unchanged');
      } finally {
        fs.rmSync(game, { recursive: true, force: true });
      }
    });
  }

  it('rejects an unknown appType before building', () => {
    assert.throws(() => expectedIsGame('other'), /appType must be/);
  });

  it('rejects unverified CLI versions', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ait-unsupported-cli-'));
    try {
      const pkgDir = path.join(dir, 'node_modules/@apps-in-toss/cli');
      fs.mkdirSync(path.join(pkgDir, 'dist'), { recursive: true });
      fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
        name: '@apps-in-toss/cli', version: '99.0.0', type: 'module',
        exports: { './package.json': './package.json' }, bin: { ait: 'dist/index.js' },
      }));
      const entry = path.join(pkgDir, 'dist/index.js');
      fs.writeFileSync(entry, '');
      assert.throws(() => resolveMetadataCli(entry, dir), /3\.10\.0.*99\.0\.0/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects stale metadata even when the .ait is readable', async () => {
    const writer = new AITWriter({ appName: 'bad-metadata' });
    writer.setMetadata({ sdkVersion: '3.10.0' });
    const reader = AITReader.fromBuffer(await writer.toBuffer());
    assert.throws(() => assertPackageMetadata(reader, true), /메타데이터 불일치/);
    assert.equal(RUNTIME_VERSION, '0.84.0');
  });

  it('cleans its wrapper after the official CLI reports a build error', () => {
    const game = gameFixture('game');
    const { entry } = resolveMetadataCli(aitBin, game);
    const cliDir = path.dirname(entry);
    try {
      fs.rmSync(path.join(game, 'web'), { recursive: true });
      const result = runPackage(game);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /ait build 실패/);
      assert.deepEqual(fs.readdirSync(cliDir).filter((name) => name.startsWith(`.ait-godot-metadata-${result.pid}-`)), []);
    } finally {
      fs.rmSync(game, { recursive: true, force: true });
    }
  });
});
