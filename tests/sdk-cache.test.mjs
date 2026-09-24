// common.mjs SDK cache: clone must land on the lock-pinned commit
// (regression: cacheDir typo + missing checkout). Uses a local fixture repo,
// so no network is needed.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

const git = (args, cwd) => execFileSync('git', ['-c', 'user.name=ait-test', '-c', 'user.email=ait-test@example.com', ...args], { cwd, encoding: 'utf8' });

describe('common.mjs resolveSdkDir cache', () => {
  it('clones and checks out the pinned commit, not origin HEAD', async () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'ait-upstream-'));
    git(['init', '-q'], fixture);
    const addonDir = path.join(fixture, 'addons/apps_in_toss');
    fs.mkdirSync(addonDir, { recursive: true });
    fs.writeFileSync(path.join(addonDir, 'plugin.cfg'), '[plugin]\nversion="0.2.0"\n');
    git(['add', '.'], fixture);
    git(['commit', '-qm', 'pinned'], fixture);
    const pinned = git(['rev-parse', 'HEAD'], fixture).trim();
    fs.writeFileSync(path.join(addonDir, 'plugin.cfg'), '[plugin]\nversion="9.9.9"\n');
    git(['commit', '-qam', 'later'], fixture);
    assert.notEqual(git(['rev-parse', 'HEAD'], fixture).trim(), pinned);

    const tmpCache = fs.mkdtempSync(path.join(os.tmpdir(), 'ait-cache-'));
    const prevTmp = process.env.TMPDIR;
    process.env.TMPDIR = tmpCache;
    try {
      const { resolveSdkDir } = await import('../addons/apps_in_toss/tools/scripts/common.mjs');
      const gameDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ait-game-'));
      const sdkDir = resolveSdkDir(gameDir, {
        aitGodotSdk: { baseCommit: pinned, repository: fixture },
      });
      const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sdkDir, encoding: 'utf8' }).trim();
      assert.equal(head, pinned);
      assert.match(fs.readFileSync(path.join(sdkDir, 'addons/apps_in_toss/plugin.cfg'), 'utf8'), /0\.2\.0/);
    } finally {
      process.env.TMPDIR = prevTmp;
    }
  });
});
