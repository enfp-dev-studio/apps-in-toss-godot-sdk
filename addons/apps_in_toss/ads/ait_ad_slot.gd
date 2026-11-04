extends RefCounted
class_name AITAdSlot

## 광고 그룹 하나를 미리 불러 두고 보여 주는 도우미(전면·보상형 공통). AIT.ads나 AIT.admob 위에서 동작합니다.
##   var reward := AITAdSlot.new(AIT.admob, "콘솔 광고 그룹 ID")
##   reward.finished.connect(func(result, _event): if result == "rewarded": give_reward())
##   reward.load_ad()       # 시작할 때 미리 불러 두기
##   if reward.is_ready(): reward.show_ad()
##
## - 한 번에 하나만 불러옵니다. 모든 슬롯이 줄을 서서 차례로 load를 부릅니다(안드로이드 토스 5.266.0에서
##   동시에 부르면 이벤트가 오지 않는다는 공식 FAQ). 같은 슬롯이나 같은 광고 그룹 ID를 쓰는 다른 슬롯이
##   불러오는 중·불러 둔 상태면 다시 부르지 않습니다.
## - 불러오기 제한 시간(load_timeout_sec, 기본 75초 — AdMob이 60초 걸린 사례)에 응답이 없으면 그 구독을 끊고
##   retry_delays 간격으로 다시 부릅니다. 모두 실패하면 load_failed를 보냅니다. 토스 답변(커뮤니티 5057)대로
##   불러오기는 느릴 수 있으니 제한 시간을 짧게 줄이지 마세요. 0이면 제한 시간 없이 기다립니다.
## - 보여 준 광고가 끝나면(닫힘·실패·보여 주기 보호) finished(result, event)를 보내고, auto_reload면 그 뒤에
##   다음 광고를 불러옵니다(닫히기 전에 다음 광고를 부르지 않습니다 — 커뮤니티 5091).
##   result: "rewarded"(userEarnedReward 받음), "closed"(닫힘), "not_shown"(impression 없이 끝남 — 광고가
##   안 나왔으니 "끝까지 안 봤어요"가 아니라 "광고가 안 나왔어요"로 안내), "failed"(failedToShow·오류).
##   보상은 "rewarded"에서만 주세요(dismissed 기준으로 주면 장애 때 누락됩니다).

signal loaded
signal load_failed(error: Dictionary)
signal finished(result: String, event: Dictionary)

const SHOWN_EVENTS := ["show", "impression"]

static var _queue: Array[AITAdSlot] = []
static var _loading: AITAdSlot = null

var ad_group_id := ""
var load_timeout_sec := 75.0
var retry_delays: Array[float] = [2.0, 4.0, 8.0, 16.0, 32.0]
var auto_reload := true
## "idle" / "queued" / "loading" / "waiting"(다시 부르기 전) / "ready" / "showing"
var state := "idle"

var _module: Object
var _admob := false
var _load_id := -1
var _show_id := -1
var _attempt := 0
var _token := 0
var _shown := false
var _rewarded := false
var _failed := false
var _last_event: Dictionary = {}


func _init(module: Object, group_id: String) -> void:
    _module = module
    _admob = module is AITAdMob
    ad_group_id = group_id
    if _admob:
        _module.admob_loaded.connect(_on_loaded)
        _module.admob_event.connect(_on_event)
        _module.admob_failed.connect(_on_failed)
    else:
        _module.ad_loaded.connect(_on_loaded)
        _module.ad_event.connect(_on_event)
        _module.ad_failed.connect(_on_failed)
    _module.show_ended.connect(_on_show_ended)


func is_ready() -> bool:
    return state == "ready"


## 불러오기를 줄에 세웁니다. 이미 불러오는 중이거나 불러 둔 상태면 아무것도 하지 않습니다
func load_ad() -> void:
    if state != "idle":
        return
    if _group_busy():
        push_warning("AITAdSlot: 광고 그룹 %s를 다른 슬롯이 이미 불러오고 있어 건너뜁니다." % ad_group_id)
        return
    _attempt = 0
    _enqueue()


