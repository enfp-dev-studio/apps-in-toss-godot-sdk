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

**이 SDK는 출시된 공식 Unity SDK와 1:1로 맞춥니다.** 버전 사이의 차이만 보면 전에 빠진 API가 계속 빠진 채로 남습니다
(2026-09-28에 게임에 필요한 것만 골라 넣고 나머지를 미룬 뒤, 3.8.0·3.9.0 업데이트가 차이만 봐서 45개가 11-10까지 빠져 있었습니다).
업데이트할 때마다 아래처럼 전체를 대조합니다.

- 기준은 출시된 Unity UPM 태그(`release/v<버전>`)입니다. main 브랜치나 API 변경 기록의 개수는 출시 전 표면이라 쓰지 않습니다.
- 그 태그의 jslib가 부르는 web-framework 경로를 모두 뽑습니다.

  ```bash
  git clone --depth 1 --branch release/v<버전> https://github.com/toss/apps-in-toss-unity-sdk.git <임시 폴더>
  grep -h -o -E "window\.AppsInToss\.[A-Za-z0-9_.]+" <임시 폴더>/Runtime/SDK/Plugins/*.jslib | sed 's/window\.AppsInToss\.//' | sort -u
  ```

- 뽑은 목록으로 [manifest-parity](../tests/manifest-parity.test.mjs)의 Unity 경로 목록을 바꾸고, 테스트가 통과할 때까지 매핑합니다.
  결과를 한 번 주는 API는 매니페스트(`AIT.api.*`), 콜백을 여러 번 주는 API는 `AIT.events`, 결제·광고처럼 흐름이 있는 API는 전용 모듈에 둡니다.
  Unity가 엔진 값으로 주는 API(`GetDevicePixelRatio` 등)도 Godot 쪽 함수로 맞춥니다.
- Unity가 deprecated·v2 별칭인 옛 이름을 부르고 이 SDK에 같은 기능의 새 이름이 있으면, 테스트의 `RENAMED`에 적고 새 이름으로 덮습니다.
- web-framework·DevTools 버전과 API는 그 Unity 태그가 쓰는 것(`WebGLTemplates/AITTemplate/BuildConfig~/package.json`)을 따릅니다.
  Unity보다 web-framework에 먼저 나온 API는 Unity가 넣을 때 함께 넣습니다(2026-11-12 결정: 앱인토스 팀이 만드는 Unity SDK의 처리 결과를 따른다).
  그 전에 앞서 넣은 web-framework 3.10.0과 `NavigationBar` 액세서리 버튼은 내리지 않고 둡니다.
