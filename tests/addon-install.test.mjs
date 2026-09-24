// addon:install regression — embedded self-install must never delete the addon,
// and SDK-to-project copies must land intact.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const installer = path.join(repoRoot, 'addons/apps_in_toss/tools/scripts/pipeline-addon.mjs');

function makeGameDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ait-game-'));
  fs.writeFileSync(path.join(dir, 'project.godot'), '; Engine configuration file.\n');
  return dir;
}

function runInstaller({ gameDir, addonDir, sdkDir, force }) {
  const env = { ...process.env, GODOT_PROJECT_DIR: gameDir };
  if (addonDir) env.AIT_ADDON_DIR = addonDir;
  if (sdkDir) env.GODOT_SDK_DIR = sdkDir;
  const args = force ? ['--force'] : [];
  return execFileSync(process.execPath, [installer, ...args], { cwd: gameDir, env, encoding: 'utf8' });
}

describe('addon:install (pipeline-addon.mjs)', () => {
  it('self-install with --force keeps the embedded addon (no-op)', () => {
    const gameDir = makeGameDir();
    const addonDir = path.join(gameDir, 'addons/apps_in_toss');
    fs.mkdirSync(addonDir, { recursive: true });
    fs.writeFileSync(path.join(addonDir, 'plugin.cfg'), '[plugin]\nname="x"\nversion="0.2.0"\n');
    fs.writeFileSync(path.join(addonDir, 'marker.txt'), 'must-survive');

    const out = runInstaller({ gameDir, addonDir, force: true });
    assert.match(out, /자기 자신|내장 모드/);
    assert.ok(fs.existsSync(path.join(addonDir, 'plugin.cfg')), 'plugin.cfg must survive self-install');
    assert.equal(fs.readFileSync(path.join(addonDir, 'marker.txt'), 'utf8'), 'must-survive');
  });

  it('symlinked game dir pointing at the SDK is also a self-install no-op', () => {
    const realGame = makeGameDir();
    const addonDir = path.join(realGame, 'addons/apps_in_toss');
    fs.mkdirSync(addonDir, { recursive: true });
    fs.writeFileSync(path.join(addonDir, 'plugin.cfg'), '[plugin]\nname="x"\nversion="0.2.0"\n');
    fs.writeFileSync(path.join(addonDir, 'marker.txt'), 'must-survive');
    const aliasGame = path.join(os.tmpdir(), `ait-alias-${Date.now()}`);
    fs.symlinkSync(realGame, aliasGame);

    const env = {
      ...process.env,
      GODOT_PROJECT_DIR: aliasGame,
      AIT_ADDON_DIR: addonDir,
    };
    const out = execFileSync(process.execPath, [installer, '--force'], { cwd: aliasGame, env, encoding: 'utf8' });
    assert.match(out, /자기 자신|내장 모드/);
    assert.ok(fs.existsSync(path.join(addonDir, 'plugin.cfg')), 'plugin.cfg must survive aliased self-install');
    assert.equal(fs.readFileSync(path.join(addonDir, 'marker.txt'), 'utf8'), 'must-survive');
  });

  it('copies an SDK addon into a fresh game project', () => {
    const sdkRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ait-sdk-'));
    const sdkAddon = path.join(sdkRoot, 'addons/apps_in_toss');
    fs.mkdirSync(sdkAddon, { recursive: true });
    fs.writeFileSync(path.join(sdkAddon, 'plugin.cfg'), '[plugin]\nname="x"\nversion="0.2.0"\n');
    fs.writeFileSync(path.join(sdkAddon, 'ait.gd'), 'extends Node\n');
    const gameDir = makeGameDir();

    runInstaller({ gameDir, sdkDir: sdkRoot, force: false });
    const target = path.join(gameDir, 'addons/apps_in_toss');
    assert.ok(fs.existsSync(path.join(target, 'plugin.cfg')));
    assert.ok(fs.existsSync(path.join(target, 'ait.gd')));
  });

  it('same-version reinstall without --force is a no-op', () => {
    const sdkRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ait-sdk-'));
    const sdkAddon = path.join(sdkRoot, 'addons/apps_in_toss');
    fs.mkdirSync(sdkAddon, { recursive: true });
    fs.writeFileSync(path.join(sdkAddon, 'plugin.cfg'), '[plugin]\nname="x"\nversion="0.2.0"\n');
    const gameDir = makeGameDir();
    runInstaller({ gameDir, sdkDir: sdkRoot, force: false });

    const targetCfg = path.join(gameDir, 'addons/apps_in_toss/plugin.cfg');
    const before = fs.statSync(targetCfg).mtimeMs;
    const out = runInstaller({ gameDir, sdkDir: sdkRoot, force: false });
    assert.match(out, /이미 최신/);
    assert.equal(fs.statSync(targetCfg).mtimeMs, before);
  });
});
