// 테스트 빌드(build --debug-console) 전용 debug-console 주입과
// release 검증이 그것을 막는지 확인한다.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  DEBUG_CONSOLE_EXPORT_FILE,
  DEV_ONLY_EXPORT_FILES,
  removeDevOnlyFiles,
} from '../addons/apps_in_toss/tools/scripts/export-dir.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const addonDir = path.join(repoRoot, 'addons/apps_in_toss');
const scriptsDir = path.join(addonDir, 'tools/scripts');
const patchScript = path.join(addonDir, 'tools/bridge/scripts/patch-export.mjs');
const verifyScript = path.join(scriptsDir, 'verify-godot-export.mjs');
const manifestScript = path.join(scriptsDir, 'write-platform-manifest.mjs');
const doctorScript = path.join(scriptsDir, 'ait-doctor.mjs');

const BRIDGE = 'apps-in-toss-godot-bridge.js';
const bridgeTag = `<script src="./${BRIDGE}"></script>`;
const consoleTag = `<script src="./${DEBUG_CONSOLE_EXPORT_FILE}"></script>`;

const cleanup = [];
afterEach(() => {
  while (cleanup.length > 0) fs.rmSync(cleanup.pop(), { recursive: true, force: true });
});

function tempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  cleanup.push(dir);
  return dir;
}

// patch-export.mjs는 자기 위치 기준 ../dist에서 번들을 찾으므로 임시 브리지 폴더에 복사해 실행한다.
function makeBridge({ withConsoleBundle = true } = {}) {
  const bridgeDir = tempDir('ait-dc-bridge-');
  fs.mkdirSync(path.join(bridgeDir, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(bridgeDir, 'dist'), { recursive: true });
  fs.copyFileSync(patchScript, path.join(bridgeDir, 'scripts/patch-export.mjs'));
  fs.writeFileSync(path.join(bridgeDir, 'dist', BRIDGE), '// AppsInTossGodot bridge\nwindow.AppsInTossGodot = {};\n');
  fs.writeFileSync(path.join(bridgeDir, 'dist/apps-in-toss-godot-bridge.mock.js'), '// AppsInTossGodot mock\n');
  const panel = path.join(bridgeDir, 'node_modules/@apps-in-toss/devtools/dist/panel/index.js');
  fs.mkdirSync(path.dirname(panel), { recursive: true });
  fs.writeFileSync(panel, '// panel\n');
  if (withConsoleBundle) {
    fs.writeFileSync(path.join(bridgeDir, 'dist', DEBUG_CONSOLE_EXPORT_FILE), '// debug console\n');
  }
  return bridgeDir;
}

// Godot export를 흉내 낸 폴더. debugConsole이면 테스트 빌드 결과를 그대로 만든다.
function makeExport({ debugConsole = false, manifestFlag = debugConsole, consoleFirst = false } = {}) {
  const exportDir = tempDir('ait-dc-export-');
  const tags = debugConsole ? (consoleFirst ? [consoleTag, bridgeTag] : [bridgeTag, consoleTag]) : [bridgeTag];
  fs.writeFileSync(
    path.join(exportDir, 'index.html'),
    `<!doctype html><html><head><meta charset="utf-8">\n  ${tags.join('\n  ')}\n</head><body></body></html>\n`,
  );
  fs.writeFileSync(path.join(exportDir, BRIDGE), '// AppsInTossGodot bridge\nwindow.AppsInTossGodot = {};\n');
  if (debugConsole) fs.writeFileSync(path.join(exportDir, DEBUG_CONSOLE_EXPORT_FILE), '// debug console\n');
  fs.writeFileSync(path.join(exportDir, 'game.wasm'), 'wasm');
  fs.writeFileSync(path.join(exportDir, 'game.pck'), 'pck');
  const lockPath = path.join(tempDir('ait-dc-lock-'), 'platform.lock.json');
  fs.writeFileSync(lockPath, `lock-${Date.now()}-${Math.random()}`);
  writeManifest(exportDir, lockPath, manifestFlag ? { debugConsole: true } : {});
  return { exportDir, lockPath };
}

function writeManifest(exportDir, lockPath, extra = {}) {
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(lockPath)).digest('hex');
  fs.writeFileSync(
    path.join(exportDir, 'ait-platform-manifest.json'),
    JSON.stringify({ platformVersion: '0.0.0-test', platformLockSha256: sha256, ...extra }),
  );
}

