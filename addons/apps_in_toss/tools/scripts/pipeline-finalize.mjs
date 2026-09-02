// ait-godot: 브리지 빌드 + 주입 + 무결성 검사 (release 파이프라인의 후반부).
// Unity SDK의 "브리지 주입 + 검증"에 해당. SDK 리포의 bridge 도구를 사용한다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const gameDir = process.env.GODOT_PROJECT_DIR
  ? path.resolve(process.env.GODOT_PROJECT_DIR)
  : process.cwd();

function fail(message) { console.error(`[ait-godot finalize] ${message}`); process.exit(1); }
function run(cmd, argv, { cwd = gameDir, env = {} } = {}) {
  const result = spawnSync(cmd, argv, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });
  if (result.error) fail(String(result.error));
  if (result.status !== 0) fail(`실패: ${cmd} ${argv.join(' ')}`);
}

export function resolveSdkDir() {
  if (process.env.AIT_ADDON_DIR) return path.resolve(process.env.AIT_ADDON_DIR);
  const explicit = process.env.GODOT_SDK_DIR;
  if (explicit) return path.resolve(explicit);
  const sibling = path.resolve(path.dirname(gameDir), 'apps-in-toss-godot-sdk');
  if (fs.existsSync(path.join(sibling, 'addons/apps_in_toss/plugin.cfg'))) return sibling;
  const lockPath = path.join(gameDir, '.ait/platform.lock.json');
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  const { baseCommit: commit, repository: repo } = lock.aitGodotSdk;
  const cached = path.join(os.tmpdir(), 'ait-godot-sdk', commit);
  if (!fs.existsSync(path.join(cached, 'addons/apps_in_toss/plugin.cfg'))) {
    fs.mkdirSync(path.dirname(cached), { recursive: true });
    const tmp = `${cached}.tmp`;
    const clone = spawnSync('git', ['clone', '--quiet', repo, tmp], { stdio: 'inherit' });
    if (clone.status !== 0) fail(`SDK 클론 실패: ${repo}`);
    fs.renameSync(tmp, cached);
  }
  return cached;
}

const sdkDir = resolveSdkDir();
// 내장 모드: bridge는 addonDir/tools/bridge에 있다. 그 외에는 SDK 리포의 bridge.
const bridgeDir = process.env.AIT_BRIDGE_DIR
  ? path.resolve(process.env.AIT_BRIDGE_DIR)
  : path.join(sdkDir, 'bridge');

// GDScript 재생성(생성물 정합) + 브리지 의존성 확인 후 타입체크·번들
run('node', [path.join(bridgeDir, 'scripts/generate-gdscript.mjs')], { cwd: sdkDir });
if (!fs.existsSync(path.join(bridgeDir, 'node_modules'))) {
  console.log('[ait-godot finalize] bridge 의존성 설치...');
  run('npm', ['install', '--no-audit', '--no-fund'], { cwd: bridgeDir });
}
run('npm', ['run', 'build'], { cwd: bridgeDir });

// 주입 + export 무결성 검증 — 게임 리포의 export dir을 명시적으로 넘긴다.
run('node', [path.join(bridgeDir, 'scripts/patch-export.mjs')], {
  cwd: sdkDir,
  env: { GODOT_EXPORT_DIR: path.join(gameDir, 'build/godot-web') },
});
run(process.execPath, [path.join(here, 'verify-godot-export.mjs')], {
  env: { GODOT_EXPORT_DIR: path.join(gameDir, 'build/godot-web') },
});

console.log('[ait-godot finalize] 브리지 주입·검증 완료');