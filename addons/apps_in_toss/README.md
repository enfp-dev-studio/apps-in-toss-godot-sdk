# Apps in Toss Godot addon

공식 Unity SDK 3.5.0(web-framework 3.5.0) 구조에 맞춰 `AIT` 오토로드, 로그인,
게임 사용자 식별, IAP·전면 광고·AdMob·구독 결제 이벤트, 게임센터·바이럴·
내비게이션 바, 진단 API와 타임아웃을 제공하는 Godot 4 애드온입니다(플러그인
버전 0.2.0).

설치는 게임 리포에서 합니다. 먼저 이 SDK를 다운로드·클론한 뒤, SDK 원본
CLI를 게임 루트 기준으로 실행하세요 (아래 `SDK`는 실제 SDK 경로로 바꾸세요):

```bash
SDK=/path/to/apps-in-toss-godot-sdk
GODOT_PROJECT_DIR="$PWD" node "$SDK/addons/apps_in_toss/tools/ait-godot.mjs" addon:install --force
```

갱신할 때도 업데이트된 SDK 원본 경로로 위 명령을 실행합니다. 게임 안의
복사본에서 `addon:install`/`sync`를 실행하면 기본적으로 자기 자신을 가리켜
파일을 갱신하지 않습니다. lock 갱신과 빌드 준비는 [루트 README](../../README.md)를
참고하세요.

그 다음 Godot 에디터에서 Project Settings → Plugins → "Apps in Toss Godot
SDK"를 활성화하면 `AIT` 오토로드가 자동 등록됩니다. 수동으로 오토로드를
추가할 필요가 없습니다.

플러그인을 켜면 게임 스크립트의 함수 안에서 다음처럼 호출할 수 있습니다.

```gdscript
var identity := await AIT.get_user_key_for_game(15_000)
var login := await AIT.app_login(15_000)
var products := await AIT.iap.get_product_item_list_and_wait(15_000)
var ad_support := await AIT.ads.is_load_full_screen_ad_supported_and_wait(15_000)
var status := await AIT.status.check_all(15_000)
```

`get_user_key_for_game` 의 결과는 HASH 외에도 `"ERROR"`/없음이 올 수 있으니,
`result`가 Dictionary이고 `type == "HASH"` 인지 확인한 뒤 `hash`를 읽으세요
(자세한 예제는 루트 README 참고).

이벤트형 API는 Unity의 콜백과 같은 수명 관리 모델을 사용합니다. 아래는
호출부 예시이며, 콜백 정의와 구독 해제까지 포함한 예제는 루트 README에 있습니다.

```gdscript
AIT.ads.ad_loaded.connect(_on_ad_loaded)
AIT.ads.ad_failed.connect(_on_ad_failed)
var subscription_id := AIT.ads.load_full_screen_ad({"adGroupId": "광고그룹ID"})
```

AdMob load/show도 구독형이라서 전용 모듈을 씁니다. 자동 생성된
`AIT.api.admob_load` / `admob_show` (일반 호출 invoke)는 upstream 호출 규약과
맞지 않으니 호출하지 마세요.

```gdscript
AIT.admob.admob_loaded.connect(_on_admob_loaded)
AIT.admob.admob_event.connect(_on_admob_event)
var admob_sub := AIT.admob.load_admob({"adGroupId": "광고그룹ID"})
var cached := await AIT.admob.is_admob_loaded_and_wait({"adGroupId": "광고그룹ID"}, 15_000)
```

`AIT.is_available()`은 Web export에 주입된 브리지(실전) 또는 mock 브리지(개발
빌드)가 있을 때 true입니다. 브리지가 없는 에디터·브라우저에서는 false이며, 호출은
`AIT_BRIDGE_UNAVAILABLE` 에러로 비동기 반환됩니다.

이 애드온만으로는 Web 페이지의 JavaScript 브리지가 만들어지지 않습니다.
게임 루트에서 `node addons/apps_in_toss/tools/ait-godot.mjs build`를 실행하면
Godot Web export에 브리지를 주입하고 `.ait` 파일을 생성합니다. `build:dev`는
브라우저 mock 테스트용 Web 번들만 생성합니다.
