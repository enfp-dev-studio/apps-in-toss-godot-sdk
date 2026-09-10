extends Node
class_name AppsInToss

var core: AITCore
var auth: AITAuth
var iap: AITIAP
var ads: AITAds
var game: AITGame
var status: AITStatus
var api: AITGeneratedAPI

func _ready() -> void:
    if core != null:
        return
    core = AITCore.new()
    core.name = "Core"
    add_child(core)
    auth = AITAuth.new(core)
    iap = AITIAP.new(core)
    ads = AITAds.new(core)
    game = AITGame.new(core)
    status = AITStatus.new(core)
    api = AITGeneratedAPI.new(core)

func is_available() -> bool:
    return core != null and core.is_available()

func invoke(path: String, args: Array = []) -> int:
    return core.invoke(path, args)

func invoke_and_wait(path: String, args: Array = [], timeout_ms: int = 0) -> Dictionary:
    return await core.invoke_and_wait(path, args, timeout_ms)
