// 테스트 빌드(--debug-console)에 넣을 실기기 디버거 공개키를 게임 매니페스트에서 읽는다.
// debug-console 0.3.0부터 QR 테스트 호스트는 attach 링크의 서명을 이 공개키로 검증한다.
// 공개키는 `debugger relay-key`가 프로젝트의 .ait_relay(비밀값, 커밋 금지)에서 만들어 주는 값이고 커밋해도 된다.
// 팀원은 자기 키를 배열에 더한다. 키가 없으면 테스트 빌드를 멈춘다(키 없이 만든 번들은 QR로 붙지 않는다).
import fs from 'node:fs';
import path from 'node:path';

export const DEBUGGER_TGZ =
  'https://github.com/toss/apps-in-toss-harness/releases/download/debugger-v0.3.0/apps-in-toss-debugger-0.3.0.tgz';

export function readRelayPublicKeys(gameDir) {
  const manifestPath = path.join(gameDir, '.ait/game.manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const keys = manifest.debugConsole?.relayPublicKeys;
  if (!Array.isArray(keys) || keys.length === 0 || !keys.every((k) => typeof k === 'string' && k.trim() !== '')) {
    throw new Error(
      '.ait/game.manifest.json에 debugConsole.relayPublicKeys(실기기 디버거 공개키 배열)가 없습니다. ' +
        `게임 폴더에서 npx -y -p ${DEBUGGER_TGZ} debugger relay-key 를 실행해 나온 한 줄을 ` +
        '"debugConsole": { "relayPublicKeys": ["<그 값>"] } 로 넣으세요. .ait_relay는 커밋하지 마세요.',
    );
  }
  return keys.map((k) => k.trim());
}
