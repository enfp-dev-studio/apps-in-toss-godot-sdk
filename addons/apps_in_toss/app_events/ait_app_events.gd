extends RefCounted
class_name AITAppEvents

## WebView 화면 떠남·돌아옴(백/포그라운드)을 알리는 모듈입니다.
## 토스 WebView에서는 visibilitychange만으로 놓치는 경우가 있었습니다(hidden만 오고 visible이 오지 않음,
## 처음부터 hidden이라 이벤트가 없음, iOS 18.7은 AudioContext interrupted가 hidden보다 먼저 옴).
## 그래서 브리지(web-runtime)가 visibilitychange·pagehide·pageshow·blur·focus·AudioContext 끊김·터치를
## 모으고, 상태를 바꾼 첫 신호 하나만 씁니다. 화면을 누르고 손을 떼면 돌아온 것으로 봅니다.
## 브리지가 없으면 visibilitychange만 듣습니다. 웹 빌드가 아니면 신호가 없고 is_visible()은 항상 true입니다.
## 앱인토스 SDK에는 앱 닫힘·종료 이벤트가 없습니다. 저장은 화면을 떠날 때(visibility_changed(false)) 하세요.

signal visibility_changed(is_visible: bool)
## 상태가 바뀔 때 어떤 신호로 정했는지 함께 알립니다.
## source: "visibilitychange", "pagehide", "pageshow", "blur", "focus", "audio-interrupted", "audio-suspended", "touch"
signal life_changed(is_visible: bool, source: String)
## 소리 컨텍스트 소식(AIT.sound.enable_audio_recovery()를 켰을 때): "resumed"(돌아와 다시 남),
## "renewed"(새로 만듦 — 재생 중이던 소리는 끝난 것으로 처리됨), "failed"
signal audio_event(state: String)

## 마지막으로 상태를 정한 신호
var last_source := ""

var _callback: JavaScriptObject
var _listening := false
var _runtime := false
var _visible := true

func _init() -> void:
    start_listening()

func is_visible() -> bool:
    if not OS.has_feature("web"):
        return true
    if _runtime:
        return _visible
    return _document_visible()

## 브리지가 모은 최근 신호(진단용). { state, source, recovery, signals: [{ signal, state, at, used }] }
func runtime_state() -> Dictionary:
    var bridge := _bridge()
    if bridge == null or not bool(bridge.hasBridgeMethod("runtimeState")):
        return {}
    var parsed: Variant = JSON.parse_string(String(bridge.runtimeState()))
    return parsed if typeof(parsed) == TYPE_DICTIONARY else {}

func start_listening() -> void:
    if _listening or not OS.has_feature("web"):
        return
    _listening = true
    if _callback != null:
        return  # 브리지 구독은 한 번만 하고, 멈춘 동안 온 이벤트는 버린다
    var bridge := _bridge()
    if bridge != null and bool(bridge.hasBridgeMethod("runtimeSubscribe")):
        _runtime = true
        _visible = _document_visible()
        _callback = JavaScriptBridge.create_callback(_on_runtime_event)
        bridge.runtimeSubscribe(_callback)
        return
    _callback = JavaScriptBridge.create_callback(_on_visibility_event)
    var document: Variant = JavaScriptBridge.get_interface("document")
    if document != null:
        document.addEventListener("visibilitychange", _callback)

func stop_listening() -> void:
    if not _listening or not OS.has_feature("web"):
        return
    _listening = false
    if _runtime:
        return
    var document: Variant = JavaScriptBridge.get_interface("document")
    if document != null and _callback != null:
        document.removeEventListener("visibilitychange", _callback)
    _callback = null

func _bridge() -> JavaScriptObject:
    if not OS.has_feature("web"):
        return null
    return JavaScriptBridge.get_interface("AppsInTossGodot")

func _document_visible() -> bool:
    var document: Variant = JavaScriptBridge.get_interface("document")
    if document == null:
        return true
    return String(document.visibilityState) != "hidden"

func _on_visibility_event(_args: Array) -> void:
    last_source = "visibilitychange"
    var visible := _document_visible()
    visibility_changed.emit(visible)
    life_changed.emit(visible, last_source)

func _on_runtime_event(args: Array) -> void:
    if not _listening or args.is_empty():
        return
    var data: Variant = JSON.parse_string(String(args[0]))
    if typeof(data) != TYPE_DICTIONARY:
        return
    match String(data.get("kind", "")):
        "life":
            apply_life(String(data.get("state", "")) != "hidden", String(data.get("source", "")))
        "audio":
            audio_event.emit(String(data.get("state", "")))

## 상태가 바뀔 때만 신호를 보냅니다(같은 상태의 뒤늦은 신호는 무시). 테스트에서도 씁니다.
func apply_life(visible: bool, source: String) -> void:
    if visible == _visible:
        return
    _visible = visible
    last_source = source
    visibility_changed.emit(visible)
    life_changed.emit(visible, source)
