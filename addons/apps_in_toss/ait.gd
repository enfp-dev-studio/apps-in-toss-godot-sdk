extends Node

## Unity SDK의 정적 AIT API에 대응하는 Godot Autoload facade입니다.
## 플러그인을 활성화하면 프로젝트에 `AIT` 싱글턴으로 등록됩니다.

var core: AITCore
var auth: AITAuth
var iap: AITIAP
var ads: AITAds
var status: AITStatus
var api: AITGeneratedAPI

var _sdk: AppsInToss


func _ready() -> void:
    _sdk = AppsInToss.new()
    _sdk.name = "Runtime"
    add_child(_sdk)

    core = _sdk.core
    auth = _sdk.auth
    iap = _sdk.iap
    ads = _sdk.ads
    status = _sdk.status
    api = _sdk.api


func is_available() -> bool:
    return _sdk != null and _sdk.is_available()


func has_api(path: String) -> bool:
    return core != null and core.has_api(path)


func invoke(path: String, args: Array = []) -> int:
    return _sdk.invoke(path, args)


func invoke_and_wait(path: String, args: Array = [], timeout_ms: int = 0) -> Dictionary:
    return await _sdk.invoke_and_wait(path, args, timeout_ms)


func app_login(timeout_ms: int = 0) -> Dictionary:
    return await auth.app_login(timeout_ms)


func get_user_key_for_game(timeout_ms: int = 0) -> Dictionary:
    return await auth.get_user_key_for_game(timeout_ms)


func get_is_toss_login_integrated_service(timeout_ms: int = 0) -> Dictionary:
    return await auth.get_is_toss_login_integrated_service(timeout_ms)