## 불러 둔 광고를 보여 줍니다. 준비되지 않았으면 false
func show_ad() -> bool:
    if state != "ready":
        return false
    state = "showing"
    _shown = false
    _rewarded = false
    _failed = false
    _last_event = {}
    var options := {"adGroupId": ad_group_id}
    _show_id = _module.show_admob(options) if _admob else _module.show_full_screen_ad(options)
    return true


## 불러오기·표시를 멈추고 줄에서 뺍니다
func cancel() -> void:
    _token += 1
    _queue.erase(self)
    if _load_id != -1:
        _module.dispose(_load_id)
        _load_id = -1
    if _show_id != -1:
        _module.dispose(_show_id)
        _show_id = -1
    state = "idle"
    _release()


func _group_busy() -> bool:
    for slot in _queue:
        if slot != self and slot.ad_group_id == ad_group_id:
            return true
    return _loading != null and _loading != self and _loading.ad_group_id == ad_group_id


func _enqueue() -> void:
    state = "queued"
    if not _queue.has(self):
        _queue.append(self)
    AITAdSlot._pump()


static func _pump() -> void:
    while _loading == null and not _queue.is_empty():
        var next: AITAdSlot = _queue.pop_front()
        if next.state == "queued":
            _loading = next
            next._begin_load()


func _release() -> void:
    if _loading == self:
        _loading = null
        AITAdSlot._pump()


func _begin_load() -> void:
    state = "loading"
    _token += 1
    var token := _token
    var options := {"adGroupId": ad_group_id}
    _load_id = _module.load_admob(options) if _admob else _module.load_full_screen_ad(options)
    if load_timeout_sec <= 0.0:
        return
    var tree := Engine.get_main_loop() as SceneTree
    if tree == null:
        return
    await tree.create_timer(load_timeout_sec, true, false, true).timeout
    if token == _token and state == "loading":
        _retry_or_fail({"code": "AIT_AD_LOAD_TIMEOUT", "message": "광고를 %d초 안에 불러오지 못했습니다." % int(load_timeout_sec)})


func _retry_or_fail(error: Dictionary) -> void:
    if _load_id != -1:
        _module.dispose(_load_id)
        _load_id = -1
    _release()
    if _attempt >= retry_delays.size():
        state = "idle"
        load_failed.emit(error)
        return
    state = "waiting"
    _token += 1
    var token := _token
    var delay: float = retry_delays[_attempt]
    _attempt += 1
    var tree := Engine.get_main_loop() as SceneTree
    if tree != null and delay > 0.0:
        await tree.create_timer(delay, true, false, true).timeout
    if token == _token and state == "waiting":
        _enqueue()


func _on_loaded(subscription_id: int) -> void:
    if subscription_id != _load_id:
        return
    _module.dispose(_load_id)
    _load_id = -1
    _token += 1
    state = "ready"
    _release()
    loaded.emit()


func _on_failed(subscription_id: int, error: Dictionary) -> void:
    if subscription_id == _load_id and state == "loading":
        _token += 1
        _retry_or_fail(error)
    elif subscription_id == _show_id:
        _failed = true
        _last_event = error


func _on_event(subscription_id: int, event: Variant) -> void:
    if subscription_id != _show_id or typeof(event) != TYPE_DICTIONARY:
        return
    var type := String(event.get("type", ""))
    _last_event = event
    if SHOWN_EVENTS.has(type):
        _shown = true
    elif type == "userEarnedReward":
        _rewarded = true
    elif type == "failedToShow":
        _failed = true


func _on_show_ended(subscription_id: int) -> void:
    if subscription_id != _show_id:
        return
    _module.dispose(_show_id)
    _show_id = -1
    state = "idle"
    var result := "closed"
    if _rewarded:
        result = "rewarded"
    elif _failed:
        result = "failed"
    elif not _shown:
        result = "not_shown"
    finished.emit(result, _last_event)
    if auto_reload:
        load_ad()
