// 테스트 빌드 전용 on-device 디버깅 진입점(dist/ait-debug-console.js).
// 출시 브리지(index.ts)와 따로 번들되며 `ait-godot build --debug-console`만 export에 넣는다.
// /auto는 URL에 debug=1 또는 relay=가 있고 토스 미니앱 호스트일 때만 relay에 붙는다.
// SDK는 먼저 로드된 브리지의 window.AppsInToss를 쓴다(vite.config.ts 참고).
import '@apps-in-toss/debug-console/auto';
