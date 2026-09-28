extends RefCounted
class_name AITAppEvents

## WebView 가시성(백/포그라운드) 변화를 전달하는 모듈입니다.
## 커뮤니티 사례: 앱이 백그라운드로 가도 BGM이 계속 재생되어,
## document.visibilitychange를 구독해 게임을 멈춰야 합니다(웹뷰 SDK에는 있고
## 엔진 래퍼에만 없던 기능이라 Unity SDK도 별도 helper로 제공합니다).
## 웹 빌드가 아니면 신호가 없고 is_visible()은 항상 true입니다.

signal visibility_changed(is_visible: bool)

var _callback: JavaScriptObject
var _listening := false

func _init() -> void:
    start_listening()

func is_visible() -> bool:
    if not OS.has_feature("web"):
        return true
    return bool(JavaScriptBridge.eval("document.visibilityState === 'visible'", true))

func start_listening() -> void:
    if _listening or not OS.has_feature("web"):
        return
    _listening = true
    _callback = JavaScriptBridge.create_callback(_on_visibility_event)
    JavaScriptBridge.get_interface("window").__ait_visibility_callback = _callback
    JavaScriptBridge.eval(
        "window.__ait_visibility_listener = function () {" +
        " window.__ait_visibility_callback(document.visibilityState === 'visible');" +
        "}; document.addEventListener('visibilitychange', window.__ait_visibility_listener);"
    )

func stop_listening() -> void:
    if not _listening or not OS.has_feature("web"):
        return
    _listening = false
    JavaScriptBridge.eval(
        "if (window.__ait_visibility_listener) {" +
        " document.removeEventListener('visibilitychange', window.__ait_visibility_listener);" +
        " delete window.__ait_visibility_listener; delete window.__ait_visibility_callback;" +
        "}"
    )
    _callback = null

func _on_visibility_event(args: Array) -> void:
    visibility_changed.emit(args.is_empty() or bool(args[0]))
