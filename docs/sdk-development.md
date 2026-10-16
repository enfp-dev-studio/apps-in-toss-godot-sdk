# SDK 개발·업데이트 기록

[← 프로젝트 소개](../README.md) · [검사 실행 방법](testing.md)

이 문서는 SDK 자체를 수정하는 개발자를 위한 안내입니다.
게임에 SDK를 설치하는 방법은 [설치 가이드](getting-started.md)를 참고하세요.

## 저장소 구조

| 경로 | 역할 |
| --- | --- |
| `addons/apps_in_toss/` | 게임에 설치하는 Godot 애드온과 `AIT` 진입점 |
| `bridge/` | TypeScript 브리지 원본 |
| `addons/apps_in_toss/tools/bridge/` | 게임 빌드가 실제로 사용하는 브리지 복사본 |
| `addons/apps_in_toss/tools/scripts/` | 설정 검사·export·브리지 주입·패키징 단계 |
| `addons/apps_in_toss/tools/templates/` | 초기화용 버전 lock과 게임 매니페스트 예시 |
| `tests/`, `.github/workflows/` | 회귀 테스트와 자동 검사 |

구조는 공식 Unity SDK의 게임 API·브리지 레이어에 대응합니다.
브리지 내부의 호출·콜백 처리 방식은 [브리지 안내](../bridge/README.md)에 있습니다.

## 브리지와 API 수정

`bridge/`와 애드온에 포함된 복사본의 소스, `package.json`, `api-manifest.json`,
lockfile을 함께 갱신해야 합니다. 게임 빌드는 애드온의 복사본을 사용합니다.

```bash
cd bridge
npm ci
npm run generate
npx tsc --noEmit
npm run build
```

API 항목의 원본은 [bridge/api-manifest.json](../bridge/api-manifest.json)입니다.
어느 쪽 브리지에서든 `npm run generate`를 실행하면 애드온의 같은 위치에
API와 카탈로그 GDScript를 생성합니다. 의존성 설치 시 실행되는 `prepare`도 이를 수행합니다.

매니페스트가 바뀌면 `templates/platform.lock.json`의 `aitGodotSdk.apiManifestSha256`도
내장 브리지 매니페스트의 SHA-256과 맞춰야 합니다. 버전과 커밋은 실제 의존성에 맞춰 갱신하고,
변경한 API의 호출 방식과 이벤트 처리를 회귀 테스트로 확인하세요.

