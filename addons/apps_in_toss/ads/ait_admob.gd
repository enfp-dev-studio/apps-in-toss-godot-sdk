extends RefCounted
class_name AITAdMob

## Google AdMob(앱인토스) API를 Unity SDK의 이벤트 콜백 형태로 감싼 모듈입니다.
##
## Upstream(web-framework)의 loadAppsInTossAdMob / showAppsInTossAdMob은
## 구독형 API({ options, onEvent, onError } => disposer)라서, 자동 생성된
## one-shot invoke 래퍼(AITGeneratedAPI.admob_load / admob_show)로는 호출할 수
## 없습니다. AdMob은 항상 이 모듈을 쓰세요.
##
## - load_admob(options): 로드되면 admob_loaded, 그 외 진행 상황은 admob_event.
##   options 예: {"adGroupId": "콘솔 광고 그룹 ID"} (선택: "referrer")
## - show_admob(options): 노출 이벤트(show/clicked/dismissed/userEarnedReward 등)는
##   admob_event로 전달됩니다. options 예: {"adGroupId": "콘솔 광고 그룹 ID"}
## - is_admob_loaded_and_wait(options): 캐시된 노출 가능 여부를 await로 확인.
## 실제 광고는 토스 앱에서 확인합니다. mock 개발 빌드는 mock 응답을 돌려주고,
## 브리지가 없는 에디터/브라우저에서는 AIT_BRIDGE_UNAVAILABLE 에러가 옵니다.

signal admob_loaded(subscription_id: int)
signal admob_event(subscription_id: int, event: Variant)
signal admob_failed(subscription_id: int, error: Dictionary)
## show_admob을 부른 때부터 닫힘(dismissed)·실패(failedToShow·오류)·dispose까지.
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

func load_admob(options: Dictionary = {}) -> int:
    return _start("GoogleAdMob.loadAppsInTossAdMob", options)

func show_admob(options: Dictionary = {}) -> int:
    var subscription_id := _start("GoogleAdMob.showAppsInTossAdMob", options)
    _showing[subscription_id] = true
    show_started.emit(subscription_id)
    return subscription_id

func is_admob_loaded_and_wait(options: Dictionary = {}, timeout_ms: int = 0) -> Dictionary:
    return await _core.invoke_and_wait("GoogleAdMob.isAppsInTossAdMobLoaded", [options], timeout_ms)

func dispose(subscription_id: int) -> void:
    _active.erase(subscription_id)
    _core.dispose_subscription(subscription_id)
    _end_show(subscription_id)

## 표시 중인 광고인지(show_started 뒤 show_ended 전)
func is_showing(subscription_id: int) -> bool:
    return _showing.has(subscription_id)

func _start(path: String, options: Dictionary) -> int:
    var subscription_id := _core.create_subscription_id()
    _active[subscription_id] = path
    _core.start_path_subscription(subscription_id, path, options)
    return subscription_id

func _on_subscription_event(subscription_id: int, event: Variant) -> void:
    if not _active.has(subscription_id):
        return
    admob_event.emit(subscription_id, event)
    var type := String(event.get("type", "")) if typeof(event) == TYPE_DICTIONARY else ""
    if type == "loaded":
        admob_loaded.emit(subscription_id)
    elif SHOW_END_EVENTS.has(type):
        _end_show(subscription_id)

func _on_subscription_error(subscription_id: int, error: Dictionary) -> void:
    if not _active.has(subscription_id):
        return
    admob_failed.emit(subscription_id, error)
    _end_show(subscription_id)

func _end_show(subscription_id: int) -> void:
    if _showing.erase(subscription_id):
        show_ended.emit(subscription_id)
