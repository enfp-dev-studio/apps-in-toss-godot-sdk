extends Node
class_name AITSoundGate

## 사운드 게이트: 소리를 멈춰야 하는 이유를 집합으로 들고, 하나라도 남아 있으면 Master 버스를 끕니다.
## enable()을 불러야 동작합니다(기본은 꺼져 있어 기존 게임의 소리 처리는 그대로입니다).
## 켜면 다음 이유를 자동으로 넣고 뺍니다(출시 체크리스트: 백그라운드 즉시 정지·복귀 시 재생,
## 광고·결제 중 음악 일시 정지, 광고가 끝나면 다시 재생).
##   "hidden"     WebView가 백그라운드일 때(AIT.app_events)
##   "ad:<id>"    AIT.ads.show_full_screen_ad / AIT.admob.show_admob 표시부터 닫힘·실패·dispose까지
##   "iap:<id>"   AIT.iap 주문 시작부터 결과·dispose까지
## 광고 중에 앱이 다시 보여도 광고가 끝나기 전에는 켜지지 않습니다. 게임 상태로 멈출 때는
## silence("내 이유")/unsilence("내 이유")를 씁니다.
## 효과음·배경음 끄기 같은 설정은 Master가 아니라 각자의 버스로 두세요(게이트가 Master를 다시 켭니다).
## track_player()로 등록한 플레이어는 멈춘 자리에서 이어 틉니다(배경음 등).

signal changed(silenced: bool)

const HIDDEN := "hidden"

var enabled := false
var bus_index := 0

var _app_events: AITAppEvents
var _ads: AITAds
var _admob: AITAdMob
var _iap: AITIAP
var _reasons := {}
var _players: Array[Node] = []
var _silenced := false


# AIT 오토로드(AppsInToss)가 모듈을 넘겨 만듭니다. 넘기지 않은 모듈의 이유는 자동으로 들지 않습니다.
func _init(app_events: AITAppEvents = null, ads: AITAds = null, admob: AITAdMob = null, iap: AITIAP = null) -> void:
    _app_events = app_events
    _ads = ads
    _admob = admob
    _iap = iap


func enable() -> void:
    if enabled:
        return
    enabled = true
    _wire(true)
    if _app_events != null and not _app_events.is_visible():
        _reasons[HIDDEN] = true
    _apply()


## 끄면 모든 이유를 지우고 버스를 다시 켭니다
func disable() -> void:
    if not enabled:
        return
    enabled = false
    _wire(false)
    _reasons.clear()
    _apply()


func silence(reason: String) -> void:
    _reasons[reason] = true
    _apply()


func unsilence(reason: String) -> void:
    if _reasons.erase(reason):
        _apply()


func is_silenced() -> bool:
    return _silenced


func reasons() -> Array:
    return _reasons.keys()


## 게이트가 닫히는 동안 멈췄다가 같은 자리에서 이어 틀 플레이어(AudioStreamPlayer·2D·3D)
func track_player(player: Node) -> void:
    if player != null and "stream_paused" in player and not _players.has(player):
        _players.append(player)
        if _silenced and bool(player.get("playing")):
            player.set("stream_paused", true)


func untrack_player(player: Node) -> void:
    _players.erase(player)


func _wire(on: bool) -> void:
    var pairs: Array = []
    if _app_events != null:
        pairs.append([_app_events.visibility_changed, _on_visibility])
    for ads_module: Object in [_ads, _admob]:
        if ads_module != null:
            pairs.append([ads_module.show_started, _on_ad_started])
            pairs.append([ads_module.show_ended, _on_ad_ended])
    if _iap != null:
        pairs.append([_iap.order_started, _on_order_started])
        pairs.append([_iap.order_ended, _on_order_ended])
    for pair in pairs:
        var sig: Signal = pair[0]
        if on and not sig.is_connected(pair[1]):
            sig.connect(pair[1])
        elif not on and sig.is_connected(pair[1]):
            sig.disconnect(pair[1])


func _apply() -> void:
    var mute := enabled and not _reasons.is_empty()
    if mute != _silenced:
        AudioServer.set_bus_mute(bus_index, mute)
    var alive: Array[Node] = []
    for p in _players:
        if not is_instance_valid(p):
            continue
        alive.append(p)
        if bool(p.get("playing")) or bool(p.get("stream_paused")):
            p.set("stream_paused", mute)
    _players = alive
    if mute != _silenced:
        _silenced = mute
        changed.emit(mute)


func _on_visibility(is_visible: bool) -> void:
    if is_visible:
        unsilence(HIDDEN)
    else:
        silence(HIDDEN)


func _on_ad_started(subscription_id: int) -> void:
    silence("ad:%d" % subscription_id)


func _on_ad_ended(subscription_id: int) -> void:
    unsilence("ad:%d" % subscription_id)


func _on_order_started(subscription_id: int) -> void:
    silence("iap:%d" % subscription_id)


func _on_order_ended(subscription_id: int) -> void:
    unsilence("iap:%d" % subscription_id)
