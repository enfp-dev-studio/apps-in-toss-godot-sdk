extends RefCounted
class_name AITShowGuard

## 광고 보여 주기 보호. 표시한 광고의 dismissed·failedToShow가 끝내 오지 않으면(2026-10-08 AdMob 장애 등)
## show_ended가 오지 않아 사운드 게이트의 "ad:<id>"가 풀리지 않고 게임이 멈춘 채로 남습니다.
## 보이는 상태로 idle_seconds 동안 이벤트가 없거나, 표시 중에 화면을 떠났다가 돌아온 뒤 return_seconds가
## 지나도 끝나지 않으면 끝난 것으로 봅니다. 0이면 그 규칙을 쓰지 않습니다.
## AIT.ads·AIT.admob이 씁니다. 끝낼 때는 ad_event/admob_event로 {"type": "showGuardEnded", "reason": ...}를
## 보낸 뒤 show_ended를 보냅니다(늦게 온 dismissed는 그대로 전달되지만 show_ended는 다시 오지 않습니다).

var idle_seconds := 90.0
var return_seconds := 3.0

var _expire: Callable
var _app_events: AITAppEvents
var _last_event := {}  # subscription_id -> msec
var _left := {}        # 표시 중에 화면을 떠난 구독
var _returned_at := {} # subscription_id -> 돌아온 msec


func _init(expire: Callable) -> void:
    _expire = expire


func attach_app_events(app_events: AITAppEvents) -> void:
    if _app_events != null and _app_events.visibility_changed.is_connected(_on_visibility):
        _app_events.visibility_changed.disconnect(_on_visibility)
    _app_events = app_events
    if _app_events != null:
        _app_events.visibility_changed.connect(_on_visibility)


func start(subscription_id: int) -> void:
    _last_event[subscription_id] = Time.get_ticks_msec()
    _watch(subscription_id)


func touch(subscription_id: int) -> void:
    if _last_event.has(subscription_id):
        _last_event[subscription_id] = Time.get_ticks_msec()


func stop(subscription_id: int) -> void:
    _last_event.erase(subscription_id)
    _left.erase(subscription_id)
    _returned_at.erase(subscription_id)


func is_watching(subscription_id: int) -> bool:
    return _last_event.has(subscription_id)


func _visible() -> bool:
    return _app_events == null or _app_events.is_visible()


func _on_visibility(is_visible: bool) -> void:
    for id: int in _last_event.keys():
        if not is_visible:
            _left[id] = true
            _returned_at.erase(id)
        elif _left.has(id):
            _returned_at[id] = Time.get_ticks_msec()


func _watch(subscription_id: int) -> void:
    var tree := Engine.get_main_loop() as SceneTree
    if tree == null:
        return
    while _last_event.has(subscription_id):
        # 게임이 광고 중에 트리를 멈춰도 돌아가야 한다(process_always, 시간 배율 무시).
        await tree.create_timer(0.25, true, false, true).timeout
        if not _last_event.has(subscription_id):
            return
        var now := Time.get_ticks_msec()
        if return_seconds > 0.0 and _returned_at.has(subscription_id) and now - int(_returned_at[subscription_id]) >= int(return_seconds * 1000.0):
            _end(subscription_id, "returned")
        elif idle_seconds > 0.0 and _visible() and not _returned_at.has(subscription_id) and now - int(_last_event[subscription_id]) >= int(idle_seconds * 1000.0):
            _end(subscription_id, "idle")


func _end(subscription_id: int, reason: String) -> void:
    stop(subscription_id)
    _expire.call(subscription_id, reason)
