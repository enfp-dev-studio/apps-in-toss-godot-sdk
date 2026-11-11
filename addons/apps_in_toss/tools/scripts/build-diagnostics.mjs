// 빌드 실패 진단(Unity SDK 3.9.0 AITBuildDiagnostics·AITExportErrorCatalog 대응). 실패한 단계·종료 코드·오류 끝부분을
// 모아 알려진 원인이면 할 일을 붙인다. build/last-build-error.json에 남겨 에디터 패널이 보여 준다.
import fs from 'node:fs';
import path from 'node:path';

const TAIL_LINES = 20;
const CATALOG = [
  [/export template|내보내기 템플릿|templates? (?:not found|missing)/i, 'Godot Web export 템플릿을 설치하세요(Godot 에디터 > 편집기 > 내보내기 템플릿 관리, Godot와 같은 판).'],
  [/spawn(?:Sync)? godot ENOENT|Godot executable could not be checked/i, 'Godot 실행 파일을 찾지 못했습니다. GODOT_BIN에 Godot 경로를 주세요.'],
  [/Node\.js major version/i, 'Node.js 24 또는 26으로 실행하세요(에디터 패널의 Node 설치 버튼도 있습니다).'],
  [/still contains "eval" text|eval 글자|"eval"/i, '번들에 검수가 반려하는 eval 글자가 남았습니다. SDK를 최신으로 올리거나 게임 코드의 JavaScriptBridge.eval을 빼세요.'],
  [/relayPublicKeys|debugger relay-key|relay-key/i, '테스트 빌드는 debugger 0.4.0의 relay-key로 공개키를 받습니다. 게임 폴더에서 npx -y -p <debugger 0.4.0 tgz> debugger relay-key가 되는지 확인하세요(키가 만료됐으면 --rotate).'],
  [/sentry\.dsn|AIT_SENTRY_CONFIG/i, '매니페스트 sentry 설정(dsn·environment·release·sampleRate)을 확인하세요.'],
  [/npm (?:ci|install).*(?:ENOTFOUND|ETIMEDOUT|ECONNRESET)|getaddrinfo/i, '네트워크 문제로 의존성을 받지 못했습니다. 연결을 확인하고 다시 실행하세요.'],
  [/platform\.lock|lock and project/i, '.ait/platform.lock.json과 프로젝트 설정이 다릅니다. doctor 출력의 ERROR 줄을 고치세요.'],
  [/custom HTML shell|custom_shell/i, '내보내기 프리셋의 html/custom_html_shell이 SDK 셸(res://custom_shell.html)을 가리키는지 확인하세요.'],
  [/\b(401|403)\b|Unauthorized|Forbidden/i, '인증에 실패했습니다. ait token add로 배포 키를 다시 넣고 앱 이름이 콘솔과 같은지 확인하세요.'],
  [/최소 판|사용 중지된 판/, 'SDK가 최소 판보다 낮습니다. ait-godot update로 올리세요.'],
];

export function diagnose(label, exitCode, output) {
  const tail = String(output ?? '').split('\n').filter((line) => line.trim() !== '').slice(-TAIL_LINES);
  const hints = CATALOG.filter(([pattern]) => pattern.test(output ?? '')).map(([, hint]) => hint);
  return { step: label, exitCode, tail, hints };
}

export function writeDiagnosis(gameDir, diagnosis) {
  fs.mkdirSync(path.join(gameDir, 'build'), { recursive: true });
  fs.writeFileSync(path.join(gameDir, 'build/last-build-error.json'), `${JSON.stringify({ ...diagnosis, at: new Date().toISOString() }, null, 2)}\n`);
}

export function formatDiagnosis(diagnosis) {
  const lines = [`[ait-godot] ✖ ${diagnosis.step} 실패 (exit ${diagnosis.exitCode ?? '?'})`];
  if (diagnosis.hints.length > 0) {
    lines.push('[ait-godot] 할 일:');
    for (const hint of diagnosis.hints) lines.push(`  - ${hint}`);
  }
  if (diagnosis.tail.length > 0) {
    lines.push('[ait-godot] 오류 끝부분:');
    for (const line of diagnosis.tail) lines.push(`  | ${line}`);
  }
  return lines.join('\n');
}
