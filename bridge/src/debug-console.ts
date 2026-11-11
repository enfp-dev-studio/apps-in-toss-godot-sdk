// 테스트 빌드 전용 on-device 디버깅 진입점(dist/ait-debug-console.js).
// 출시 브리지(index.ts)와 따로 번들되며 `ait-godot build --debug-console`만 export에 넣는다.
// startDebugConsole은 URL에 debug=1 또는 relay=가 있고 토스 미니앱 호스트일 때만 relay에 붙는다.
// QR 테스트 호스트에서는 링크 서명을 디버거 공개키로 검증한다(debugger-client 0.4.0, 프로토콜 3).
// 공개키 { publicKey, notAfter }는 빌드할 때 debugger relay-key --json으로 받는다(기본 24시간 뒤 만료).
// SDK는 먼저 로드된 브리지의 window.AppsInToss를 쓴다(vite.config.ts 참고).
import { startDebugConsole } from '@apps-in-toss/debugger-client';

declare const __AIT_DEBUG_RELAY_KEYS__: ReadonlyArray<{ publicKey: string; notAfter: number }>;

void startDebugConsole({ relayPublicKeys: __AIT_DEBUG_RELAY_KEYS__ });
