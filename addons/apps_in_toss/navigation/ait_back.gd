extends Node
class_name AITBack

## 시스템 뒤로가기(graniteEvent backEvent)를 화면 스택으로 받는 모듈입니다.
## - 닫을 것(시트·하위 화면)을 열 때 push(handler), 닫을 때 remove(handler)를 부릅니다.
## - 스택이 비어 있지 않을 때만 backEvent를 구독합니다. 구독하는 동안에는 플랫폼의 기본 뒤로가기가 막히고,
##   스택이 비면 구독을 풀어 첫 화면에서는 기본 동작(미니앱 종료)이 됩니다(비게임 출시 체크리스트).
## - 뒤로가기가 오면 맨 위 handler 하나만 부릅니다. handler는 화면을 닫으면서 remove를 부르세요.
## - 데스크톱·에디터·브라우저 미리보기에서는 Esc(ui_cancel)도 뒤로가기입니다(handle_escape로 끌 수 있음).
## 비게임 미니앱은 토스 내비게이션 바에 뒤로가기 버튼이 있어야 합니다(매니페스트 appType "nongame"이면
## navigationBar.withBackButton: true가 기본). 화면 안에 뒤로가기 버튼을 따로 그리지 마세요.

signal listening_changed(listening: bool)

const EVENT_PATH := "graniteEvent.addEventListener"
const EVENT_NAME := "backEvent"

var handle_escape := true

var _core: AITCore
var _stack: Array[Callable] = []
var _subscription_id := -1


# AIT 오토로드(AppsInToss)가 core를 넘겨 만듭니다. 인자 없이 만든 노드(에디터의 노드 만들기)는 아무것도 하지 않습니다.
func _init(core: AITCore = null) -> void:
    _core = core
    if _core == null:
        return
    _core.subscription_event.connect(_on_subscription_event)
    _core.subscription_error.connect(_on_subscription_error)


func push(handler: Callable) -> void:
    if not handler.is_valid():
        return
    _stack.append(handler)
    _sync()


func remove(handler: Callable) -> void:
    _stack.erase(handler)
    _sync()


func clear() -> void:
    _stack.clear()
    _sync()


func size() -> int:
    return _stack.size()


## backEvent를 구독하고 있는지(스택이 비어 있지 않고 브리지에 graniteEvent가 있을 때)
func is_listening() -> bool:
    return _subscription_id != -1


## 맨 위 handler를 부릅니다. 부를 것이 없으면 false(플랫폼 기본 동작에 맡김)
func handle() -> bool:
    while not _stack.is_empty() and not _stack.back().is_valid():
        _stack.pop_back()
    if _stack.is_empty():
        _sync()
        return false
    var top: Callable = _stack.back()
    top.call()
    return true


func _sync() -> void:
    var want := not _stack.is_empty()
    if want == is_listening():
        return
    if want:
        if _core == null or not _core.has_api(EVENT_PATH):
            return # 브리지 없음(에디터·데스크톱) 또는 graniteEvent가 없는 환경
        _subscription_id = _core.create_subscription_id()
        _core.start_path_subscription(_subscription_id, EVENT_PATH, {}, [EVENT_NAME])
    else:
        _core.dispose_subscription(_subscription_id)
        _subscription_id = -1
    listening_changed.emit(is_listening())


func _on_subscription_event(subscription_id: int, _event: Variant) -> void:
    if subscription_id != _subscription_id or _subscription_id == -1:
        return
    # 브리지 콜백 안에서 화면을 바꾸지 않도록 다음 처리로 미룬다
    handle.call_deferred()


func _on_subscription_error(subscription_id: int, error: Dictionary) -> void:
    if subscription_id != _subscription_id or _subscription_id == -1:
        return
    push_warning("AITBack: backEvent subscription failed: %s" % JSON.stringify(error))
    _subscription_id = -1
    listening_changed.emit(false)


func _unhandled_key_input(event: InputEvent) -> void:
    if handle_escape and event.is_action_pressed("ui_cancel") and handle():
        get_viewport().set_input_as_handled()
