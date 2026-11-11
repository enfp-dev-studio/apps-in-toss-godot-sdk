import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const script = fileURLToPath(new URL('../addons/apps_in_toss/tools/scripts/write-ait-config.mjs', import.meta.url));

function baseManifest() {
  return {
    gameId: 'test-game',
    gameVersion: '0.1.0',
    platformLock: 'platform.lock.json',
    requiredApis: [],
    releaseChannel: 'sandbox',
  };
}

function runWithManifest(extra, extraEnv = {}) {
  const game = fs.mkdtempSync(path.join(os.tmpdir(), 'ait-config-'));
  fs.mkdirSync(path.join(game, '.ait'), { recursive: true });
  fs.writeFileSync(
    path.join(game, '.ait/game.manifest.json'),
    JSON.stringify({ ...baseManifest(), ...extra }, null, 2),
  );
  const result = spawnSync(process.execPath, [script], {
    env: { ...process.env, GODOT_PROJECT_DIR: game, ...extraEnv },
    encoding: 'utf8',
    timeout: 10_000,
  });
  let config = null;
  const configPath = path.join(game, 'apps-in-toss.config.ts');
  if (fs.existsSync(configPath)) {
    config = fs.readFileSync(configPath, 'utf8');
  }
  return { game, result, config };
}

function cleanup(game) {
  fs.rmSync(game, { recursive: true, force: true });
}

test('새 필드 없음 → 캔버스 앱 webView 기본값, 빈 permissions, navigationBar 없음', () => {
  const { game, result, config } = runWithManifest({});
  try {
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.match(config, /"?mediaPlaybackRequiresUserAction"?\s*:\s*false/);
    assert.match(config, /"?pullToRefreshEnabled"?\s*:\s*false/);
    assert.match(config, /"?bounces"?\s*:\s*false/);
    assert.match(config, /"?overScrollMode"?\s*:\s*"never"/);
    assert.match(config, /"?allowsBackForwardNavigationGestures"?\s*:\s*false/);
    assert.match(config, /"?allowsInlineMediaPlayback"?\s*:\s*true/);
    assert.match(config, /permissions:\s*\[\]/);
    assert.ok(!config.includes('navigationBar'), 'navigationBar가 없어야 한다');
  } finally {
    cleanup(game);
  }
});

test('webView 추가 옵션이 기본값과 함께 포함된다', () => {
  const { game, result, config } = runWithManifest({
    webView: { bounces: false, allowsBackForwardNavigationGestures: false },
  });
  try {
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.match(config, /"?bounces"?\s*:\s*false/);
    assert.match(config, /"?allowsBackForwardNavigationGestures"?\s*:\s*false/);
    assert.match(config, /"?mediaPlaybackRequiresUserAction"?\s*:\s*false/);
    assert.match(config, /"?pullToRefreshEnabled"?\s*:\s*false/);
  } finally {
    cleanup(game);
  }
});

test('webView pullToRefreshEnabled를 true로 덮어쓴다', () => {
  const { game, result, config } = runWithManifest({
    webView: { pullToRefreshEnabled: true },
  });
  try {
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.match(config, /"?pullToRefreshEnabled"?\s*:\s*true/);
  } finally {
    cleanup(game);
  }
});

test('permissions clipboard/read이 포함된다', () => {
  const { game, result, config } = runWithManifest({
    permissions: [{ name: 'clipboard', access: 'read' }],
  });
  try {
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.match(config, /clipboard/);
    assert.match(config, /read/);
  } finally {
    cleanup(game);
  }
});

test('navigationBar withTitle/theme이 포함된다', () => {
  const { game, result, config } = runWithManifest({
    navigationBar: { withTitle: false, theme: 'dark' },
  });
  try {
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.match(config, /"?withTitle"?\s*:\s*false/);
    assert.match(config, /"?theme"?\s*:\s*"dark"/);
  } finally {
    cleanup(game);
  }
});

test('webView 모르는 키는 실패한다', () => {
  const { game, result } = runWithManifest({ webView: { unknownKey: true } });
  try {
    assert.ifError(result.error);
    assert.notEqual(result.status, 0);
  } finally {
    cleanup(game);
  }
});

