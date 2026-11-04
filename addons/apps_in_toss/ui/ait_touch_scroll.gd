extends Node
class_name AITTouchScroll

## 스크롤 영역 어디서 시작해도(버튼·카드 위 포함) 손가락으로 끌면 스크롤되게 합니다.
##
## Godot에서는 Button 같은 Control이 누름을 받으면(mouse_filter STOP) 부모 ScrollContainer가 끌기를 받지 못해,
## 버튼 위에서 시작한 끌기는 스크롤이 되지 않습니다. 이 노드는 GUI보다 먼저(_input) 누름을 보고:
##   - 이동이 문턱(drag_threshold, UI 좌표 기본 10)을 넘으면 그 손가락을 스크롤로 바꿉니다. 이때 스크롤 영역 안 Control에
##     NOTIFICATION_SCROLL_BEGIN을 보내 BaseButton이 누름을 취소하게 합니다 — 손을 떼도 클릭이 나가지 않습니다.
##   - 문턱을 넘지 않고 떼면 아무것도 하지 않습니다. 짧은 탭은 버튼이 그대로 받습니다.
##   - 손을 떼면 마지막 0.1초의 속도로 관성 스크롤하다 멈춥니다(friction). 미끄러지는 중에 누르면 멈추기만 하고 탭은 버립니다.
##   - 누름이 이 스크롤 영역 밖이거나 위에 다른 화면(시트 등)이 덮고 있으면 끌기를 맡지 않습니다.
## 세로 스크롤만 다룹니다. ScrollContainer의 기본 터치 끌기(scroll_deadzone)는 끕니다. 마우스 휠은 그대로입니다.
## 모바일 Web은 터치가 마우스로 에뮬레이션되므로(Godot 기본 input_devices/pointing/emulate_mouse_from_touch) 마우스 이벤트로 처리합니다.
##
## 사용: AITTouchScroll.attach(scroll_container) 또는 AITTouchScroll.scroll_area()

const FLING_MIN := 40.0 # 이보다 느리면(UI 좌표/초) 관성 없이 멈춘다
const FLING_MAX := 4200.0
const STOP_TAP_SPEED := 250.0 # 이보다 빨리 미끄러지는 중의 누름은 "멈춤"으로만 쓴다

var scroll: ScrollContainer
var drag_threshold := 10.0
var friction := 3.6 # 관성 감쇠(초당). 클수록 빨리 멈춘다

var _state := 0 # 0 없음, 1 눌림(탭인지 끌기인지 아직 모름), 2 끌어서 스크롤 중
var _start := Vector2.ZERO
var _last_y := 0.0
var _pos := 0.0 # 소수까지 든 스크롤 위치
var _velocity := 0.0 # 관성 속도(스크롤 값/초)
var _samples: Array = [] # [시각 ms, y]
var _swallow := false


## 이미 있는 ScrollContainer에 붙입니다. 가로 스크롤은 그대로 두므로 필요하면 끄세요
static func attach(sc: ScrollContainer) -> AITTouchScroll:
    var t := AITTouchScroll.new()
    t.scroll = sc
    t.name = "AITTouchScroll"
    sc.scroll_deadzone = 1000000 # 기본 터치 끌기를 끈다(이 노드가 맡는다)
    sc.add_child(t, false, Node.INTERNAL_MODE_FRONT) # 내부 자식이라 ScrollContainer의 내용으로 치지 않는다
    return t


## 세로 스크롤 영역을 새로 만듭니다(가로 스크롤 없음, 포커스 따라가기 없음, 터치 끌기 붙임).
## ScrollContainer.new() 대신 이것으로 만들면 모든 스크롤 영역이 같은 손맛을 냅니다
static func scroll_area() -> ScrollContainer:
    var sc := ScrollContainer.new()
    sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
    sc.follow_focus = false
    attach(sc)
    return sc


func _ready() -> void:
    set_process(false)


func is_dragging() -> bool:
    return _state == 2


func _input(event: InputEvent) -> void:
    if scroll == null or not scroll.is_visible_in_tree():
        return
    if event is InputEventMouseButton and (event as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
        var mb := event as InputEventMouseButton
        if mb.pressed:
            _on_press(mb.position)
        else:
            _on_release()
    elif event is InputEventMouseMotion and _state != 0:
        var mm := event as InputEventMouseMotion
        if mm.button_mask & MOUSE_BUTTON_MASK_LEFT == 0:
            return # 누르지 않은 채 움직이는 커서(데스크톱 호버)는 끌기가 아니다
        _on_motion(mm.position)


func _on_press(p: Vector2) -> void:
    _state = 0
    if not scroll.get_global_rect().has_point(p):
        return
    _swallow = is_processing() and absf(_velocity) > STOP_TAP_SPEED
    _velocity = 0.0
    set_process(false)
    _state = 1
    _start = p
    _last_y = p.y
    _pos = float(scroll.scroll_vertical)
    _samples = [[Time.get_ticks_msec(), p.y]]
    if _swallow:
        # 미끄러지는 중에 누른 것은 멈춤이다. GUI가 누름을 받은 뒤 취소해 놓을 때 클릭이 나가지 않게 한다
        _cancel_presses.call_deferred()


func _on_motion(p: Vector2) -> void:
    if _state == 1:
        if absf(p.y - _start.y) < drag_threshold and p.distance_to(_start) < drag_threshold * 1.5:
            return
        if not _owns_gesture():
            _state = 0
            return
        _state = 2
        _last_y = p.y
        _cancel_presses()
        return
    # _state == 2
    var dy := p.y - _last_y
    _last_y = p.y
    _pos = clampf(_pos - dy, 0.0, _max_scroll())
    _apply()
    _samples.append([Time.get_ticks_msec(), p.y])
    while _samples.size() > 2 and Time.get_ticks_msec() - int(_samples[0][0]) > 100:
        _samples.pop_front()
    get_viewport().set_input_as_handled()


func _on_release() -> void:
    if _state == 2:
        var now := Time.get_ticks_msec()
        var first: Array = _samples[0]
        var dt := float(now - int(first[0])) / 1000.0
        if dt > 0.0 and now - int(_samples[_samples.size() - 1][0]) < 80:
            _velocity = clampf(-(_last_y - float(first[1])) / dt, -FLING_MAX, FLING_MAX)
        else:
            _velocity = 0.0 # 멈춘 채로 뗐다
        if absf(_velocity) > FLING_MIN:
            set_process(true)
        scroll.propagate_notification(Control.NOTIFICATION_SCROLL_END)
    _state = 0


## 누름이 이 스크롤 영역 안 Control에서 시작했는지(위에 시트·다른 화면이 덮고 있으면 아니다)
func _owns_gesture() -> bool:
    var h := get_viewport().gui_get_hovered_control()
    if h == null:
        return true
    return h == scroll or scroll.is_ancestor_of(h)


func _cancel_presses() -> void:
    scroll.propagate_notification(Control.NOTIFICATION_SCROLL_BEGIN)


func _max_scroll() -> float:
    var bar := scroll.get_v_scroll_bar()
    return maxf(0.0, bar.max_value - bar.page)


func _apply() -> void:
    var v := int(round(_pos))
    if scroll.scroll_vertical != v:
        scroll.scroll_vertical = v


func _process(dt: float) -> void:
    _pos += _velocity * dt
    _velocity *= exp(-friction * dt)
    var top := 0.0
    var bottom := _max_scroll()
    if _pos <= top or _pos >= bottom:
        _pos = clampf(_pos, top, bottom)
        _velocity = 0.0
    _apply()
    if absf(_velocity) < FLING_MIN:
        _velocity = 0.0
        set_process(false)