- API 밖의 Unity 기능(런타임 도우미, WebGL 템플릿, 에디터 메뉴·창)도 같은 태그로 대조합니다. 엔진 차이로 필요 없는 것만 빼고, 뺀 것은 이유와 함께 기록합니다.
- "게임에 필요 없어 보인다"는 이유로 빼거나 미루지 않습니다. 범위를 줄여야 할 사정이 있으면 정하기 전에 사용자에게 묻습니다.

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
- [engine-patch.mjs](../addons/apps_in_toss/tools/scripts/engine-patch.mjs)는 4.7.2 엔진 JS의 정확한 코드 조각에 붙습니다.
  새 엔진에서 조각을 못 찾으면 `build`가 멈추므로, 새 템플릿의 `godot.js`로 `tests/release-eval.test.mjs`의 실제 템플릿 검사를
  돌리고 조각을 갱신하세요(Godot 4.8은 Sample 소리 버그 #123996를 고쳤으니 소리 훅도 다시 확인).

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
- 감시: Windows `ait build`가 `.ait` 안 경로를 역슬래시로 쓴다는 문의
  ([5003](https://techchat-apps-in-toss.toss.im/t/5003), 답변 대기). `@apps-in-toss/cli` 3.5.0과 3.8.0의
  배포 코드는 버전 문자열만 달라 이번 업데이트로 생긴 문제는 아닙니다.
- 의존성: bridge 개발 의존성 경로(vite → postcss)의 `source-map-js` 감사 경고를
  `npm audit fix`로 1.2.2로 올려 해소했습니다. 배포 번들에는 포함되지 않습니다.

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
   (2026-11-04 정정: 검수는 이 엔진 코드와 "eval" 글자 자체를 반려합니다. 아래 2026-11-04 기록대로
   export 뒤 엔진 JS를 고칩니다.)
4. 브리지 탐색: `AITCore`가 `get_interface("AppsInTossGodot")` 직접 조회 대신
   `window` 속성으로 브리지를 찾아, 브리지가 아직 없을 때
    `No interface 'AppsInTossGodot' registered` 오류를 찍지 않습니다. 이 항목의
    전용 회귀 테스트는 추가하지 않았습니다. 대신 아래 검증 문단의 브라우저 확인으로
    대체했습니다.
5. 경로 표시 정리: `doctor`의 eval 경고가 게임 폴더 기준 경로(`scripts/x.gd:4`)로
   나오고, 생성 설정의 webBundleDir 기본값이 게임 안이면 상대경로(`build/godot-web`)로
   기록돼 기기별 절대경로가 커밋되지 않습니다.
 6. 깨끗한 체크아웃 빌드: `.godot`가 없는 프로젝트(새 clone, git worktree)에서 `build`가 컴파일 게이트에서 `Could not find type AITCore`로 실패했습니다. 게이트가 import 전에 돌아 class_name 캐시가 없었기 때문입니다. `export-godot.mjs`가 `.godot/global_script_class_cache.cfg`가 없을 때만 `godot --headless --import`를 먼저 실행합니다. 추가된 테스트는 [export-import-order](../tests/export-import-order.test.mjs)입니다. `.godot`를 뺀 cat-room-godot 사본에서 첫 실행은 import 후 export 성공, 두 번째 실행은 import 없이 성공함을 확인했습니다.
 7. 오래된 캐시 빌드 통과: 출시 점검 세션이 오래된 `.godot` 캐시가 남은 작업 사본에서 빌드하다 발견했습니다. 새 `class_name TouchScroll`이 추가됐는데 캐시가 있어 import가 건너뛰어졌고, 컴파일 게이트는 애드온 파일만 검사해 "passed (17 files)"로 통과했습니다. export 중 게임 스크립트 6개의 SCRIPT ERROR가 났는데도 빌드가 exit 0으로 끝나 `.ait`가 만들어졌습니다. 원인 둘: (a) import가 캐시가 있을 때 건너뛰어 새 class_name이 등록되지 않았고, (b) export 출력 판정이 `startsWith('SCRIPT ERROR')`라 색 코드·앞 공백이 붙은 줄을 놓쳤습니다. 수정: `export-godot.mjs`가 컴파일 게이트 전에 매번 `godot --headless --import`를 실행하고(증분이라 빠름, 실행 시간을 로그에 남김; `needsGodotImport`는 처음/갱신 로그 문구 구분에만 사용), import와 export 출력 모두 ANSI 색 코드를 제거한 뒤 줄 단위 `includes('SCRIPT ERROR')`로 검사합니다. 검출 함수 `findScriptErrors`는 [`export-dir.mjs`](../addons/apps_in_toss/tools/scripts/export-dir.mjs)의 순수 함수로 두었습니다. 추가된 테스트는 [export-script-errors](../tests/export-script-errors.test.mjs)입니다.

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
잔여 갭(해결): Godot 번들에 `@apps-in-toss/debug-console` 연결 지점이 없어 `/ait:debug` 환경 3(실기기 원격 디버깅)을 쓸 수 없던 문제는 아래 "2026-10-16: 실기기 원격 디버깅 테스트 빌드"에서 `build --debug-console`로 해결했습니다.

## 2026-10-16: 실기기 원격 디버깅 테스트 빌드

토스 앱에서 연 테스트 번들에 앱인토스 디버거(`ait-devtools` MCP, `/ait:debug` 환경 3,
relay-staging QR attach)를 붙일 수 있게 했습니다. 출시 번들에는 들어가지 않습니다.
사용 순서는 [테스트 가이드](testing.md#실기기-원격-디버깅)에 있습니다.

- 의존성: `@apps-in-toss/debug-console` 0.2.0(harness GitHub Release tarball)을 두 브리지
  `dependencies`에 넣었습니다. 두 `package.json`·lockfile은 바이트가 같고,
  [manifest-parity](../tests/manifest-parity.test.mjs)가 lockfile까지 비교합니다.
- 별도 번들: `npm run build:debug-console`(Vite mode `debug-console`)이
  `src/debug-console.ts`(`@apps-in-toss/debug-console/auto`)를 `dist/ait-debug-console.js`
  IIFE(약 12KB)로 만듭니다. 출시 브리지 `src/index.ts`는 이 패키지를 import하지 않으며,
  옵션 없이 만든 출시·mock 브리지 번들은 변경 전과 바이트가 같습니다. debug-console이
  `import('@apps-in-toss/web-framework')`로 부르는 SDK는 빌드 때 브리지가 올린
  `window.AppsInToss`로 바꿔 web-framework가 두 번 들어가지 않게 했습니다. 그래서
  `index.html`에서 브리지 다음에 와야 합니다. `/auto`의 DEV 신호는 빌드에서 `false`로 고정됩니다.
- 켜는 방법: `ait-godot build --debug-console` 또는 `AIT_DEBUG_CONSOLE=1`. 켜면
  `pipeline-finalize`가 debug-console 번들을 만들고, `patch-export`가 브리지 다음에
  `<script src="./ait-debug-console.js">`를 넣고, `write-platform-manifest`가
  `"debugConsole": true`를 기록합니다. 빌드 로그 처음과 끝에 "테스트 전용 빌드 — 검수 제출 금지"를
  출력합니다. 끄면(기본) 이전과 같은 결과입니다. `build:dev`(mock)에서는 이 옵션을 무시합니다.
- 안전장치: `ait-debug-console.js`를 `export-dir.mjs`의 개발 전용 목록에 넣어 `build`가
  export 폴더를 비우지 못할 때도 지웁니다. `verify-godot-export.mjs`는 release 검증에서
  이 파일이나 `index.html` 참조, 매니페스트 `debugConsole: true`, 브리지 번들 안의
  debug-console 코드(`__ait_debug_status`, `/ait-attach`)를 발견하면 실패합니다.
  테스트 빌드 검증은 파일·참조 1회·브리지 다음 순서·매니페스트 기록을 확인합니다.
  `doctor`는 export 폴더 매니페스트에 `debugConsole: true`가 남아 있으면 경고합니다.
  추가된 테스트는 [debug-console](../tests/debug-console.test.mjs)(18개)이고, CI의
  [브리지·패키징](../.github/workflows/bridge-package.yml)에 `build:debug-console` 단계를 넣었습니다.

검증: `node --test tests/*.test.mjs` 56개, 두 브리지의 `tsc --noEmit`·production·mock·
`build:debug-console` 빌드, `tests/run-minimal-package.mjs`, Godot 4.7.2
`tests/run-godot-addon.mjs`가 통과합니다. cat-room-godot 커밋(`60c3246`)을 git worktree로
꺼내 이 애드온(SDK `8fffd4b` + 이번 변경)과 새 템플릿 lock을 넣고 확인했습니다.
`build --debug-console`의 `.ait`에는 `ait-debug-console.js`와 `"debugConsole": true`가 있었고,
이어서 옵션 없이 `build`하자 `doctor`가 이전 테스트 빌드를 경고한 뒤 `.ait`에서 둘 다 빠졌습니다.
테스트 빌드 결과를 정적 서버(375×812)로 열면 쿼리가 없을 때 debug-console이 아무것도 하지 않고
(`__ait_debug_status`·`__sdk` 없음, relay 요청 없음) 게임이 입양 화면까지 뜹니다. 콘솔 오류는
토스 밖에서 나는 게임의 Storage 경고뿐입니다. `?debug=1`만 붙이면 relay 주소가 없어
`blocked-invalid-relay` 막대가 뜨고, `window.__sdk`는 브리지의 `window.AppsInToss` 객체를 그대로 씁니다.
미확인: 토스 앱 실기기에서 QR attach와 디버거 도구(`take_screenshot`, `evaluate`, `call_sdk`, `run_tests`) 동작.

## 2026-10-18: cat-room-godot에서 배운 것 반영

cat-room-godot(비게임, Godot 4.7.2 Web)을 만들며 SDK 위에 따로 짠 것 가운데 다른 Godot 미니앱에도 반드시 필요한 것을 SDK로 옮겼습니다.
항목별 분류(애드온 코드·문서·앱 전용)와 cat-room 위치는 [정리 문서](lessons-cat-room-godot.md)에 있습니다.
새 모듈은 모두 부르거나 켜야 동작하고, `appType`이 없는 매니페스트의 생성 설정은 이전과 같습니다.

- 애드온 모듈:
  - `AIT.back`(`AITBack`): 닫을 것이 있을 때만 `graniteEvent` `backEvent`를 구독하고 비면 풀어, 첫 화면에서는 플랫폼 기본 동작(종료)이 됩니다.
    `addEventListener(event, handlers)`처럼 구독 객체 앞에 인자를 받는 API를 위해 브리지에 `subscribePathArgs`를 더했습니다(두 복사본 동일).
    `AITCore.start_path_subscription`에 `args` 인자가 생겼고 기본값은 빈 배열입니다.
  - `AIT.safe_area`(`AITSafeArea`): `SafeArea.get`·`SafeArea.subscribe`, 없으면 CSS `env()`를 DOM으로 잽니다. CSS px를 UI 단위로 바꿉니다.
  - `AIT.sound`(`AITSoundGate`): 멈출 이유 집합. `enable()` 뒤 백그라운드·광고·결제 동안 Master 버스를 끕니다. 이를 위해
    `AIT.ads`·`AIT.admob`에 `show_started`·`show_ended`·`is_showing`, `AIT.iap`에 `order_started`·`order_ended` 신호를 더했습니다.
  - `AITSaveSlot`: 사용자 식별키 기준 키, 읽기 재시도, 읽기 실패면 새로 시작하지 않음, 깨진 JSON 원본 보관, 숨김 때 flush, 데스크톱은 `user://`.
  - `AITKorean`(`keep_all`, `josa`), `AITTouchScroll`(cat-room `TouchScroll`), `AIT.build_kind()`·`is_test_run()`,
    `AIT.get_anonymous_key()`·`get_user_hash()`(`AITAuth`).
  - 모든 애드온 스크립트의 `.uid`를 배포합니다(`tools/` 제외). `tools/.gdignore`를 배포해 Godot이 CLI와 `node_modules`를 스캔하지 않습니다.
- CLI:
  - 매니페스트 `appType`(`game`·`nongame`): `nongame`이면 `navigationBar.withBackButton: true`, `game`이면 `transparentBackground: true`를
    매니페스트 값 아래에 깝니다. cat-room은 설정에 뒤로가기 버튼이 없어 iOS에서 하위 화면을 나갈 길이 없었습니다.
  - `init --nongame`, `init`이 셸 템플릿(`tools/templates/custom_shell.html` = `docs/examples/custom-shell.html`)과 `.gitignore` 줄을 만듭니다.
    템플릿은 확대 막기·`viewport-fit=cover`·캔버스 제스처·해상도 상한·WebGL 2 안내를 담습니다.
  - `doctor`: 셸 viewport meta, 테스트 광고 ID, `appType`, `.ait_relay` git 무시, `tools/.gdignore` 경고. Godot MCP의 `McpBridge` 오토로드와,
    프리셋 `vram_texture_compression/for_mobile=true`인데 `import_etc2_astc`가 꺼진 경우는 strict 실패(브라우저 스모크 중 export가 이유 없이 실패해 찾음).
    검사 함수는 [`doctor-checks.mjs`](../addons/apps_in_toss/tools/scripts/doctor-checks.mjs)에 있습니다.
  - `verify-godot-export.mjs`: export 폴더가 100MiB를 넘으면 실패, 100MB를 넘으면 경고(`.ait`는 압축 해제 100MB 이하, 단위는 문서에 없음).
  - `addon:install --force`가 SDK에 없는 게임 쪽 `.uid`를 지킵니다.
- 문서: [출시 전 점검](release-checklist.md), [Godot Web 주의사항](godot-web-notes.md)을 새로 썼고, API 가이드(뒤로가기·Safe Area·사운드 게이트·저장·한글·
  결제 지급 3단계와 오류 코드·광고 미리 불러오기·서버 호출 한도), 설치 가이드(`appType`·셸·프로젝트 설정·개발 도구 프리셋), 테스트 가이드
  (mock 보상 이벤트 없음, QR 결제는 실제 결제, 디버거 붙지 않을 때, 헤드리스 점검·캡처, Godot MCP)를 고쳤습니다.
- 확인한 사실(앱인토스 문서): 비게임 체크리스트의 뒤로가기·확대 항목, 게임 바와 종료 확인 모달(SDK 2.9.2+), `graniteEvent` 시그니처,
  `SafeArea.get`(동기)·`subscribe`, iOS IndexedDB 7일 삭제와 QR·라이브 오리진, 테스트 스킴 `queryParams`, 압축 해제 100MB,
  `getCompletedOrRefundedOrders` 첫 페이지만, QR 결제는 실제 결제, 테스트 광고 ID 네 가지, 파트너 API 분당 3,000회.
- 검증: `node --test tests/*.test.mjs` 97개(새 테스트: [lessons-cli](../tests/lessons-cli.test.mjs) 29개, 설정 생성 5개, 브리지 전송 2개),
  두 브리지의 `tsc --noEmit`·production·mock·`build:debug-console` 빌드(출시 번들에 debug-console 코드 없음), `tests/run-minimal-package.mjs`,
  Godot 4.7.2 `tests/run-godot-addon.mjs`(컴파일 게이트 23개 파일, [모듈 검사](../tests/gdscript/lessons-modules.gd) 82개), API 가이드·주의사항 문서의
  GDScript 예제 14개 컴파일. 모듈 검사를 쓰다가 헤드리스 기본 창이 64×64라 그 밖의 누름을 GUI가 받지 않는 것을 확인해 테스트 가이드에 적었습니다.
- 브라우저 스모크(임시 프로젝트, 375×812): SDK 원본 CLI로 `addon:install` → `init --nongame`(매니페스트 `appType`, 셸, `.gitignore`) →
  실제 Godot Web export `build:dev` → DevTools 3.8.0 mock에서 확인했습니다. `AIT.build_kind()` = `dev`, `AIT.back.push` 뒤 `backEvent` 구독(`subscribePathArgs`),
  mock `__ait:backEvent` 한 번에 handler 한 번 → 구독 해제 → 다음 뒤로가기는 가로채지 않음, Safe Area mock 54/34 CSS px → 51.84/32.64 UI(×0.96),
  `get_user_hash()`, `AITSaveSlot`이 식별키 기준 키로 쓰고 새로고침 뒤 읽음, 전면 광고 표시 동안 게이트 `ad:<id>`로 닫힘 → 끝나면 열림,
  생성 설정에 `withBackButton: true`, 셸 viewport meta·로딩 화면 걷기·해상도 상한. 같은 스모크에서 모바일 VRAM 압축 프리셋과 ETC2/ASTC import가
  어긋나 export가 이유 없이 실패하는 것을 찾아 `doctor` 검사로 넣었습니다.
- 미확인: 토스 앱 실기기에서 바 뒤로가기 버튼이 `backEvent`로 오는지, 첫 화면 종료, Safe Area 실제 값, Sample 루프 이음매,
  사운드 게이트가 광고·결제 중 실제로 소리를 멈추는지, `AITSaveSlot`의 실제 저장 유지. cat-room-godot에는 아직 적용하지 않았습니다
  (앱의 `Platform`·`Sound`·`Game`을 SDK 모듈로 바꾸는 일은 앱 쪽 작업).
- 버전: 플러그인·lock 버전(0.2.0)은 그대로 두었습니다. 배포할 때 올립니다.

## 2026-10-25: Unity SDK 3.9.0 대응

- 기준: [공식 3.9.0 릴리스](https://github.com/toss/apps-in-toss-unity-sdk/releases/tag/release/v3.9.0)
  (2026-10-24 UTC), 태그가 가리키는 UPM 커밋
  `c2892282018b44e1666b364a7a97711a130761d6`.
  릴리스 본문의 `ad787dd`는 생성 원본 커밋이며 고정할 UPM 태그 커밋과 다릅니다.
- 비교 기준은 원격 main에 고정돼 있던 `18814fe5b5a2af5cd2a11a7a5bae53403fafa15e`입니다.
  Unity `Runtime/` C#·jslib API 파일은 동일합니다. Editor·Unity WebGL 로더·측정·개발 콘솔과
  BuildConfig 변경은 Godot API로 옮기지 않았습니다.
- 실제 npm web-framework 3.8.0/3.9.0의 `dist/index.d.ts`·구현 비교에서는
  `IAP.getCompletedOrRefundedOrders(params?)`에 `{key?: string | null}`이 추가됐습니다.
  양쪽 매니페스트와 생성기에 선택 인자 기본값을 반영하고, IAP 래퍼에 옵션을 전달합니다.
  기존 무인자 호출과 `_and_wait(timeout_ms)`는 유지하며 옵션은 시간제한 다음에 받습니다.
  `getPendingOrders` 설명도 '결제 완료 후 미지급 주문'으로 바로잡았습니다.
- web-framework·간접 CLI와 DevTools는 실제 상류 의존성대로 각각 3.9.0으로 고정했습니다.
  Godot 4.7.2, 플러그인 0.2.0, TypeScript·Vite 및 무관한 잠금 의존성은 유지합니다.
- DevTools 3.9.0은 기존 3.8.1의 광고·결제 오류/이벤트 mock 개선을 포함합니다.
  기존 브리지는 오류와 이벤트를 그대로 전달합니다. 카탈로그 38개 경로가 실제 mock 함수로
  해석되는 것을 확인했지만, 완료·환불 주문의 `key`는 mock에서 무시됩니다.
- 새 GDScript 회귀 검사는 기본 페이지·커서·nullable 커서·기존 시간제한 호출과 생성 API를 확인합니다.
  실제 검사 결과와 미검증 범위는 [3.9.0 검사 기록](testing.md#2026-10-25-sdk-390-자동-검사)에 있습니다.

## 2026-11-04: cat-room-godot 실기기 사례 반영과 3.9 정리

cat-room-godot 출시 준비(검수 반려 2회, iOS 실기기 -33~-105)에서 앱 쪽으로 고치거나 우회한 것 가운데 다른 Godot 앱에도
필요한 것을 정리한 노트(2026-11-04)를 기준으로 반영했습니다. cat-room의 11월 코드는 이 저장소에서 볼 수 없어 노트의 설명대로
다시 구현했습니다. 실기기로 맞춘 동작(특히 iOS 소리 복구)은 실기기에서 다시 확인해야 합니다.

- 먼저 합침: `lessons/cat-room-godot`(뒤로가기·Safe Area·사운드 게이트·저장 칸·UI 도우미·doctor 점검)과
  `codex/toss-sdk-3.9.0`(web-framework·DevTools 3.9.0, Unity `release/v3.9.0` = `c2892282`, 주문 페이지 조회).
  `.gd.uid` 충돌은 `main` 값(51e1fb1)을 지켰습니다.
- 1-1 검수 eval 반려: [engine-patch.mjs](../addons/apps_in_toss/tools/scripts/engine-patch.mjs)가 export 직후 `_godot_js_eval`을
  빈 `_godot_js_off`로 바꾸고 wasm 가져오기 표 값도 바꿉니다(출시 템플릿은 키가 `$e`처럼 짧아 글자가 모두 사라짐, 디버그 템플릿은 키가 남음).
  브리지 빌드는 `@webview-bridge/web`의 `evaluate` 옵션 이름을 `dispatch`로 바꾸고 출시·debug-console 번들에 글자가 남으면 멈춥니다.
  [release-scan.mjs](../addons/apps_in_toss/tools/scripts/release-scan.mjs)로 export 폴더와 최종 `.ait`(`project-package.json` 포함)를 검사하고,
  `doctor --strict`는 게임의 `JavaScriptBridge.eval`에서 실패합니다. 엔진 직접 빌드(`javascript_eval=no`)는 확인하지 않았습니다.
- 2-1·2-2 iOS 소리: 엔진 패치가 `window.__godotAudio`, 출력 앞 페이더, 드라이버 인자 기록, 위치 워크릿 훅,
  `GodotAudio.aitRecreate()`(버스·위치 워크릿·출력 드라이버 다시 잇기)를 넣고, 다른 컨텍스트의 위치 워크릿을 다시 쓰던 엔진 버그를
  고칩니다. 브리지 [web-runtime.ts](../bridge/src/web-runtime.ts)가 첫 터치 소리 풀기, 위치 워크릿 Blob 재시도·대역 노드(항상),
  떠날 때 페이드·직접 멈춤과 돌아온 뒤 첫 터치에서 멈춘 컨텍스트 새로 만들기(`AIT.sound.enable_audio_recovery()`, 기본 꺼짐)를 맡습니다.
  `AITSoundGate`는 `audio_renewed`에서 등록 플레이어를 닫힐 때의 자리에서 다시 틉니다. **실기기 미검증**(가짜 AudioContext 테스트만).
- 2-3 `add_bus`: `AITSoundGate.ensure_bus()`, `doctor` 경고. 상류 수정 godot#123996(4.8, beta2 뒤 머지)으로 확인된 버그입니다.
- 2-4 화면 신호: 브리지가 여러 신호를 모아 첫 신호만 쓰고(`AIT.app_events.life_changed`, `runtime_state()`), bfcache `pagehide`에서는
  구독을 끊지 않습니다(광고·결제 중 이벤트 끊김 위험).
- 2-5 광고: `AITShowGuard`(90초·돌아온 뒤 3초)를 `AIT.ads`·`AIT.admob`에 넣고, `AITAdSlot`(한 번에 하나, 그룹 중복 막기,
  75초 제한과 다시 부르기, 닫힌 뒤 다음 광고, `rewarded`·`not_shown` 결과)을 더했습니다.
- 2-6 Safe Area: 위쪽 인셋은 빌드 설정의 `navigationBar.transparentBackground`가 참일 때만(`top_mode`). `write-ait-config`가
  `build/ait-app-config.json`을 쓰고 엔진 패치 단계가 index.html에 JSON으로 넣습니다.
- 3-1 최종 `.ait` 검사: [verify-ait.mjs](../addons/apps_in_toss/tools/scripts/verify-ait.mjs)(`build` 마지막, `ait-godot verify-ait`).
  출시 `build`는 `GODOT_EXPORT_PRESET`이 lock 프리셋과 다르면 멈추고, 플랫폼 매니페스트에 `exportPreset`과 빌드 도장을 남깁니다.
  `<script src>`만 보도록 고쳐 셸 코드의 글자를 잘못 잡지 않습니다. pck의 `scripts/dev/` 검사는 SDK에 그런 규칙이 없어 넣지 않았습니다.
- 3-2 셸 템플릿: 크기를 모를 때 `config.fileSizes` 합·오가는 막대, 실패 화면의 다시 시도.
- 4: `AITSaveSlot.wipe()`가 `:broken` 백업과 예전 키까지 지움(예전 키를 남기면 다음 읽기가 되살림), `AIT.entry()`(`queryParams` 포함),
  `AIT.build_info()`, 캔버스 WebView 기본값 네 개, `doctor` 버전 맞추기, `ait-godot sim`, API 가이드의 서버 없는 비소모품 절.
- 5: eval이 엔진에 있어도 된다고 적은 곳과 iOS 복귀 소리 설명을 고쳤습니다.
- 3.9.0 상류 정리: 지급 콜백 실패가 바로 '지급 안 됨'이 되는 동작(릴리스 노트에만 있음)에 맞춰 `reject_product_grant`에
  `PRODUCT_NOT_GRANTED_BY_PARTNER` 코드를 붙이고, `product_grant_requested`에 연결이 없으면 `AIT_NO_GRANT_HANDLER`로 바로 거절합니다.
  `AITCore`가 같은 경로 10초 300번 초과를 경고합니다(커뮤니티 5024: 10초 1000번 초과로 노출 중지). `vite` 8.2.2 → 8.3.5(개발 의존성 경고).
  npm 최신은 3.9.0이고 3.10.0-beta.0(`openOneViral`, 허용 앱 전용)은 베타라 올리지 않았습니다.
- 검증: `node --test tests/*.test.mjs`, 두 브리지의 타입 검사·production·mock·debug-console 빌드, 최소 `.ait` 패키징,
  Godot 4.7.2 모듈 검사, 실제 4.7.2 출시·디버그 템플릿에 엔진 패치 적용. 결과는 [테스트 기록](testing.md#2026-11-04-sdk-점검)에 있습니다.
- 감시: 커뮤니티 5134(wasm·외부 코드 실행 판정), web-framework 3.10.0 정식(DevTools 3.10의 peer 범위가 web-framework 3.10 이상),
  Godot 4.8(#123996)·4.7.3, Unity의 IDBFS 숨김 flush(`user://` 저장을 쓰는 게임만), Windows `ait build` 경로(5003은 글이 내려감).

## 2026-11-10: web-framework 3.10.0 대응과 Unity SDK 3.9.0 전체 매핑

- 기준: 출시된 Unity SDK `release/v3.9.0`(UPM `c2892282`, 공개 메서드 87개)과 npm web-framework·DevTools 3.10.0(2026-11-06).
  Unity는 아직 3.10.0을 내지 않았습니다(main도 web-framework 3.9.0). Unity main의 API 변경 기록에 적힌 "229개"는
  출시되지 않은 main 기준이며(메서드 232개 = 기능 146 + `IsSupported` 58 + 권한 보조 28), 비교 기준으로 쓰지 않습니다.
- 대조 방법: Unity 3.9.0 jslib가 부르는 web-framework 경로 85개(`window.AppsInToss.<경로>`)와 이 SDK의 매니페스트·브리지·모듈을 맞췄습니다.
  전에는 41개만 함수가 있었고 45개가 없었습니다(대부분 `AIT.invoke`로는 부를 수 있었음). 이번에 모두 넣었고,
  [manifest-parity](../tests/manifest-parity.test.mjs)가 85개 경로를 모두 덮는지 확인합니다.
  - 호출형 41개 → 카탈로그(`AIT.api.*`): 토스페이(`checkoutPayment`, `requestTossPayPaysBilling`), 인증서 서명, 동의 데이터·연령대,
    기기·환경 정보(`getDeviceId`·`getGroupId`·`getLocale`·`getSchemeUri`·`getServerTime`·`getOperationalEnvironment`·`getTossAppVersion`·
    `getAppsInTossGlobals`·`isMinVersionSupported`·`env.getDeploymentId`), 위치·권한 요청, 프로모션 보상 둘, 연락처·앨범·카메라·PDF·파일 저장,
    화면 방향·iOS 스와이프·꺼짐 방지·보안 화면, `eventLog`·`Analytics` 셋, 토스 배너 광고 `TossAds` 다섯, `partner` 액세서리 버튼 둘, 리뷰 요청.
    Unity와 같이 web-framework의 옛 평면 이름 그대로입니다(web-framework 3.10.0에서 상당수가 `Screen.*`·`TossPay.*` 등으로 deprecated).
  - 구독형 6개 → 새 모듈 `AIT.events`(`AITEvents`): `graniteEvent` `homeEvent`, `tdsEvent` `navigationAccessoryEvent`, `startUpdateLocation`,
    `contactsViral`, `onVisibilityChangedByTransparentServiceWeb`, `requestNotificationAgreement`. 구독 번호와 이름으로 이벤트·오류를 돌려줍니다.
  - `GetDevicePixelRatio`(Unity 엔진 값) → `AIT.get_device_pixel_ratio()`(`window.devicePixelRatio`).
  - Unity의 옛 이름 `getGameCenterGameProfile`·`openGameCenterLeaderboard`·`submitGameCenterLeaderBoardScore`·`getTossShareLink`·`SafeAreaInsets`는
    web-framework가 deprecated·v2 별칭으로 둔 것이라 이미 있는 새 이름(`Game.*`·`Share.createLink`·`SafeArea`)으로 덮습니다.
  - `TossAds`는 Unity 3.9.0과 같이 값을 그대로 넘깁니다(`target`은 CSS 선택자, 콜백은 JSON이라 전달되지 않음).
- web-framework 3.9.0 → 3.10.0 변경과 반영:
  - 내비게이션 바 액세서리 버튼이 `partner`에서 `NavigationBar.addAccessoryButton`·`removeAccessoryButton`·`subscribeAccessoryButton`으로 옮겨졌고
    `title` 대신 `accessibilityLabel`을 씁니다 → 카탈로그 둘과 `AIT.events.subscribe_accessory_button()`을 더했습니다.
    `write-ait-config`는 `initialAccessoryButton`의 `accessibilityLabel`(또는 예전 `title`)을 받고 `id`는 생략할 수 있게 했습니다.
  - `brand`가 deprecated(생략 가능, CLI가 기존 `primaryColor`는 유지)입니다. 생성 설정은 지금처럼 `brand.primaryColor`를 씁니다.
  - 버전: web-framework·DevTools·간접 CLI 3.9.0 → 3.10.0. CLI가 바뀌며 빌드 도구 의존성(babel·clack 등)도 함께 올라갔고 출시 번들에는 들어가지 않습니다.
- debug-console 0.2.0 → 0.3.0: QR 테스트 호스트에서 attach 링크의 서명을 개발자 공개키로 검증합니다.
  공식 권장대로 `/auto` 대신 `startDebugConsole({ relayPublicKeys })`를 쓰고, 공개키는 게임 매니페스트 `debugConsole.relayPublicKeys`에서 읽어
  테스트 빌드 번들에 넣습니다([debug-relay-keys.mjs](../addons/apps_in_toss/tools/scripts/debug-relay-keys.mjs)). 키가 없으면 테스트 빌드가 멈춥니다.
  짝이 되는 디버거는 0.3.0(프로토콜 2)입니다.
- 검증: [2026-11-10 검사 기록](testing.md#2026-11-10-sdk-3100-자동-검사).
- 감시: Unity SDK 3.10.0 출시(새 `NavigationBar` 액세서리 API 이름·`IsSupported`·권한 보조 함수가 들어오는지), Godot 4.8 정식(지금 beta3)·4.7.3.

### 2026-11-10 (이어서): Unity SDK 3.9.0의 API 밖 기능 맞춤

API 85개 경로에 이어, Unity 패키지의 런타임 도우미·WebGL 템플릿·에디터 도구를 대조해 엔진 차이로 필요 없는 것만 빼고 붙였습니다.
Unity SDK 저장소에는 라이선스가 없어(Toss 모든 권리 보유) 코드는 옮기지 않고 동작만 맞춰 새로 썼습니다.

| Unity 3.9.0 | 이 SDK |
| --- | --- |
| `AITBannerAd`·`AITBannerAdView`·BannerAd.jslib | `AIT.banner`·`AITBannerAdView`, 브리지 `bannerShow`·`bannerSetRect`·`bannerRefreshSizes`(초기화 직렬화, 위·아래·영역, 높이 보고) |
| `AITVersion` | `AITVersion`(`AIT.sdk_version()`), 시작 로그 |
| 런타임 이벤트 로거(`unity_*`, `debugLog`) | `AIT.runtime_log`(`godot_*`, log_type `godot_runtime`). GC 로그는 GDScript에 가비지 컬렉터가 없어 뺌 |
| Unity Metrics 탭(vConsole) | Godot Metrics 탭(`bridge/src/metrics.ts`) |
| Sentry 통합·Analytics 연동 | `AIT.sentry` + `dist/ait-sentry.js`(@sentry/browser 11.10.0, 매니페스트 `sentry.dsn`이 있을 때만). 번들의 "eval" 글자 6곳은 뜻을 바꾸지 않고 다시 써 검수 검사를 통과 |
| PlayerPrefs 미러링(ait-playerprefs.js) | `userFiles` + `AIT.user_files` + 브리지 `userFilesReady()`(IDBFS `/userfs` 판 21에 되살림) |
| 템플릿 소프트 키보드(pan·resize·none) | 셸 템플릿 같은 세 모드(`keyboardMode`). Unity 입력 바 처리는 Unity 전용이라 뺌 |
| EarlyFetch | 셸 템플릿 이른 내려받기(wasm·pck) |
| `AITLoading`·`showLoadError` | `AppsInTossShell.appInfo`·콜백·`hide`·실패 힌트와 진단 정보 |
| Deploy for Online Test·Release Candidate·QR | `ait-godot deploy [--rc]`, 패널 버튼과 QR(qrcode 1.5.4). 토큰은 CLI 저장소(`ait token add`) |
| `ait-patch-cli.mjs`(runtimeVersion) | 뺌: CLI 3.10.0의 `ait deploy`에는 runtimeVersion 검사가 없음(서버 쪽은 실제 배포 전에는 확인하지 못함) |
| AutoUpdater·DeprecationChecker | `update [--check]`, `sdk-policy.json` + strict `doctor`. 정책을 받지 못하면 Unity처럼 코드 기준으로 대신하지 않고 경고만 |
| Clean·Open Build Output·Reset Loading Screen·Force Update Template·Reset All SDK State | `clean`, `shell:reset`, 패널 버튼 |
| 서버 호스트·포트·재시작 | 매니페스트 `preview`, 패널 재시작 |
| NodeJSDownloader | 패널 Node 설치(24.22.1, SHA256 고정). 다른 미러로 대신 받기는 뺌 |
| BuildOptimizationScanner | `optimize [--fix]`(Godot `.import` 기준) |
| GitGuard | `git:guard [--fix]`, `doctor` 경고 |
| BuildDiagnostics·ExportErrorCatalog | 단계 실패 진단(`build-diagnostics.mjs`, `build/last-build-error.json`) |
| Configuration 창 | 패널 설정 창(`AITConfigDialog`, 모르는 키·appType 기본값 유지) |
| 이슈 제보(토스 Sentry User Feedback) | GitHub 이슈 작성 화면을 진단 정보로 채워 엶(토스의 Sentry 프로젝트로는 보내지 않음) |
| 에디터 오류 추적(토스 Sentry, opt-out) | 뺌: 토스의 Sentry 프로젝트로 보내는 것이라 이 SDK가 쓸 수 없음 |

엔진 차이로 뺀 것: PlayerSettings·빌드 세션 복구, WebGL 빌더 설정(IL2CPP, 코드 제거, WASM 스트리밍, 파일명 해싱), Unity 메타데이터·
에디터 대기·컴파일 감시, pnpm 실행·저장소·잠금 파일 검사, BuildConfig 병합·Unity 빌드 복사, 템플릿 관리, 내부 유틸, IL2CPP 줄번호,
Sentry Unity 패키지 설치, web-framework 2.x 전용 설정(`bridgeColorMode`, `webViewType`).
검증: [테스트 기록](testing.md#2026-11-10-unity-390-api-밖-기능-검사).

## 2026-11-11: debugger-client 0.4.0

- 원인: upstream(`toss/apps-in-toss-harness`)이 `@apps-in-toss/debug-console`을 `@apps-in-toss/debugger-client`로 이름을 바꾸며(MCP 키 `ait-devtools` →
  `ait-debugger`, 프로토콜 2 → 3) 옛 릴리스 파일(debug-console·debugger 0.2·0.3)을 지웠습니다. 0.3.0 tarball을 고정한 `main`의 CI가 `npm ci` 404로 실패했습니다.
- 반영: 두 브리지 의존성을 debugger-client 0.4.0으로, `src/debug-console.ts`의 import와 vite의 SDK 바꿔치기 대상을 새 이름으로 바꿨습니다.
- 공개키: 0.4.0은 `{ publicKey, notAfter }`만 받고 키가 기본 24시간 뒤 만료되며, 개인키는 디버거의 메모리 key agent에 있습니다. 그래서 어제(11-10) 넣은
  "매니페스트 `debugConsole.relayPublicKeys`에 커밋" 방식을 빼고, 테스트 빌드가 `debugger relay-key --json`(debugger 0.4.0)으로 그때그때 받습니다
  ([debug-relay-keys.mjs](../addons/apps_in_toss/tools/scripts/debug-relay-keys.mjs)). 설정 창의 그 칸도 뺐습니다.
- 출력 파일 이름 `ait-debug-console.js`·검사 표식(`__ait_debug_status`, `/ait-attach`)은 새 패키지에도 그대로라 바꾸지 않았습니다.


## 2026-11-13: Unity SDK 3.10.0 정식 릴리스 대응

- 기준: 원격 `main` `fcec05f27ebbb857b73e1464e6521ab5ce26b697`의 Unity 3.9.0 고정 커밋
  `c2892282018b44e1666b364a7a97711a130761d6`부터
  [공식 `release/v3.10.0`](https://github.com/toss/apps-in-toss-unity-sdk/releases/tag/release/v3.10.0)의 실제 UPM 태그 커밋
  `b46a21bf6395a4c502e23ccde97b8cd47f5afbf6`까지 패키지 파일을 대조했습니다.
  릴리스 본문의 생성 원본 `12b4f94e726261d4a5897ff9d09c27acb5b7c7cc`와 UPM 커밋을 구분합니다.
  Godot 공식 정식 릴리스는 4.7.2가 최신이어서 엔진·feature(4.7)·Compatibility·비스레드 정책은 그대로입니다.
- 실제 의존성: 공식 BuildConfig의 web-framework·DevTools 및 간접 CLI는 3.10.0입니다.
  이 저장소의 원격 main은 세 패키지를 이미 3.10.0으로 고정했으므로 양쪽 `package.json`·lockfile을 다시 갱신하지 않습니다.
  Unity 템플릿은 별도 bridge-core·web-analytics 의존성을 제거하고 Analytics를 web-framework에서 가져옵니다.
  Godot 브리지는 이미 이 방식을 쓰고 있어 변경이 필요 없습니다. Unity의 TypeScript 7.0.2·Vite 8.3.5·pnpm 11.6.0을
  엔진 어댑터와 무관한 이 저장소의 도구 버전에 옮기지 않습니다.
- API: 공식 jslib의 고유 web-framework 경로가 85개에서 231개로 늘었습니다. 옛 평면 API를 호환 경로로 유지하면서
  `TossAuth`·`TossPay`·`Device`·`Environment`·`Clipboard`·`File`·`Screen`·`User` 등의 새 경로를 제공합니다.
  속성 읽기 8개는 `get_value`, `.isSupported()` 58개와 메서드별 권한 보조 함수는 실제 함수를 호출합니다.
  `AIT.has_api()`는 경로 존재 확인이며 기능별 지원 여부 호출과 다릅니다.
  `Device.subscribeLocation`·`Promotion.openContactsInvite`·`Notification.requestAgreement`는 이벤트·오류·해제를 관리하는 `AIT.events`에 넣습니다.
- 패키징: 공식 Unity의 새 출력 검사와 설치된 CLI 코드를 대조한 결과, 수정하지 않은 CLI 3.10.0의 `.ait`는
  `isGame:false`·`runtimeVersion:""`를 기록함을 최소 HTML 빌드로 확인했습니다.
  공식 Unity는 런타임 값 `0.84.0`과 게임 여부를 CLI 실행 전에 보강합니다. 이 SDK도 같은 메타데이터를 빌드 시점에 넣고
  실제 `.ait`를 읽어 확인합니다. 공식 CLI 원본이나 완성된 `.ait`를 다시 쓰지 않습니다.
  `appType:"nongame"`만 `isGame:false`, `game` 및 생략한 경우는 `true`입니다.
  `runtimeVersion`은 Toss Web 런타임 값이며 Godot 엔진 버전이 아닙니다.
  설치된 CLI 3.10.0의 deploy 코드에는 이 필드의 로컬 거부 검사가 없으므로, upstream 주석의 배포 게이트 설명은
  그대로 지원 근거로 삼지 않습니다. 배포 서버 수락 여부는 실제 배포하지 않아 미검증입니다.
- Unity 전용 변화: PlayerPrefs 복원 순서와 Unity 오디오 복귀 레이어는 Godot 엔진 구현에 그대로 적용하지 않습니다.
  기존 Godot 저장 미러링과 소리 복구의 지원 범위·실기기 미검증 표시를 유지합니다.
- 자동 검사와 미검증 범위: [2026-11-13 검사 기록](testing.md#2026-11-13-unity-sdk-3100-정식-대응).
