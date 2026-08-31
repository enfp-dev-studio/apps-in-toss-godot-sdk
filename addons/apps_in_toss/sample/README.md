# Apps in Toss Godot SDK 샘플

Unity SDK의 `Tests~/E2E`(인터랙티브 테스터 + E2E 부트스트래퍼) 구조에 대응하는
Godot 샘플 계층입니다. 실제 게임은 이 폴더를 복사하지 않고, 필요한 AIT API만
게임 코드에서 호출하세요.

- `ait_sample_scene.gd` — 연동 확인 메인 씬 스크립트. 로그인/식별키/IAP 복구/
  전면 광고 흐름과 `?e2e=true` 자동 점검(E2E 모드)을 포함합니다.
- `ait_sample_tester.gd` — 카탈로그 기반 API 테스터.
  `AITGeneratedCatalog.APIS`(api-manifest.json에서 생성)를 목록으로 제시하고,
  선택한 API를 호출해 결과를 표시합니다. Unity의 InteractiveAPITester에 대응.

E2E 모드는 Web 빌드 URL에 `?e2e=true`를 붙이면 활성화됩니다. 파라미터 없는
API를 순회 호출해 성공/실패 개수를 화면에 남깁니다.
