extends Node

## Unity SDK의 정적 AIT API에 대응하는 Godot Autoload facade입니다.
## 플러그인을 활성화하면 프로젝트에 `AIT` 싱글턴으로 등록됩니다.

var core: AITCore
var auth: AITAuth
var iap: AITIAP
var ads: AITAds
var admob: AITAdMob
var game: AITGame
var status: AITStatus
var app_events: AITAppEvents
## 시스템 뒤로가기 스택(graniteEvent backEvent). 닫을 것이 있을 때만 구독합니다
var back: AITBack
## Safe Area 인셋(Godot UI 단위). 처음 refresh()를 부를 때 시작합니다
var safe_area: AITSafeArea
## 사운드 게이트(백그라운드·광고·결제 중 정지). enable()을 불러야 동작합니다
var sound: AITSoundGate
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
    admob = _sdk.admob
    game = _sdk.game
    status = _sdk.status
    app_events = _sdk.app_events
    back = _sdk.back
    safe_area = _sdk.safe_area
    sound = _sdk.sound
    api = _sdk.api


func is_available() -> bool:
    return _sdk != null and _sdk.is_available()


func has_api(path: String) -> bool:
    return core != null and core.has_api(path)


## 빌드 종류: "debug"(에디터·데스크톱 디버그) / "dev"(build:dev mock) / "test"(build --debug-console) / "release"
func build_kind() -> String:
    return core.build_kind() if core != null else ("debug" if OS.is_debug_build() else "release")


## 출시 빌드가 아닌 실행인지. 테스트 편의(시작 재화 등)에만 쓰고, 개발용 조작 훅은 build_kind() == "dev"·"debug"에서만 여세요
func is_test_run() -> bool:
    return build_kind() != "release"


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


func get_anonymous_key(timeout_ms: int = 0) -> Dictionary:
    return await auth.get_anonymous_key(timeout_ms)


## 사용자 식별키 hash(비게임 getAnonymousKey → 게임 getUserKeyForGame 순). 받지 못하면 ""
func get_user_hash(timeout_ms: int = 5000) -> String:
    return await auth.get_user_hash(timeout_ms)


func get_value(path: String) -> Variant:
    return core.get_value(path)


func create_anonymous_key_auth_code(timeout_ms: int = 0) -> Dictionary:
    return await auth.create_anonymous_key_auth_code(timeout_ms)