이 저장소에는 루트 npm 스크립트가 없습니다. 전체 검사 명령은
[테스트 가이드](testing.md#로컬에서-자동-검사-다시-실행하기)에 있습니다.
수정한 SDK를 게임에 반영하는 방법은 [SDK 업데이트](getting-started.md#sdk-업데이트)를 참고하세요.

## 공식 SDK 업데이트 확인

공식 릴리스 노트와 고정 커밋 이후의 코드 차이를 함께 확인합니다.
Unity SDK와 npm web-framework, DevTools의 버전이 같다고 가정하지 말고 실제 의존성을 비교하세요.
새 API에 맞춰 양쪽 브리지, GDScript 래퍼·생성 파일, 버전 lock, 테스트와 문서를 갱신합니다.

문서도 용도별로 유지합니다. README에는 소개·시작 순서·검사 상태만 두고,
설치 변경은 설치 가이드에, 호출 예제는 API 가이드에, 검사 범위는 테스트 가이드에 반영하세요.
상세한 변경 근거는 아래처럼 날짜와 함께 기록합니다.

## Godot 버전 업데이트

[Godot 정식 릴리스](https://github.com/godotengine/godot/releases)와
`platform.lock.json`의 `godot.version`을 비교합니다. 새 버전에 대응할 때는
엔진과 같은 버전의 Web export 템플릿을 함께 준비합니다.

- `godot.version`과 `godot.feature`를 맞춥니다. feature는 `4.7`처럼 major.minor 값입니다.
- Godot 버전이 명시된 CI 워크플로와 문서도 함께 갱신합니다.
- 구문 검사 외에 샘플의 실제 Web export, 브라우저 로딩·API 호출, `.ait` 패키징을 확인합니다.
- 테스트 결과와 미검증 범위를 PR에 기록하고, 검토 후 지원 버전을 올립니다.

검증용 엔진은 별도 경로에서 실행할 수 있습니다. `GODOT_BIN`으로 경로를 지정하면
사용자가 기존에 설치한 Godot 앱을 바꾸지 않고도 새 버전을 시험할 수 있습니다.

## 2026-09-24: Unity SDK 3.5.0 대응

- 기준: 공식 Unity SDK `release/v3.5.0`
  (`29682a9cbc9ff35bf3008d3fb2b790111d34887e`,
  [2026-09-22 공식 릴리스](https://github.com/toss/apps-in-toss-unity-sdk/releases/tag/release%2Fv3.5.0)).
- `release/v3.2.0 → release/v3.5.0` Unity SDK 전체 diff는 패키지 메타데이터·
  체인지로그·빌드 템플릿 npm manifest/lock 5개 파일뿐이고 Runtime 소스 변경은
  없습니다. 단, npm web-framework 자체의 API 표면에는 3.5.0 추가분이 있어서
  아래 한 건을 반영했습니다.
- 반영: `NavigationBar.setOptions` → `navigation_bar_set_options` (매니페스트
  양쪽 + 생성 GDScript + platform lock SHA). 이미 포함돼 있던 추가 API
  (Viral 3종, Storage 배치 2종, Game 정보 오버레이 구독)는 그대로 유효합니다.
- `Promotion.openContactsInvite`는 사용 비권장으로 변경됐습니다. 이 SDK에는
  매핑되지 않은 API라 관련 코드 변경은 없습니다.
- 버전: web-framework 3.4.0 → 3.5.0 (루트·내장 lockfile 포함),
  devtools는 기존 3.2.0을 유지(상류 템플릿 3.1.1로 내리지 않음 — 3.5.0 신규
  API의 mock 응답은 제공하지 않음), 이 SDK 플러그인 버전은 0.2.0 유지.

SDK 업데이트의 초기 검수에서는 설치·구문·브리지·최소 HTML 패키징을 확인했습니다.
이후 진행한 실제 샘플 Web 빌드와 브라우저 실행 결과는 [테스트 기록](testing.md#2026-09-24-샘플-실행-결과)에 있습니다.

## 2026-09-28: 커뮤니티 사례 반영과 잔여 갭 정리

Unity SDK 3.5.0 표면(현재 이름 기준 100여 개)과 앱인토스 개발자 커뮤니티의
문의·노하우를 대조해, 게임에 필요한 항목을 골라 반영했습니다.

- 반영: 생성 설정(`write-ait-config.mjs`)에 `webView.mediaPlaybackRequiresUserAction: false`,
  `pullToRefreshEnabled: false` 기본값 — 로딩 직후 터치 없이 BGM 재생과
  게임 중 당겨서 새로고침 방지(커뮤니티에서 확인된 토스 게임과 동일한 설정).
- 반영: `migration_get_origin_storage` (`Migration.getOriginStorage`) — 서빙
  오리진 변경으로 저장 데이터에 접근할 수 없게 된 사고(2026-08)에 대비한
  이전·현재 저장 덤프 조회. 진행 상태는 SDK 저장소나 서버에 둔다는 규칙을
  API 가이드에 명시했습니다.
- 반영: `AIT.app_events` 가시성 감지(`document.visibilitychange`) — 백그라운드
  진입 이벤트가 엔진 래퍼에 없어 BGM이 계속 재생되던 문의(21개 답글, Unity
  SDK도 별도 helper로 제공) 대응. headless 검사 대상이 아니므로 실기기 확인 필요.
- 이미 반영되어 있던 사례: 상품 지급은 콜백에서 즉시 응답하고 미결 주문으로
  복구(샘플 씬), 광고·AdMob 등 조건부 주입 브리지 방어(`has_api`), QR 실패 시
  호스트 앱(토스 앱) 버전 먼저 확인, SDK 3.x 롤백 불가·신규 등록 게이트.
- 잔여 갭(게임 우선순위에 따라 백로그): `TossPay.*`, `Screen.*`(화면 방향·깨우기),
  `SafeArea.*`, `Analytics.*`, `Device/File.*`(카메라·앨범·PDF), `TossAds` 배너,
  `Review/Notification/Promotion.*`, 위치 API, `User/Environment.*` 식별·정보 API,
  `GraniteEvent` back/home 구독. 표면 비교는 `bridge/node_modules/@apps-in-toss/web-framework/dist/index.d.ts`
  또는 [Domains API](https://developers-apps-in-toss.toss.im/documentation/sdk/domains-api)와
  `bridge/api-manifest.json`을 대조하면 됩니다.
- 감시: web-framework 3.6.0(2026-09-28, `User.createAnonymousKeyAuthCode`)이
  나왔으나 Unity SDK 태그는 아직 3.5.0입니다. Unity가 따라오면 함께 검토합니다.

## 2026-10-16: Unity SDK 3.8.0 대응

- 기준: 공식 Unity SDK `release/v3.8.0`
  (`18814fe5b5a2af5cd2a11a7a5bae53403fafa15e`,
  [2026-10-14 공식 릴리스](https://github.com/toss/apps-in-toss-unity-sdk/releases/tag/release%2Fv3.8.0)).
  3.6.0·3.7.0·3.8.0이 같은 날 함께 나왔습니다.
- Unity 쪽 `release/v3.5.0 → release/v3.8.0` Runtime 변경은 배너 광고 helper뿐입니다.
  창 크기가 바뀐 뒤 배너 높이 비율이 갱신되지 않아 배너가 게임 화면을 가리던 문제를 고쳤습니다
  (`AIT.BannerAd.cs`, `AppsInToss-BannerAd.jslib`). 이 SDK에는 배너 광고가 없어 반영할 코드가 없습니다.
- web-framework API 표면 변경과 반영 결과:
  - 3.6.0 `User.createAnonymousKeyAuthCode` → 반영. `user_create_anonymous_key_auth_code`
    (매니페스트 양쪽 + 생성 GDScript)와 `AIT.create_anonymous_key_auth_code` 래퍼(`AITAuth`)를 추가했습니다.
  - 3.7.0 `ConsentedUserDataKey`에 `USER_ADDRESS_BASE`, `USER_ADDRESS_DETAIL` 추가 →
    `User.getConsentedData`를 매핑하지 않았으므로 코드 변경 없음.
  - 3.8.0 `Viral.share` 옵션에 `title`, `description` 추가 → 옵션을 그대로 넘기므로
    코드 변경 없이 사용할 수 있습니다. API 가이드에 예제를 추가했습니다.
- 버전: web-framework 3.5.0 → 3.8.0, devtools 3.2.0 → 3.8.0(Unity 템플릿과 같은 버전).
  devtools 3.8.0 mock은 카탈로그 37개 API를 모두 제공하고, 브리지가 쓰는
  `unplugin` 옵션(`mock`, `panel`, `forceEnable`)과 `dist/panel/index.js` 경로도 그대로입니다.
  이 SDK 플러그인 버전은 0.2.0을 유지합니다.
- 상류 태그 재생성: Unity SDK는 2026-10-06에 `release/v3.2.0`~`v3.5.0` 태그를 다시 만들었습니다.
  이전에 고정한 `29682a9`는 지금의 `release/v3.5.0` 태그 커밋이 아닙니다.
  차이는 Editor 도구, WebGL 템플릿(`index.html`), BuildConfig devtools·vite 버전뿐이고 Runtime 변경은 없습니다.
  다음 비교도 태그 이름이 아니라 고정한 커밋 해시를 기준으로 하세요.
- 잔여 갭(백로그):
  - Unity WebGL 템플릿의 소프트 키보드 처리(`index.html`, 3.5.0 재태그에 포함). iOS WKWebView가
    입력창을 드러내려고 문서를 스크롤하면 `position: fixed` 게임 컨테이너가 밀려 상단 UI가 화면 밖으로
    나가는 문제를 `visualViewport`로 보정합니다. Godot의 텍스트 입력에도 같은 원리가 적용될 수 있어
    실기기에서 재현한 뒤 커스텀 셸에 넣을지 판단합니다.
  - `TossAds` 배너, `User.getConsentedData` 등 2026-09-28 기록의 잔여 갭은 그대로입니다.
- 커뮤니티(2026-09-28 이후, 게임 관련):
  - [웹 디버그 툴즈](https://techchat-apps-in-toss.toss.im/t/4890)(2026-09-30 출시)가 테스트 스킴에서
    `fetch` 응답을 감싸 `WebAssembly.compileStreaming`이 실패한 사례가 있었습니다(Flutter Web,
    [4920](https://techchat-apps-in-toss.toss.im/t/4920)). 2026-10-08 플랫폼에서 수정됐습니다.
    Godot도 wasm을 쓰므로 테스트 스킴에서만 로딩이 멈추면 이 사례를 먼저 확인합니다.
  - "문제가 생겨서 미니앱을 다시 시작했어요" 토스트와 반복 재시작은 대부분 메모리 부족(OOM) 때문이라는
    운영팀 답변이 있습니다([4990](https://techchat-apps-in-toss.toss.im/t/4990), Unity Web, iOS).
  - `Game.getUserProfile`이 라이브에서 `NOT_SUPPORTED`를 돌려주는 사례를 운영팀이 재현해 확인 중입니다
    ([4887](https://techchat-apps-in-toss.toss.im/t/4887)). 게임은 이 값을 받으면 기본 닉네임으로 대체해야 합니다.
- 검증: `node --test tests/*.test.mjs`, 브리지 타입 검사, prod·mock 빌드.
  로컬에 Godot가 없어 GDScript 구문 검사는 CI(`godot-addon.yml`)에 맡겼습니다.
  새 API의 실제 응답은 토스 앱에서 확인해야 합니다.
- 감시: Unity SDK가 `User.getConsentedData`나 배너 외 helper를 추가하는지, devtools mock 응답이 바뀌는지 봅니다.

## 2026-10-16: 게임 적용에서 발견한 버그 수정

cat-room-godot 게임에 SDK를 적용하며 4건(1~4)을 발견했고, 수정 검수에서 1건(5), 출시 점검에서 1건(6)을 더 찾았습니다. 아래와 같이 고쳤습니다.

1. export 폴더 정리: `build:dev` 뒤 `build`를 하면 mock 브리지와 DevTools 패널
   (약 1.6MB)이 출시 `.ait`에 섞였습니다. `export-godot.mjs`가 이전에는 기본
   경로일 때만 폴더를 비웠기 때문입니다. 새 모듈
   [`export-dir.mjs`](../addons/apps_in_toss/tools/scripts/export-dir.mjs)가
   지워도 되는 폴더인지 판단하고(`isClearableExportDir`), `export-godot.mjs`가
   그 결과에 따라 폴더를 비우거나 개발 전용 파일만 골라 지웁니다.
   [`verify-godot-export.mjs`](../addons/apps_in_toss/tools/scripts/verify-godot-export.mjs)는
   release 빌드에 개발 전용 파일(`apps-in-toss-godot-bridge.mock.js`,
   `ait-devtools-panel.js`)이 파일 또는 `index.html` 참조로 남아 있으면
   실패합니다. 추가된 테스트는 [export-dir](../tests/export-dir.test.mjs)입니다.
2. 설정 생성: [`write-ait-config.mjs`](../addons/apps_in_toss/tools/scripts/write-ait-config.mjs)가
   `.ait/game.manifest.json`의 `webView`, `permissions`, `navigationBar`를 읽어
   `apps-in-toss.config.ts`에 넣습니다. `webView`는 기본값
   (`mediaPlaybackRequiresUserAction: false`, `pullToRefreshEnabled: false`) 위에
   매니페스트 값을 덮어쓰고, 허용되지 않은 키·값·조합은 실패합니다. 추가된
   테스트는 [write-ait-config](../tests/write-ait-config.test.mjs)입니다.
3. eval 제거: 애드온 가시성 모듈(`ait_app_events.gd`)과 샘플
   (`ait_sample_scene.gd`, `ait_sample_tester.gd`)이 `JavaScriptBridge.eval`을
   쓰지 않습니다. `get_interface`와 콜백 직접 전달로 바꿨습니다. `doctor`는
   게임 스크립트의 `JavaScriptBridge.eval` 사용을 경고합니다. Godot 엔진 JS
   자체에는 `JavaScriptBridge.eval` 구현용 eval 코드가 들어 있지만, 게임과 SDK가
   그 API를 호출하지 않으면 실행되지 않습니다. 엔진에서 아예 빼는 방법(커스텀
   Web 템플릿 빌드)은 이 SDK에서 검증하지 않았습니다. 추가된 테스트는
   [no-eval](../tests/no-eval.test.mjs)입니다.
4. 브리지 탐색: `AITCore`가 `get_interface("AppsInTossGodot")` 직접 조회 대신
   `window` 속성으로 브리지를 찾아, 브리지가 아직 없을 때
    `No interface 'AppsInTossGodot' registered` 오류를 찍지 않습니다. 이 항목의
    전용 회귀 테스트는 추가하지 않았습니다. 대신 아래 검증 문단의 브라우저 확인으로
    대체했습니다.
5. 경로 표시 정리: `doctor`의 eval 경고가 게임 폴더 기준 경로(`scripts/x.gd:4`)로
   나오고, 생성 설정의 webBundleDir 기본값이 게임 안이면 상대경로(`build/godot-web`)로
   기록돼 기기별 절대경로가 커밋되지 않습니다.
6. 깨끗한 체크아웃 빌드: `.godot`가 없는 프로젝트(새 clone, git worktree)에서 `build`가 컴파일 게이트에서 `Could not find type AITCore`로 실패했습니다. 게이트가 import 전에 돌아 class_name 캐시가 없었기 때문입니다. `export-godot.mjs`가 `.godot/global_script_class_cache.cfg`가 없을 때만 `godot --headless --import`를 먼저 실행합니다. 추가된 테스트는 [export-import-order](../tests/export-import-order.test.mjs)입니다. `.godot`를 뺀 cat-room-godot 사본에서 첫 실행은 import 후 export 성공, 두 번째 실행은 import 없이 성공함을 확인했습니다.

게임 쪽 우회: cat-room-godot의 `npm run clean`은 export 폴더를 직접 비우는
임시 조치이며, SDK 업데이트 후 없애도 됩니다.

검증: `node --test tests/*.test.mjs` 37개와 Godot 4.7.2 애드온 검사
(`tests/run-godot-addon.mjs`)가 통과합니다. cat-room-godot 복사본에 수정한
애드온을 넣고 확인했습니다. `build:dev` 결과를 브라우저(375×812)에서 열어
브리지 연결, 가시성 이벤트(숨김 → 소리 게이트에 hidden, 다시 보임 → 해제)가
eval 없이 동작함을 확인했습니다. 이어서 정리 단계 없이 `build`를 실행해
`build/godot-web`과 `.ait`에 mock 브리지·DevTools 패널이 없고 출시 브리지만
들어감을 확인했습니다. 매니페스트의 webView 옵션(`bounces`,
`allowsBackForwardNavigationGestures`)이 설정에 들어감, `doctor`가 게임 스크립트의
eval을 경고함, 브리지를 뺀 빌드에서 "No interface" 오류 없이 게임 자체 경고만
나옴을 확인했습니다. 미확인: 토스 앱·실기기 동작.

참고: DevTools 패널 번들은 `process.env.NODE_ENV`를 참조하므로 SDK의 `preview`(Vite)로
열어야 합니다. 단순 정적 서버로 열면 `process is not defined` 오류로 패널만 뜨지
않습니다(3.2.0 패널도 같음, 게임 동작에는 영향 없음).
잔여 갭: Godot 번들에는 `@apps-in-toss/debug-console` 연결 지점이 없어 `/ait:debug` 환경 3(실기기 원격 디버깅)을 쓸 수 없습니다. 백로그로 둡니다.
