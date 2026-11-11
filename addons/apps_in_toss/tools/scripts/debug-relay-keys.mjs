// 테스트 빌드(--debug-console)에 넣을 실기기 디버거 공개키를 빌드할 때 받는다(debugger-client·debugger 0.4.0).
// QR 테스트 호스트는 attach 링크의 서명을 이 키로 검증한다. 키는 { publicKey, notAfter }(만료 유닉스 초) 모양이고
// 기본 24시간(최대 72시간) 뒤 만료되므로 커밋하지 않고 빌드마다 debugger relay-key --json으로 받는다.
// 개인키는 디버거의 메모리 key agent에만 있다. 0.3.0의 .ait_relay가 있으면 디버거가 agent로 옮기고 파일을 지운다.
import { spawnSync } from 'node:child_process';

export const DEBUGGER_TGZ =
  'https://github.com/toss/apps-in-toss-harness/releases/download/debugger-v0.4.0/apps-in-toss-debugger-0.4.0.tgz';

// relay-key --json의 출력 → [{ publicKey, notAfter }]. 모양이 틀리거나 이미 만료됐으면 던진다
export function parseRelayKeys(stdout, now = Date.now() / 1000) {
  let keys;
  try {
    keys = JSON.parse(stdout);
  } catch {
    throw new Error(`debugger relay-key --json 출력을 읽지 못했습니다: ${String(stdout).slice(0, 200)}`);
  }
  const valid = (k) => k && typeof k.publicKey === 'string' && k.publicKey !== '' && Number.isFinite(k.notAfter);
  if (!Array.isArray(keys) || keys.length === 0 || !keys.every(valid)) {
    throw new Error('debugger relay-key --json이 { publicKey, notAfter } 배열을 돌려주지 않았습니다.');
  }
  const live = keys.filter((k) => k.notAfter > now);
  if (live.length === 0) {
    throw new Error('실기기 디버거 공개키가 모두 만료됐습니다. debugger relay-key --rotate로 새로 만든 뒤 다시 빌드하세요.');
  }
  return live.map(({ publicKey, notAfter }) => ({ publicKey, notAfter }));
}

export function readRelayPublicKeys(gameDir) {
  const result = spawnSync('npx', ['-y', '-p', DEBUGGER_TGZ, 'debugger', 'relay-key', '--json', '--project', gameDir], {
    cwd: gameDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `실기기 디버거 공개키를 받지 못했습니다(debugger relay-key, exit ${result.status ?? '?'}): ${(result.stderr || String(result.error ?? '')).trim().split('\n').at(-1)}. ` +
        `게임 폴더에서 npx -y -p ${DEBUGGER_TGZ} debugger relay-key 를 실행해 확인하세요.`,
    );
  }
  return parseRelayKeys(result.stdout);
}
