// ait-godot build:dev — mock 브리지 + DevTools 패널 개발 빌드 (Unity Dev Server 대응).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const gameDir = path.resolve(process.env.GODOT_PROJECT_DIR ?? process.cwd());

function fail(message) { console.error(`[ait-godot dev] ${message}`); process.exit(1); }
function run(cmd, argv, { cwd = gameDir, env = {} } = {}) {
  const result = spawnSync(cmd, argv, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });
  if (result.error) fail(String(result.error));
  if (result.status !== 0) fail(`단계 실패: ${cmd} ${argv.join(' ')}`);
}
function script(name, env = {}, extraArgs = []) {
  run(process.execPath, [path.join(here, name), ...extraArgs], { env });
}
function resolveSdkDir() {
  if (process.env.AIT_ADDON_DIR) return path.resolve(process.env.AIT_ADDON_DIR);
  const explicit = process.env.GODOT_SDK_DIR;
  if (explicit) return path.resolve(explicit);
  const sibling = path.resolve(gameDir, '..', 'apps-in-toss-godot-sdk');
  if (fs.existsSync(path.join(sibling, 'addons/apps_in_toss/plugin.cfg'))) return sibling;
  const lock = JSON.parse(fs.readFileSync(path.join(gameDir, '.ait/platform.lock.json'), 'utf8'));
  const { baseCommit: commit, repository: repo } = lock.aitGodotSdk;
  const cache = path.join(os.tmpdir(), 'ait-godot-sdk');
  const cached = path.join(cache, commit);
  if (!fs.existsSync(path.join(cached, 'addons/apps_in_toss/plugin.cfg'))) {
    fs.mkdirSync(cache, { recursive: true });
    const tmp = path.join(cache, `${commit}.tmp`);
    run('git', ['clone', '--quiet', repo, tmp]);
    fs.renameSync(tmp, cached);
  }
  return cached;
}

const sdkDir = resolveSdkDir();
// 내장 모드: bridge는 addonDir/tools/bridge에 있다. 그 외에는 SDK 리포의 bridge.
const bridgeDir = process.env.AIT_BRIDGE_DIR
  ? path.resolve(process.env.AIT_BRIDGE_DIR)
  : path.join(sdkDir, 'bridge');

script('write-ait-config.mjs', { GODOT_SDK_DIR: sdkDir });
script('ait-doctor.mjs', { GODOT_SDK_DIR: sdkDir }); // sandbox 채널은 advisory 허용
script('sync-godot-sdk.mjs', { GODOT_SDK_DIR: sdkDir });
run('npm', ['run', 'build'], { cwd: bridgeDir, env: { AIT_BRIDGE_MOCK: '1' } });
script('export-godot.mjs', { GODOT_SDK_DIR: sdkDir });
run('node', [path.join(bridgeDir, 'scripts/patch-export.mjs')], { cwd: sdkDir, env: { AIT_BRIDGE_MOCK: '1' } });
console.log('\n[ait-godot] dev build 완료. 다음: ait-godot preview → 브라우저 테스트');