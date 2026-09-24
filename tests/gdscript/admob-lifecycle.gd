extends SceneTree
## AITAdMob lifecycle smoke — real AITCore, no Web bridge (desktop headless).
## Expects: load_admob() routes to start_path_subscription, bridge absence
## surfaces as admob_failed with AIT_BRIDGE_UNAVAILABLE, dispose() is safe.
## Run from a game project with the addon installed (imported once in editor):
##   Godot --headless --path <game> --script \
##     res://addons/apps_in_toss/../../tests/gdscript/admob-lifecycle.gd
## (copy this file into the game project, e.g. res://tests/admob-lifecycle.gd)

var _core: AITCore
var _admob: AITAdMob
var _sub := 0
var _failed: Array = []
var _events: Array = []
var _frame := 0


func _initialize() -> void:
	_core = AITCore.new()
	root.add_child(_core)
	_admob = AITAdMob.new(_core)
	_admob.admob_failed.connect(_on_failed)
	_admob.admob_event.connect(_on_event)
	_sub = _admob.load_admob({"adGroupId": "smoke-group"})
	if _sub <= 0:
		_fail("load_admob returned no subscription id")


func _process(_delta: float) -> bool:
	_frame += 1
	if _frame >= 600:
		_fail("timed out waiting for deferred unavailable emission")
		return true
	if _frame < 3:
		return false
	return _finish()


func _on_failed(subscription_id: int, error: Dictionary) -> void:
	_failed.append([subscription_id, error])


func _on_event(subscription_id: int, event: Variant) -> void:
	_events.append([subscription_id, event])


func _finish() -> bool:
	if _failed.size() != 1:
		_fail("expected exactly 1 admob_failed, got %d" % _failed.size())
		return true
	if int(_failed[0][0]) != _sub:
		_fail("failed subscription id mismatch")
		return true
	var error: Dictionary = _failed[0][1]
	if String(error.get("code", "")) != "AIT_BRIDGE_UNAVAILABLE":
		_fail("expected AIT_BRIDGE_UNAVAILABLE, got %s" % JSON.stringify(error))
		return true
	if not _events.is_empty():
		_fail("expected no events without a bridge")
		return true
	_admob.dispose(_sub)
	print("[AIT] admob lifecycle check passed (unavailable path + dispose)")
	quit(0)
	return true


func _fail(message: String) -> void:
	printerr("[AIT] FAIL: " + message)
	quit(1)
