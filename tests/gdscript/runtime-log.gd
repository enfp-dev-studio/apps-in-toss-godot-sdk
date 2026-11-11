extends SceneTree

## AITRuntimeLog(Unity 런타임 이벤트 로거 대응)가 첫 상호작용·장면 전환·오류(중복 제거)·화면 떠남·time_scale을
## godot_* 이름과 log_type godot_runtime으로 보내는지, AITVersion이 SDK 버전을 주는지 본다.

class RecordingCore extends AITCore:
    var logs: Array = []

    func runtime_log(log_name: String, log_type: String, params: Dictionary) -> void:
        logs.append({"name": log_name, "type": log_type, "params": params})

var failures: Array[String] = []
var checks := 0

func _initialize() -> void:
    _run.call_deferred()

func _expect(condition: bool, message: String) -> void:
    checks += 1
    if not condition:
        failures.append(message)

func _names(core: RecordingCore) -> Array:
    return core.logs.map(func(entry: Dictionary) -> String: return entry["name"])

func _run() -> void:
    var core := RecordingCore.new()
    root.add_child(core)
    var log := AITRuntimeLog.new(core)
    root.add_child(log)
    await process_frame
    _expect(not _names(core).has("godot_first_interactive"), "no first interactive before a scene exists")

    var main := Node.new()
    main.name = "Main"
    root.add_child(main)
    current_scene = main
    await process_frame
    await process_frame
    var first: Array = core.logs.filter(func(e: Dictionary) -> bool: return e["name"] == "godot_first_interactive")
    _expect(first.size() == 1, "first interactive once: %s" % [_names(core)])
    _expect(first[0]["type"] == "godot_runtime" and first[0]["params"]["scene_name"] == "Main", "first interactive payload")

    var room := Node.new()
    room.name = "Room"
    root.add_child(room)
    current_scene = room
    scene_changed.emit()
    var transition: Dictionary = core.logs.back()
    _expect(transition["name"] == "godot_scene_transition", "scene transition logged")
    _expect(transition["params"]["scene_name"] == "Room" and transition["params"]["previous_scene"] == "Main", "scene names: %s" % transition["params"])

    push_error("AIT runtime log test error")
    push_error("AIT runtime log test error")
    await process_frame
    await process_frame
    var errors: Array = core.logs.filter(func(e: Dictionary) -> bool: return e["name"] == "godot_error")
    _expect(errors.size() == 1, "same error once: %d" % errors.size())
    _expect(errors.size() == 1 and String(errors[0]["params"]["message"]).contains("AIT runtime log test error"), "error message")

    log.on_visibility_changed(false)
    _expect(core.logs.back()["name"] == "godot_lifecycle" and core.logs.back()["params"]["has_focus"] == false, "leaving logged")

    Engine.time_scale = 0.5
    await process_frame
    _expect(core.logs.back()["name"] == "godot_time_scale" and is_equal_approx(core.logs.back()["params"]["time_scale"], 0.5), "time scale logged")
    Engine.time_scale = 1.0

    log.enabled = false
    var count := core.logs.size()
    scene_changed.emit()
    _expect(core.logs.size() == count, "disabled sends nothing")

    _expect(AITVersion.VERSION == "0.2.0" and AITVersion.full_version().begins_with("0.2.0 (web-framework "), "version")

    log.queue_free()
    await process_frame
    core.free()
    if not failures.is_empty():
        printerr("[AIT] runtime log FAIL: ", failures)
        quit(1)
        return
    print("[AIT] runtime log check passed (%d checks)" % checks)
    quit(0)
