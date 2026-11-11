extends Node
class_name AITRuntimeLog

## 실행 중 일어난 일을 디버그 로그로 남깁니다(Unity SDK 3.9.0 런타임 이벤트 로거 대응).
## 브리지가 window.AppsInToss.debugLog가 있으면 넘기고, 토스 웹 디버그 툴즈의 Godot Metrics 탭에 보여 줍니다.
## log_type은 "godot_runtime"이고, log_name은 Unity의 unity_* 대신 godot_*입니다.
##   godot_scene_transition  장면이 바뀜(scene_loaded)
##   godot_first_interactive 첫 장면이 처음 그려짐(한 세션에 한 번). 매니페스트 runtimeLog.firstInteractive가 false면 보내지 않음
##   godot_error             오류(error·script·shader). 60초에 10개까지, 같은 문구는 한 번
##   godot_low_memory        메모리 경고(30초에 한 번)
##   godot_lifecycle         화면 떠남·돌아옴(focus_changed, 5초에 한 번), 닫기 요청(quitting)
##   godot_frame_stall       한 프레임이 0.5초를 넘음(보이는 동안만, 60초에 5개까지)
##   godot_screen_change     화면 크기·방향이 바뀜(2초에 한 번)
##   godot_time_scale        Engine.time_scale이 바뀜(5초에 한 번)
## Unity의 GC 수집 로그는 GDScript에 가비지 컬렉터가 없어 없습니다.

## 걸러진(60초에 10개, 같은 문구 한 번) Godot 오류. AIT.sentry가 받아 Sentry로 보냅니다
signal error_logged(message: String, stack: String, kind: String)

const LOG_TYPE := "godot_runtime"
const ERROR_INTERVAL_SEC := 60.0
const ERROR_MAX_PER_INTERVAL := 10
const ERROR_MESSAGE_MAX := 500
const ERROR_STACK_MAX := 200
const LOW_MEMORY_INTERVAL_SEC := 30.0
const FOCUS_INTERVAL_SEC := 5.0
const FRAME_STALL_SEC := 0.5
const FRAME_STALL_INTERVAL_SEC := 60.0
const FRAME_STALL_MAX_PER_INTERVAL := 5
const SCREEN_CHANGE_INTERVAL_SEC := 2.0
const TIME_SCALE_INTERVAL_SEC := 5.0

## 끄면 아무것도 보내지 않습니다
var enabled := true

var _core: AITCore
var _logger: _ErrorLogger
var _last_scene := ""
var _first_interactive_done := false
var _error_window_start := -INF
var _error_count := 0
var _error_seen: Dictionary = {}
var _last_low_memory := -INF
var _last_focus := -INF
var _stall_window_start := -INF
var _stall_count := 0
var _last_screen_change := -INF
var _last_screen_size := Vector2i.ZERO
var _last_time_scale := 1.0
var _last_time_scale_log := -INF
var _visible := true


class _ErrorLogger extends Logger:
    var owner: WeakRef

    func _log_error(function: String, file: String, line: int, code: String, rationale: String, _editor_notify: bool, error_type: int, script_backtraces: Array[ScriptBacktrace]) -> void:
        if error_type == ERROR_TYPE_WARNING:
            return
        var log: AITRuntimeLog = owner.get_ref()
        if log == null:
            return
        var message := rationale if not rationale.is_empty() else code
        var stack := "%s (%s:%d)" % [function, file, line]
        if not script_backtraces.is_empty():
            stack = script_backtraces[0].format()
        log.call_deferred("_on_error", message, stack, ["error", "warning", "script", "shader"][error_type])

    func _log_message(_message: String, _error: bool) -> void:
        pass


func _init(core: AITCore) -> void:
    _core = core

func _ready() -> void:
    process_mode = Node.PROCESS_MODE_ALWAYS
    var tree := get_tree()
    tree.scene_changed.connect(_on_scene_changed)
    get_viewport().size_changed.connect(_on_screen_changed)
    _last_screen_size = DisplayServer.window_get_size()
    _last_time_scale = Engine.time_scale
    _logger = _ErrorLogger.new()
    _logger.owner = weakref(self)
    OS.add_logger(_logger)
    print("[AIT] Apps in Toss Godot SDK v%s" % AITVersion.full_version())

func _exit_tree() -> void:
    if _logger != null:
        OS.remove_logger(_logger)
        _logger = null

