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
| 이벤트 | 백/포그라운드 가시성 변화, 시스템 뒤로가기(`AIT.back`) |
| 화면 | Safe Area(`AIT.safe_area`), 한글 줄바꿈·조사(`AITKorean`), 터치 스크롤(`AITTouchScroll`) |
| 소리 | 백그라운드·광고·결제 중 정지(`AIT.sound`) |
| 저장 | 사용자별 안전한 저장(`AITSaveSlot`) |
| 기타 | 저장소·배치 처리, 권한·공유·공유 링크·진입 주소·클립보드·햅틱, 바이럴, 내비게이션 바 |

현재 카탈로그는 38개 항목이며, Unity SDK 3.8.0 / web-framework 3.8.0을 기준으로 합니다.
카탈로그와 별도로 결제·광고·게임 이벤트의 구독과 해제를 관리하는 래퍼와
가시성 감지(`AIT.app_events`)를 제공합니다. 화면·소리·저장 모듈은 cat-room-godot을 만들며
모든 미니앱에 필요하다고 확인한 것을 옮긴 것입니다([정리 문서](lessons-cat-room-godot.md)).
모두 부르거나 켜야 동작하므로 기존 게임의 동작은 바뀌지 않습니다.
AdMob load/show 두 항목은 일반 호출로 사용할 수 없으므로 `AIT.admob`을 사용하세요.

## 호출 전에 확인할 것

`AIT.is_available()`은 Web 빌드에 브리지가 주입되어 있을 때 true입니다.
실전 브리지뿐 아니라 개발용 mock 브리지도 포함하므로, 실제 토스 앱인지 판별하는 용도는 아닙니다.
브리지가 없는 Godot 에디터나 일반 브라우저에서는 false이며,
호출은 `AIT_BRIDGE_UNAVAILABLE` 오류로 비동기 반환됩니다.

