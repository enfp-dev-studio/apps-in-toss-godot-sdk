# Apps in Toss Godot bridge

Godot의 `JavaScriptBridge` 호출을 `@apps-in-toss/web-framework`(3.5.0)로 전달하는
브리지입니다. 공식 Unity SDK의 `.jslib` 레이어에 대응합니다. 이 리포에는 루트
npm 스크립트가 없으니, 이 디렉터리 안에서 직접 실행하세요.

```bash
npm install              # 의존성 설치 (web-framework 3.5.0, devtools 3.2.0)
npm run build            # 실전 번들 → dist/apps-in-toss-godot-bridge.js
npm run generate         # api-manifest.json에서 GDScript 카탈로그 재생성
npx tsc --noEmit         # 타입 검사
AIT_BRIDGE_MOCK=1 npm run build   # mock 개발 번들 (브라우저 DevTools 테스트용)
```

`npm install` 시 실행되는 `prepare`도 추가 환경변수 없이 애드온의
`generated/` 폴더에 파일을 생성합니다.

이 디렉터리를 수정하면 `addons/apps_in_toss/tools/bridge/`의 소스,
`package.json`, `api-manifest.json`, lockfile도 동일하게 갱신해야 합니다. 빌드 파이프라인이
실제로 쓰는 쪽은 애드온 내장 복사본입니다. 어느 쪽에서 `generate`를 실행해도
같은 생성물이 나옵니다.

브리지는 classic IIFE로 빌드되어 Godot 엔진의 `index.js`보다 먼저 실행됩니다.
GDScript의 `invoke(path, args)`는 `NavigationBar.setOptions`처럼 Promise로
결과를 반환하는 API를 경로 문자열로 호출합니다. JSON으로 전달할 수 있는 인자를
받는 API라면 매니페스트 항목을 추가해 연결할 수 있습니다. IAP의
`processProductGrant`는 JS Promise를 유지한 채 Godot의 지급 처리 응답을
기다립니다(일회성·구독 결제 공통). 전면 광고의 `loadFullScreenAd`와
`showFullScreenAd`는 구독 콜백으로 `loaded`, `show`, `dismissed`,
`userEarnedReward` 등의 이벤트를 전달합니다. `subscribePath`는 이 전달 방식을 다른
이벤트형 API(`Game.subscribeInfoOverlayHidden`,
`GoogleAdMob.loadAppsInTossAdMob` 등)에 재사용하는 범용 진입점입니다(GDScript
`AITAdMob`·`AITGame` 모듈이 이 경로를 씁니다).
`has()`는 프레임워크 네임스페이스 전용이고, 브리지 자체 메서드 존재 확인은
`hasBridgeMethod()`를 씁니다(GDScript 가드가 프레임워크 경로로 브리지 메서드를
검사하던 버그 방지). 모든 브리지→Godot 콜백은 microtask로 비동기 배달되어
GDScript→JS 호출 중 동기 re-entrancy 유실을 피합니다.
