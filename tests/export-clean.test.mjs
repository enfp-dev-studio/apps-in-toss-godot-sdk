// release 번들 잔여물 회귀 — build:dev 뒤 build를 돌려도 mock 브리지·DevTools 패널·
// *.import가 .ait에 실리면 안 된다. export-godot는 게임의 build/ 안만 비우고,
// verify-godot-export는 release 모드에서 그런 파일을 거부한다.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const scriptsDir = path.resolve(here, '../addons/apps_in_toss/tools/scripts');
const exportScript = path.join(scriptsDir, 'export-godot.mjs');
const verifyScript = path.join(scriptsDir, 'verify-godot-export.mjs');

const DEV_LEFTOVERS = ['apps-in-toss-godot-bridge.mock.js', 'ait-devtools-panel.js', 'index.png.import'];

function makeGameDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ait-export-clean-'));
  fs.writeFileSync(path.join(dir, 'project.godot'), '; Engine configuration file.\n');
  return dir;
}

// 실제 Godot 대신: --script(컴파일 게이트)는 통과, --export-release는 최소 Web 출력을 쓴다.
function makeFakeGodot(dir) {
  const impl = path.join(dir, 'fake-godot.mjs');
  fs.writeFileSync(
    impl,
    `import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const i = args.indexOf('--export-release');
if (i !== -1) {
  const out = args[i + 2];
  const dir = path.dirname(out);
  fs.writeFileSync(out, '<!doctype html><html><head></head><body></body></html>\\n');
  for (const name of ['index.wasm', 'index.pck', 'index.png']) fs.writeFileSync(path.join(dir, name), name);
}
`,
  );
  const bin = path.join(dir, 'godot');
  fs.writeFileSync(bin, `#!/bin/sh\nexec "${process.execPath}" "${impl}" "$@"\n`, { mode: 0o755 });
  return bin;
}

function runExport(gameDir, env = {}) {
  const tools = fs.mkdtempSync(path.join(os.tmpdir(), 'ait-fake-godot-'));
  try {
    return spawnSync(process.execPath, [exportScript], {
      cwd: gameDir,
      env: { ...process.env, GODOT_PROJECT_DIR: gameDir, GODOT_BIN: makeFakeGodot(tools), ...env },
      encoding: 'utf8',
      timeout: 30_000,
    });
  } finally {
    fs.rmSync(tools, { recursive: true, force: true });
  }
}

function writeFiles(dir, names) {
  fs.mkdirSync(dir, { recursive: true });
  for (const name of names) fs.writeFileSync(path.join(dir, name), 'stale');
}

describe('export-godot.mjs export dir cleanup', () => {
  it('removes build:dev leftovers from the game build/godot-web and writes build/.gdignore', () => {
    const game = makeGameDir();
    try {
      const exportDir = path.join(game, 'build/godot-web');
      writeFiles(exportDir, [...DEV_LEFTOVERS, 'ait-platform-manifest.json']);

      const result = runExport(game);
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      assert.deepEqual(fs.readdirSync(exportDir).sort(), ['index.html', 'index.pck', 'index.png', 'index.wasm']);
      assert.ok(fs.existsSync(path.join(game, 'build/.gdignore')), 'build/.gdignore must exist');
    } finally {
      fs.rmSync(game, { recursive: true, force: true });
    }
  });

  it('does not clean a custom export dir outside the game build folder', () => {
    const game = makeGameDir();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ait-export-outside-'));
    try {
      writeFiles(outside, ['keep-me.txt']);

      const result = runExport(game, { GODOT_EXPORT_DIR: outside });
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      assert.match(result.stdout, /not cleaning/);
      assert.ok(fs.existsSync(path.join(outside, 'keep-me.txt')), 'files outside build/ must survive');
      assert.ok(!fs.existsSync(path.join(game, 'build/.gdignore')));
    } finally {
      fs.rmSync(game, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('does not clean through a build/godot-web symlink that points outside build/', () => {
    const game = makeGameDir();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ait-export-outside-'));
    try {
      writeFiles(outside, ['keep-me.txt']);
      fs.mkdirSync(path.join(game, 'build'));
      fs.symlinkSync(outside, path.join(game, 'build/godot-web'));

      const result = runExport(game);
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      assert.match(result.stdout, /not cleaning/);
      assert.ok(fs.existsSync(path.join(outside, 'keep-me.txt')), 'symlink target must survive');
    } finally {
      fs.rmSync(game, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe('verify-godot-export.mjs release leftovers', () => {
  function makeReleaseBundle() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ait-verify-'));
    const exportDir = path.join(dir, 'build/godot-web');
    fs.mkdirSync(exportDir, { recursive: true });
    const lockPath = path.join(dir, 'platform.lock.json');
    fs.writeFileSync(lockPath, '{"platformVersion":"test"}\n');
    const lockSha256 = crypto.createHash('sha256').update(fs.readFileSync(lockPath)).digest('hex');
    fs.writeFileSync(
      path.join(exportDir, 'index.html'),
      '<!doctype html><html><head>\n  <script src="./apps-in-toss-godot-bridge.js"></script>\n</head><body></body></html>\n',
    );
    fs.writeFileSync(path.join(exportDir, 'apps-in-toss-godot-bridge.js'), 'window.AppsInTossGodot = {};\n');
    fs.writeFileSync(
      path.join(exportDir, 'ait-platform-manifest.json'),
      JSON.stringify({ platformVersion: 'test', platformLockSha256: lockSha256 }),
    );
    for (const name of ['index.wasm', 'index.pck', 'index.png']) fs.writeFileSync(path.join(exportDir, name), name);
    return { dir, exportDir, lockPath };
  }

  function runVerify({ dir, exportDir, lockPath }, env = {}) {
    return spawnSync(process.execPath, [verifyScript, exportDir], {
      cwd: dir,
      env: { ...process.env, GODOT_PROJECT_DIR: dir, AIT_PLATFORM_LOCK: lockPath, AIT_BRIDGE_MOCK: '', ...env },
      encoding: 'utf8',
      timeout: 10_000,
    });
  }

  it('accepts a clean release bundle', () => {
    const bundle = makeReleaseBundle();
    try {
      const result = runVerify(bundle);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /Verified Godot Apps in Toss bundle: 6 files/);
    } finally {
      fs.rmSync(bundle.dir, { recursive: true, force: true });
    }
  });

  for (const leftover of DEV_LEFTOVERS) {
    it(`rejects ${leftover} in a release bundle`, () => {
      const bundle = makeReleaseBundle();
      try {
        fs.writeFileSync(path.join(bundle.exportDir, leftover), 'stale');
        const result = runVerify(bundle);
        assert.notEqual(result.status, 0, 'verify must fail');
        assert.match(result.stderr, new RegExp(`dev build or Godot import files: ${leftover.replace(/\./g, '\\.')}`));
      } finally {
        fs.rmSync(bundle.dir, { recursive: true, force: true });
      }
    });
  }

  it('rejects a .import file in a bundle subfolder', () => {
    const bundle = makeReleaseBundle();
    try {
      writeFiles(path.join(bundle.exportDir, 'assets'), ['icon.svg.import']);
      const result = runVerify(bundle);
      assert.notEqual(result.status, 0, 'verify must fail');
      assert.match(result.stderr, /icon\.svg\.import/);
    } finally {
      fs.rmSync(bundle.dir, { recursive: true, force: true });
    }
  });
});
