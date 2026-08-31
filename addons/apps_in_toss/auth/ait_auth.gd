extends RefCounted
class_name AITAuth

var _core: AITCore


func _init(core: AITCore) -> void:
    _core = core


## 토스 로그인 인가 코드를 요청합니다.
## 반환값의 result는 { authorizationCode, referrer } 형식입니다.
## 인가 코드는 10분짜리 일회용 값이므로 즉시 파트너 서버로 보내야 합니다.
func app_login(timeout_ms: int = 0) -> Dictionary:
    return await _core.invoke_and_wait("appLogin", [], timeout_ms)


## 게임 미니앱 전용 사용자 식별키를 요청합니다.
## 신규 게임은 단순 사용자 식별에 app_login보다 이 API를 우선 사용합니다.
func get_user_key_for_game(timeout_ms: int = 0) -> Dictionary:
    return await _core.invoke_and_wait("getUserKeyForGame", [], timeout_ms)


## 기존 토스 로그인 연동 여부를 확인합니다.
func get_is_toss_login_integrated_service(timeout_ms: int = 0) -> Dictionary:
    return await _core.invoke_and_wait("getIsTossLoginIntegratedService", [], timeout_ms)
