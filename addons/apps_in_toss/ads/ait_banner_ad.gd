extends RefCounted
class_name AITBannerAd

## 토스 배너 광고를 화면 위나 아래에 한 줄로 띄우는 도우미입니다(Unity SDK 3.9.0 AITBannerAd 대응).
## 페이지 요소(DOM) 자리는 SDK가 만들고 Safe Area를 비켜 둡니다. 실제 광고는 토스 앱·샌드박스에서만 나옵니다.
##   AIT.banner.ad_event.connect(func(event): print(event))
##   AIT.banner.show("콘솔 광고 그룹 ID", AITBannerAd.Position.BOTTOM)
##   AIT.banner.hide()
## 다시 부르면 기존 배너를 내리고 새로 띄웁니다. 화면의 특정 영역에 붙이거나 여러 개를 띄우려면 AITBannerAdView를 쓰세요.
##
## ad_event의 event: { kind, ad_group_id, slot_id, creative_id, request_id, error_code, error_message,
##   width, height, height_fraction }
## kind: initialized, initialization_failed, rendered, viewable, clicked, impression, failed_to_render, no_fill,
##   resized(렌더된 배너 크기. width·height는 CSS px, height_fraction은 캔버스 높이 대비 비율)

signal ad_event(event: Dictionary)
## 호출 단계 오류(빈 광고 그룹 ID 등)
signal error(message: String)

enum Position { TOP, BOTTOM }

const MODE_TOP := 0
const MODE_BOTTOM := 1
const MODE_RECT := 2
const THEMES := ["auto", "light", "dark"]
const TONES := ["blackAndWhite", "grey"]
const VARIANTS := ["card", "expanded"]
const KINDS := {
    "initialized": "initialized",
    "initializationFailed": "initialization_failed",
    "rendered": "rendered",
    "viewable": "viewable",
    "clicked": "clicked",
    "impression": "impression",
    "failedToRender": "failed_to_render",
    "noFill": "no_fill",
    "resized": "resized",
}

var _core: AITCore
var _handlers: Dictionary = {} # slot id -> Callable(event: Dictionary)
var _slot := -1

func _init(core: AITCore) -> void:
    _core = core
    _core.subscription_event.connect(_on_subscription_event)
    _core.subscription_error.connect(_on_subscription_error)

## theme: "auto"·"light"·"dark", tone: "blackAndWhite"·"grey", variant: "card"·"expanded"
func show(ad_group_id: String, position: Position = Position.BOTTOM, theme := "auto", tone := "blackAndWhite", variant := "expanded") -> void:
    if ad_group_id.is_empty():
        push_warning("[AITBannerAd] 광고 그룹 ID가 비어 있습니다.")
        error.emit("광고 그룹 ID가 비어 있습니다.")
        return
    hide()
    var mode := MODE_TOP if position == Position.TOP else MODE_BOTTOM
    _slot = open_slot(ad_group_id, mode, theme, tone, variant, func(event: Dictionary) -> void: ad_event.emit(event))

func hide() -> void:
    if _slot < 0:
        return
    close_slot(_slot)
    _slot = -1

func is_showing() -> bool:
    return _slot >= 0

## 여러 슬롯을 쓰는 AITBannerAdView가 부르는 낮은 단계 함수입니다. 슬롯 번호를 돌려줍니다.
func open_slot(ad_group_id: String, mode: int, theme: String, tone: String, variant: String, handler: Callable) -> int:
    assert(theme in THEMES and tone in TONES and variant in VARIANTS, "AITBannerAd: theme·tone·variant 값을 확인하세요")
    var slot := _core.create_subscription_id()
    _handlers[slot] = handler
    _core.start_banner(slot, ad_group_id, mode, theme, tone, variant)
    return slot

## 영역 배너의 위치(캔버스 기준 0~1, 왼쪽 위 원점)
func set_slot_rect(slot: int, rect: Rect2) -> void:
    if _handlers.has(slot):
        _core.set_banner_rect(slot, rect)

func close_slot(slot: int) -> void:
    if not _handlers.has(slot):
        return
    _handlers.erase(slot)
    _core.dispose_subscription(slot)

## 화면 크기가 바뀌면 모든 슬롯이 높이(resized)를 다시 보고하게 합니다
func refresh_sizes() -> void:
    if not _handlers.is_empty():
        _core.refresh_banner_sizes()

static func to_event(raw: Variant) -> Dictionary:
    var e: Dictionary = raw if raw is Dictionary else {}
    return {
        "kind": KINDS.get(String(e.get("kind", "")), String(e.get("kind", ""))),
        "ad_group_id": String(e.get("adGroupId", "")),
        "slot_id": String(e.get("slotId", "")),
        "creative_id": String(e.get("creativeId", "")),
        "request_id": String(e.get("requestId", "")),
        "error_code": int(e.get("errorCode", 0)),
        "error_message": String(e.get("errorMessage", "")),
        "width": float(e.get("width", 0.0)),
        "height": float(e.get("height", 0.0)),
        "height_fraction": float(e.get("heightFraction", 0.0)),
    }

func _on_subscription_event(subscription_id: int, event: Variant) -> void:
    var handler: Variant = _handlers.get(subscription_id)
    if handler is Callable:
        (handler as Callable).call(to_event(event))

## 브리지가 없거나(에디터·데스크톱) 오래된 애드온이면 초기화 실패 이벤트로 알립니다
func _on_subscription_error(subscription_id: int, failure: Dictionary) -> void:
    var handler: Variant = _handlers.get(subscription_id)
    if handler is Callable:
        (handler as Callable).call(to_event({"kind": "initializationFailed", "errorMessage": String(failure.get("message", ""))}))