// env 값이 undefined면 그 변수를 지운다(스크립트가 `??`로 기본값을 고르게).
function runNode(script, args, env) {
  const merged = { ...process.env, AIT_BRIDGE_MOCK: '', AIT_DEBUG_CONSOLE: '', ...env };
  for (const [key, value] of Object.entries(merged)) if (value === undefined) delete merged[key];
  const result = spawnSync(process.execPath, [script, ...args], {
    env: merged,
    encoding: 'utf8',
    timeout: 30_000,
  });
  assert.ifError(result.error);
  return result;
}

function runPatch(bridgeDir, exportDir, env = {}) {
  return runNode(path.join(bridgeDir, 'scripts/patch-export.mjs'), [exportDir], env);
}

function runVerify(exportDir, lockPath, env = {}) {
  return runNode(verifyScript, [], { GODOT_EXPORT_DIR: exportDir, AIT_PLATFORM_LOCK: lockPath, ...env });
}

function count(text, needle) {
  return text.split(needle).length - 1;
}

describe('patch-export debug-console 주입', () => {
  it('옵션이 없으면 debug-console을 넣지 않는다', () => {
    const bridgeDir = makeBridge();
    const { exportDir, lockPath } = makeExport();
    fs.writeFileSync(path.join(exportDir, 'index.html'), '<!doctype html><html><head></head><body></body></html>\n');
    const result = runPatch(bridgeDir, exportDir);
    assert.equal(result.status, 0, result.stderr);
    const html = fs.readFileSync(path.join(exportDir, 'index.html'), 'utf8');
    assert.equal(count(html, bridgeTag), 1);
    assert.equal(html.includes(DEBUG_CONSOLE_EXPORT_FILE), false);
    assert.equal(fs.existsSync(path.join(exportDir, DEBUG_CONSOLE_EXPORT_FILE)), false);
    assert.equal(runVerify(exportDir, lockPath).status, 0);
  });

  it('AIT_DEBUG_CONSOLE=1이면 브리지 다음에 한 번만 넣고, 다시 실행해도 같다', () => {
    const bridgeDir = makeBridge();
    const { exportDir, lockPath } = makeExport();
    fs.writeFileSync(path.join(exportDir, 'index.html'), '<!doctype html><html><head></head><body></body></html>\n');
    writeManifest(exportDir, lockPath, { debugConsole: true });
    for (let i = 0; i < 2; i += 1) {
      const result = runPatch(bridgeDir, exportDir, { AIT_DEBUG_CONSOLE: '1' });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /do not submit for review/);
    }
    const html = fs.readFileSync(path.join(exportDir, 'index.html'), 'utf8');
    assert.equal(count(html, bridgeTag), 1);
    assert.equal(count(html, consoleTag), 1);
    assert.ok(html.indexOf(bridgeTag) < html.indexOf(consoleTag), html);
    assert.ok(fs.existsSync(path.join(exportDir, DEBUG_CONSOLE_EXPORT_FILE)));

    // 테스트 빌드 검증은 통과하고, 같은 결과를 release로 검증하면 실패한다.
    assert.equal(runVerify(exportDir, lockPath, { AIT_DEBUG_CONSOLE: '1' }).status, 0);
    const release = runVerify(exportDir, lockPath);
    assert.notEqual(release.status, 0);
    assert.match(release.stderr, /ait-debug-console\.js/);
  });

  it('debug-console 번들이 없으면 build:debug-console을 안내하며 실패한다', () => {
    const bridgeDir = makeBridge({ withConsoleBundle: false });
    const { exportDir } = makeExport();
    const result = runPatch(bridgeDir, exportDir, { AIT_DEBUG_CONSOLE: '1' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /build:debug-console/);
    assert.equal(fs.existsSync(path.join(exportDir, DEBUG_CONSOLE_EXPORT_FILE)), false);
  });

  it('mock(Dev Server) 빌드에서는 AIT_DEBUG_CONSOLE을 무시한다', () => {
    const bridgeDir = makeBridge();
    const exportDir = tempDir('ait-dc-mock-');
    fs.writeFileSync(path.join(exportDir, 'index.html'), '<!doctype html><html><head></head><body></body></html>\n');
    const result = runPatch(bridgeDir, exportDir, { AIT_DEBUG_CONSOLE: '1', AIT_BRIDGE_MOCK: '1' });
    assert.equal(result.status, 0, result.stderr);
    const html = fs.readFileSync(path.join(exportDir, 'index.html'), 'utf8');
    assert.equal(html.includes(DEBUG_CONSOLE_EXPORT_FILE), false);
    assert.equal(fs.existsSync(path.join(exportDir, DEBUG_CONSOLE_EXPORT_FILE)), false);
  });
});

