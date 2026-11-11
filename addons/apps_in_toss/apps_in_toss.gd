extends Node
class_name AppsInToss

var core: AITCore
var auth: AITAuth
var iap: AITIAP
var ads: AITAds
var admob: AITAdMob
var banner: AITBannerAd
var game: AITGame
var events: AITEvents
var status: AITStatus
var app_events: AITAppEvents
var back: AITBack
var safe_area: AITSafeArea
var sound: AITSoundGate
var runtime_log: AITRuntimeLog
var sentry: AITSentry
var user_files: AITUserFiles
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
    banner = AITBannerAd.new(core)
    game = AITGame.new(core)
    events = AITEvents.new(core)
    status = AITStatus.new(core)
    app_events = AITAppEvents.new()
    ads.attach_app_events(app_events)
    admob.attach_app_events(app_events)
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
    runtime_log = AITRuntimeLog.new(core)
    runtime_log.name = "RuntimeLog"
    add_child(runtime_log)
    app_events.visibility_changed.connect(runtime_log.on_visibility_changed)
    sentry = AITSentry.new(core)
    sentry.name = "Sentry"
    add_child(sentry)
    runtime_log.error_logged.connect(sentry.capture_godot_error)
    user_files = AITUserFiles.new(core)
    user_files.name = "UserFiles"
    add_child(user_files)
    app_events.visibility_changed.connect(user_files.on_visibility_changed)

func is_available() -> bool:
    return core != null and core.is_available()

func invoke(path: String, args: Array = []) -> int:
    return core.invoke(path, args)

func invoke_and_wait(path: String, args: Array = [], timeout_ms: int = 0) -> Dictionary:
    return await core.invoke_and_wait(path, args, timeout_ms)

## SDK 버전 "0.2.0"(Unity AITVersion.Version)
func sdk_version() -> String:
    return AITVersion.VERSION

## 페이지의 window.devicePixelRatio(Unity GetDevicePixelRatio). Web이 아니면 1.0
func get_device_pixel_ratio() -> float:
    if not OS.has_feature("web"):
        return 1.0
    var window: Variant = JavaScriptBridge.get_interface("window")
    return float(window.devicePixelRatio) if window != null else 1.0
