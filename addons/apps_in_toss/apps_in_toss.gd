extends Node
class_name AppsInToss

var core: AITCore
var iap: AITIAP
var api: AITGeneratedAPI

func _ready() -> void:
    if core != null:
        return
    core = AITCore.new()
    core.name = "Core"
    add_child(core)
    iap = AITIAP.new(core)
    api = AITGeneratedAPI.new(core)

func is_available() -> bool:
    return core != null and core.is_available()

func invoke(path: String, args: Array = []) -> int:
    return core.invoke(path, args)

func invoke_and_wait(path: String, args: Array = []) -> Dictionary:
    return await core.invoke_and_wait(path, args)
