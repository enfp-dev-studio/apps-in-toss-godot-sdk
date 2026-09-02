// ait-godot build (release): Unity의 Build & Package에 대응하는 전체 파이프라인.
// 각 단계는 SDK 리포/플랫폼 리포에서 검증된 스크립트를 게임 환경으로 호출한다.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const gameDir = path.resolve(process.env.GODOT_PROJECT_DIR ?? process.cwd());
const gameId = JSON.parse(fs.readFileSync(path.join(gameDir, '.ait/game.manifest.json'), 'utf8')).gameId;

function fail(message) {
  console.error(`[ait-godot build] ${message}`);
  process.exit(1);
}
function run(cmd, argv, { cwd = gameDir, env = {} } = {}) {
  const result = spawnSync(cmd, argv, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });
  if (result.error) fail(String(result.error));
  if (result.status !== 0) fail(`단계 실패: ${cmd} ${argv.join(' ')} (exit ${result.status})`);
}
function script(scriptName, env = {}, extraArgs = []) {
  run(process.execPath, [path.join(here, scriptName), ...extraArgs], { env });
}
function resolveSdkDir() {
  if (process.env.AIT_ADDON_DIR) return path.resolve(process.env.AIT_ADDON_DIR);
  const explicit = process.env.GODOT_SDK_DIR;
  if (explicit) return path.resolve(explicit);
  const sibling = path.resolve(gameDir, '..', 'apps-in-toss-godot-sdk');
  if (fs.existsSync(path.join(sibling, 'addons/apps_in_toss/plugin.cfg'))) return sibling;
  const lock = JSON.parse(fs.readFileSync(path.join(gameDir, '.ait/platform.lock.json'), 'utf8'));
  const commit = lock.aitGodotSdk.baseCommit;
  const repo = lock.aitGodotSdk.repository;
  const cache = path.join(os.tmpdir(), 'ait-godot-sdk');
  const cached = path.join(cache, commit);
  if (!fs.existsSync(path.join(cached, 'addons/apps_in_toss/plugin.cfg'))) {
    fs.mkdirSync(cache, { recursive: true });
    const tmp = path.join(cache, `${commit}.tmp`);
    fs.rmSync(tmp, { recursive: true, force: true });
    run('git', ['clone', '--quiet', repo, tmp]);
    fs.renameSync(tmp, cached);
    console.log(`[ait-godot] SDK 클론 완료 (${commit.slice(0, 7)}) → ${cached}`);
  }
  fs.writeFileSync(path.join(cached, '.sdk-commit'), commit);
  return cached;
}

console.log(`[ait-godot] 게임: ${gameId} (${gameDir})`);
const sdkDir = resolveSdkDir();
// 내장 모드: bridge는 addonDir/tools/bridge에 있다. 그 외에는 SDK 리포의 bridge.
const bridgeDir = process.env.AIT_BRIDGE_DIR
  ? path.resolve(process.env.AIT_BRIDGE_DIR)
  : path.join(sdkDir, 'bridge');

// 1. 설정 생성 (Unity Configuration 대응)
script('write-ait-config.mjs', { GODOT_SDK_DIR: sdkDir });

// 2. strict 호환성 검사 (Unity AITBuildInitializer 대응)
script('ait-doctor.mjs', { GODOT_SDK_DIR: sdkDir, AIT_PLATFORM_STRICT: '1' }, ['--strict']);

// 3. SDK → 게임 애드온 동기화
script('sync-godot-sdk.mjs', { GODOT_SDK_DIR: sdkDir });

// 4. GDScript API + 카탈로그 재생성 (SDK 원본 기준)
run('node', [path.join(bridgeDir, 'scripts/generate-gdscript.mjs')], { cwd: sdkDir });

// 5. 브리지 타입체크 + 번들 (캐시 클론이면 의존성이 없으므로 설치)
if (!fs.existsSync(path.join(bridgeDir, 'node_modules'))) {
  console.log('[ait-godot] bridge 의존성 설치...');
  run('npm', ['install', '--no-audit', '--no-fund'], { cwd: bridgeDir });
}
run('npm', ['run', 'build'], { cwd: bridgeDir });

// 6. Godot Web export — export 결과물도 게임 리포 안에 둔다.
script('export-godot.mjs', { GODOT_SDK_DIR: sdkDir, GODOT_EXPORT_DIR: path.join(gameDir, 'build/godot-web') });

// 7. 플랫폼 매니페스트 (ait-build-info.json 대응) — export dir 기준으로 기록
script('write-platform-manifest.mjs', {
  GODOT_SDK_DIR: sdkDir,
  GODOT_EXPORT_DIR: path.join(gameDir, 'build/godot-web'),
});

// 8. 브리지 주입 + export 무결성 검증
run('node', [path.join(bridgeDir, 'scripts/patch-export.mjs')], {
  cwd: sdkDir,
  env: { GODOT_EXPORT_DIR: path.join(gameDir, 'build/godot-web') },
});
script('verify-godot-export.mjs', { GODOT_SDK_DIR: sdkDir, GODOT_EXPORT_DIR: path.join(gameDir, 'build/godot-web') });

// 9. .ait 패키징 (ait bin 해석은 pipeline-package.mjs가 담당)
script('pipeline-package.mjs', { GODOT_SDK_DIR: sdkDir });

console.log(`\n[ait-godot build] 완료: ${gameId}.ait`);