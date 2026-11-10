extends RefCounted
class_name AITEvents

## Unity SDK 3.9.0의 구독형 API와 web-framework 3.10.0 액세서리 버튼 구독에 대응하는 모듈입니다.
## 각 함수는 구독 번호를 돌려줍니다. 이벤트는 event_received, 실패는 subscription_failed로 오고,
## 두 신호의 name으로 어느 구독인지 가릅니다. 그만 받을 때는 dispose(구독 번호)를 부르세요.
##
## | 함수 | web-framework | Unity |
## | --- | --- | --- |
## | subscribe_home_event | graniteEvent homeEvent | GraniteEventSubscribeHomeEvent |
## | subscribe_navigation_accessory_event | tdsEvent navigationAccessoryEvent (3.10 deprecated) | TdsEventSubscribeNavigationAccessoryEvent |
## | subscribe_accessory_button | NavigationBar.subscribeAccessoryButton (3.10) | (Unity 3.10 미출시) |
## | start_update_location | startUpdateLocation | StartUpdateLocation |
## | contacts_viral | contactsViral | ContactsViral |
## | on_visibility_changed_by_transparent_service_web | onVisibilityChangedByTransparentServiceWeb | OnVisibilityChangedByTransparentServiceWeb |
## | request_notification_agreement | requestNotificationAgreement | RequestNotificationAgreement |
##
## 시스템 뒤로가기(graniteEvent backEvent)는 화면 스택과 함께 AIT.back이 맡습니다.

signal event_received(subscription_id: int, name: String, event: Variant)
signal subscription_failed(subscription_id: int, name: String, error: Dictionary)

var _core: AITCore
var _active: Dictionary = {} # subscription_id -> name

func _init(core: AITCore) -> void:
    _core = core
    _core.subscription_event.connect(_on_subscription_event)
    _core.subscription_error.connect(_on_subscription_error)

## 홈 버튼 이벤트. event는 null입니다.
func subscribe_home_event() -> int:
    return _start("home_event", "graniteEvent.addEventListener", {}, ["homeEvent"])

## 내비 바 액세서리 버튼 클릭(예전 방식). event: { id }
func subscribe_navigation_accessory_event() -> int:
    return _start("navigation_accessory_event", "tdsEvent.addEventListener", {}, ["navigationAccessoryEvent"])

## 내비 바 액세서리 버튼 클릭(web-framework 3.10.0). event는 null입니다.
## 버튼은 AIT.api.navigation_bar_add_accessory_button({ accessibilityLabel, icon })으로 붙입니다.
func subscribe_accessory_button() -> int:
    return _start("accessory_button", "NavigationBar.subscribeAccessoryButton")

## 위치 변화를 계속 받습니다. options: { accuracy, timeInterval, distanceInterval }. event: 위치
func start_update_location(options: Dictionary) -> int:
    return _start("update_location", "startUpdateLocation", options)

## 친구 공유 리워드. options: { moduleId }. event: { type, data }
func contacts_viral(options: Dictionary) -> int:
    return _start("contacts_viral", "contactsViral", options)

## 투명 서비스 웹뷰의 가시성 변화. options: { callbackId }. event: bool
func on_visibility_changed_by_transparent_service_web(options: Dictionary) -> int:
    return _start("visibility_changed_by_transparent_service_web", "onVisibilityChangedByTransparentServiceWeb", options)

## 알림 동의 화면을 띄우고 결과를 받습니다. options: { templateCode }. event: { type }
func request_notification_agreement(options: Dictionary) -> int:
    return _start("notification_agreement", "requestNotificationAgreement", options)

func dispose(subscription_id: int) -> void:
    _active.erase(subscription_id)
    _core.dispose_subscription(subscription_id)

func _start(name: String, path: String, options: Dictionary = {}, args: Array = []) -> int:
    var subscription_id := _core.create_subscription_id()
    _active[subscription_id] = name
    _core.start_path_subscription(subscription_id, path, options, args)
    return subscription_id

func _on_subscription_event(subscription_id: int, event: Variant) -> void:
    if not _active.has(subscription_id):
        return
    event_received.emit(subscription_id, String(_active[subscription_id]), event)

func _on_subscription_error(subscription_id: int, error: Dictionary) -> void:
    if not _active.has(subscription_id):
        return
    subscription_failed.emit(subscription_id, String(_active[subscription_id]), error)
