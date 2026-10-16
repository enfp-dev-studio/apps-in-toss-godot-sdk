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
    var document: Variant = JavaScriptBridge.get_interface("document")
    if document == null:
        return true
    return String(document.visibilityState) == "visible"

func start_listening() -> void:
    if _listening or not OS.has_feature("web"):
        return
    _listening = true
    _callback = JavaScriptBridge.create_callback(_on_visibility_event)
    var document: Variant = JavaScriptBridge.get_interface("document")
    if document != null:
        document.addEventListener("visibilitychange", _callback)

func stop_listening() -> void:
    if not _listening or not OS.has_feature("web"):
        return
    _listening = false
    var document: Variant = JavaScriptBridge.get_interface("document")
    if document != null and _callback != null:
        document.removeEventListener("visibilitychange", _callback)
    _callback = null

func _on_visibility_event(_args: Array) -> void:
    visibility_changed.emit(is_visible())
