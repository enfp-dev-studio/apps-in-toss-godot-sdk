# Apps in Toss Godot SDK 샘플

Unity SDK의 `Tests~/E2E`(인터랙티브 테스터 + E2E 부트스트래퍼) 구조에 대응하는
Godot 샘플 계층입니다. 실제 게임은 이 폴더를 복사하지 않고, 필요한 AIT API만
게임 코드에서 호출하세요.

- `ait_sample_scene.gd` — 연동 확인 메인 씬 스크립트. 버튼은 정해져 있습니다:
  API 테스터 열기 / 게임 사용자 식별키 받기 / 토스 로그인 인가 코드 받기 /
  인앱 상품 불러오기 / 미결 주문 복구하기 / 전면 광고 지원 확인·미리 불러오기·
  보기, 그리고 `?e2e=true` 자동 점검(E2E 모드).
- `ait_sample_tester.gd` — 카탈로그 기반 API 테스터.
  `AITGeneratedCatalog.APIS`를 목록으로 제시하고, 선택한 API를 호출해 결과를
  표시합니다. Unity의 InteractiveAPITester에 대응. API 항목의 단일 출처는
  `bridge/api-manifest.json`이고, 카탈로그 GDScript는 그것에서 생성된
  출력물입니다(현재 35개 항목 — 그중 AdMob load/show 2개는 구독형이라
  일반 호출 항목 그대로는 호출할 수 없고 `AIT.admob` 래퍼를 써야 합니다).

E2E 모드는 Web 빌드 URL에 `?e2e=true`를 붙이면 씬(`ait_sample_scene.gd`)에서
활성화됩니다. 파라미터 없는 API를 순회 호출해 성공/실패 개수를 화면에
남깁니다(`close_view`는 브라우저에서 제외). 파라미터가 필요한 API는 E2E
순회에서 제외됩니다. 샘플 버튼에 없는 API — AdMob load/show, 내비게이션 바,
구독 결제 주문, 정보 오버레이 구독 — 는 샘플에서 테스트할 수 없고 실제 게임
코드에서 해당 래퍼(`AIT.admob`, `AIT.iap.create_subscription_purchase_order`,
`AIT.game.subscribe_info_overlay_hidden` 등)로 호출하세요. 실기기·토스 앱
값(광고 그룹 ID 등)이 필요하면 `TEST_AD_GROUP_ID` 상수에 콘솔 값을 넣고
전면 광고 버튼으로 직접 호출하세요.

테스터의 파라미터 입력창은 문자열 하나만 전달합니다. 인자가 2개 이상인 API
(예: `storage_set_item(key, value)`)는 입력창 값 그대로 호출할 수 없으니,
실제 게임 코드에서 타입에 맞춰 구성하세요.

테스터(`ait_sample_tester.gd`)의 자동 점검은 `AITGodotE2EProbe` JS 인터페이스를
찾는데, 현재 파이프라인은 이 probe를 주입하지 않아 테스터 쪽 자동 실행은
동작하지 않습니다. 테스터는 목록에서 골라 직접 호출하는 용도로 쓰세요.

두 샘플 모두 `AIT` 오토로드(플러그인 활성화 상태)와 주입된 브리지를 전제로
합니다. 에디터·일반 브라우저·미주입 export에서는 호출 결과가 비어 있거나
`AIT_BRIDGE_UNAVAILABLE` 입니다 (mock 개발 빌드는 mock 응답을 돌려줍니다).