describe('verify-godot-export debug-console 검사', () => {
  it('release export에 ait-debug-console.js 파일이 남으면 실패한다', () => {
    const { exportDir, lockPath } = makeExport();
    fs.writeFileSync(path.join(exportDir, DEBUG_CONSOLE_EXPORT_FILE), '// leftover\n');
    const result = runVerify(exportDir, lockPath);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ait-debug-console\.js/);
  });

  it('release index.html이 ait-debug-console.js를 참조하면 실패한다', () => {
    const { exportDir, lockPath } = makeExport();
    const indexPath = path.join(exportDir, 'index.html');
    fs.writeFileSync(indexPath, fs.readFileSync(indexPath, 'utf8').replace('</head>', `  ${consoleTag}\n</head>`));
    const result = runVerify(exportDir, lockPath);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ait-debug-console\.js/);
  });

  it('release 매니페스트에 debugConsole: true가 있으면 실패한다', () => {
    const { exportDir, lockPath } = makeExport({ manifestFlag: true });
    const result = runVerify(exportDir, lockPath);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /debugConsole/);
  });

  it('브리지 번들에 debug-console 코드가 섞이면 실패한다', () => {
    const { exportDir, lockPath } = makeExport();
    fs.appendFileSync(path.join(exportDir, BRIDGE), 'window.__ait_debug_status = "idle";\n');
    const result = runVerify(exportDir, lockPath);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /debug-console/);
  });

  it('테스트 빌드 결과는 AIT_DEBUG_CONSOLE=1 검증을 통과한다', () => {
    const { exportDir, lockPath } = makeExport({ debugConsole: true });
    const result = runVerify(exportDir, lockPath, { AIT_DEBUG_CONSOLE: '1' });
    assert.equal(result.status, 0, result.stderr);
  });

  it('테스트 빌드인데 매니페스트에 debugConsole이 없으면 실패한다', () => {
    const { exportDir, lockPath } = makeExport({ debugConsole: true, manifestFlag: false });
    const result = runVerify(exportDir, lockPath, { AIT_DEBUG_CONSOLE: '1' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /debugConsole/);
  });

  it('테스트 빌드에서 debug-console이 브리지보다 먼저 오면 실패한다', () => {
    const { exportDir, lockPath } = makeExport({ debugConsole: true, consoleFirst: true });
    const result = runVerify(exportDir, lockPath, { AIT_DEBUG_CONSOLE: '1' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /after the Apps in Toss Godot bridge/);
  });

  it('테스트 빌드인데 ait-debug-console.js 파일이 없으면 실패한다', () => {
    const { exportDir, lockPath } = makeExport({ debugConsole: true });
    fs.rmSync(path.join(exportDir, DEBUG_CONSOLE_EXPORT_FILE));
    const result = runVerify(exportDir, lockPath, { AIT_DEBUG_CONSOLE: '1' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Debug console bundle not found/);
  });

  it('테스트 빌드라도 mock 브리지·DevTools 패널은 여전히 막는다', () => {
    const { exportDir, lockPath } = makeExport({ debugConsole: true });
    fs.writeFileSync(path.join(exportDir, 'ait-devtools-panel.js'), '// panel\n');
    const result = runVerify(exportDir, lockPath, { AIT_DEBUG_CONSOLE: '1' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ait-devtools-panel\.js/);
  });
});

describe('export 폴더 정리', () => {
  it('ait-debug-console.js는 개발 전용 목록에 있고 정리 대상이다', () => {
    assert.ok(DEV_ONLY_EXPORT_FILES.includes(DEBUG_CONSOLE_EXPORT_FILE));
    const dir = tempDir('ait-dc-clean-');
    fs.writeFileSync(path.join(dir, DEBUG_CONSOLE_EXPORT_FILE), '// leftover\n');
    fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html>');
    assert.deepEqual(removeDevOnlyFiles(dir), [DEBUG_CONSOLE_EXPORT_FILE]);
    assert.equal(fs.existsSync(path.join(dir, DEBUG_CONSOLE_EXPORT_FILE)), false);
    assert.ok(fs.existsSync(path.join(dir, 'index.html')));
  });
});

// 게임 폴더(.ait/platform.lock.json + game.manifest.json)와 빈 export 폴더를 만든다.
function makeGame() {
  const gameDir = tempDir('ait-dc-game-');
  fs.mkdirSync(path.join(gameDir, '.ait'), { recursive: true });
  fs.copyFileSync(
    path.join(addonDir, 'tools/templates/platform.lock.json'),
    path.join(gameDir, '.ait/platform.lock.json'),
  );
  const manifest = JSON.parse(
    fs.readFileSync(path.join(addonDir, 'tools/templates/game.manifest.example.json'), 'utf8'),
  );
  manifest.gameId = 'debug-console-test';
  fs.writeFileSync(path.join(gameDir, '.ait/game.manifest.json'), JSON.stringify(manifest, null, 2));
  const exportDir = path.join(gameDir, 'build/godot-web');
  fs.mkdirSync(exportDir, { recursive: true });
  return { gameDir, exportDir };
}

describe('write-platform-manifest debugConsole 기록', () => {
  for (const [label, env, expected] of [
    ['옵션이 없으면 debugConsole 키가 없다', {}, undefined],
    ['AIT_DEBUG_CONSOLE=1이면 debugConsole: true', { AIT_DEBUG_CONSOLE: '1' }, true],
  ]) {
    it(label, () => {
      const { gameDir, exportDir } = makeGame();
      const result = runNode(manifestScript, [], {
        GODOT_PROJECT_DIR: gameDir,
        GODOT_EXPORT_DIR: exportDir,
        AIT_PLATFORM_LOCK: undefined,
        ...env,
      });
      assert.equal(result.status, 0, result.stderr);
      const manifest = JSON.parse(fs.readFileSync(path.join(exportDir, 'ait-platform-manifest.json'), 'utf8'));
      assert.equal(manifest.debugConsole, expected);
      assert.equal(manifest.game.gameId, 'debug-console-test');
    });
  }
});

describe('doctor debugConsole 경고', () => {
  function runDoctor(gameDir) {
    return runNode(doctorScript, ['--strict'], {
      GODOT_PROJECT_DIR: gameDir,
      GODOT_EXPORT_DIR: undefined,
      AIT_ADDON_DIR: addonDir,
      AIT_BRIDGE_DIR: path.join(addonDir, 'tools/bridge'),
      AIT_PLATFORM_LOCK: undefined,
      AIT_PLATFORM_STRICT: '1',
      GODOT_BIN: path.join(gameDir, 'no-godot'),
    });
  }

  it('export 매니페스트의 debugConsole: true를 경고한다', () => {
    const { gameDir, exportDir } = makeGame();
    fs.writeFileSync(
      path.join(exportDir, 'ait-platform-manifest.json'),
      JSON.stringify({ platformVersion: 'x', debugConsole: true }),
    );
    const result = runDoctor(gameDir);
    assert.match(result.stderr, /WARN build\/godot-web\/ait-platform-manifest\.json has "debugConsole": true/);
    assert.match(result.stderr, /검수에 제출하지 마세요/);
  });

  it('release 매니페스트면 debugConsole 경고가 없다', () => {
    const { gameDir, exportDir } = makeGame();
    fs.writeFileSync(path.join(exportDir, 'ait-platform-manifest.json'), JSON.stringify({ platformVersion: 'x' }));
    const result = runDoctor(gameDir);
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /debugConsole/);
  });
});
