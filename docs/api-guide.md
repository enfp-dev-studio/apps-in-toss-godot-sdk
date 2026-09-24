# API 사용법

[← 프로젝트 소개](../README.md) · [설치 가이드](getting-started.md)

플러그인을 활성화하면 게임 전역의 `AIT`로 토스 기능을 호출할 수 있습니다.

## 지원 기능

| 분류 | 제공하는 기능 |
| --- | --- |
| 인증 | 토스 로그인, 게임 사용자 식별키, 로그인 연동 여부 |
| 결제 | 상품·주문 조회, 일회성·구독 결제, 지급 콜백과 미결 주문 처리 |
| 광고 | 전면 광고·AdMob의 로드·표시·이벤트 |
| 게임 | 게임센터, 정보 오버레이 구독 |
| 기타 | 저장소·배치 처리, 권한·공유·클립보드·햅틱, 바이럴, 내비게이션 바 |

현재 카탈로그는 35개 항목이며, Unity SDK 3.5.0 / web-framework 3.5.0을 기준으로 합니다.
카탈로그와 별도로 결제·광고·게임 이벤트의 구독과 해제를 관리하는 래퍼를 제공합니다.
AdMob load/show 두 항목은 일반 호출로 사용할 수 없으므로 `AIT.admob`을 사용하세요.

## 호출 전에 확인할 것

`AIT.is_available()`은 Web 빌드에 브리지가 주입되어 있을 때 true입니다.
실전 브리지뿐 아니라 개발용 mock 브리지도 포함하므로, 실제 토스 앱인지 판별하는 용도는 아닙니다.
브리지가 없는 Godot 에디터나 일반 브라우저에서는 false이며,
호출은 `AIT_BRIDGE_UNAVAILABLE` 오류로 비동기 반환됩니다.

현재 DevTools 3.2.0에는 `NavigationBar.setOptions`와 `Viral.*`가 없습니다.
기능별 지원 여부는 `AIT.has_api()`로 확인하세요. [브라우저 테스트 범위](testing.md#브라우저-시뮬레이터의-테스트-범위)

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
    # mock 개발 빌드에서는 미지원이므로 has_api 가드를 권장합니다.
    if AIT.has_api("NavigationBar.setOptions"):
        await AIT.invoke_and_wait("NavigationBar.setOptions", [{"theme": "dark"}], 15_000)


func _on_ad_loaded(subscription_id: int) -> void:
    print("ad loaded: %d" % subscription_id)
    AIT.ads.dispose(subscription_id)


func _on_ad_failed(subscription_id: int, error: Dictionary) -> void:
    push_warning("ad failed: %s" % JSON.stringify(error))
    AIT.ads.dispose(subscription_id)
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

## API 목록과 권한

API 항목의 원본은 [api-manifest.json](../bridge/api-manifest.json)이며,
[카탈로그 GDScript](../addons/apps_in_toss/generated/ait_generated_catalog.gd)는 자동 생성됩니다.
자세한 사용 방법(로그인 서버 연동, 결제 지급/복구, 전면 광고)은
플랫폼 리포 [`docs/godot-integration.md`](https://github.com/enfp-dev-studio/toss-web-game/blob/main/docs/godot-integration.md)를 참고하세요.

주의: 자동 생성 설정 파일의 `permissions`는 빈 배열입니다. 클립보드 등 권한이
필요한 API가 기본 상태에서 동작한다고 가정하지 마세요. 권한 선언과 실기기
동작은 토스 앱에서 직접 확인해야 합니다.
