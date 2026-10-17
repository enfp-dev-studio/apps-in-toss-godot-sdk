extends RefCounted
class_name AITAds

## Apps in Toss 전면 광고 API를 Unity SDK의 이벤트 콜백 형태로 감싼 모듈입니다.
## 광고 그룹 ID는 앱인토스 콘솔에서 발급한 값을 options.adGroupId로 넘겨야 합니다.

signal ad_loaded(subscription_id: int)
signal ad_event(subscription_id: int, event: Variant)
signal ad_failed(subscription_id: int, error: Dictionary)
## show_full_screen_ad를 부른 때부터 닫힘(dismissed)·실패(failedToShow·오류)·dispose까지.
## AIT.sound(사운드 게이트)가 이 신호로 광고 중 소리를 멈춥니다.
signal show_started(subscription_id: int)
signal show_ended(subscription_id: int)

const SHOW_END_EVENTS := ["dismissed", "failedToShow"]

var _core: AITCore
var _active: Dictionary = {}
var _showing: Dictionary = {}

func _init(core: AITCore) -> void:
    _core = core
    _core.subscription_event.connect(_on_subscription_event)
    _core.subscription_error.connect(_on_subscription_error)

func load_full_screen_ad(options: Dictionary = {}) -> int:
    return _start("adsLoadFullScreenAd", options)

func show_full_screen_ad(options: Dictionary = {}) -> int:
    var subscription_id := _start("adsShowFullScreenAd", options)
    _showing[subscription_id] = true
    show_started.emit(subscription_id)
    return subscription_id

func is_load_full_screen_ad_supported_and_wait(timeout_ms: int = 0) -> Dictionary:
    return await _core.invoke_and_wait("loadFullScreenAd.isSupported", [], timeout_ms)

func is_show_full_screen_ad_supported_and_wait(timeout_ms: int = 0) -> Dictionary:
    return await _core.invoke_and_wait("showFullScreenAd.isSupported", [], timeout_ms)

func dispose(subscription_id: int) -> void:
    _active.erase(subscription_id)
    _core.dispose_subscription(subscription_id)
    _end_show(subscription_id)

## 표시 중인 광고인지(show_started 뒤 show_ended 전)
func is_showing(subscription_id: int) -> bool:
    return _showing.has(subscription_id)

func _start(bridge_method: String, options: Dictionary) -> int:
    var subscription_id := _core.create_subscription_id()
    _active[subscription_id] = bridge_method
    _core.start_event_subscription(subscription_id, bridge_method, options)
    return subscription_id

func _on_subscription_event(subscription_id: int, event: Variant) -> void:
    if not _active.has(subscription_id):
        return
    ad_event.emit(subscription_id, event)
    var type := String(event.get("type", "")) if typeof(event) == TYPE_DICTIONARY else ""
    if type == "loaded":
        ad_loaded.emit(subscription_id)
    elif SHOW_END_EVENTS.has(type):
        _end_show(subscription_id)

func _on_subscription_error(subscription_id: int, error: Dictionary) -> void:
    if not _active.has(subscription_id):
        return
    ad_failed.emit(subscription_id, error)
    _end_show(subscription_id)

func _end_show(subscription_id: int) -> void:
    if _showing.erase(subscription_id):
        show_ended.emit(subscription_id)
