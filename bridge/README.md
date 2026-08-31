# Apps in Toss Godot bridge

Godot의 `JavaScriptBridge` 호출을 `@apps-in-toss/web-framework`로 전달하는
브리지입니다. 공식 Unity SDK의 `.jslib` 레이어에 대응합니다.

```bash
npm run godot:bridge:build
npm run godot:patch
```

이 디렉터리는 웹 게임의 React 코드와 분리된 SDK 계층에 있지만 루트 npm 스크립트로
함께 빌드됩니다. `npm run godot:sdk:sync`가 `godot-sdk/addons/apps_in_toss`를
샘플 Godot 프로젝트에 복사합니다.

브리지는 classic IIFE로 빌드되어 Godot 엔진의 `index.js`보다 먼저 실행됩니다.
IAP의 `processProductGrant`는 JS Promise를 유지한 채 Godot의 응답을 기다리는 nested
callback transport를 사용합니다. 전면 광고의 `loadFullScreenAd`와
`showFullScreenAd`는 같은 구독 이벤트 transport로 `loaded`, `show`, `dismissed`,
`userEarnedReward` 등을 전달합니다.
