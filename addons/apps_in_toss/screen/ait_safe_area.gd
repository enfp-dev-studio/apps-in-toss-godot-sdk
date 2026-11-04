extends Node
class_name AITSafeArea

## Safe Area 인셋을 Godot UI 단위로 알려 주는 모듈입니다.
## - 값의 출처: SafeArea.get(web-framework) → 없으면 CSS env(safe-area-inset-*)를 DOM으로 잰 값 → 0.
##   SDK 값과 CSS 값은 CSS px이고, 화면 배율(UI 폭 / window.innerWidth)을 곱해 UI 단위로 바꿉니다.
## - 처음 refresh()를 부를 때 시작합니다. 그 뒤로는 SafeArea.subscribe와 창 크기 변경에 맞춰
##   다시 계산하고, 값이 바뀌면 changed를 보냅니다.
## - 셸의 viewport meta에 viewport-fit=cover가 없으면 iOS에서 CSS 값이 0입니다.
## 에디터·데스크톱 실행에서는 0입니다.

signal changed

const SIDES := ["top", "right", "bottom", "left"]
const TIMEOUT_MS := 3000
const CSS_PROBE := "position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;" + \
    "padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)"

## UI 단위 인셋
var top := 0.0
var right := 0.0
var bottom := 0.0
var left := 0.0
## 마지막으로 읽은 CSS px 인셋
var css := {"top": 0.0, "right": 0.0, "bottom": 0.0, "left": 0.0}
## 값의 출처: "" (아직 안 읽음) / "sdk" / "css" / "none"
var source := ""

var _core: AITCore
var _started := false
var _subscription_id := -1


# AIT 오토로드(AppsInToss)가 core를 넘겨 만듭니다. 인자 없이 만들면 SDK 값 없이 CSS 값만 씁니다.
func _init(core: AITCore = null) -> void:
    _core = core if core != null else AITCore.new()
    _core.subscription_event.connect(_on_subscription_event)


## 인셋을 다시 읽고 UI 단위 값을 돌려줍니다. {top, right, bottom, left}
func refresh() -> Dictionary:
    _start()
    var read := await _read_css_insets()
    _apply(read)
    return insets()


func insets() -> Dictionary:
    return {"top": top, "right": right, "bottom": bottom, "left": left}


## CSS px 1이 UI 몇 단위인지. Web이 아니거나 폭을 모르면 1
func ui_per_css_px() -> float:
    if not OS.has_feature("web") or not is_inside_tree():
        return 1.0
    var window: Variant = JavaScriptBridge.get_interface("window")
    if window == null:
        return 1.0
    return ratio(get_viewport().get_visible_rect().size.x, float(window.innerWidth))


## UI 폭과 CSS 폭으로 배율을 구합니다(CSS 폭을 모르면 1)
static func ratio(ui_width: float, css_width: float) -> float:
    return ui_width / css_width if css_width > 0.0 and ui_width > 0.0 else 1.0


## SDK 응답·CSS 측정값을 {top, right, bottom, left} 숫자로 맞춥니다. 모양이 다르면 빈 Dictionary
static func normalize(value: Variant) -> Dictionary:
    if typeof(value) != TYPE_DICTIONARY:
        return {}
    var out := {}
    for side in SIDES:
        var v: Variant = value.get(side, 0.0)
        out[side] = maxf(0.0, float(v)) if v is int or v is float else 0.0
    return out


## CSS px 인셋에 배율을 곱합니다
static func scale_insets(css_insets: Dictionary, k: float) -> Dictionary:
    var out := {}
    for side in SIDES:
        out[side] = float(css_insets.get(side, 0.0)) * k
    return out


func _start() -> void:
    if _started:
        return
    _started = true
    if is_inside_tree():
        get_viewport().size_changed.connect(_on_resized)
    if _core.has_api("SafeArea.subscribe"):
        _subscription_id = _core.create_subscription_id()
        _core.start_path_subscription(_subscription_id, "SafeArea.subscribe")


func _read_css_insets() -> Dictionary:
    if _core.has_api("SafeArea.get"):
        var res: Dictionary = await _core.invoke_and_wait("SafeArea.get", [], TIMEOUT_MS)
        var from_sdk := normalize(res.get("result")) if bool(res.get("ok", false)) else {}
        if not from_sdk.is_empty():
            source = "sdk"
            return from_sdk
    var probed := _probe_css()
    if not probed.is_empty():
        source = "css"
        return probed
    source = "none"
    return normalize({})


## CSS env(safe-area-inset-*)를 숨긴 div의 padding으로 잽니다(eval 없이 DOM API만 씀)
func _probe_css() -> Dictionary:
    if not OS.has_feature("web"):
        return {}
    var document: Variant = JavaScriptBridge.get_interface("document")
    var window: Variant = JavaScriptBridge.get_interface("window")
    if document == null or window == null or document.body == null:
        return {}
    var probe: Variant = document.createElement("div")
    probe.style.cssText = CSS_PROBE
    document.body.appendChild(probe)
    var style: Variant = window.getComputedStyle(probe)
    var out := {
        "top": String(style.paddingTop).to_float(),
        "right": String(style.paddingRight).to_float(),
        "bottom": String(style.paddingBottom).to_float(),
        "left": String(style.paddingLeft).to_float(),
    }
    probe.remove()
    return normalize(out)


func _apply(css_insets: Dictionary) -> void:
    css = css_insets
    var ui := scale_insets(css_insets, ui_per_css_px())
    var moved := false
    for side in SIDES:
        if not is_equal_approx(float(get(side)), float(ui[side])):
            set(side, float(ui[side]))
            moved = true
    if moved:
        changed.emit()


func _on_resized() -> void:
    refresh()


func _on_subscription_event(subscription_id: int, event: Variant) -> void:
    if subscription_id != _subscription_id or _subscription_id == -1:
        return
    var value := normalize(event)
    if not value.is_empty():
        source = "sdk"
        _apply(value)
