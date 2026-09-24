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

var _core: AITCore
var _active: Dictionary = {}

func _init(core: AITCore) -> void:
    _core = core
    _core.subscription_event.connect(_on_subscription_event)
    _core.subscription_error.connect(_on_subscription_error)

func load_admob(options: Dictionary = {}) -> int:
    return _start("GoogleAdMob.loadAppsInTossAdMob", options)

func show_admob(options: Dictionary = {}) -> int:
    return _start("GoogleAdMob.showAppsInTossAdMob", options)

func is_admob_loaded_and_wait(options: Dictionary = {}, timeout_ms: int = 0) -> Dictionary:
    return await _core.invoke_and_wait("GoogleAdMob.isAppsInTossAdMobLoaded", [options], timeout_ms)

func dispose(subscription_id: int) -> void:
    _active.erase(subscription_id)
    _core.dispose_subscription(subscription_id)

func _start(path: String, options: Dictionary) -> int:
    var subscription_id := _core.create_subscription_id()
    _active[subscription_id] = path
    _core.start_path_subscription(subscription_id, path, options)
    return subscription_id

func _on_subscription_event(subscription_id: int, event: Variant) -> void:
    if not _active.has(subscription_id):
        return
    admob_event.emit(subscription_id, event)
    if typeof(event) == TYPE_DICTIONARY and String(event.get("type", "")) == "loaded":
        admob_loaded.emit(subscription_id)

func _on_subscription_error(subscription_id: int, error: Dictionary) -> void:
    if not _active.has(subscription_id):
        return
    admob_failed.emit(subscription_id, error)
