extends RefCounted
class_name AITAuth

const USER_KEY_PATHS: PackedStringArray = ["getAnonymousKey", "getUserKeyForGame"]

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


## 비게임 미니앱 전용 사용자 식별키를 요청합니다. (토스 앱 5.232.0+)
## 성공하면 result가 { type: "HASH", hash }이고, 실패하면 "ERROR"나 없음이 올 수 있습니다.
func get_anonymous_key(timeout_ms: int = 0) -> Dictionary:
    return await _core.invoke_and_wait("getAnonymousKey", [], timeout_ms)


## 이 미니앱에서만 유효한 사용자 식별키(hash)를 돌려줍니다. 받지 못하면 빈 문자열입니다.
## paths 순서대로 시도합니다. 기본은 비게임용 getAnonymousKey, 그다음 게임용 getUserKeyForGame입니다.
## 빈 문자열이면 저장을 새로 시작하지 말고 다시 시도하세요(AITSaveSlot이 이렇게 합니다).
func get_user_hash(timeout_ms: int = 5000, paths: PackedStringArray = USER_KEY_PATHS) -> String:
    for path in paths:
        if not _core.has_api(path):
            continue
        var response: Dictionary = await _core.invoke_and_wait(path, [], timeout_ms)
        var value := hash_from_response(response)
        if value != "":
            return value
    return ""


## 식별키 응답에서 hash만 꺼냅니다. { ok, result: { type: "HASH", hash } }가 아니면 빈 문자열
static func hash_from_response(response: Dictionary) -> String:
    if not bool(response.get("ok", false)):
        return ""
    var result: Variant = response.get("result")
    if typeof(result) != TYPE_DICTIONARY or String(result.get("type", "")) != "HASH":
        return ""
    return String(result.get("hash", ""))


## 사용자 식별키 API가 하나라도 있는지
func has_user_key_api(paths: PackedStringArray = USER_KEY_PATHS) -> bool:
    for path in paths:
        if _core.has_api(path):
            return true
    return false


## 기존 토스 로그인 연동 여부를 확인합니다.
func get_is_toss_login_integrated_service(timeout_ms: int = 0) -> Dictionary:
    return await _core.invoke_and_wait("getIsTossLoginIntegratedService", [], timeout_ms)


## 익명 사용자 식별키를 서버에서 교환할 일회용 인증 코드를 요청합니다. (web-framework 3.6.0+)
## 반환값의 result는 { code, expiresIn } 형식입니다.
## 코드는 expiresIn(초) 안에 한 번만 쓸 수 있으므로 즉시 파트너 서버로 보내 교환해야 합니다.
func create_anonymous_key_auth_code(timeout_ms: int = 0) -> Dictionary:
    return await _core.invoke_and_wait("User.createAnonymousKeyAuthCode", [], timeout_ms)
