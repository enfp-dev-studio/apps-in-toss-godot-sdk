// CI Godot 애드온 검사 — 일회용 임시 프로젝트에 애드온을 복사해
// headless 에디터 import + GDScript 컴파일 게이트 + AdMob 수명 검사를 실행한다.
// 사용자 게임 파일을 건드리지 않으며, 성공·실패 모두 임시 폴더를 정리한다
// (실패도 throw → finally 정리 뒤 exitCode로 종료).
//
//   GODOT_BIN=/Applications/Godot.app/Contents/MacOS/Godot node tests/run-godot-addon.mjs
//   AIT_KEEP_FIXTURE=1 ...  # 디버깅용으로 임시 폴더 유지
//
// 종료 코드: 전부 통과하면 0, 하나라도 실패하면 0이 아님.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const lock = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'addons/apps_in_toss/tools/templates/platform.lock.json'), 'utf8'),
);
const expectedGodot = lock.godot.version; // 예: "4.7.2"
const expectedFeature = lock.godot.feature; // 예: "4.7"
const godotBin = process.env.GODOT_BIN ?? 'godot';
const keepFixture = process.env.AIT_KEEP_FIXTURE === '1';

// node_modules/dist는 Godot 리소스 스캔에 넣지 않는다 (무거움 + 오탐 방지).
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);

function copyTree(src, dst) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    if (SKIP_DIRS.has(path.basename(src))) return;
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src)) copyTree(path.join(src, entry), path.join(dst, entry));
  } else {
    fs.copyFileSync(src, dst);
  }
}

function run(bin, args, { cwd, timeoutMs, label }) {
  const result = spawnSync(bin, args, { cwd, encoding: 'utf8', timeout: timeoutMs });
  const out = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (result.error) {
    throw new Error(`${label} 실행 실패: ${result.error.message}\n${out}`);
  }
  if (result.status !== 0) {
    throw new Error(`${label} 실패 (exit ${result.status}, signal ${result.signal ?? '-'})\n${out}`);
  }
  return out;
}

// "4.7.2.stable.official..." → [4, 7, 2]. includes 비교는 4.7.20을 통과시키므로
// major.minor.patch를 정확히 비교한다.
function parseVersion(text) {
  const m = text.match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function main() {
  // 1. 바이너리 확인 — 없거나 버전이 다르면 여기서 실패한다.
  const versionOut = run(godotBin, ['--version'], { cwd: repoRoot, timeoutMs: 60_000, label: 'godot --version' });
  console.log(`[godot-ci] Godot 버전: ${versionOut.trim().split('\n').pop()}`);
  const actual = parseVersion(versionOut);
  const expected = parseVersion(expectedGodot);
  if (!actual || !expected || actual.some((n, i) => n !== expected[i])) {
    throw new Error(`Godot ${expectedGodot} 필요 (platform.lock), 현재 출력과 불일치`);
  }

  // 2. 임시 프로젝트 구성.
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'ait-godot-ci-'));
  console.log(`[godot-ci] 임시 프로젝트: ${fixture}`);
  try {
    const addonSrc = path.join(repoRoot, 'addons/apps_in_toss');
    if (!fs.existsSync(path.join(addonSrc, 'ait.gd'))) throw new Error(`애드온 원본 없음: ${addonSrc}`);
    copyTree(addonSrc, path.join(fixture, 'addons/apps_in_toss'));

    const lifecycleSrc = path.join(repoRoot, 'tests/gdscript/admob-lifecycle.gd');
    fs.mkdirSync(path.join(fixture, 'tests'), { recursive: true });
    fs.copyFileSync(lifecycleSrc, path.join(fixture, 'tests/admob-lifecycle.gd'));

    fs.writeFileSync(
      path.join(fixture, 'project.godot'),
      '; Engine configuration file.\n' +
        'config_version=5\n' +
        '\n' +
        '[application]\n' +
        'config/name="AITCITest"\n' +
        `config/features=PackedStringArray("${expectedFeature}")\n` +
        '\n' +
        '[autoload]\n' +
        'AIT="*res://addons/apps_in_toss/ait.gd"\n' +
        '\n' +
        '[rendering]\n' +
        'renderer/rendering_method="gl_compatibility"\n',
    );

    // 3. headless 에디터 import (리소스 등록용), 그 뒤 게이트 + 수명 검사.
    run(godotBin, ['--headless', '--path', fixture, '--editor', '--quit'], {
      cwd: repoRoot,
      timeoutMs: 300_000,
      label: 'editor import',
    });
    const gateOut = run(
      godotBin,
      ['--headless', '--path', fixture, '--script', 'res://addons/apps_in_toss/tools/scripts/verify-gdscript.gd'],
      { cwd: repoRoot, timeoutMs: 180_000, label: 'gdscript gate' },
    );
    const gateMatch = gateOut.match(/GDScript compile check passed \((\d+) files\)/);
    if (!gateMatch || Number(gateMatch[1]) < 1) {
      throw new Error(`게이트가 스크립트를 0개 확인함 — 빈 성공으로 처리하지 않음:\n${gateOut}`);
    }
    console.log(`[godot-ci] 게이트 통과 (${gateMatch[1]} files)`);
    // Godot은 에러가 있어도 exit 0을 낼 수 있어 성공 마커를 직접 확인한다.
    const lifeOut = run(godotBin, ['--headless', '--path', fixture, '--script', 'res://tests/admob-lifecycle.gd'], {
      cwd: repoRoot,
      timeoutMs: 180_000,
      label: 'admob lifecycle',
    });
    if (!lifeOut.includes('admob lifecycle check passed')) {
      throw new Error(`수명 검사 성공 마커 없음:\n${lifeOut}`);
    }
    console.log('[godot-ci] 전부 통과');
  } finally {
    if (keepFixture) {
      console.log(`[godot-ci] AIT_KEEP_FIXTURE=1 — 유지: ${fixture}`);
    } else {
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  }
}

try {
  main();
} catch (error) {
  console.error(`[godot-ci] FAIL: ${error.message}`);
  process.exitCode = 1;
}
