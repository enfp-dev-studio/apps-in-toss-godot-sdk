// CI 최소 HTML .ait 패키징 스모크 — 일회용 임시 게임 폴더에
// 최소 package.json + 매니페스트 + index.html을 만들고
// write-ait-config + pipeline-package를 실제 리포 의존성으로 실행한다.
// 네트워크·토큰 불필요. 성공·실패 모두 임시 폴더를 정리한다
// (실패도 throw → finally 정리 뒤 exitCode로 종료).
//
//   node tests/run-minimal-package.mjs
//   AIT_KEEP_FIXTURE=1 ...  # 디버깅용으로 임시 폴더 유지
//
// 종료 코드: .ait 파일이 비어 있지 않게 나오면 0, 아니면 0이 아님.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const addonDir = process.env.AIT_ADDON_DIR ?? path.join(repoRoot, 'addons/apps_in_toss');
// 공식 ait CLI는 내장 bridge의 node_modules에서 찾는다 (pipeline-package 해석 순서).
const bridgeDir = process.env.AIT_BRIDGE_DIR ?? path.join(addonDir, 'tools/bridge');
const keepFixture = process.env.AIT_KEEP_FIXTURE === '1';
const APP_NAME = 'ci-smoke-test';

function run(script, env, label) {
  const result = spawnSync(process.execPath, [script], {
    cwd: env.GODOT_PROJECT_DIR,
    env,
    encoding: 'utf8',
    timeout: 300_000,
  });
  const out = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (result.error || result.status !== 0) {
    throw new Error(`${label} 실패 (exit ${result.status ?? '?'}, signal ${result.signal ?? '-'})\n${out}`);
  }
  return out;
}

function main() {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'ait-pkg-ci-'));
  console.log(`[pkg-ci] 임시 게임 폴더: ${fixture}`);
  try {
    // package.json은 공식 ait의 필수 요구사항이다.
    fs.writeFileSync(
      path.join(fixture, 'package.json'),
      JSON.stringify({ name: APP_NAME, version: '0.0.0', private: true, type: 'module' }, null, 2),
    );
    fs.mkdirSync(path.join(fixture, '.ait'), { recursive: true });
    const template = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'addons/apps_in_toss/tools/templates/game.manifest.example.json'), 'utf8'),
    );
    template.gameId = APP_NAME;
    fs.writeFileSync(path.join(fixture, '.ait/game.manifest.json'), JSON.stringify(template, null, 2));
    fs.mkdirSync(path.join(fixture, 'build/godot-web'), { recursive: true });
    fs.writeFileSync(
      path.join(fixture, 'build/godot-web/index.html'),
      '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>smoke</title></head><body>smoke</body></html>\n',
    );

    // 자식 단계가 쓰는 ait CLI를 명시한다 — 상위의 AIT_BIN이 달라도
    // 이 검사는 선언된 리포 bridge CLI로만 실행된다.
    const aitBin = path.join(bridgeDir, 'node_modules/.bin/ait');
    if (!fs.existsSync(aitBin)) {
      throw new Error(`ait CLI 없음: ${aitBin} (bridge 의존성 미설치?)`);
    }
    const env = {
      ...process.env,
      GODOT_PROJECT_DIR: fixture,
      AIT_ADDON_DIR: addonDir,
      AIT_BRIDGE_DIR: bridgeDir,
      AIT_BIN: aitBin,
    };
    run(path.join(repoRoot, 'addons/apps_in_toss/tools/scripts/write-ait-config.mjs'), env, 'write-ait-config');
    run(path.join(repoRoot, 'addons/apps_in_toss/tools/scripts/pipeline-package.mjs'), env, 'pipeline-package');

    const outFile = path.join(fixture, `${APP_NAME}.ait`);
    const stat = fs.existsSync(outFile) ? fs.statSync(outFile) : null;
    if (!stat || !stat.isFile() || stat.size < 1) {
      throw new Error(`.ait 출력이 파일이 아니거나 비었음: ${outFile}`);
    }
    console.log(`[pkg-ci] 통과 (${APP_NAME}.ait ${stat.size} bytes)`);
  } finally {
    if (keepFixture) {
      console.log(`[pkg-ci] AIT_KEEP_FIXTURE=1 — 유지: ${fixture}`);
    } else {
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  }
}

try {
  main();
} catch (error) {
  console.error(`[pkg-ci] FAIL: ${error.message}`);
  process.exitCode = 1;
}
