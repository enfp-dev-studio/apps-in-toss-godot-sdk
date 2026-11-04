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
##
## iOS는 백그라운드에서 돌아와도 Web Audio가 멈춘 채라 화면을 누를 때까지 소리가 안 나고, 누르면 밀린 소리가
## 한꺼번에 납니다. enable_audio_recovery()를 켜면 떠날 때 소리를 줄여 직접 멈추고, 돌아온 뒤 첫 터치에
## 다시 켜며, 그래도 멈춰 있으면 오디오 컨텍스트를 새로 만듭니다(실기기 미검증, 기본 꺼짐).
## 새로 만들면 재생 중이던 소리가 끝난 것으로 처리되므로, 등록한 플레이어는 게이트가 닫힐 때의 자리에서
## 다시 틀고 audio_renewed를 보냅니다. 등록하지 않은 플레이어는 이 신호를 받아 게임이 다시 트세요.
##
## 웹(Godot 4.7)에서 AudioServer.add_bus()·move_bus()를 부르면 버스 순서가 섞여 모든 소리가 사라질 수 있습니다
## (godot#119026, 4.8에서 수정). 버스는 default_bus_layout.tres에 두거나 ensure_bus()로 만드세요.

signal changed(silenced: bool)
## 오디오 컨텍스트를 새로 만든 뒤(등록한 플레이어를 다시 튼 다음) 보냅니다
signal audio_renewed

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
# 게이트가 닫힐 때 재생 중이던 등록 플레이어: player -> [stream, position]
var _resume_points := {}


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
    _resume_points.erase(player)


## iOS 복귀 소리 복구를 켭니다(웹 빌드에서만, 실기기 미검증). enable()과 따로 켭니다.
func enable_audio_recovery(on := true) -> void:
    if not OS.has_feature("web"):
        return
    var bridge: Variant = JavaScriptBridge.get_interface("AppsInTossGodot")
    if bridge != null and bool(bridge.hasBridgeMethod("audioRecovery")):
        bridge.audioRecovery(on)


## 이름으로 버스를 찾고, 없으면 끝에 만들어 인덱스를 돌려줍니다. 웹에서 AudioServer.add_bus()를
## 부르면 소리가 모두 사라질 수 있어(godot#119026) bus_count를 늘려 붙입니다.
static func ensure_bus(bus_name: StringName, send: StringName = &"Master") -> int:
    var index := AudioServer.get_bus_index(bus_name)
    if index != -1:
        return index
    index = AudioServer.bus_count
    AudioServer.bus_count = index + 1
    AudioServer.set_bus_name(index, bus_name)
    if send != &"":
        AudioServer.set_bus_send(index, send)
    return index


func _wire(on: bool) -> void:
    var pairs: Array = []
    if _app_events != null:
        pairs.append([_app_events.visibility_changed, _on_visibility])
        pairs.append([_app_events.audio_event, _on_audio_event])
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
    if mute and not _silenced:
        _remember_players()
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


func _remember_players() -> void:
    _resume_points.clear()
    for p in _players:
        if is_instance_valid(p) and bool(p.get("playing")) and not bool(p.get("stream_paused")):
            _resume_points[p] = [p.get("stream"), float(p.call("get_playback_position"))]


func _on_audio_event(state: String) -> void:
    if state != "renewed":
        return
    for p: Variant in _resume_points.keys():
        if not is_instance_valid(p) or not _players.has(p):
            continue
        var point: Array = _resume_points[p]
        if p.get("stream") != point[0] or bool(p.get("playing")):
            continue
        p.call("play", point[1])
        if _silenced:
            p.set("stream_paused", true)
    _resume_points.clear()
    audio_renewed.emit()


func _on_ad_started(subscription_id: int) -> void:
    silence("ad:%d" % subscription_id)


func _on_ad_ended(subscription_id: int) -> void:
    unsilence("ad:%d" % subscription_id)


func _on_order_started(subscription_id: int) -> void:
    silence("iap:%d" % subscription_id)


func _on_order_ended(subscription_id: int) -> void:
    unsilence("iap:%d" % subscription_id)
