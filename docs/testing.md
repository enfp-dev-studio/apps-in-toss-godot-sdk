# 테스트 가이드

[← 프로젝트 소개](../README.md) · [설치 가이드](getting-started.md)

자동 검사는 SDK 코드와 빌드 도구를 검증합니다. 실제 게임 플레이와
토스 앱에서의 인증·결제·광고는 별도로 확인해야 합니다.

## 자동 검사가 확인하는 범위

| 검사 | 확인하는 내용 |
| --- | --- |
| [회귀 테스트](../.github/workflows/regressions.yml) | Node 24/26에서 설치 안전성, SDK 캐시, API 매니페스트·생성 파일 일치, 브리지 호출·이벤트 전달 |
| [브리지·패키징](../.github/workflows/bridge-package.yml) | 소스·내장 브리지 타입 검사, production/mock/debug-console 빌드, 최소 HTML 입력의 `.ait` 패키징 |
| [Godot 애드온](../.github/workflows/godot-addon.yml) | Godot 4.7.2 headless import, GDScript 구문 검사, AdMob 브리지 부재 오류·구독 해제, [모듈 검사](../tests/gdscript/lessons-modules.gd)(한글·뒤로가기·Safe Area·사운드 게이트·광고/결제 수명 신호·저장·터치 스크롤) |
| [export 폴더 정리](../tests/export-dir.test.mjs) | 프로젝트 안 export 폴더는 비워도 되고 소스·프로젝트 바깥은 비우지 않음, release에 개발 전용 파일이 섞이면 검증 실패 |
| [설정 생성](../tests/write-ait-config.test.mjs) | 매니페스트의 `webView`·`permissions`·`navigationBar` 반영과 기본값·검증, 잘못된 키·조합은 실패 |
| [eval 금지](../tests/no-eval.test.mjs) | 애드온 GDScript에 `JavaScriptBridge.eval`이 없음 |
| [CLI 규칙](../tests/lessons-cli.test.mjs) | `doctor`의 셸 확대 막기·`McpBridge`·`.ait_relay`·테스트 광고 ID·`appType`·`tools/.gdignore` 검사, export 100MB 한도, `addon:install`의 `.uid` 보존, `init`의 셸 템플릿·`.gitignore` |
| [debug-console](../tests/debug-console.test.mjs) | 테스트 빌드에서만 debug-console을 브리지 다음에 주입, release에 남으면 검증 실패, 매니페스트 `debugConsole` 기록과 `doctor` 경고 |
| 별도 확인 | 전체 Godot Web export, 브라우저 게임 플레이, 토스 앱·실기기 동작 |