test('permissions 잘못된 조합은 실패한다', () => {
  const { game, result } = runWithManifest({ permissions: [{ name: 'camera', access: 'read' }] });
  try {
    assert.ifError(result.error);
    assert.notEqual(result.status, 0);
  } finally {
    cleanup(game);
  }
});

test('생성 파일 주석 경로가 .ait/game.manifest.json으로 나온다', () => {
  const { game, result, config } = runWithManifest({});
  try {
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    const firstLine = config.split('\n')[0];
    assert.ok(firstLine.includes('.ait/game.manifest.json'), firstLine);
  } finally {
    cleanup(game);
  }
});

test('GODOT_EXPORT_DIR이 게임 안 절대경로면 상대경로로 기록된다', () => {
  const game = fs.mkdtempSync(path.join(os.tmpdir(), 'ait-config-'));
  fs.mkdirSync(path.join(game, '.ait'), { recursive: true });
  fs.writeFileSync(
    path.join(game, '.ait/game.manifest.json'),
    JSON.stringify(baseManifest(), null, 2),
  );
  const absoluteInside = path.join(game, 'build/godot-web');
  const result = spawnSync(process.execPath, [script], {
    env: { ...process.env, GODOT_PROJECT_DIR: game, GODOT_EXPORT_DIR: absoluteInside },
    encoding: 'utf8',
    timeout: 10_000,
  });
  try {
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    const config = fs.readFileSync(path.join(game, 'apps-in-toss.config.ts'), 'utf8');
    assert.ok(config.includes("?? 'build/godot-web'"), config);
  } finally {
    cleanup(game);
  }
});

test('GODOT_EXPORT_DIR이 게임 밖 절대경로면 절대경로 그대로 기록된다', () => {
  const outsideBase = fs.mkdtempSync(path.join(os.tmpdir(), 'ait-config-outside-'));
  const outside = path.join(outsideBase, 'build-out');
  const { game, result, config } = runWithManifest({}, { GODOT_EXPORT_DIR: outside });
  try {
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(config.includes(`?? '${outside}'`), config);
  } finally {
    cleanup(game);
    cleanup(outsideBase);
  }
});

test('appType nongame → navigationBar.withBackButton: true 기본값', () => {
  const { game, result, config } = runWithManifest({ appType: 'nongame' });
  try {
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.match(config, /navigationBar:\s*\{[^}]*"withBackButton"\s*:\s*true/s);
    assert.ok(!config.includes('transparentBackground'), '비게임 기본값에 투명 배경이 없어야 한다');
    assert.match(result.stdout, /appType: nongame/);
  } finally {
    cleanup(game);
  }
});

test('appType game → navigationBar.transparentBackground: true 기본값', () => {
  const { game, result, config } = runWithManifest({ appType: 'game' });
  try {
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.match(config, /navigationBar:\s*\{[^}]*"transparentBackground"\s*:\s*true/s);
    assert.ok(!config.includes('withBackButton'), '게임 기본값에 뒤로가기 버튼이 없어야 한다');
  } finally {
    cleanup(game);
  }
});

test('appType 기본값보다 매니페스트 navigationBar가 우선한다', () => {
  const { game, result, config } = runWithManifest({
    appType: 'nongame',
    navigationBar: { withBackButton: false, theme: 'dark' },
  });
  try {
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.match(config, /"withBackButton"\s*:\s*false/);
    assert.match(config, /"theme"\s*:\s*"dark"/);
  } finally {
    cleanup(game);
  }
});

test('appType이 없으면 navigationBar를 넣지 않고 안내만 한다', () => {
  const { game, result, config } = runWithManifest({});
  try {
    assert.equal(result.status, 0, result.stderr);
    assert.ok(!config.includes('navigationBar'));
    assert.match(result.stdout, /appType이 없어/);
  } finally {
    cleanup(game);
  }
});

test('알 수 없는 appType은 실패한다', () => {
  const { game, result } = runWithManifest({ appType: 'webview' });
  try {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /appType must be "game" or "nongame"/);
  } finally {
    cleanup(game);
  }
});