DevTools 3.8.0 mock은 카탈로그의 모든 API를 제공하지만, 토스 앱 버전에 따라
최근 추가된 API는 없을 수 있습니다. 기능별 지원 여부는 `AIT.has_api()`로 확인하세요. [브라우저 테스트 범위](testing.md#브라우저-시뮬레이터의-테스트-범위)

빌드 종류는 `AIT.build_kind()`로 봅니다. SDK는 Web 빌드를 모두 release 템플릿으로 내보내므로
Web에서는 `OS.is_debug_build()`가 늘 false입니다. 그래서 SDK가 페이지에 넣은 스크립트로 가릅니다.

| 값 | 뜻 |
| --- | --- |
| `debug` | 에디터·데스크톱 디버그 실행 |
| `dev` | `build:dev`(mock 브리지 + DevTools) |
| `test` | `build --debug-console`(실기기 원격 디버깅 테스트 번들) |
| `release` | 출시 빌드. release 검증이 mock 브리지·debug-console이 남으면 실패합니다 |

`AIT.is_test_run()`은 `release`가 아닐 때 true입니다. 시작 재화처럼 테스트 편의에만 쓰세요.
주소 쿼리(`?dev=1` 등)로 여는 조작 훅이나 저장 초기화는 `dev`·`debug`에서만 여세요.
출시 빌드에서 쿼리를 읽으면 남이 만든 링크 하나로 진행이 지워질 수 있습니다.

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

파트너 API는 mTLS 인증서가 필요하고, 기본 호출 한도는 미니앱당 분당 3,000회입니다
([서버 API 이용하기](https://developers-apps-in-toss.toss.im/documentation/integration/server-api)).
결제 지급 API는 같은 `orderId`를 여러 번 받아도 한 번만 지급하게 만드세요. 아래 대사가 같은 주문을 다시 보냅니다.

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

## 친구 초대 링크와 진입 주소

친구 초대 링크는 `Share.createLink`로 만들고, 들어온 쪽은 시작할 때
`Environment.initialURL`에서 초대 코드 쿼리를 꺼냅니다. (web-framework 3.8.0 기준)

```gdscript
func _make_invite_link(code: String) -> void:
    if not AIT.has_api("Share.createLink"):
        return  # 구버전 토스 앱
    var path := "intoss://<앱이름>/visit?code=%s" % code
    var response := await AIT.invoke_and_wait("Share.createLink", [{"path": path}], 15_000)
    if not bool(response.get("ok", false)):
        push_warning("share link failed: %s" % JSON.stringify(response.get("error")))
        return
    print(String(response.get("result")))
```

```gdscript
func _read_invite_code() -> void:
    if not AIT.has_api("Share.createLink"):
        return  # 구버전 토스 앱
    var value: Variant = AIT.get_value("Environment.initialURL")
    if typeof(value) != TYPE_STRING: return
    var url := String(value)
    if url.is_empty() or not url.contains("code="):
        return
    var code := url.get_slice("code=", 1).get_slice("&", 0)
    print(code)
```

`Environment.initialURL`은 앱에 처음 진입할 때 쓴 스킴 URL만 담고, 이후 이동은 반영되지 않습니다.
`ogImageUrl`은 토스앱 Android 5.240.0 / iOS 5.239.0 이상에서만 동작합니다.
링크 값은 조작될 수 있으니 서버에서 검증해야 합니다.

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

광고는 보여 줄 화면에 들어올 때 미리 불러 두세요(출시 체크리스트: 재생 시점에 실시간으로 불러오지 않음).
불러오기에 실패하면 간격을 늘려 가며(예: 20초 × 시도 횟수) 몇 번만 다시 시도합니다. 실패할 때마다 바로 다시 부르면
앱 브릿지 과도 호출이 됩니다. 개발 중에는 테스트 광고 그룹 ID(`ait-ad-test-interstitial-id`, `ait-ad-test-rewarded-id`,
`ait-ad-test-banner-id`, `ait-ad-test-native-image-id`)를 쓰고, 검수 번들 전에 콘솔에서 발급한 ID로 바꿉니다.
`doctor`는 게임 스크립트에 `ait-ad-test-`가 남아 있으면 경고합니다.

보상은 `userEarnedReward` 이벤트에서 지급하고, `dismissed`는 화면 상태 복구와
구독 해제에만 쓰세요. 2026-10-08 AdMob 장애 때는 `dismissed`가 오지 않아
닫힘 이벤트에서 보상을 주던 게임의 보상이 누락됐습니다
([공지](https://techchat-apps-in-toss.toss.im/t/4951)). 닫힘 이벤트가 오지 않을 때를
대비해 로딩·버튼 비활성 같은 대기 상태도 타임아웃으로 풀어 주는 것이 안전합니다.

## 뒤로가기와 내비게이션 바

비게임 미니앱은 토스 내비게이션 바의 뒤로가기 버튼으로 하위 화면을 닫습니다. iOS에는 시스템 뒤로가기가 없어서
이 버튼이 없으면 하위 화면을 나갈 길이 없습니다. 매니페스트에 `"appType": "nongame"`을 적으면
생성 설정에 `navigationBar.withBackButton: true`가 들어갑니다([설치 가이드](getting-started.md#3-게임-정보와-의존성-준비)).

`AIT.back`은 닫을 것이 있을 때만 시스템 뒤로가기(`graniteEvent` `backEvent`)를 구독합니다.
구독하는 동안은 플랫폼의 기본 뒤로가기가 막히고, 스택이 비면 구독을 풀어 첫 화면에서는 미니앱이 닫힙니다.
화면 안에 뒤로가기 버튼을 따로 그리지 마세요. 토스 버튼과 함께 보이면 비게임 체크리스트 위반입니다.

```gdscript
extends Control

func open_sheet() -> void:
    visible = true
    AIT.back.push(close_sheet)


func close_sheet() -> void:
    visible = false
    AIT.back.remove(close_sheet)
```

뒤로가기가 오면 맨 위 handler 하나만 불립니다. 데스크톱 실행과 브라우저 미리보기에서는 Esc도 뒤로가기입니다.
게임 미니앱의 바는 더보기·닫기(X)뿐이고, X를 누르면 플랫폼이 종료 확인 모달을 띄웁니다.
토스 바의 뒤로가기 버튼이 `backEvent`로 오는지는 실기기에서 확인하세요.

## Safe Area

`AIT.safe_area.refresh()`는 인셋을 Godot UI 단위로 돌려줍니다. 값은 `SafeArea.get`에서 읽고,
없으면 CSS `env(safe-area-inset-*)`를 잽니다. 둘 다 CSS px이라 화면 배율(UI 폭 / `window.innerWidth`)을 곱합니다.
처음 부른 뒤에는 `SafeArea.subscribe`와 창 크기 변경에 맞춰 다시 계산하고 `changed`를 보냅니다.

```gdscript
extends MarginContainer

func _ready() -> void:
    AIT.safe_area.changed.connect(_apply_insets)
    await AIT.safe_area.refresh()
    _apply_insets()


func _apply_insets() -> void:
    add_theme_constant_override("margin_top", int(AIT.safe_area.top))
    add_theme_constant_override("margin_bottom", int(AIT.safe_area.bottom) + 16)
```

셸의 viewport meta에 `viewport-fit=cover`가 없으면 iOS에서 CSS 값이 0입니다. `init`이 만드는 셸 템플릿에는 들어 있습니다.

## 백그라운드와 오디오(BGM)

앱이 백그라운드로 가도 BGM이 계속 재생된다는 문의가 반복되므로 웹뷰의
`document.visibilitychange`를 `AIT.app_events`로 제공합니다. 구독은 자동으로
시작되며, 가시성이 변할 때 신호를 받습니다.

가시성 하나로만 끄고 켜면 광고를 보는 중에 앱이 다시 보일 때 소리가 켜집니다.
사운드 게이트 `AIT.sound`는 멈출 이유를 모아 두고 하나라도 남으면 Master 버스를 끕니다.
`enable()`을 부르면 백그라운드, 전면 광고·AdMob 표시(`show_started`~`show_ended`),
인앱 결제 주문(`order_started`~`order_ended`) 동안 자동으로 멈추고, 끝나면 다시 켭니다.

```gdscript
extends Node

@onready var music: AudioStreamPlayer = $Music


func _ready() -> void:
    AIT.sound.enable()
    AIT.sound.track_player(music)  # 멈춘 자리에서 이어 튼다


func play_cutscene() -> void:
    AIT.sound.silence("cutscene")


func end_cutscene() -> void:
    AIT.sound.unsilence("cutscene")
```

효과음·배경음 끄기 설정은 Master가 아니라 SFX·Music 같은 각자의 버스로 두세요. 게이트가 Master를 다시 켭니다.
광고의 `dismissed`나 결제 결과가 끝내 오지 않으면(2026-10-08 AdMob 장애처럼) 게이트도 닫힌 채로 남습니다.
대기 상태를 타임아웃으로 풀 때 그 구독을 `dispose`하면 게이트도 함께 풀립니다.

로딩 직후 터치 없이 소리를 재생하려면 WebView의 `mediaPlaybackRequiresUserAction`가
false여야 합니다. 이 값과 게임 중 당겨서 새로고침을 막는 `pullToRefreshEnabled: false`는
생성된 `apps-in-toss.config.ts`에 기본으로 들어갑니다. Godot Web의 소리 재생 방식과 메모리는
[Godot Web 주의사항](godot-web-notes.md#소리)을 참고하세요.

## 진행 상태 저장

진행 상태를 `localStorage`나 IndexedDB에 두지 마세요. iOS WebView는 7일간 상호작용이 없으면 IndexedDB를 지우고,
Web Storage는 오리진별이라 QR 테스트(`<앱>.private-apps.tossmini.com`)와 라이브(`<앱>.apps.tossmini.com`)가
서로 공유되지 않습니다. 플랫폼이 서빙 오리진을 바꾸면 접근할 수 없게 되며, 3.x 전환에서 실제로 데이터가 소실된
사례가 있습니다([스토리지](https://developers-apps-in-toss.toss.im/documentation/common/file-storage/storage)).
게임 상태는 SDK 저장소(`storage_*`)나 서버에 두세요.

`AITSaveSlot`은 SDK 저장소에 JSON 하나로 두면서 저장을 잃지 않는 규칙을 지킵니다.

- 키는 사용자 식별키 기준입니다. 식별키는 `AIT.get_user_hash()`로 받습니다(비게임 `getAnonymousKey`, 게임 `getUserKeyForGame` 순).
- 식별키나 저장소를 읽지 못하면 새 저장으로 시작하지 않고 `ok: false`를 돌려줍니다. 앱은 안내를 띄우고 다시 부르세요.
- 해석할 수 없는 저장은 원본을 `<키>:broken`에 두고 저장을 끕니다(`reason: "broken"`).
- `save()`는 0.8초씩 모아 쓰고, 앱이 백그라운드로 가면 바로 씁니다.
- 브리지가 없는 에디터·데스크톱 실행에서는 `user://` 파일을 씁니다.

```gdscript
extends Node

var slot := AITSaveSlot.new("mygame.save.v1")


func _ready() -> void:
    add_child(slot)
    var r := await slot.load_data()
    while not bool(r["ok"]) and r["reason"] != AITSaveSlot.REASON_BROKEN:
        await _show_retry_notice(String(r["reason"]))
        r = await slot.load_data()
    if r["reason"] == AITSaveSlot.REASON_BROKEN:
        pass  # 원본은 보관됐다. 이번 실행은 저장하지 않고 진행하거나, 안내 뒤 slot.can_save = true로 새로 시작
    slot.data["coins"] = int(slot.data.get("coins", 0)) + 10
    slot.save()


func _show_retry_notice(reason: String) -> void:
    await get_tree().create_timer(1.0).timeout  # 실제로는 "다시 시도" 버튼을 기다린다
```

오리진 이전 데이터를 병합해야 할 때만 `migration_get_origin_storage`로 이전·현재 덤프를
비교합니다(원본은 `Migration.getOriginStorage`, mock에는 없을 수 있습니다).

## 한글 글자와 스크롤

Godot 줄바꿈은 한글 음절 사이에서도 끊습니다. `AITKorean.keep_all()`은 음절 사이에 단어 결합 문자를 넣어
띄어쓰기에서만 줄이 바뀌게 합니다(CSS `word-break: keep-all`). `AITKorean.josa()`는 받침에 맞는 조사를 붙입니다.

```gdscript
func _set_title(label: Label, cat_name: String) -> void:
    label.text = AITKorean.keep_all("%s 밥을 줄까요?" % AITKorean.josa(cat_name, "이/가"))
```

Godot의 Button은 누름을 받으면 부모 ScrollContainer가 끌기를 받지 못해, 버튼·카드 위에서 시작한 끌기가
스크롤되지 않습니다. 스크롤 영역은 `ScrollContainer.new()` 대신 `AITTouchScroll.scroll_area()`로 만들거나,
이미 있는 영역에 `AITTouchScroll.attach(scroll)`를 붙이세요. 10(UI 단위)을 넘게 움직이면 스크롤로 바꾸고
버튼 누름을 취소하며, 짧은 탭은 버튼이 그대로 받습니다. 손을 떼면 관성으로 미끄러지다 멈춥니다.

```gdscript
func _build_list(parent: Control) -> void:
    var scroll := AITTouchScroll.scroll_area()
    scroll.set_anchors_preset(Control.PRESET_FULL_RECT)
    parent.add_child(scroll)
    var list := VBoxContainer.new()
    list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    scroll.add_child(list)
```

글자·터치 영역 하한(11px 이하 금지, 본문 15px 이상, 44px 이상)은 [출시 전 점검](release-checklist.md#화면)을 참고하세요.

## 결제 지급 규칙

결제 화면이 떠 있는 동안 WebView가 hidden이 되어 엔진 루프가 멈춥니다. `product_grant_requested`(`processProductGrant`)
안에서 서버 검증을 `await`하면 응답이 돌아오지 않아 결제 화면이 닫히지 않을 수 있습니다
([Unity API 사용 패턴](https://developers-apps-in-toss.toss.im/documentation/unity/first-steps/api-usage-patterns)과 같은 원리).
세 단계를 한 묶음으로 지키세요.

1. **즉시 승인**: `product_grant_requested`에서 기다리지 않고 바로 `resolve_product_grant(..., true)`.
   `orderId`가 비어 있을 때만 `false`입니다.
2. **결제 화면이 닫힌 뒤 지급**: `purchase_succeeded`에서 서버에 지급을 요청합니다. 실패하면 "결제는 끝났어요, 곧 들어와요"처럼
   안내하고 3에 맡깁니다. 콜백의 `orderId`가 비어 올 수 있으니 이벤트의 `data.orderId`도 봅니다.
3. **대사**: 앱 시작, 포그라운드 복귀, 상점 진입 때
   - `get_pending_orders`의 주문 → 지급 → 성공하면 `complete_product_grant`
   - `get_completed_or_refunded_orders`의 `COMPLETED` 주문 중 이 기기가 처리 완료로 적지 않은 주문 → 지급
     (즉시 승인 뒤 앱이 닫혀 놓친 주문은 미결 목록에 없을 수 있습니다)
   - 한 번 실행하는 동안 같은 주문은 한 번만 요청합니다(앱 브릿지 과도 호출 금지).

웹 SDK의 `IAP.getCompletedOrRefundedOrders`는 인자가 없고 첫 페이지만 줍니다. 최근 주문 위주라 대사에는 충분합니다.
결제 결과가 끝내 오지 않을 때를 대비해 감시 타이머로 버튼 잠금을 풀고 주문 구독을 `dispose`하세요.

`purchase_failed`의 `error.code`는 web-framework 값을 그대로 전달합니다
([IAP.createOneTimePurchaseOrder](https://developers-apps-in-toss.toss.im/documentation/sdk/domains-api/iap/iap.createonetimepurchaseorder)).
사용자가 이유와 다음 행동을 알 수 있게 코드별로 안내하세요(체크리스트: 결제 실패 사유를 인지할 수 있음).

| 코드 | 의미 |
| --- | --- |
| `USER_CANCELED` | 사용자가 결제 화면을 나감 |
| `PAYMENT_PENDING` | 결제 승인 대기 중 |
| `NETWORK_ERROR` | 네트워크·서버 문제 |
| `INVALID_PRODUCT_ID` | 상품 ID가 없거나 유효하지 않음 |
| `INVALID_USER_ENVIRONMENT` | 기기·계정·설정 환경에서 구매 불가 |
| `KOREAN_ACCOUNT_ONLY` | iOS 계정이 한국 계정이 아님 |
| `APP_MARKET_VERIFICATION_FAILED` | 결제 후 앱 마켓 검증 실패 |
| `TOSS_SERVER_VERIFICATION_FAILED` | 결제 후 토스 서버 전송·저장 실패 |
| `PRODUCT_NOT_GRANTED_BY_PARTNER` | 파트너 상품 지급 실패(토스 앱 5.230.0+) |
| `ITEM_ALREADY_OWNED` | 이미 산 상품을 다시 구매 |
| `INTERNAL_ERROR` | 내부 서버 문제 |
| `UNSUPPORTED_APP_VERSION` | 지원하지 않는 토스 앱 버전 |

결제 화면이 떠 있는 동안 음악은 멈춰야 합니다. `AIT.sound.enable()`을 부르면 주문 동안 자동으로 멈춥니다.
콘솔 QR 테스트의 결제는 실제 결제입니다. 로컬에서는 DevTools 모의 결제로 확인하세요.
샘플 씬의 미결 주문 복구도 참고하세요.

## API 목록과 권한

API 항목의 원본은 [api-manifest.json](../bridge/api-manifest.json)이며,
[카탈로그 GDScript](../addons/apps_in_toss/generated/ait_generated_catalog.gd)는 자동 생성됩니다.
자세한 사용 방법(로그인 서버 연동, 결제 지급/복구, 전면 광고)은
플랫폼 리포 [`docs/godot-integration.md`](https://github.com/enfp-dev-studio/toss-web-game/blob/main/docs/godot-integration.md)를 참고하세요.

게임센터 프로필: `game_get_user_profile`(`Game.getUserProfile`)은 문서의
`SUCCESS`/`PROFILE_NOT_FOUND` 외에 라이브에서 `NOT_SUPPORTED`를 돌려준 사례가
있습니다(2026-10, 토스 확인 중). 성공이 아니면 기본 닉네임으로 대체하세요.

주의: 필요한 권한은 `.ait/game.manifest.json`의 `permissions`로 선언합니다.
`build`·`build:dev`가 매니페스트를 읽어 `apps-in-toss.config.ts`를 다시 만들며, 선언하지 않으면
빈 배열입니다. 클립보드 등 권한이 필요한 API가 기본 상태에서 동작한다고 가정하지 마세요.
권한 선언과 실기기 동작은 토스 앱에서 직접 확인해야 합니다.
저장 규칙은 위 [진행 상태 저장](#진행-상태-저장)을 보세요.