## AIT.app_events의 화면 떠남·돌아옴을 받습니다(AppsInToss가 연결)
func on_visibility_changed(is_visible: bool) -> void:
    _visible = is_visible
    var now := _now()
    if now - _last_focus < FOCUS_INTERVAL_SEC:
        return
    _last_focus = now
    _send("godot_lifecycle", {"event_type": "focus_changed", "has_focus": is_visible, "time_since_start_sec": _sec(now)})

func _process(delta: float) -> void:
    var now := _now()
    if not _first_interactive_done:
        var scene := get_tree().current_scene
        if scene != null:
            _first_interactive_done = true
            _last_scene = String(scene.name)
            if _first_interactive_allowed():
                _send("godot_first_interactive", {
                    "event_type": "first_interactive",
                    "scene_name": _last_scene,
                    "scene_path": scene.scene_file_path,
                    "time_since_start_ms": Time.get_ticks_msec(),
                })
    if _visible and delta > FRAME_STALL_SEC:
        if now - _stall_window_start >= FRAME_STALL_INTERVAL_SEC:
            _stall_window_start = now
            _stall_count = 0
        if _stall_count < FRAME_STALL_MAX_PER_INTERVAL:
            _stall_count += 1
            _send("godot_frame_stall", {"event_type": "frame_stall", "frame_time_ms": roundi(delta * 1000.0), "scene_name": _last_scene, "time_since_start_sec": _sec(now)})
    if not is_equal_approx(Engine.time_scale, _last_time_scale):
        var previous := _last_time_scale
        _last_time_scale = Engine.time_scale
        if now - _last_time_scale_log >= TIME_SCALE_INTERVAL_SEC:
            _last_time_scale_log = now
            _send("godot_time_scale", {"event_type": "time_scale_changed", "time_scale": Engine.time_scale, "previous_time_scale": previous, "time_since_start_sec": _sec(now)})

func _notification(what: int) -> void:
    if what == NOTIFICATION_OS_MEMORY_WARNING:
        var now := _now()
        if now - _last_low_memory >= LOW_MEMORY_INTERVAL_SEC:
            _last_low_memory = now
            _send("godot_low_memory", {"event_type": "low_memory", "time_since_start_sec": _sec(now)})
    elif what == NOTIFICATION_WM_CLOSE_REQUEST:
        _send("godot_lifecycle", {"event_type": "quitting", "time_since_start_sec": _sec(_now())})

func _on_scene_changed() -> void:
    var scene := get_tree().current_scene
    var name := String(scene.name) if scene != null else ""
    var previous := _last_scene
    _last_scene = name
    _send("godot_scene_transition", {
        "event_type": "scene_loaded",
        "scene_name": name,
        "scene_path": scene.scene_file_path if scene != null else "",
        "previous_scene": previous,
        "time_since_start_sec": _sec(_now()),
    })

func _on_screen_changed() -> void:
    var size := DisplayServer.window_get_size()
    if size == _last_screen_size:
        return
    var now := _now()
    var previous := _last_screen_size
    _last_screen_size = size
    if now - _last_screen_change < SCREEN_CHANGE_INTERVAL_SEC:
        return
    _last_screen_change = now
    _send("godot_screen_change", {
        "event_type": "resolution_changed",
        "width": size.x, "height": size.y,
        "previous_width": previous.x, "previous_height": previous.y,
        "orientation": "landscape" if size.x > size.y else "portrait",
        "time_since_start_sec": _sec(now),
    })

func _on_error(message: String, stack: String, kind: String) -> void:
    var now := _now()
    if now - _error_window_start >= ERROR_INTERVAL_SEC:
        _error_window_start = now
        _error_count = 0
        _error_seen.clear()
    if _error_count >= ERROR_MAX_PER_INTERVAL or _error_seen.has(message):
        return
    _error_seen[message] = true
    _error_count += 1
    error_logged.emit(message, stack, kind)
    _send("godot_error", {
        "event_type": kind,
        "message": message.left(ERROR_MESSAGE_MAX),
        "stack_trace": stack.left(ERROR_STACK_MAX),
        "time_since_start_sec": _sec(now),
    })

## 빌드 설정(index.html의 ait-app-config)의 runtimeLog.firstInteractive. 없으면 켬
func _first_interactive_allowed() -> bool:
    var runtime_log: Variant = AITEntry.page_config().get("runtimeLog")
    return not (runtime_log is Dictionary and runtime_log.get("firstInteractive") == false)

func _send(log_name: String, params: Dictionary) -> void:
    if enabled:
        _core.runtime_log(log_name, LOG_TYPE, params)

func _now() -> float:
    return Time.get_ticks_msec() / 1000.0

func _sec(now: float) -> float:
    return snappedf(now, 0.1)
