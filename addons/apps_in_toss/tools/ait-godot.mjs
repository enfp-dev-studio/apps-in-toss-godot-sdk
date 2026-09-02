#!/usr/bin/env node
// ait-godot: Apps in Toss × Godot 게임 파이프라인 CLI (SDK 애드온 내장 버전).
// Unity SDK 워크플로(설치 → Configuration → 기능 → Dev Server → Build → Publish)를
// 게임 리포에서 동일하게 재현한다. 이 CLI는 SDK 애드온(addons/apps_in_toss)에
// 내장되어 배포되므로, 게임 리포는 애드온 복사본 하나만으로 전 파이프라인을
// 실행할 수 있다 — 별도 npm 패키지나 SDK checkout이 필요 없다.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const toolsDir = path.resolve(here); // .../addons/apps_in_toss/tools
const addonDir = path.resolve(toolsDir, '..'); // .../addons/apps_in_toss (SDK addon = 자기 자신)
const scriptsDir = path.join(toolsDir, 'scripts');
const templatesDir = path.join(toolsDir, 'templates');
const bridgeDir = path.join(toolsDir, 'bridge');
const args = process.argv.slice(2);
const command = args[0] ?? '';
const gameDir = process.env.GODOT_PROJECT_DIR ? path.resolve(process.env.GODOT_PROJECT_DIR) : process.cwd();

function fail(message) {
  console.error(`[ait-godot] ${message}`);
  process.exit(1);
}

// 모든 자식 스크립트에 "SDK = 자기 자신"임을 알린다. 이 env가 있으면 각
// 스크립트의 SDK 해석(sibling checkout / lock 커밋 클론)은 건너뛴다.
function pipelineEnv(extra = {}) {
  return {
    ...process.env,
    GODOT_PROJECT_DIR: gameDir,
    AIT_ADDON_DIR: addonDir,
    AIT_TOOLS_DIR: toolsDir,
    AIT_BRIDGE_DIR: bridgeDir,
    ...extra,
  };
}

function runStep(label, scriptName, { env = {}, extraArgs = [] } = {}) {
  console.log(`\n[ait-godot] ▶ ${label}`);
  const result = spawnSync(process.execPath, [path.join(scriptsDir, scriptName), ...extraArgs], {
    cwd: gameDir,
    stdio: 'inherit',
    env: pipelineEnv(env),
  });
  if (result.error) fail(String(result.error));
  if (result.status !== 0) fail(`${label} 실패 (exit ${result.status ?? '?'})`);
}

const usage = `ait-godot — Apps in Toss × Godot 게임 파이프라인 (Unity SDK 워크플로 대응)

게임 리포(project.godot가 있는 루트)에서 실행합니다. 이 CLI는 SDK 애드온
(addons/apps_in_toss/tools)에 내장되어 있어 별도 설치가 필요 없습니다.

  ait-godot init <gameId> "<표시이름>"    .ait/ 생성 — Unity Configuration에 대응
  ait-godot addon:install [--force]      AIT 애드온 설치 (AIT autoload 등록)
  ait-godot doctor [--strict]            호환성 검사 — Unity Build Init 역할
  ait-godot build                        release 파이프라인 → <gameId>.ait — Build & Package 대응
  ait-godot build:dev                    mock 브리지 + DevTools 개발 빌드 — Dev Server 대응
  ait-godot preview                      build/godot-web 로컬 서빙
  ait-godot sync                         설치된 애드온을 SDK 원본으로 갱신

배포는 토스 CLI를 그대로 씁니다: npx ait deploy (ait token add 선행)

환경변수:
  GODOT_PROJECT_DIR   게임 리포 경로 (기본: cwd)
  GODOT_BIN           Godot 실행 파일 (기본: godot)
  AIT_PLATFORM_LOCK   init 시 복사할 lock (기본: 내장 preview 릴리스 lock)`;

main();

function main() {
  if (!command || command === 'help' || command === '--help') {
    console.log(usage);
    process.exit(0);
  }
  const needs = {
    init: { project: true, manifest: false },
    'addon:install': { project: true, manifest: false },
    sync: { project: true, manifest: false },
    doctor: { project: true, manifest: true, lock: true },
    build: { project: true, manifest: true, lock: true },
    'build:dev': { project: true, manifest: true, lock: true },
    preview: { project: true, manifest: true, lock: true },
  };
  const req = needs[command];
  if (!req) fail(`알 수 없는 명령 "${command}"\n\n${usage}`);
  if (req.project && !fs.existsSync(path.join(gameDir, 'project.godot'))) {
    fail(`project.godot가 없습니다: ${gameDir}`);
  }
  if (req.lock && !fs.existsSync(path.join(gameDir, '.ait/platform.lock.json'))) {
    fail('Missing .ait/platform.lock.json — "ait-godot init"으로 생성하세요.');
  }
  if (req.manifest && !fs.existsSync(path.join(gameDir, '.ait/game.manifest.json'))) {
    fail('Missing .ait/game.manifest.json — "ait-godot init"으로 생성하세요.');
  }

  switch (command) {
    case 'init': return cmdInit();
    case 'addon:install': return cmdAddonInstall();
    case 'sync': return runStep('설치된 애드온을 SDK 원본으로 갱신', 'pipeline-addon.mjs');
    case 'doctor': return cmdDoctor();
    case 'build': return cmdBuild();
    case 'build:dev': return cmdBuildDev();
    case 'preview': return cmdPreview();
  }
}

