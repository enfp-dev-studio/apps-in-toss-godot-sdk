extends SceneTree

## AIT.events(Unity SDK 3.10.0 구독형 API와 이전 평면 이름)가
## 맞는 경로·인자·옵션으로 구독을 열고, 이벤트·오류를 구독 이름과 함께 돌려주는지 본다.

class RecordingCore extends AITCore:
    var calls: Array = []

    func start_path_subscription(subscription_id: int, path: String, options: Dictionary = {}, args: Array = []) -> void:
        calls.append({"id": subscription_id, "path": path, "options": options.duplicate(true), "args": args.duplicate(true)})

    func dispose_subscription(subscription_id: int) -> void:
        calls.append({"dispose": subscription_id})

var failures: Array[String] = []

func _initialize() -> void:
    _run.call_deferred()

func _expect(condition: bool, message: String) -> void:
    if not condition:
        failures.append(message)

func _run() -> void:
    var core := RecordingCore.new()
    root.add_child(core)
    var events := AITEvents.new(core)
    var cases := [
        [events.subscribe_home_event(), "graniteEvent.addEventListener", {}, ["homeEvent"], "home_event"],
        [events.subscribe_navigation_accessory_event(), "tdsEvent.addEventListener", {}, ["navigationAccessoryEvent"], "navigation_accessory_event"],
        [events.subscribe_accessory_button(), "NavigationBar.subscribeAccessoryButton", {}, [], "accessory_button"],
        [events.start_update_location({"accuracy": 3, "timeInterval": 1000, "distanceInterval": 10}), "startUpdateLocation", {"accuracy": 3, "timeInterval": 1000, "distanceInterval": 10}, [], "update_location"],
        [events.contacts_viral({"moduleId": "m"}), "contactsViral", {"moduleId": "m"}, [], "contacts_viral"],
        [events.on_visibility_changed_by_transparent_service_web({"callbackId": "c"}), "onVisibilityChangedByTransparentServiceWeb", {"callbackId": "c"}, [], "visibility_changed_by_transparent_service_web"],
        [events.request_notification_agreement({"templateCode": "t"}), "requestNotificationAgreement", {"templateCode": "t"}, [], "notification_agreement"],
        [events.device_subscribe_location({"accuracy": 1, "timeInterval": 2000, "distanceInterval": 25}), "Device.subscribeLocation", {"accuracy": 1, "timeInterval": 2000, "distanceInterval": 25}, [], "device_location"],
        [events.promotion_open_contacts_invite({"moduleId": "reward"}), "Promotion.openContactsInvite", {"moduleId": "reward"}, [], "promotion_contacts_invite"],
        [events.notification_request_agreement({"templateCode": "notice"}), "Notification.requestAgreement", {"templateCode": "notice"}, [], "notification_request_agreement"],
    ]
    _expect(core.calls.size() == cases.size(), "one subscription per call")
    for i in cases.size():
        var expected: Array = cases[i]
        var call: Dictionary = core.calls[i]
        _expect(call["id"] == expected[0], "id %d" % i)
        _expect(call["path"] == expected[1], "path %s" % expected[1])
        _expect(call["options"] == expected[2], "options %s" % expected[1])
        _expect(call["args"] == expected[3], "args %s" % expected[1])

    var received: Array = []
    var failed: Array = []
    events.event_received.connect(func(id: int, name: String, event: Variant) -> void: received.append([id, name, event]))
    events.subscription_failed.connect(func(id: int, name: String, error: Dictionary) -> void: failed.append([id, name, error]))
    for entry: Array in cases:
        var id: int = entry[0]
        var name: String = entry[4]
        core.subscription_event.emit(id, {"type": "result", "value": id})
        core.subscription_error.emit(id, {"code": "PERMISSION_DENIED"})
        _expect(received.back() == [id, name, {"type": "result", "value": id}], "event name %s" % name)
        _expect(failed.back() == [id, name, {"code": "PERMISSION_DENIED"}], "error name %s" % name)
        events.dispose(id)
        _expect(core.calls.back() == {"dispose": id}, "dispose forwarded %s" % name)
        core.subscription_event.emit(id, {"type": "late"})
        core.subscription_error.emit(id, {"code": "LATE"})
    core.subscription_event.emit(999999, null) # 다른 모듈의 구독은 무시
    core.subscription_error.emit(999999, {"code": "OTHER_MODULE"})
    _expect(received.size() == cases.size(), "no events after dispose or for unknown subscriptions")
    _expect(failed.size() == cases.size(), "no errors after dispose or for unknown subscriptions")

    core.free()
    if not failures.is_empty():
        printerr("[AIT] events FAIL: ", failures)
        quit(1)
        return
    print("[AIT] events subscriptions check passed")
    quit(0)
