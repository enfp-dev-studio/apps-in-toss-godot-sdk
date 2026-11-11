// ait-godot build:dev의 주입 단계 — mock 브리지 + DevTools 패널을 export에 얹는다.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSentryConfig, sentryBuildEnv } from './sentry-config.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const gameDir = path.resolve(process.env.GODOT_PROJECT_DIR ?? process.cwd());

function resolveSdkDir() {
  if (process.env.AIT_ADDON_DIR) return path.resolve(process.env.AIT_ADDON_DIR);
  if (process.env.GODOT_SDK_DIR) return path.resolve(process.env.GODOT_SDK_DIR);
  const sibling = path.resolve(path.dirname(gameDir), 'apps-in-toss-godot-sdk');
  if (fs.existsSync(path.join(sibling, 'addons/apps_in_toss/plugin.cfg'))) return sibling;
  const lock = JSON.parse(fs.readFileSync(path.join(gameDir, '.ait/platform.lock.json'), 'utf8'));
  const { baseCommit: commit, repository: repo } = lock.aitGodotSdk;
  const cached = path.join(os.tmpdir(), 'ait-godot-sdk', commit);
  if (!fs.existsSync(path.join(cached, 'addons/apps_in_toss/plugin.cfg'))) {
    fs.mkdirSync(path.dirname(cached), { recursive: true });
    const tmp = `${cached}.tmp`;
    spawnSync('git', ['clone', '--quiet', lock.aitGodotSdk.repository, tmp], { stdio: 'inherit' });
    fs.renameSync(tmp, cached);
  }
  return cached;
}

const sdkDir = resolveSdkDir();
// 내장 모드: bridge는 addonDir/tools/bridge에 있다. 그 외에는 SDK 리포의 bridge.
const bridgeDir = process.env.AIT_BRIDGE_DIR
  ? path.resolve(process.env.AIT_BRIDGE_DIR)
  : path.join(sdkDir, 'bridge');
// Sentry 연동(매니페스트에 sentry.dsn이 있는 게임만): 개발 빌드는 environment development
const sentry = readSentryConfig(gameDir);
if (sentry) {
  const built = spawnSync('npm', ['run', 'build:sentry'], { cwd: bridgeDir, stdio: 'inherit', env: { ...process.env, ...sentryBuildEnv(sentry, 'development') } });
  if (built.status !== 0) process.exit(built.status ?? 1);
}
const result = spawnSync('node', [path.join(bridgeDir, 'scripts/patch-export.mjs')], {
  cwd: sdkDir,
  stdio: 'inherit',
  env: { ...process.env, AIT_BRIDGE_MOCK: '1', AIT_SENTRY: sentry ? '1' : '', GODOT_EXPORT_DIR: process.env.GODOT_EXPORT_DIR ?? path.join(gameDir, 'build/godot-web') },
});
process.exit(result.status ?? 1);