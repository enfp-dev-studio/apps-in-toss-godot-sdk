extends Node
class_name AITSentry

## Sentry 연동(Unity SDK 3.9.0 AITSentryIntegration·AITSentryAnalytics 대응).
## 게임 매니페스트에 sentry.dsn을 적은 게임만 빌드가 Sentry 브라우저 SDK(ait-sentry.js)를 넣고, 그때만 켜집니다.
##   "sentry": { "dsn": "https://…", "environment": "production", "release": "1.2.0", "sampleRate": 1 }
## 켜지면 보내는 것:
##   태그 ait.sdk_version·ait.godot_version·ait.current_scene, 앱인토스 정보(기기 ID를 사용자 ID로, OS·언어·토스 앱 판·
##   환경·배포 ID, 컨텍스트 apps_in_toss), 장면 전환 기록(breadcrumb), Godot 오류(AITRuntimeLog가 잡은 것).
##   페이지의 JS 오류는 Sentry 브라우저 SDK가 직접 잡습니다.
## track_screen·track_impression·track_click은 Analytics를 부르고(꺼져 있어도) 켜져 있으면 기록도 남깁니다.
## auto_screen_tracking = true면 장면이 바뀔 때 track_screen({ screen_name })을 부릅니다.

const UNAVAILABLE := "unavailable"
const CONTEXT_TIMEOUT_MS := 3000

var auto_screen_tracking := false
## 테스트에서 window.AppsInTossGodotSentry 대신 넣는 객체
var client: Object

var _core: AITCore
var _counts := {"screen": 0, "impression": 0, "click": 0}
var _last_screen := ""

func _init(core: AITCore) -> void:
    _core = core

func _ready() -> void:
    if client == null and OS.has_feature("web"):
        var window: Variant = JavaScriptBridge.get_interface("window")
        if window != null and window.AppsInTossGodotSentry != null:
            client = window.AppsInTossGodotSentry
    if not is_enabled():
        return
    get_tree().scene_changed.connect(_on_scene_changed)
    client.setTag("ait.sdk_version", AITVersion.full_version())
    client.setTag("ait.godot_version", String(Engine.get_version_info().get("string", "")))
    _tag_current_scene.call_deferred()
    enrich_context()

## 빌드에 Sentry가 들어 있는지(매니페스트 sentry.dsn)
func is_enabled() -> bool:
    return client != null

func track_screen(params: Dictionary = {}) -> Dictionary:
    return await _track("Analytics.screen", "screen", params)

func track_impression(params: Dictionary = {}) -> Dictionary:
    return await _track("Analytics.impression", "impression", params)

func track_click(params: Dictionary = {}) -> Dictionary:
    return await _track("Analytics.click", "click", params)

## AITRuntimeLog.error_logged에서 받습니다
func capture_godot_error(message: String, stack: String, kind: String) -> void:
    if is_enabled():
        client.captureGodotError(JSON.stringify({"message": message, "stack_trace": stack, "kind": kind}))

## 앱인토스 정보를 모아 태그·사용자·컨텍스트로 붙입니다(시작할 때 한 번)
func enrich_context() -> void:
    var context := {
        "sdk_version": AITVersion.full_version(),
        "godot_version": String(Engine.get_version_info().get("string", "")),
        "device_id": await _value("getDeviceId"),
        "platform_os": await _value("getPlatformOS"),
        "locale": await _value("getLocale"),
        "toss_app_version": await _value("getTossAppVersion"),
        "environment": await _value("getOperationalEnvironment"),
        "deployment_id": await _value("env.getDeploymentId"),
    }
    if not is_enabled():
        return
    if context["device_id"] != UNAVAILABLE:
        client.setTag("ait.device_id", context["device_id"])
        client.setUser(JSON.stringify({"id": context["device_id"]}))
    for key in ["platform_os", "locale", "toss_app_version", "environment", "deployment_id"]:
        if context[key] != UNAVAILABLE and context[key] != "":
            client.setTag("ait." + key, context[key])
    client.setContext("apps_in_toss", JSON.stringify(context))

func _value(path: String) -> String:
    var response: Dictionary = await _core.invoke_and_wait(path, [], CONTEXT_TIMEOUT_MS)
    if not bool(response.get("ok", false)) or response.get("result") == null:
        return UNAVAILABLE
    return String(response.get("result"))

func _track(path: String, type: String, params: Dictionary) -> Dictionary:
    var response: Dictionary = await _core.invoke_and_wait(path, [params])
    _counts[type] += 1
    var scene := get_tree().current_scene if is_inside_tree() else null
    if type == "screen":
        _last_screen = String(scene.name) if scene != null else "unknown"
    if is_enabled():
        client.addBreadcrumb(JSON.stringify({"category": "analytics", "message": type, "level": "info", "data": {"type": type, "params": params}}))
        client.setContext("ait_analytics", JSON.stringify({
            "screen_count": _counts["screen"],
            "impression_count": _counts["impression"],
            "click_count": _counts["click"],
            "last_screen": _last_screen,
        }))
    return response

func _on_scene_changed() -> void:
    var scene := get_tree().current_scene
    var name := String(scene.name) if scene != null else ""
    client.addBreadcrumb(JSON.stringify({
        "category": "scene",
        "message": "Scene loaded: %s" % name,
        "level": "info",
        "data": {"scene_name": name, "scene_path": scene.scene_file_path if scene != null else ""},
    }))
    client.setTag("ait.current_scene", name)
    if auto_screen_tracking:
        track_screen({"screen_name": name})

func _tag_current_scene() -> void:
    var scene := get_tree().current_scene
    if scene != null:
        client.setTag("ait.current_scene", String(scene.name))
