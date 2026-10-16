# API 사용법

[← 프로젝트 소개](../README.md) · [설치 가이드](getting-started.md)

플러그인을 활성화하면 게임 전역의 `AIT`로 토스 기능을 호출할 수 있습니다.

## 지원 기능

| 분류 | 제공하는 기능 |
| --- | --- |
| 인증 | 토스 로그인, 게임 사용자 식별키, 로그인 연동 여부, 익명 식별키 인증 코드 |
| 결제 | 상품·주문 조회, 일회성·구독 결제, 지급 콜백과 미결 주문 처리 |
| 광고 | 전면 광고·AdMob의 로드·표시·이벤트 |
| 게임 | 게임센터, 정보 오버레이 구독 |
| 이벤트 | 백/포그라운드 가시성 변화 |
| 기타 | 저장소·배치 처리, 권한·공유·클립보드·햅틱, 바이럴, 내비게이션 바 |

현재 카탈로그는 37개 항목이며, Unity SDK 3.8.0 / web-framework 3.8.0을 기준으로 합니다.
카탈로그와 별도로 결제·광고·게임 이벤트의 구독과 해제를 관리하는 래퍼와
가시성 감지(`AIT.app_events`)를 제공합니다.
AdMob load/show 두 항목은 일반 호출로 사용할 수 없으므로 `AIT.admob`을 사용하세요.

## 호출 전에 확인할 것

`AIT.is_available()`은 Web 빌드에 브리지가 주입되어 있을 때 true입니다.
실전 브리지뿐 아니라 개발용 mock 브리지도 포함하므로, 실제 토스 앱인지 판별하는 용도는 아닙니다.
브리지가 없는 Godot 에디터나 일반 브라우저에서는 false이며,
호출은 `AIT_BRIDGE_UNAVAILABLE` 오류로 비동기 반환됩니다.

