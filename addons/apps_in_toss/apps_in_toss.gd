extends Node
class_name AppsInToss

var core: AITCore
var auth: AITAuth
var iap: AITIAP
var ads: AITAds
var admob: AITAdMob
var game: AITGame
var status: AITStatus
var app_events: AITAppEvents
var back: AITBack
var safe_area: AITSafeArea
var sound: AITSoundGate
var api: AITGeneratedAPI

func _ready() -> void:
    if core != null:
        return
    core = AITCore.new()
    core.name = "Core"
    add_child(core)
    auth = AITAuth.new(core)
    iap = AITIAP.new(core)
    ads = AITAds.new(core)
    admob = AITAdMob.new(core)
    game = AITGame.new(core)
    status = AITStatus.new(core)
    app_events = AITAppEvents.new()
    api = AITGeneratedAPI.new(core)
    back = AITBack.new(core)
    back.name = "Back"
    add_child(back)
    safe_area = AITSafeArea.new(core)
    safe_area.name = "SafeArea"
    add_child(safe_area)
    sound = AITSoundGate.new(app_events, ads, admob, iap)
    sound.name = "Sound"
    add_child(sound)

func is_available() -> bool:
    return core != null and core.is_available()

func invoke(path: String, args: Array = []) -> int:
    return core.invoke(path, args)

func invoke_and_wait(path: String, args: Array = [], timeout_ms: int = 0) -> Dictionary:
    return await core.invoke_and_wait(path, args, timeout_ms)
