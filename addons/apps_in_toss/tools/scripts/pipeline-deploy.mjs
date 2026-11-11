// ait-godot deploy — 빌드한 .ait를 콘솔 테스트(QR) 환경에 올린다(Unity SDK 3.9.0 Deploy for Online Test /
// Deploy Release Candidate 대응). 토스 CLI의 ait deploy는 어느 쪽이든 테스트 환경에 올리고, 실제 출시는
// 콘솔의 검수 요청으로만 한다. 두 종류는 메모 머리말과 끝난 뒤 안내만 다르다.
//   --rc            릴리스 후보(테스트 빌드(--debug-console)는 막는다)
//   --profile 이름  ~/.ait/credentials의 토큰 프로필(ait token add로 저장). 비우면 default
// 배포 토큰은 토스 CLI가 다룬다. 이 스크립트는 토큰을 읽거나 출력하지 않는다.
// 결과 링크는 터미널 QR로 보여 주고 build/deploy-qr.png·build/deploy-result.json에 남긴다(에디터 패널이 읽음).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const gameDir = path.resolve(process.env.GODOT_PROJECT_DIR ?? process.cwd());
const bridgeDir = path.resolve(process.env.AIT_BRIDGE_DIR ?? path.join(here, '../bridge'));
const args = process.argv.slice(2);
const rc = args.includes('--rc');
const profileAt = args.indexOf('--profile');
const profile = profileAt !== -1 ? args[profileAt + 1] : null;
const MEMO_MAX = 1000;

function fail(message, hints = []) {
  console.error(`[ait-godot deploy] ${message}`);
  for (const hint of hints) console.error(`  - ${hint}`);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(path.join(gameDir, '.ait/game.manifest.json'), 'utf8'));
const artifact = path.join(gameDir, `${manifest.gameId}.ait`);
if (!fs.existsSync(artifact)) fail(`${path.basename(artifact)}이 없습니다. 먼저 ait-godot build를 실행하세요.`);
const platform = JSON.parse(fs.readFileSync(path.join(gameDir, 'build/godot-web/ait-platform-manifest.json'), 'utf8'));
if (rc && platform.debugConsole === true) {
  fail('테스트 빌드(--debug-console)는 릴리스 후보로 올리지 않습니다. 옵션 없이 ait-godot build를 다시 실행하세요.');
}
const credentials = path.join(os.homedir(), '.ait', 'credentials');
if (!fs.existsSync(credentials)) {
  fail('배포 토큰이 없습니다.', [
    '콘솔 > 워크스페이스 > 키 관리에서 배포 API 키를 만들고, 게임 폴더에서 한 번 실행하세요:',
    `${path.join(bridgeDir, 'node_modules/.bin/ait')} token add`,
  ]);
}

const sdkVersion = fs.readFileSync(path.join(here, '../../plugin.cfg'), 'utf8').match(/version="([^"]+)"/)?.[1] ?? '?';
const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
const name = manifest.displayName ?? manifest.gameId;
const memo = `[${rc ? 'RC' : 'Test'}] ${name} v${manifest.gameVersion} · Godot SDK ${sdkVersion} · ${stamp}`
  .replace(/["`$\\]/g, '')
  .slice(0, MEMO_MAX);

const aitBin = process.env.AIT_BIN ?? path.join(bridgeDir, 'node_modules/.bin/ait');
const deployArgs = ['deploy', '--scheme-only', '--location', artifact, '-m', memo];
if (profile) deployArgs.push('--profile', profile);
console.log(`[ait-godot deploy] ${path.basename(artifact)} → 콘솔 테스트 환경 (${rc ? '릴리스 후보' : '온라인 테스트'})`);
console.log(`[ait-godot deploy] 메모: ${memo}`);
const result = spawnSync(aitBin, deployArgs, { cwd: gameDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const out = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
const link = out.split('\n').map((line) => line.trim()).find((line) => line.startsWith('intoss-private://'));
if (result.status !== 0 || !link) {
  const auth = /\b(401|403)\b|Unauthorized|Forbidden/i.test(out);
  fail(`배포하지 못했습니다${auth ? '(인증 실패)' : ''}: ${out.split('\n').at(-1) ?? ''}`, auth
    ? [
        '배포 키가 맞는지(콘솔 > 워크스페이스 > 키 관리), 이 앱의 워크스페이스에서 만든 키인지 확인하세요.',
        `앱 이름이 콘솔에 등록된 이름과 같은지 확인하세요(지금 ${manifest.gameId}).`,
      ]
    : ['네트워크와 콘솔 상태를 확인하고 다시 시도하세요.']);
}

const require = createRequire(path.join(bridgeDir, 'package.json'));
const QRCode = require('qrcode');
fs.mkdirSync(path.join(gameDir, 'build'), { recursive: true });
await QRCode.toFile(path.join(gameDir, 'build/deploy-qr.png'), link, { margin: 2, width: 320 });
const deploymentId = new URL(link).searchParams.get('_deploymentId');
fs.writeFileSync(
  path.join(gameDir, 'build/deploy-result.json'),
  `${JSON.stringify({ kind: rc ? 'rc' : 'test', link, deploymentId, memo, at: new Date().toISOString() }, null, 2)}\n`,
);
console.log(`\n[ait-godot deploy] ✅ 올렸습니다: ${link}`);
console.log(await QRCode.toString(link, { type: 'terminal', small: true }));
console.log('[ait-godot deploy] 토스 앱으로 QR을 찍어 여세요. QR 그림: build/deploy-qr.png');
if (rc) {
  console.log(`[ait-godot deploy] 릴리스 후보입니다. 콘솔에서 이 번들(deploymentId ${deploymentId})로 검수를 요청하세요.`);
}
