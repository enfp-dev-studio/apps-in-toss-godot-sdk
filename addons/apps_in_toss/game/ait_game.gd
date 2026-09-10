extends RefCounted
class_name AITGame

## Unity SDK의 GameCenter 카테고리에 대응하는 게임 모듈입니다.
## 리더보드·프로필은 await형으로, 게임 정보 오버레이가 사라지는 시점은
## 전면 광고와 같은 구독형 이벤트로 제공합니다.

signal info_overlay_hidden(subscription_id: int)
signal overlay_subscription_failed(subscription_id: int, error: Dictionary)

var _core: AITCore
var _active: Dictionary = {}

func _init(core: AITCore) -> void:
    _core = core
    _core.subscription_event.connect(_on_subscription_event)
    _core.subscription_error.connect(_on_subscription_error)

func open_leaderboard_and_wait(timeout_ms: int = 0) -> Dictionary:
    return await _core.invoke_and_wait("Game.openLeaderboard", [], timeout_ms)

func set_leaderboard_score_and_wait(score: String, timeout_ms: int = 0) -> Dictionary:
    return await _core.invoke_and_wait("Game.setLeaderboardScore", [{"score": score}], timeout_ms)

func get_user_profile_and_wait(timeout_ms: int = 0) -> Dictionary:
    return await _core.invoke_and_wait("Game.getUserProfile", [], timeout_ms)

func subscribe_info_overlay_hidden() -> int:
    var subscription_id := _core.create_subscription_id()
    _active[subscription_id] = true
    _core.start_path_subscription(subscription_id, "Game.subscribeInfoOverlayHidden")
    return subscription_id

func dispose(subscription_id: int) -> void:
    _active.erase(subscription_id)
    _core.dispose_subscription(subscription_id)

func _on_subscription_event(subscription_id: int, _event: Variant) -> void:
    if not _active.has(subscription_id):
        return
    info_overlay_hidden.emit(subscription_id)

func _on_subscription_error(subscription_id: int, error: Dictionary) -> void:
    if not _active.has(subscription_id):
        return
    overlay_subscription_failed.emit(subscription_id, error)
