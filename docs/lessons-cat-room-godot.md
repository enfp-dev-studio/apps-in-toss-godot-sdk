# cat-room-godot에서 배운 것 정리 (2026-10-18)

[← SDK 개발·업데이트 기록](sdk-development.md)

cat-room-godot(Godot 4.7.2 Web, 비게임 미니앱)을 만들며 이 SDK 위에 따로 짜야 했던 것을 모았습니다.
앞으로 다른 Godot 프로젝트에도 똑같이 필요한 것은 SDK로 옮기고, 이 앱에만 해당하는 것은 남겨 둡니다.

분류:

- **(a) 애드온 코드**: SDK 애드온·CLI에 넣습니다. 동작이 바뀌는 것은 켜야만 동작하게(opt-in) 둡니다.
- **(b) 문서·체크리스트·템플릿**: 설치 가이드, API 가이드, 테스트 가이드, 새 출시 점검 문서, `init` 템플릿에 넣습니다.
- **(c) 앱 전용**: SDK에 넣지 않습니다.

cat-room 위치는 `room-v2` 브랜치(`db6e830`) 기준입니다. 공식 규칙은 앱인토스 문서로 확인했습니다
([비게임 출시 가이드](https://developers-apps-in-toss.toss.im/checklist/app-nongame),
[게임 출시 가이드](https://developers-apps-in-toss.toss.im/checklist/app-game),
[네비게이션 바 설정](https://developers-apps-in-toss.toss.im/documentation/common/navigationbar),
[graniteEvent](https://developers-apps-in-toss.toss.im/documentation/sdk/events/graniteevent),
[SafeArea](https://developers-apps-in-toss.toss.im/documentation/sdk/domains-api/safearea),
[WebView 속성 제어](https://developers-apps-in-toss.toss.im/documentation/integration/props),
[스토리지](https://developers-apps-in-toss.toss.im/documentation/common/file-storage/storage),
[인앱 결제](https://developers-apps-in-toss.toss.im/guide/monetization/in-app-payment),
[미니앱 테스트하기](https://developers-apps-in-toss.toss.im/guide/operation/toss),
[서버 API 이용하기](https://developers-apps-in-toss.toss.im/documentation/integration/server-api)).

## 1. 내비게이션과 뒤로가기

| 항목 | 분류 | cat-room 위치 | SDK 반영 |
| --- | --- | --- | --- |
| 비게임은 `navigationBar.withBackButton: true`가 필요하다. 설정에 없어서 iOS에서 하위 화면을 나갈 길이 없었다. 문서는 기본값을 정하지 않으니 명시해야 한다 | a | `.ait/game.manifest.json`(navigationBar 없음) | 매니페스트에 선택 키 `appType`(`game`·`nongame`)을 더한다. `nongame`이면 생성 설정에 `withBackButton: true`, `game`이면 문서 예시대로 `transparentBackground: true`를 기본으로 넣고, 매니페스트 값이 이긴다. `appType`이 없으면 지금과 같고 `doctor`가 알린다. `init --nongame`이 `appType`을 적는다 |
| 체크리스트: 뒤로가기는 모든 화면에서 동작, 첫 화면에서 뒤로가기를 누르면 미니앱 종료, 앱 안 뒤로가기 버튼과 토스 버튼이 같이 보이지 않음, 안드로이드 백버튼 | a·b | `scripts/autoload/platform.gd` `push_back`·`remove_back`·`_sync_back`, `custom_shell.html` `setBackHandler` | 새 모듈 `AIT.back`(`AITBack`): `push(handler)`·`remove(handler)`·`handle()`. 닫을 것이 있을 때만 `graniteEvent.addEventListener("backEvent")`를 구독하고, 비면 해제해 첫 화면에서는 플랫폼 기본 동작(종료)이 된다. 데스크톱 실행에서는 Esc가 뒤로가기다. 브리지에 인자를 앞에 붙이는 구독 진입점 `subscribePathArgs`를 더한다(두 브리지 복사본 동일). 체크리스트는 새 출시 점검 문서에 |
| 게임과 비게임의 내비게이션 바 차이: 게임 바는 더보기·닫기(X)뿐이고 X를 누르면 플랫폼이 종료 확인 모달을 띄운다(SDK 2.9.2+). 비게임은 뒤로가기·홈·타이틀을 고를 수 있다 | b | — | 출시 점검 문서와 설치 가이드 `appType` 설명 |
| 매니페스트 → `apps-in-toss.config.ts` 생성 | 이미 반영 | SDK `write-ait-config.mjs`(87f58ca) | 변경 없음. `appType` 기본값만 더한다 |
| 내비게이션 바 색 맞추기(`NavigationBar.setOptions`) | b | `platform.gd` `style_navigation_bar` | API 가이드 예제가 이미 있다. 그대로 둔다 |
| 홈 버튼(`homeEvent`) | b | 쓰지 않음 | 출시 점검 문서에 "홈 버튼을 켜면 동작 확인 필요"만 적는다. 모듈은 실기기 동작을 확인한 뒤 |

## 2. Safe Area, 화면 배율, 확대 막기

| 항목 | 분류 | cat-room 위치 | SDK 반영 |
| --- | --- | --- | --- |
| Safe Area 인셋(CSS px)을 Godot UI 단위로 바꾸기, 바뀌면 다시 배치 | a | `platform.gd` `refresh_safe_area`·`safe_area_changed`, 셸 `cssSafeArea` | 새 모듈 `AIT.safe_area`(`AITSafeArea`): `SafeArea.get` → 없으면 CSS `env(safe-area-inset-*)`를 DOM으로 재기(eval 없음) → 0. 배율은 `UI 폭 / window.innerWidth`. `SafeArea.subscribe`와 창 크기 변경에 `changed` 신호. 처음 `refresh()`를 부를 때 시작한다(opt-in) |
| 기준 크기 360×640, `canvas_items` + `expand`: UI 1단위가 360 CSS px 이상 기기에서 1 CSS px 이상이라 글자·터치 영역이 하한 밑으로 줄지 않는다(이전 390 기준은 375×667에서 0.79배, 캡션 10.3px) | b | `project.godot` `[display]`, `docs/PORTING.md` "화면 크기별 확인" | 설치 가이드의 프로젝트 설정 표 |
| viewport meta `width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover`. 비게임 체크리스트는 지도 말고는 제스처 확대를 막으라고 한다. `viewport-fit=cover`가 없으면 iOS에서 `env()` 인셋이 0이다 | a·b | `custom_shell.html` 3행 | `init`이 쓰는 셸 템플릿(`tools/templates/custom_shell.html`, `docs/examples/custom-shell.html`과 같은 파일)에 넣고, `doctor`가 셸의 viewport meta에 확대 막기·`viewport-fit=cover`가 없으면 경고 |
| 캔버스 제스처: `touch-action: none`, 길게 눌러 선택·돋보기 막기, `overscroll-behavior: none`, 탭 하이라이트 끄기 | b | `custom_shell.html` `#canvas` | 셸 템플릿 |
| 렌더 해상도 상한(기기 배율 3을 2로): 발열·배터리 | b | `custom_shell.html` `devicePixelRatio` 덮어쓰기, `platform.gd` `set_pixel_cap` | 셸 템플릿에 상한 2와 `AppsInTossShell.setPixelCap()`을 넣는다 |
| WebGL 2 미지원 안내(`Engine.getMissingFeatures`), 로딩 진행률, 실패 문구 | b | `custom_shell.html` 끝 스크립트 | 셸 템플릿 |

## 3. 입력과 한글

| 항목 | 분류 | cat-room 위치 | SDK 반영 |
| --- | --- | --- | --- |
| 버튼·카드 위에서 시작한 끌기도 스크롤되고 탭과 구분(Button이 누름을 먹어 ScrollContainer가 못 받는다). 관성 스크롤 | a | `scripts/ui/touch_scroll.gd`(`TouchScroll`, 앱에 묶이지 않음), `tools/tests/touch_scroll_test.gd` | `AITTouchScroll`(`addons/apps_in_toss/ui/`)로 옮긴다. `attach(scroll)`과 `scroll_area()`. Godot 헤드리스 검사에 마우스 길 테스트를 더한다 |
| 스크롤 영역은 `ScrollContainer.new()` 대신 한 함수로 만든다 | b | `scripts/ui/ui.gd` `scroll_area` | API 가이드 |
| 한글 keep-all: Godot 줄바꿈은 음절 사이에서도 끊으므로 음절 사이에 단어 결합 문자(U+2060)를 넣는다 | a | `ui.gd` `ko`·`_joins` | `AITKorean.keep_all(text)` |
| 받침에 맞는 조사(`은/는`, `이/가`, `을/를`, `과/와`, `으로/로`, 숫자 포함) | a | `ui.gd` `j` | `AITKorean.josa(word, pair)` |
| 글자 11px 이하 금지·본문 15px 이상, 터치 영역 44px 이상, 굵기 400~700 | b | `ui.gd` 상수, `AGENTS.md` 디자인 가이드 | 출시 점검 문서(디자인 하한) |
| 한글 입력(IME)은 Godot LineEdit 대신 DOM `<input>` 시트 | b | `custom_shell.html` `promptName`, `platform.gd` `prompt_name` | Godot Web 주의사항 문서에 방법만. 모듈은 후속 후보 |

## 4. 저장

| 항목 | 분류 | cat-room 위치 | SDK 반영 |
| --- | --- | --- | --- |
| SDK Storage만 쓴다. iOS WebView는 7일간 상호작용이 없으면 IndexedDB를 지운다. Web Storage는 오리진별이라 QR 테스트(`<앱>.private-apps.tossmini.com`)와 라이브(`<앱>.apps.tossmini.com`)가 공유되지 않는다 | b | `game.gd` 머리 주석 | API 가이드 저장소 절을 고친다(현재는 오리진 변경만 적혀 있다) |
| 저장을 잃지 않는 규칙: 사용자 식별키 기준 키, 식별키·저장소 읽기 한 번 재시도, 읽기 실패면 새 저장으로 시작하지 않고 막음, 해석할 수 없는 저장은 원본을 다른 키에 두고 저장 중지, 이전 키는 새 키에 쓴 뒤에만 지움, 백그라운드로 갈 때 바로 쓰기, 0.8초 디바운스 | a | `scripts/autoload/game.gd` `load_state`·`_read_save`·`_keep_broken`·`flush` | `AITSaveSlot`(`addons/apps_in_toss/storage/`): `load_data()`가 `{ok, reason, data, fresh}`를 돌려주고(`reason`: `bridge`·`user_key`·`storage`·`broken`), 막는 화면은 앱이 그린다. `save()`(디바운스)·`flush()`·`wipe()`, 숨김 때 자동 flush. 테스트용 저장소·식별키 주입 |
| 비게임 식별키는 `getAnonymousKey`, 게임은 `getUserKeyForGame`. 둘 다 `{type: "HASH", hash}` 외에 `"ERROR"`·없음이 올 수 있다 | a | `platform.gd` `user_key` | `AIT.get_anonymous_key()` 래퍼와 둘을 차례로 시도해 hash만 돌려주는 `AIT.get_user_hash()` |
| 막는 안내 화면 문구·디자인 | c | `game.gd` `_block` | 앱 몫 |

## 5. 소리

| 항목 | 분류 | cat-room 위치 | SDK 반영 |
| --- | --- | --- | --- |
| 사운드 게이트: 멈출 이유를 집합으로 든다(백그라운드·광고·결제). 하나라도 남으면 Master 버스를 끈다. 광고 중에 앱이 다시 보여도 광고가 끝나기 전에는 켜지지 않는다. 배경음은 멈췄다가 같은 자리에서 이어 간다 | a | `scripts/autoload/sound.gd` `silence`·`unsilence`·`_apply` | `AIT.sound`(`AITSoundGate`): `enable()`을 불러야 동작(opt-in). 켜면 숨김(`AIT.app_events`), 전면 광고·AdMob 표시, 인앱 결제 주문 동안 자동으로 멈춘다. 이를 위해 `AIT.ads`·`AIT.admob`에 `show_started`·`show_ended`, `AIT.iap`에 `order_started`·`order_ended` 신호를 더한다(추가만). `track_player(player)`로 등록한 플레이어는 멈춘 자리에서 이어 튼다 |
| 효과음·배경음 끄기 설정은 각자 버스로(게이트와 분리) | b | `sound.gd` `apply_settings` | API 가이드 |
| 터치 전 재생: `mediaPlaybackRequiresUserAction: false` | 이미 반영 | 생성 설정 기본값 | 변경 없음 |
| Godot 4.7 Web "Sample" 재생은 Web Audio `loop`가 아니라 `ended`에서 처음부터 다시 튼다. 데스크톱 Chrome에서는 메인 스레드가 바빠도 빈틈이 없었고 iOS·안드로이드 WebView는 미확인. 처음 틀 때 스트림을 48kHz 스테레오 float32로 다시 그린다(10초에 약 3.8MB) → `register_stream_as_sample`로 미리 치르고, 다 쓰면 `stream = null`. QOA로 import한 WAV는 PCM으로 못 읽는다. 코드로 만든 소리는 `AudioStreamWAV`(16비트, `LOOP_FORWARD`)로, 프레임마다 나눠 만들고 `user://`에 캐시 | b | 백색 소음 시제품 기록(2026-10-17), `sound.gd` `_start_ambient_stream`·`_fade` | Godot Web 주의사항 문서 |
| 배경 소리 생성기(노이즈·빗소리 등)와 골골송 | c | `scripts/audio/ambient_gen.gd` | 앱 몫 |
| 배경음은 OGG로(용량) | b | 커밋 `e8f2d04` | 출시 점검 문서(번들 크기) |

## 6. 배터리와 그리기

| 항목 | 분류 | cat-room 위치 | SDK 반영 |
| --- | --- | --- | --- |
| 정지 화면이 많은 비게임은 `application/run/low_processor_mode=true`(필요할 때만 그리기) | b | `project.godot` | 설치 가이드 프로젝트 설정 표 |
| 필요할 때만 그리기 모드에서는 정지 화면이면 `frame_post_draw`가 오지 않는다 → 캡처 스크립트는 그동안 모드를 끈다 | b | `tools/tests/capture.gd` | 테스트 가이드 |
| 화면이 방을 가리면 3D 그리기·입력을 멈춘다 | c | `scripts/main.gd` | 앱 몫 |

## 7. 인앱 결제

| 항목 | 분류 | cat-room 위치 | SDK 반영 |
| --- | --- | --- | --- |
| 결제 화면이 떠 있으면 WebView가 hidden이 되어 엔진 루프가 멈춘다. `processProductGrant` 안에서 서버를 기다리면 교착 → 즉시 `true`(주문번호가 없을 때만 `false`), 지급은 결제 화면이 닫힌 뒤 `onEvent`(성공)에서 | b | `scripts/autoload/billing.gd` 머리 주석·`_on_grant_requested`·`_on_succeeded` | API 가이드 "결제 지급 규칙"을 이 순서로 고친다. 지금 문서의 "확정은 미결 주문 복구 루틴에 맡기세요"만으로는 부족하다 |
| 대사: 앱 시작·포그라운드 복귀·상점 진입 때 `getPendingOrders` + `getCompletedOrRefundedOrders`의 `COMPLETED` 중 처리 완료로 적지 않은 주문. 실행당 같은 주문은 한 번만(과도 호출 금지). 웹 SDK의 `getCompletedOrRefundedOrders`는 인자가 없고 첫 페이지만 준다 | b | `billing.gd` `reconcile` | API 가이드 |
| 결과가 끝내 오지 않을 때를 대비한 감시 타이머(잠금·소리 멈춤 풀기) | b | `billing.gd` `WATCHDOG_SEC` | API 가이드 |
| 결제 오류 코드별 안내 문구 | b | `billing.gd` `error_text` | API 가이드에 코드 목록만(문구는 앱 몫) |
| 콘솔 QR 테스트의 결제는 실제 결제다. 로컬은 DevTools 모의 결제 | b | `docs/ROADMAP.md` 4 | 테스트 가이드 |
| 서버: 익명 키 인증 코드 → 파트너 API(mTLS) 교환, 미니앱당 분당 3,000회(QPM), `orderId` 멱등 지급 | b | `cloud/CONTRACT.md` | API 가이드 "서버에서 사용자 확인하기"에 한도와 멱등 규칙을 더한다 |
| 젤리·동전 모델, D1 스키마, Worker | c | `cloud/` | 앱 몫 |

## 8. 광고

| 항목 | 분류 | cat-room 위치 | SDK 반영 |
| --- | --- | --- | --- |
| 화면에 들어오면 미리 불러 두기, 실패하면 간격을 늘려 최대 몇 번만 다시(체크리스트: 사전 로딩, 재시도 횟수·간격 제어) | b | `platform.gd` `preload_rewarded`·`_on_ad_failed` | API 가이드 |
| 보상은 `userEarnedReward`에서만, 광고 중 소리 멈춤·끝나면 다시 | 일부 반영 | `platform.gd` `_on_ad_event` | 보상 규칙은 이미 있다. 소리는 `AIT.sound`로 |
| 브라우저 mock의 `showFullScreenAd`는 `userEarnedReward`를 보내지 않는다 | b | `docs/PORTING.md` | 테스트 가이드 시뮬레이터 표 |
| 개발 중에는 테스트 광고 ID(`ait-ad-test-interstitial-id`, `ait-ad-test-rewarded-id`, `ait-ad-test-banner-id`, `ait-ad-test-native-image-id`), 검수 번들 전에 실제 ID | a·b | `tools/check-release.mjs` | `doctor`가 게임 스크립트에 `ait-ad-test-`가 남아 있으면 경고. 출시 점검 문서 |
| 배너(`TossAds.attachBanner`)는 DOM 요소가 필요해 캔버스 위에 겹친다. 스크롤 영역으로 자르고, 스크롤 화면에만, 숨길 때 `destroy` | b | `custom_shell.html` `bannerShow`·`bannerRect`, `platform.gd` `banner_place` | Godot Web 주의사항 문서에 방법만. 모듈은 기존 백로그(TossAds 배너) |

## 9. 개발·테스트 빌드

| 항목 | 분류 | cat-room 위치 | SDK 반영 |
| --- | --- | --- | --- |
| SDK는 모든 Web 빌드를 release 템플릿으로 내보내 `OS.is_debug_build()`가 늘 false다. 개발 빌드(mock 브리지)·테스트 빌드(debug-console)를 페이지의 스크립트로 가른다 | a | `platform.gd` `is_dev_build`·`is_test_run`, 셸 `devBuild` | `AIT.build_kind()`(`debug`·`dev`·`test`·`release`)와 `AIT.is_test_run()`. 스크립트 파일 이름은 SDK가 정하므로 SDK가 판정한다 |
| 개발용 주소 옵션(`?dev=1`, `reset=1`)은 개발 빌드에서만 읽는다(출시 빌드에서 링크 쿼리로 저장이 지워질 수 있었다) | b | `platform.gd` `dev_flag` | API 가이드(`build_kind`와 함께) |
| 개발용 도구는 출시 프리셋에서 빼고(`exclude_filter`), 두 번째 프리셋으로만 넣는다. `load()`로만 부르고 `preload`·`class_name` 금지. `GODOT_EXPORT_PRESET`으로 프리셋 고르기 | b | `export_presets.cfg`, `package.json` `dev`·`build:test`, `tools/check-release.mjs` | 설치 가이드·테스트 가이드 |
| 실기기 원격 디버깅: 디버거 잠금은 한 세션만, relay 비밀값 `.ait_relay`는 커밋 금지, `page-not-opened`(디버그 막대 없음, relay 요청 0)이면 웹 디버그 툴즈 System 탭에서 URL에 `debug=1`이 있는지 본다. 테스트 스킴의 사용자 쿼리는 문서상 `queryParams=`(URL 인코딩 JSON)로 넘긴다 | a·b | 실기기 QA 기록(2026-10-16) | 테스트 가이드. `doctor`가 `.ait_relay`가 git에서 무시되지 않으면 경고. `init`이 `.gitignore`에 `.ait_relay`·`.mcp/`·`build/`·`*.ait`·`.godot/`를 더한다(없는 줄만) |
| Godot MCP(godot-mcp-runtime)의 `run_project`는 `project.godot`에 `McpBridge` 오토로드를 잠시 넣고 `.mcp/`를 만든다. 세션이 비정상 종료되면 남는다. 커밋·출시 금지 | a·b | `.gitignore` `.mcp/`(커밋 `de51708`), `.mcp/.gdignore` | `doctor`가 `McpBridge` 오토로드를 찾으면 strict에서 실패(출시 빌드 차단). 테스트 가이드 |
| 헤드리스 점검(`--script res://tools/tests/*.gd`)과 화면 크기별 캡처(`--resolution 375x812`) 패턴 | b | `tools/tests/` | 테스트 가이드 |
| 출시 점검 스크립트(광고 ID·서버 주소·문서 자리표시자·개발 도구) | b·c | `tools/check-release.mjs` | 일반 부분(광고 ID)은 `doctor`로, 나머지는 앱 몫. 출시 점검 문서에 "앱별 점검 스크립트를 두라"고 적는다 |
| `addon:install --force`가 게임 쪽 애드온 폴더를 지우고 복사해 `tools/.gdignore`와 Godot이 만든 `.uid`가 사라진다. `.gdignore`가 없으면 Godot이 `tools/bridge/node_modules`를 스캔한다 | a | 실기기 디버깅 테스트 빌드 작업 메모(2026-10-16), cat-room `addons/apps_in_toss/tools/.gdignore` | SDK가 `tools/.gdignore`와 빠진 `.uid`를 함께 배포하고, `addon:install`은 SDK에 없는 기존 `.uid`를 지키며, `doctor`가 `.gdignore`가 없으면 경고 |
| 샘플 폴더는 출시 export에서 뺀다(`addons/apps_in_toss/sample/*`) | b | `export_presets.cfg` | 설치 가이드 |

## 10. Godot Web 출시 점검

| 항목 | 분류 | cat-room 위치 | SDK 반영 |
| --- | --- | --- | --- |
| `.ait`는 압축 해제 기준 100MB 이하여야 올라간다 | a | `docs/PORTING.md`(44.5MB) | `verify-godot-export.mjs`가 export 폴더 합계가 100MB를 넘으면 실패, 크기와 한도를 출력 |
| wasm 약 39.5MB, 게임은 10초 안에 첫 화면(체크리스트) → 로딩 화면·진행률 | b | `custom_shell.html` | 출시 점검 문서 |
| 텍스처: VRAM 압축 `for_mobile`(ETC2/ASTC), import 기본값, 오디오 WAV는 압축(QOA)·배경음은 OGG | b | `project.godot` `[importer_defaults]`, `export_presets.cfg` | 출시 점검 문서 |
| 앱 브릿지 과도 호출 금지: 햅틱은 프레임 루프에서 부르지 않는다, 화면 켜두기는 화면을 벗어날 때 끈다, 모든 SDK 호출은 `AIT.has_api`로 확인 | b | `platform.gd` `haptic`·`set_awake` | 출시 점검 문서 |
| 라이트 모드, 진입 즉시 바텀시트 없음, 외부 링크·`location` 이동·iframe 없음 | b | 출시 점검 노트 | 출시 점검 문서(공식 체크리스트 링크와 Godot에서 볼 곳) |
| eval: 앱·SDK는 `JavaScriptBridge.eval`을 쓰지 않고 엔진 JS에만 구현이 있다 | 이미 반영 | — | 변경 없음 |

## 앱 전용으로 남기는 것(c)

방·책상 2.5D 렌더링과 카메라 도구, 고양이 행동 데이터, 그림 파이프라인(Codex·페인트오버), 젤리 서버(`cloud/`)와 재화 규칙,
처리방침 동기화, 테스트 동전, 배경 소리 생성기, 이름 입력 시트·배너 DOM의 실제 마크업과 문구, 디자인 토큰 색.

## 새 공개 API 요약

모두 추가만 하며 기존 호출의 동작은 바뀌지 않습니다.

| 이름 | 종류 |
| --- | --- |
| `AIT.back` (`AITBack`) | 뒤로가기 스택 |
| `AIT.safe_area` (`AITSafeArea`) | Safe Area(UI 단위) |
| `AIT.sound` (`AITSoundGate`) | 사운드 게이트, `enable()` 해야 동작 |
| `AIT.build_kind()`, `AIT.is_test_run()` | 빌드 종류 |
| `AIT.get_anonymous_key()`, `AIT.get_user_hash()` | 사용자 식별키 |
| `AITSaveSlot` | 안전한 저장 |
| `AITKorean.keep_all()`, `AITKorean.josa()` | 한글 줄바꿈·조사 |
| `AITTouchScroll.attach()`, `AITTouchScroll.scroll_area()` | 터치 스크롤 |
| `AIT.ads`·`AIT.admob` `show_started`/`show_ended`, `AIT.iap` `order_started`/`order_ended` | 수명 신호 |
| 매니페스트 `appType`, `init --nongame` | 설정 기본값 |
| 브리지 `subscribePathArgs` | 인자가 앞에 붙는 구독(`graniteEvent.addEventListener`) |

## 확인 범위

브라우저 mock과 Godot 헤드리스로 확인할 수 있는 것만 자동 검사로 확인합니다. 토스 내비게이션 바의 뒤로가기 버튼이
`backEvent`로 오는지, iOS·안드로이드 WebView에서 Safe Area 값과 Sample 루프 이음매, 실제 저장 유지는 실기기에서 확인해야 합니다.

## 반영 결과

브랜치 `lessons/cat-room-godot`에 (a)·(b) 항목을 모두 넣었습니다. 바뀐 내용과 검증은
[SDK 개발 기록 2026-10-18](sdk-development.md#2026-10-18-cat-room-godot에서-배운-것-반영)에 있습니다.
후속 후보: 한글 입력 DOM 시트 모듈, 배너 광고(`TossAds`) 모듈, `homeEvent`, 실기기에서 확인한 뒤 cat-room-godot을 SDK 모듈로 바꾸기.
