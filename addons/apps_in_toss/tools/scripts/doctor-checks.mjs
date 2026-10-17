// doctor가 쓰는 순수 검사 함수. 파일을 읽지 않고 문자열만 받아 테스트하기 쉽게 둔다.

// 개발 단계 테스트 광고 그룹 ID 접두사(인앱 광고 문서: ait-ad-test-interstitial-id 등).
// 검수 번들 전에는 콘솔에서 발급한 광고 그룹 ID로 바꿔야 한다.
export const TEST_AD_ID_PREFIX = 'ait-ad-test-';

// Godot MCP(godot-mcp-runtime)가 run_project·attach_project 동안 project.godot에 넣는 오토로드 이름.
export const MCP_BRIDGE_AUTOLOAD = 'McpBridge';

// HTML shell의 viewport meta를 검사해 고칠 점을 돌려준다.
// - 제스처 확대 막기: 비게임 출시 체크리스트(지도처럼 꼭 필요한 경우 제외), WebView 속성 제어 문서
// - viewport-fit=cover: 없으면 iOS에서 env(safe-area-inset-*)가 0이다
export function checkShellViewport(html) {
  const meta = [...String(html ?? '').matchAll(/<meta\b[^>]*>/gi)]
    .map((match) => match[0])
    .find((tag) => /name\s*=\s*["']viewport["']/i.test(tag));
  if (!meta) {
    return ['viewport meta가 없습니다. width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover를 넣으세요.'];
  }
  const content = (meta.match(/content\s*=\s*["']([^"']*)["']/i)?.[1] ?? '').toLowerCase().replace(/\s+/g, '');
  const parts = new Map(
    content.split(',').filter(Boolean).map((part) => {
      const [key, value = ''] = part.split('=');
      return [key, value];
    }),
  );
  const problems = [];
  const zoomBlocked = parts.get('user-scalable') === 'no' || parts.get('user-scalable') === '0';
  if (!zoomBlocked || parts.get('maximum-scale') !== '1') {
    problems.push(
      'viewport meta에 maximum-scale=1, user-scalable=no가 없어 핀치 확대가 됩니다(비게임 출시 체크리스트: 지도 등이 아니면 확대 막기).',
    );
  }
  if (parts.get('viewport-fit') !== 'cover') {
    problems.push('viewport meta에 viewport-fit=cover가 없어 iOS에서 Safe Area env() 값이 0입니다.');
  }
  return problems;
}

// project.godot에 Godot MCP 브리지 오토로드가 남아 있으면 그 줄을 돌려준다.
export function findMcpBridgeAutoload(projectText) {
  const match = String(projectText ?? '').match(new RegExp(`^${MCP_BRIDGE_AUTOLOAD}\\s*=.*$`, 'm'));
  return match ? match[0] : null;
}

// 테스트 광고 그룹 ID가 있는 줄 번호(1부터)를 돌려준다.
export function findTestAdIdLines(text) {
  const lines = String(text ?? '').split('\n');
  const found = [];
  lines.forEach((line, index) => {
    if (line.includes(TEST_AD_ID_PREFIX)) found.push(index + 1);
  });
  return found;
}

// 매니페스트의 appType·navigationBar 조합을 검사해 알릴 점을 돌려준다.
export function checkAppType(manifest) {
  if (!manifest || typeof manifest !== 'object') return [];
  const appType = manifest.appType;
  if (appType === undefined) {
    return [
      '.ait/game.manifest.json에 appType이 없습니다. "game" 또는 "nongame"을 적으면 내비게이션 바 기본값(비게임: 뒤로가기 버튼, 게임: 투명 배경)이 들어갑니다.',
    ];
  }
  if (appType === 'nongame' && manifest.navigationBar?.withBackButton === false) {
    return [
      'appType "nongame"인데 navigationBar.withBackButton이 false입니다. iOS에서 하위 화면을 나갈 길이 없습니다(비게임 출시 체크리스트: 모든 화면에서 뒤로가기 동작).',
    ];
  }
  return [];
}