function cmdInit() {
  const [gameId, displayName = gameId] = args.slice(1);
  if (!gameId) fail('사용법: ait-godot init <gameId> "<표시이름>"');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(gameId)) fail(`gameId는 영문·숫자·하이픈만: "${gameId}"`);
  if (!fs.existsSync(path.join(gameDir, 'project.godot'))) {
    fail(`project.godot가 없습니다: ${gameDir}\n먼저 Godot에서 프로젝트를 만드세요.`);
  }
  fs.mkdirSync(path.join(gameDir, '.ait'), { recursive: true });
  const lockSource = process.env.AIT_PLATFORM_LOCK ?? path.join(templatesDir, 'platform.lock.json');
  fs.copyFileSync(lockSource, path.join(gameDir, '.ait', 'platform.lock.json'));
  const manifest = JSON.parse(fs.readFileSync(path.join(templatesDir, 'game.manifest.example.json'), 'utf8'));
  manifest.gameId = gameId;
  manifest.displayName = displayName;
  fs.writeFileSync(
    path.join(gameDir, '.ait', 'game.manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(`[ait-godot] .ait/ 생성 완료 — gameId: ${gameId}, 채널: ${manifest.releaseChannel}`);
  console.log('[ait-godot] 다음: ait-godot addon:install --force');
}

function cmdAddonInstall() {
  const script = path.join(scriptsDir, 'pipeline-addon.mjs');
  const result = spawnSync(process.execPath, [script], {
    cwd: gameDir,
    stdio: 'inherit',
    env: pipelineEnv({ GODOT_ADDON_FORCE: args.includes('--force') ? '1' : '' }),
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function cmdDoctor() {
  const env = {};
  if (args.includes('--strict')) env.AIT_PLATFORM_STRICT = '1';
  const script = path.join(scriptsDir, 'ait-doctor.mjs');
  const result = spawnSync(process.execPath, [script, ...(args.includes('--strict') ? ['--strict'] : [])], {
    cwd: gameDir,
    stdio: 'inherit',
    env: pipelineEnv(env),
  });
  process.exit(result.status ?? 1);
}

function cmdBuild() {
  const exportDir = path.join(gameDir, 'build/godot-web');
  runStep('게임 매니페스트 → 웹 설정 생성 (Unity Configuration)', 'write-ait-config.mjs', {
    env: { GODOT_EXPORT_DIR: exportDir },
  });
  runStep('strict 호환성 검사 (Unity Build Init)', 'ait-doctor.mjs', { extraArgs: ['--strict'] });
  runStep('SDK 애드온 동기화', 'sync-godot-sdk.mjs');
  runStep('Godot Web export (Unity WebGL build)', 'export-godot.mjs', {
    env: { GODOT_EXPORT_DIR: exportDir },
  });
  runStep('플랫폼 매니페스트 기록 (ait-build-info 대응)', 'write-platform-manifest.mjs', {
    env: { GODOT_EXPORT_DIR: exportDir },
  });
  runStep('브리지 빌드 → 주입 → 무결성 검사', 'pipeline-finalize.mjs');
  runStep('.ait 패키징 (Unity Build & Package)', 'pipeline-package.mjs');
  console.log('\n[ait-godot] ✅ 완료. 배포: npx ait deploy (콘솔 토큰 필요)');
}

function cmdBuildDev() {
  runStep('게임 매니페스트 → 웹 설정 생성', 'write-ait-config.mjs');
  runStep('호환성 검사 (sandbox는 advisory)', 'ait-doctor.mjs');
  runStep('SDK 애드온 동기화', 'sync-godot-sdk.mjs');
  runStep('mock 브리지 빌드 (Unity Dev Server의 Mock SDK)', 'pipeline-bridge-mock.mjs');
  runStep('Godot Web export', 'export-godot.mjs');
  runStep('mock 브리지 + DevTools 패널 주입', 'pipeline-mock-patch.mjs');
  console.log('[ait-godot] 다음: ait-godot preview → 브라우저 테스트 (?e2e=true = 전 API 자동 점검)');
}

function cmdPreview() {
  runStep('로컬 프리뷰 서버 (Ctrl+C로 종료)', 'pipeline-preview.mjs');
}