test('실행 설정(build/ait-app-config.json)에 appType과 내비 바 투명 여부를 남긴다', () => {
  for (const [manifest, expected] of [
    [{}, { appType: null, navigationBar: { transparentBackground: null } }],
    [{ appType: 'game' }, { appType: 'game', navigationBar: { transparentBackground: true } }],
    [{ appType: 'nongame' }, { appType: 'nongame', navigationBar: { transparentBackground: null } }],
    [{ appType: 'game', navigationBar: { transparentBackground: false } }, { appType: 'game', navigationBar: { transparentBackground: false } }],
  ]) {
    const { game, result } = runWithManifest(manifest);
    try {
      assert.equal(result.status, 0, result.stderr);
      const runtime = JSON.parse(fs.readFileSync(path.join(game, 'build/ait-app-config.json'), 'utf8'));
      const { appInfo, ...rest } = runtime;
      assert.equal(typeof appInfo.displayName, 'string');
      assert.deepEqual(rest, { ...expected, userFiles: [], keyboardMode: 'pan', runtimeLog: { firstInteractive: true } }, JSON.stringify(manifest));
    } finally {
      cleanup(game);
    }
  }
});

test('initialAccessoryButton은 3.10 accessibilityLabel(id 생략)과 예전 id/title을 모두 받는다', () => {
  const icon = { name: 'icon-setting-mono' };
  for (const button of [{ accessibilityLabel: '설정', icon }, { id: 'settings', title: '설정', icon }]) {
    const { game, result, config } = runWithManifest({ navigationBar: { initialAccessoryButton: button } });
    try {
      assert.equal(result.status, 0, result.stderr);
      assert.match(config, /initialAccessoryButton/);
    } finally {
      cleanup(game);
    }
  }
  const { game, result } = runWithManifest({ navigationBar: { initialAccessoryButton: { id: 'x', icon } } });
  try {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /accessibilityLabel/);
  } finally {
    cleanup(game);
  }
});

test('runtimeLog.firstInteractive는 실행 설정(build/ait-app-config.json)에 들어가고 기본은 켬', () => {
  for (const [extra, expected] of [[{}, true], [{ runtimeLog: { firstInteractive: false } }, false]]) {
    const { game, result } = runWithManifest(extra);
    try {
      assert.equal(result.status, 0, result.stderr);
      const runtime = JSON.parse(fs.readFileSync(path.join(game, 'build/ait-app-config.json'), 'utf8'));
      assert.equal(runtime.runtimeLog.firstInteractive, expected);
    } finally {
      cleanup(game);
    }
  }
  const { game, result } = runWithManifest({ runtimeLog: { firstInteractive: 'no' } });
  try {
    assert.notEqual(result.status, 0);
  } finally {
    cleanup(game);
  }
});

test('userFiles는 user:// 경로만 받아 실행 설정에 넣는다', () => {
  const { game, result } = runWithManifest({ userFiles: ['user://settings.cfg'] });
  try {
    assert.equal(result.status, 0, result.stderr);
    const runtime = JSON.parse(fs.readFileSync(path.join(game, 'build/ait-app-config.json'), 'utf8'));
    assert.deepEqual(runtime.userFiles, ['user://settings.cfg']);
  } finally {
    cleanup(game);
  }
  for (const userFiles of [['res://a'], ['user://../x'], 'user://a']) {
    const bad = runWithManifest({ userFiles });
    try {
      assert.notEqual(bad.result.status, 0, JSON.stringify(userFiles));
    } finally {
      cleanup(bad.game);
    }
  }
});

test('keyboardMode와 appInfo가 실행 설정에 들어간다', () => {
  const { game, result } = runWithManifest({ keyboardMode: 'resize', displayName: '고양이 공부방', brand: { primaryColor: '#C2410C' } });
  try {
    assert.equal(result.status, 0, result.stderr);
    const runtime = JSON.parse(fs.readFileSync(path.join(game, 'build/ait-app-config.json'), 'utf8'));
    assert.equal(runtime.keyboardMode, 'resize');
    assert.deepEqual(runtime.appInfo, { displayName: '고양이 공부방', primaryColor: '#C2410C', iconUrl: null });
  } finally {
    cleanup(game);
  }
  const bad = runWithManifest({ keyboardMode: 'adjust' });
  try {
    assert.notEqual(bad.result.status, 0);
  } finally {
    cleanup(bad.game);
  }
});