PR 생성·업데이트와 `main` push 때 실행하며, GitHub Actions 탭에서 수동 실행도 가능합니다.
[README 상태표](../README.md#자동-검사-상태)는 최신 `main` 결과를 보여줍니다.
PR 결과는 PR 화면에서 확인하세요. 배지는 GitHub가 갱신하므로 결과를 README에 직접 쓸 필요가 없습니다.

## 로컬에서 자동 검사 다시 실행하기

다음 명령은 **SDK 저장소 루트**에서 실행합니다. 게임 폴더에서 실행하는 명령과 구분하세요.

```bash
npm --prefix bridge ci && npm --prefix addons/apps_in_toss/tools/bridge ci
node --test tests/*.test.mjs  # 회귀 테스트
git diff --exit-code -- addons/apps_in_toss/generated/  # 생성 파일 변경 확인

# 소스·내장 브리지 타입 검사와 production/mock 빌드
(cd bridge && npx tsc --noEmit)
(cd addons/apps_in_toss/tools/bridge && npx tsc --noEmit)
(cd bridge && npm run build && AIT_BRIDGE_MOCK=1 npm run build)
(cd addons/apps_in_toss/tools/bridge && npm run build && AIT_BRIDGE_MOCK=1 npm run build)
# 테스트 빌드 전용 debug-console 번들 (dist/ait-debug-console.js)
(cd bridge && npm run build:debug-console)
(cd addons/apps_in_toss/tools/bridge && npm run build:debug-console)

node tests/run-minimal-package.mjs  # 최소 .ait 패키징
# macOS 앱 경로 예시. PATH에 설치했다면 GODOT_BIN=godot 사용
GODOT_BIN=/Applications/Godot.app/Contents/MacOS/Godot \
  node tests/run-godot-addon.mjs
```

생성 파일이 달라졌다면 API 원본과 생성 결과를 확인하세요. 의도한 API 변경이라면
생성된 GDScript도 함께 커밋해야 CI의 일치 검사를 통과합니다.

## 브라우저 시뮬레이터의 테스트 범위

여기서 시뮬레이터는 `build:dev`와 `preview`로 실행하는 브라우저 mock 및
DevTools 패널을 뜻합니다. 아래는 설치된 DevTools 3.8.0 구현 기준이며,
카탈로그의 37개 API 모두 mock 응답이 있습니다.

| 항목 | 브라우저에서 확인할 수 있는 범위 | 토스 앱에서 확인할 항목 |
| --- | --- | --- |
| 게임 화면·조작 | Godot Web 게임의 화면, 입력, 게임 로직 | 기기별 성능과 WebView 동작 |
| 로그인·사용자 키 | 모의 사용자·로그인 응답에 따른 화면과 오류 처리 | 실제 인증, 서버 토큰 교환 |
| 인앱결제 | 모의 상품·주문, 결제 실패·보류, 지급 콜백과 미결 주문 복구 처리 | 실제 결제 승인·환불, 서버 지급 검증 |
| 전면 광고·AdMob | 로드·표시·종료 이벤트, 광고 없음 오류 처리. `showFullScreenAd` mock은 `clicked` → `dismissed`만 보내고 `userEarnedReward`를 보내지 않습니다 | 실제 광고 송출과 보상 지급 |
| 저장소·게임센터 | 브라우저 저장소 읽기·쓰기, 모의 프로필·점수 처리 | 토스 저장소와 실제 랭킹 반영, 다시 열었을 때 저장 유지 |
| 뒤로가기·Safe Area | 모의 `backEvent`, 모의 인셋 | 토스 바 뒤로가기 버튼이 `backEvent`로 오는지, 첫 화면에서 미니앱 종료, 안드로이드 백버튼, 기기별 인셋 |
| 권한·네트워크 | 권한 거부·오프라인 등 모의 상태에 대한 처리 | OS 권한 창, 실제 통신과 기기 기능 |

샘플 씬의 `?e2e=true`는 인자가 없는 API만 순회하며 `close_view`는 제외합니다.
실제 결제·광고 동작까지 검증하는 자동 테스트는 아닙니다. 모의 시나리오 중
일부는 DevTools 패널에서 설정할 수 있고, 인자가 필요한 API는 게임 코드에서
직접 호출해야 합니다. 브라우저에서 게임 전체를 플레이하는 검증은 현재 CI에 포함되지 않습니다.

샘플의 구성과 제한은 [샘플 안내](../addons/apps_in_toss/sample/README.md)를 참고하세요.

## 토스 앱에서 확인하기

로그인·결제·광고 실동작 확인은 토스 CLI로 업로드한 뒤 샌드박스 앱/토스 앱 QR
테스트에서 합니다. 게임 루트에 프레임워크 의존성을 추가하지 않고 내장 바이너리를
그대로 씁니다. 아래 명령은 인증 정보를 등록하고 빌드 결과를 업로드하는 실제 배포 단계입니다.
먼저 [설치·빌드 가이드](getting-started.md)에 따라 `.ait` 파일을 만드세요:

```bash
./addons/apps_in_toss/tools/bridge/node_modules/.bin/ait token add   # 최초 1회, 콘솔 API 키
./addons/apps_in_toss/tools/bridge/node_modules/.bin/ait deploy
```

콘솔 QR 테스트의 인앱 결제는 **실제 결제**입니다. 로컬에서는 DevTools 모의 결제로 확인하세요.
브라우저의 모의 주문·광고 이벤트가 통과해도 실제 결제 승인, 서버 지급 검증,
광고 송출과 보상을 검증한 것은 아닙니다. 게임에서 사용하는 기능을 토스 앱에서
확인하세요. 가시성 이벤트(`AIT.app_events`)는 headless 자동 검사 대상이 아니므로
실기기에서 백/포그라운드 전환 시 동작을 확인해야 합니다.

QR 테스트가 "지금은 서비스를 사용할 수 없어요"로 실패하면 SDK 코드보다 환경을
먼저 확인합니다. 커뮤니티에서 확인된 순서는 ① 토스 앱을 최신 버전으로
업데이트(신규 SDK를 모르는 호스트 앱에서 발생) ② QR을 연 토스 계정이 콘솔의 대표
관리자 또는 워크스페이스 멤버 계정인지 확인 ③ 로컬에서는 AIT Devtools mock으로
재현 여부 확인 ④ 그다음 번들 재빌드입니다.

테스트 스킴에서만 로딩 화면에서 멈추면 웹 디버그 툴즈의 Log 탭에서 WebAssembly 오류를 확인하세요.
툴즈가 `fetch` 응답을 감싸 wasm 컴파일이 실패한 사례가 있었고, 2026-10-08 플랫폼에서 수정됐습니다.
"문제가 생겨서 미니앱을 다시 시작했어요" 토스트와 함께 계속 재시작되면 대부분 메모리 부족입니다.
텍스처·오디오 크기와 Web export 메모리 설정을 줄여 보세요.

SDK 3.x 번들을 출시하면 2.x로 되돌릴 수 없고, 2026-10-05부터 3.x 미만 신규
등록이 제한됩니다. QR·DevTools에서 충분히 확인한 뒤 배포하세요.

출시 체크리스트의 외부 코드 실행(eval) 검수에는 다음처럼 답합니다. 애드온과
샘플의 GDScript는 `JavaScriptBridge.eval`을 쓰지 않으며, `doctor`는 게임
스크립트의 `JavaScriptBridge.eval` 사용을 경고합니다. Godot 엔진 JS 자체에는
`JavaScriptBridge.eval` 구현용 eval 코드가 들어 있지만, 게임과 SDK가 그 API를
호출하지 않으면 실행되지 않습니다. 엔진에서 아예 빼는 방법(커스텀 Web 템플릿
빌드)은 이 SDK에서 검증하지 않았습니다.

## 실기기 원격 디버깅

토스 앱에서 연 테스트 번들에 앱인토스 디버거(`ait-devtools` MCP, `/ait:debug` 환경 3)를
붙이면 화면 캡처, JS 평가, 콘솔·네트워크 로그, SDK 호출, `*.ait.test.ts` 실행을
원격으로 할 수 있습니다. 폰 쪽 코드는 `@apps-in-toss/debug-console` 0.2.0이며
테스트 빌드에만 넣습니다.

미리 필요한 것:

- 게임 폴더 `.mcp.json`에 `ait-devtools`(`@apps-in-toss/debugger`) 등록. `/ait:setup-debugger`가 해 줍니다.
- 내장 브리지 의존성: `npm --prefix addons/apps_in_toss/tools/bridge ci`. debug-console이
  설치되지 않았으면 테스트 빌드가 이 명령을 안내하며 멈춥니다.

순서:

1. 게임 폴더에서 테스트 빌드를 만듭니다. `AIT_DEBUG_CONSOLE=1`을 붙여 `build`해도 같습니다.

   ```bash
   node addons/apps_in_toss/tools/ait-godot.mjs build --debug-console
   ```

   출시 브리지 다음에 `ait-debug-console.js`가 들어가고, `ait-platform-manifest.json`에
   `"debugConsole": true`가 기록됩니다. 빌드 로그 처음과 끝에 "테스트 전용 빌드 — 검수 제출 금지"가 나옵니다.
2. 만든 `.ait`를 콘솔에 테스트 번들로 올립니다(콘솔 웹이나 console MCP). `ait build` 출력의
   `deploymentId`로 올린 번들이 맞는지 확인합니다.
3. `/ait:debug`를 실행해 환경 3(relay-staging) QR attach를 진행합니다. 디버거가 띄운 QR을
   폰 카메라로 스캔합니다. QR 링크에는 `debug=1&relay=…`가 붙어 있습니다. 토스 앱에 같은
   미니앱이 열려 있으면 X로 닫은 뒤 스캔합니다.

동작 범위:

- debug-console은 URL에 `debug=1`이나 `relay=`가 없으면 아무것도 하지 않습니다. 붙을 때도
  미니앱 호스트(`*.tossmini.com`, localhost), relay 주소(`*.trycloudflare.com`, localhost),
  QR의 일회용 코드를 확인합니다.
- SDK 호출(`call_sdk`)은 브리지가 올린 `window.AppsInToss`를 씁니다. debug-console 번들에
  web-framework를 다시 넣지 않으므로 `index.html`에서 브리지보다 뒤에 있어야 하며, 검증이 이 순서를 확인합니다.
- Godot 화면은 canvas 하나라 DOM 스냅샷에는 게임 UI가 나오지 않습니다. 화면은
  `take_screenshot`, 상태는 `evaluate`와 `measure_safe_area`로 봅니다.

붙지 않을 때(cat-room-godot 실기기 QA에서 겪은 것):

- 디버거(`ait-devtools`)는 한 세션만 잡을 수 있습니다. 다른 Claude 세션이 디버거를 쥐고 있으면 도구 호출이 거부됩니다.
  그 세션을 끝내거나 디버거를 놓게 한 뒤 붙습니다.
- QR attach에는 게임 폴더의 relay 비밀값 파일 `.ait_relay`가 필요합니다. `.gitignore`에 넣고(`init`이 넣습니다) 값을 커밋하거나 출력하지 마세요.
  `doctor`는 이 파일이 git에서 무시되지 않으면 경고합니다.
- 앱은 열리는데 아래 디버그 막대가 없고 relay가 요청을 하나도 받지 못하면(`page-not-opened`), debug-console이
  URL에서 `debug=1`·`relay=`를 받지 못한 것입니다. 폰에서 ⋯ → 웹 디버그 툴즈 → System 탭에서 페이지 URL에
  `debug=1`이 있는지 봅니다. 문서상 테스트 스킴의 사용자 쿼리는 `queryParams=`(URL 인코딩한 JSON)로 넘기므로
  ([미니앱 테스트하기](https://developers-apps-in-toss.toss.im/guide/operation/toss)), 일반 쿼리가 빠졌다면 그 방식을 시도합니다.

**검수 번들에 쓰지 마세요.** 테스트 빌드 `.ait`에는 원격 디버깅 표면이 들어 있습니다.
검수·출시용 `.ait`는 옵션 없이 `build`를 다시 실행해 만듭니다. `build`는 export 폴더를
비우고 다시 만들며, `ait-debug-console.js`가 파일이나 `index.html` 참조로 남거나
매니페스트에 `debugConsole: true`가 있으면 검증이 실패합니다. `doctor`는 export 폴더의
매니페스트에 `debugConsole: true`가 남아 있으면 경고합니다.

## Godot 헤드리스 점검과 화면 캡처

게임 쪽 자동 점검은 `godot --headless --path . --script res://tests/<점검>.gd`(`extends SceneTree`)로 돌립니다.
SDK의 [모듈 검사](../tests/gdscript/lessons-modules.gd)처럼 AITCore를 상속한 가짜 코어로 브리지를 흉내 내면
뒤로가기·광고·결제 흐름도 브리지 없이 확인할 수 있습니다.

- 헤드리스 기본 창(root viewport)은 64×64입니다. 버튼을 누르는 점검은 `root.size = Vector2i(400, 700)`처럼 키운 뒤 해야
  GUI가 누름을 받습니다(작은 창 밖의 누름은 조용히 무시돼 점검이 헛통과할 수 있습니다).
- 마우스 입력은 `root.push_input(event, true)`로 넣습니다. 헤드리스는 `Input.parse_input_event`로 넣은 터치를 창으로 보내지 않으므로
  터치 길은 `--resolution 375x812`로 창을 띄워 확인합니다.
- `--script` 실행에서 게임의 `class_name` 스크립트가 오토로드보다 먼저 컴파일되어 오토로드 이름을 못 찾을 수 있습니다.
  그런 스크립트는 실행 중에 `load()`로 불러 쓰세요.
- `low_processor_mode`(필요할 때만 그리기)에서는 정지 화면이면 `frame_post_draw`가 오지 않아 캡처가 끝나지 않습니다.
  캡처하는 동안 `OS.low_processor_usage_mode = false`로 끕니다.
- 화면 크기별 캡처는 360×640, 375×667, 375×812, 390×844, 430×932를 찍어 글자·버튼이 잘리지 않는지 봅니다.

Godot MCP(`godot-mcp-runtime`)의 `run_project`·`attach_project`는 실행하는 동안 `project.godot`에 `McpBridge`
오토로드를 넣고 `.mcp/` 폴더를 만듭니다. 세션이 비정상 종료되면 오토로드가 남을 수 있으니 커밋하지 말고
(`stop_project`·`detach_project`로 정리), `.mcp/`는 `.gitignore`에 넣습니다. 남아 있으면 `doctor --strict`와 `build`가 실패합니다.

## 2026-09-24 샘플 실행 결과

Godot 4.7.2와 같은 버전의 비스레드 Web export 템플릿으로 SDK 샘플을 실행했습니다.
이는 한 번의 로컬 실행 기록이며, 위 자동 CI 범위와는 구분합니다.

| 확인한 항목 | 결과 |
| --- | --- |
| `doctor --strict` | 통과 |
| 실제 Godot Web export와 실전 브리지 주입·검증 | 통과 |
| 실제 Web 출력의 `.ait` 패키징 | 통과 (배포는 실행하지 않음) |
| mock 개발 빌드와 브라우저 화면·한글 표시 | 통과 |
| 샘플 `?e2e=true` | 성공 13개, 실패 0개 |
| 샘플 버튼 | 모의 로그인 인가 코드 수신, 상품 2개 조회, 전면 광고 로드·종료 확인 |

임시 게임 프로젝트에 샘플 씬·폰트 테마·HTML shell을 준비했고,
모의 광고 확인에만 임시 광고 그룹 ID를 사용했습니다.
실제 토스 로그인·결제·광고 송출과 게임 전체 플레이는 이 기록에 포함하지 않습니다.

## 2026-10-16 샘플 실행 결과 (web-framework·DevTools 3.8.0)

브리지를 web-framework 3.8.0·DevTools 3.8.0으로 올린 뒤 위와 같은 방법으로 다시 실행했습니다.
Godot 4.7.2와 같은 버전의 비스레드 Web export 템플릿(`web_nothreads_*`)을 사용했고,
애드온은 SDK 원본 CLI의 `addon:install --force`로 임시 게임 프로젝트에 설치했습니다.

| 확인한 항목 | 결과 |
| --- | --- |
| `doctor --strict` | 통과 |
| 실제 Godot Web export와 실전 브리지 주입·검증 | 통과 (11개 파일, 주입된 브리지에 `User.createAnonymousKeyAuthCode` 포함) |
| 실제 Web 출력의 `.ait` 패키징 | 통과 (배포는 실행하지 않음) |
| mock 개발 빌드와 브라우저 화면·한글 표시 | 통과 |
| 샘플 `?e2e=true` | 성공 15개, 실패 0개 (`user_create_anonymous_key_auth_code` 포함) |
| 샘플 버튼 | 모의 로그인 인가 코드 수신, 상품 2개 조회, 전면 광고 로드·종료 확인 |
| mock `AIT.create_anonymous_key_auth_code()` | 통과 — `code`와 `expiresIn`(300초) 수신 |
| mock `Viral.share` 제목·설명 전달 | 통과 — DevTools 로그에 `title`·`description`이 그대로 전달됨 |
| `build:dev` 뒤 `build` 다시 실행 | 처음에는 실패, export 폴더 정리 수정 후 통과 (11개 파일, 51.67 MiB) |

`?e2e=true` 대상은 이 실행 시점 카탈로그에서 인자가 없는 API 16개 중 `close_view`를 뺀 15개입니다.
익명 키·`Viral.share`는 임시 프로젝트에만 둔 점검 스크립트로 호출했고, 샘플 씬에는 포함하지 않았습니다.

마지막 항목은 처음 실행에서 export 폴더가 비워지지 않아 개발 빌드의 mock 브리지·DevTools 패널과
Godot이 export PNG를 가져오며 만든 `.import` 파일이 `.ait`에 실린 문제(16개 파일, 53.22 MiB)였습니다.
같은 날 `main`에 들어간 export 폴더 정리와 release 검증([버그 수정 기록](sdk-development.md))이 이 경우를 다루며,
이 기록의 재실행은 같은 동작의 이전 수정본으로 확인했습니다.

실제 토스 로그인·결제·광고 송출, 익명 키 인증 코드의 서버 교환, 실기기 공유 시트와
게임 전체 플레이는 이 기록에 포함하지 않습니다.
