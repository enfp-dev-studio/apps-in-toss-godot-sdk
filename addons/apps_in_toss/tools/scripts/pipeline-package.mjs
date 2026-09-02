// ait-godot의 .ait 패키징 단계 — 토스 공식 CLI를 게임 폴더 기준으로 실행한다.
// ait build는 cwd의 apps-in-toss.config.ts와 webBundleDir를 읽는다.
// write-ait-config.mjs가 게임 매니페스트 기준으로 그 파일을 생성한다.
//
// ait CLI 해석 순서: AIT_BIN env → @apps-in-toss/web-framework가 설치된 곳의
// node_modules/.bin/ait → PATH의 ait.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const gameDir = path.resolve(process.env.GODOT_PROJECT_DIR ?? process.cwd());
if (!fs.existsSync(path.join(gameDir, 'apps-in-toss.config.ts'))) {
  console.error('[ait-godot package] apps-in-toss.config.ts가 없습니다. write-ait-config 단계가 선행해야 합니다.');
  process.exit(1);
}

function resolveAitBin() {
  if (process.env.AIT_BIN) return process.env.AIT_BIN;
  // 내장 모드: addonDir/tools/bridge의 node_modules/.bin/ait를 우선 확인.
  const candidates = [
    path.join(gameDir, 'node_modules/.bin/ait'),
    process.env.AIT_BRIDGE_DIR ? path.join(process.env.AIT_BRIDGE_DIR, 'node_modules/.bin/ait') : null,
    path.resolve(gameDir, '..', 'toss-web-game/node_modules/.bin/ait'),
    path.resolve(gameDir, '..', 'apps-in-toss-godot-sdk/bridge/node_modules/.bin/ait'),
  ].filter(Boolean);
  // 임시 SDK 캐시 클론도 확인 (lock-pinned clone에 bridge deps 설치돼 있으면 사용)
  const tmpSdk = fs.existsSync(path.join(os.tmpdir(), 'ait-godot-sdk'))
    ? fs.readdirSync(path.join(os.tmpdir(), 'ait-godot-sdk')).filter((d) => !d.endsWith('.tmp'))
    : [];
  for (const commit of tmpSdk) {
    candidates.push(path.join(os.tmpdir(), 'ait-godot-sdk', commit, 'bridge/node_modules/.bin/ait'));
  }
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (found) return found;
  return 'ait'; // PATH fallback
}

const aitBin = resolveAitBin();
// 내장 bridge의 node_modules를 NODE_PATH로 노출 — 게임 리포에
// @apps-in-toss/web-framework를 설치하지 않아도 apps-in-toss.config.ts의
// import가 해석된다. (게임 리포 자체에 설치돼 있으면 그게 우선이다.)
const bridgeNodeModules = process.env.AIT_BRIDGE_DIR
  ? path.join(process.env.AIT_BRIDGE_DIR, 'node_modules')
  : null;
const nodePath = [
  path.join(gameDir, 'node_modules'),
  bridgeNodeModules,
  process.env.NODE_PATH,
].filter(Boolean).join(path.delimiter);
const result = spawnSync(aitBin, ['build'], {
  cwd: gameDir,
  stdio: 'inherit',
  env: { ...process.env, NODE_PATH: nodePath },
});
if (result.error && result.error.code === 'ENOENT') {
  console.error(
    '[ait-godot package] ait CLI를 찾을 수 없습니다. 다음 중 하나로 설치하세요:\n' +
      '  npm i -D @apps-in-toss/web-framework   (게임 리포에 설치 — .bin/ait 제공)\n' +
      '  또는 AIT_BIN=/path/to/ait 환경변수 지정',
  );
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status ?? 1);