DevTools 3.8.0 mock은 카탈로그의 모든 API를 제공하지만, 토스 앱 버전에 따라
최근 추가된 API는 없을 수 있습니다. 기능별 지원 여부는 `AIT.has_api()`로 확인하세요. [브라우저 테스트 범위](testing.md#브라우저-시뮬레이터의-테스트-범위)

## 기본 호출과 광고 이벤트

`AIT` 오토로드 하나로 전부 접근합니다. Unity의 `AIT.*` 정적 API에 대응합니다.
아래 예제는 콜백 함수를 포함하며 GDScript 구문 검사를 통과했습니다.

```gdscript
extends Control

func _ready() -> void:
    if not AIT.is_available():
        return  # 주입된 브리지 없음 — 에디터/일반 브라우저/미주입 export

    AIT.ads.ad_loaded.connect(_on_ad_loaded)
    AIT.ads.ad_failed.connect(_on_ad_failed)
    AIT.ads.load_full_screen_ad({"adGroupId": "광고그룹ID"})

    # 사용자 식별 (로그인 UI 없이).
    # getUserKeyForGame은 HASH 외에도 "ERROR"/없음을 돌려줄 수 있어서
    # Dictionary + type=="HASH"를 먼저 확인해야 합니다.
    var identity := await AIT.get_user_key_for_game(15_000)
    if bool(identity.get("ok", false)):
        var result: Variant = identity.get("result")
        if typeof(result) == TYPE_DICTIONARY and String(result.get("type", "")) == "HASH":
            print(String(result.get("hash", "")))

    # 내비게이션 바 (web-framework 3.5.0 추가 — 넘긴 필드만 반영).
    # 구버전 토스 앱에는 없을 수 있으므로 has_api 가드를 권장합니다.
    if AIT.has_api("NavigationBar.setOptions"):
        await AIT.invoke_and_wait("NavigationBar.setOptions", [{"theme": "dark"}], 15_000)


func _on_ad_loaded(subscription_id: int) -> void:
    print("ad loaded: %d" % subscription_id)
    AIT.ads.dispose(subscription_id)


func _on_ad_failed(subscription_id: int, error: Dictionary) -> void:
    push_warning("ad failed: %s" % JSON.stringify(error))
    AIT.ads.dispose(subscription_id)
```

## 서버에서 사용자 확인하기

게임 서버가 사용자를 확인해야 하면 사용자 식별키를 직접 보내지 말고
일회용 인증 코드를 보내세요. 서버는 mTLS 인증서로 파트너 API에서 코드를
교환해 사용자 식별키(`anonKey`)를 받습니다. (web-framework 3.6.0 추가)

```gdscript
func _request_server_session() -> void:
    if not AIT.has_api("User.createAnonymousKeyAuthCode"):
        return  # 구버전 토스 앱
    var response := await AIT.create_anonymous_key_auth_code(15_000)
    if not bool(response.get("ok", false)):
        push_warning("auth code failed: %s" % JSON.stringify(response.get("error")))
        return
    var result: Variant = response.get("result")
    if typeof(result) == TYPE_DICTIONARY:
        # 받은 즉시 게임 서버로 보내 교환합니다. 저장하거나 다시 쓰지 마세요.
        _send_to_game_server(String(result.get("code", "")))


func _send_to_game_server(code: String) -> void:
    pass  # HTTPRequest 등으로 게임 서버에 code를 전달
```

코드는 `expiresIn`(초) 안에 한 번만 교환할 수 있습니다. 만료·실패하면 새로 발급받으세요.
서버 쪽 교환 방법은 [사용자 식별키 인증 코드 발급](https://developers-apps-in-toss.toss.im/guide/authentication/anonymous-key-auth-code)을 참고하세요.

## 바이럴 공유 문구

`viral_share`의 옵션에 `title`, `description`을 넣으면 공유 메시지 문구를 바꿀 수 있습니다.
비워 두면 콘솔 캠페인에 설정한 값을 씁니다. (web-framework 3.8.0 추가)

```gdscript
func _share_record() -> void:
    var options := {"campaignId": "캠페인ID", "title": "내 기록을 깨 보세요", "description": "1,250점 달성"}
    var response := await AIT.invoke_and_wait("Viral.share", [options], 15_000)
    if not bool(response.get("ok", false)):
        push_warning("share failed: %s" % JSON.stringify(response.get("error")))
```

## AdMob 광고

AdMob load/show는 구독형 API라서 자동 생성 일반 호출 래퍼가 아니라 전용
모듈을 씁니다.

```gdscript
extends Control

func _ready() -> void:
    AIT.admob.admob_loaded.connect(_on_admob_loaded)
    AIT.admob.admob_event.connect(_on_admob_event)
    AIT.admob.admob_failed.connect(_on_admob_failed)
    AIT.admob.load_admob({"adGroupId": "광고그룹ID"})


func _on_admob_loaded(subscription_id: int) -> void:
    print("admob loaded: %d" % subscription_id)
    AIT.admob.dispose(subscription_id)


func _on_admob_event(subscription_id: int, event: Variant) -> void:
    print("admob event %d: %s" % [subscription_id, JSON.stringify(event)])


func _on_admob_failed(subscription_id: int, error: Dictionary) -> void:
    push_warning("admob failed: %s" % JSON.stringify(error))
    AIT.admob.dispose(subscription_id)
```

## 백그라운드와 오디오(BGM)

앱이 백그라운드로 가도 BGM이 계속 재생된다는 문의가 반복되므로 웹뷰의
`document.visibilitychange`를 `AIT.app_events`로 제공합니다. 구독은 자동으로
시작되며, 가시성이 변할 때 신호를 받습니다.

```gdscript
func _ready() -> void:
    AIT.app_events.visibility_changed.connect(_on_visibility_changed)


func _on_visibility_changed(is_visible: bool) -> void:
    AudioServer.set_bus_mute(0, not is_visible)  # 또는 get_tree().paused = not is_visible
```

로딩 직후 터치 없이 소리를 재생하려면 WebView의 `mediaPlaybackRequiresUserAction`가
false여야 합니다. 이 값과 게임 중 당겨서 새로고침을 막는 `pullToRefreshEnabled: false`는
생성된 `apps-in-toss.config.ts`에 기본으로 들어갑니다.

## 결제 지급 규칙

`product_grant_requested`는 네이티브 결제 오버레이가 떠 있는 상태에서 호출되어,
안에서 서버 검증을 `await`하면 응답이 돌아오지 않을 수 있습니다. 콜백에서는 즉시
응답하고, 확정은 미결 주문 복구 루틴에 맡기세요. (커뮤니티 권장 패턴 — 예제는
샘플 씬의 미결 주문 복구를 참고하세요.)

1. `product_grant_requested`에서 즉시 `resolve_product_grant`(거부는 `reject_product_grant`)로 응답
2. 게임 시작 시 `get_pending_orders`로 미결 주문을 조회해 지급 후 `complete_product_grant`로 완료 보고
3. 콜백의 `orderId`가 비어 올 수 있으므로 2의 조회 결과로 보완

## API 목록과 권한

API 항목의 원본은 [api-manifest.json](../bridge/api-manifest.json)이며,
[카탈로그 GDScript](../addons/apps_in_toss/generated/ait_generated_catalog.gd)는 자동 생성됩니다.
자세한 사용 방법(로그인 서버 연동, 결제 지급/복구, 전면 광고)은
플랫폼 리포 [`docs/godot-integration.md`](https://github.com/enfp-dev-studio/toss-web-game/blob/main/docs/godot-integration.md)를 참고하세요.

주의: 필요한 권한은 `.ait/game.manifest.json`의 `permissions`로 선언합니다.
`build`·`build:dev`가 매니페스트를 읽어 `apps-in-toss.config.ts`를 다시 만들며, 선언하지 않으면
빈 배열입니다. 클립보드 등 권한이 필요한 API가 기본 상태에서 동작한다고 가정하지 마세요.
권한 선언과 실기기 동작은 토스 앱에서 직접 확인해야 합니다.

저장소: 진행 상태를 `localStorage`나 IndexedDB에 두지 마세요. 플랫폼이 서빙
오리진을 바꾸면 접근할 수 없고, 3.x 전환에서 실제로 데이터가 소실된 사례가
있습니다. 게임 상태는 SDK 저장소(`storage_*`)나 서버에 두세요. 오리진 이전
데이터를 병합해야 할 때만 `migration_get_origin_storage`로 이전·현재 덤프를
비교합니다(원본은 `Migration.getOriginStorage`, mock에는 없을 수 있습니다).
