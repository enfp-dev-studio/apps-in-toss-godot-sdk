extends RefCounted
class_name AITAds

## Apps in Toss 전면 광고 API를 Unity SDK의 이벤트 콜백 형태로 감싼 모듈입니다.
## 광고 그룹 ID는 앱인토스 콘솔에서 발급한 값을 options.adGroupId로 넘겨야 합니다.

signal ad_loaded(subscription_id: int)
signal ad_event(subscription_id: int, event: Variant)
signal ad_failed(subscription_id: int, error: Dictionary)

var _core: AITCore
var _active: Dictionary = {}

func _init(core: AITCore) -> void:
    _core = core
    _core.subscription_event.connect(_on_subscription_event)
    _core.subscription_error.connect(_on_subscription_error)

func load_full_screen_ad(options: Dictionary = {}) -> int:
    return _start("adsLoadFullScreenAd", options)

func show_full_screen_ad(options: Dictionary = {}) -> int:
    return _start("adsShowFullScreenAd", options)

func is_load_full_screen_ad_supported_and_wait(timeout_ms: int = 0) -> Dictionary:
    return await _core.invoke_and_wait("loadFullScreenAd.isSupported", [], timeout_ms)

func is_show_full_screen_ad_supported_and_wait(timeout_ms: int = 0) -> Dictionary:
    return await _core.invoke_and_wait("showFullScreenAd.isSupported", [], timeout_ms)

func dispose(subscription_id: int) -> void:
    _active.erase(subscription_id)
    _core.dispose_subscription(subscription_id)

func _start(bridge_method: String, options: Dictionary) -> int:
    var subscription_id := _core.create_subscription_id()
    _active[subscription_id] = bridge_method
    _core.start_event_subscription(subscription_id, bridge_method, options)
    return subscription_id

func _on_subscription_event(subscription_id: int, event: Variant) -> void:
    if not _active.has(subscription_id):
        return
    ad_event.emit(subscription_id, event)
    if typeof(event) == TYPE_DICTIONARY and String(event.get("type", "")) == "loaded":
        ad_loaded.emit(subscription_id)

func _on_subscription_error(subscription_id: int, error: Dictionary) -> void:
    if not _active.has(subscription_id):
        return
    ad_failed.emit(subscription_id, error)
