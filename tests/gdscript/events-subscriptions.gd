extends SceneTree

## AIT.events(Unity SDK 3.9.0 구독형 API + web-framework 3.10.0 액세서리 버튼)가
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
        [events.subscribe_home_event(), "graniteEvent.addEventListener", {}, ["homeEvent"]],
        [events.subscribe_navigation_accessory_event(), "tdsEvent.addEventListener", {}, ["navigationAccessoryEvent"]],
        [events.subscribe_accessory_button(), "NavigationBar.subscribeAccessoryButton", {}, []],
        [events.start_update_location({"accuracy": 3, "timeInterval": 1000, "distanceInterval": 10}), "startUpdateLocation", {"accuracy": 3, "timeInterval": 1000, "distanceInterval": 10}, []],
        [events.contacts_viral({"moduleId": "m"}), "contactsViral", {"moduleId": "m"}, []],
        [events.on_visibility_changed_by_transparent_service_web({"callbackId": "c"}), "onVisibilityChangedByTransparentServiceWeb", {"callbackId": "c"}, []],
        [events.request_notification_agreement({"templateCode": "t"}), "requestNotificationAgreement", {"templateCode": "t"}, []],
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
    var accessory_id: int = cases[1][0]
    core.subscription_event.emit(accessory_id, {"id": "settings"})
    core.subscription_error.emit(cases[3][0], {"code": "PERMISSION_DENIED"})
    core.subscription_event.emit(999999, null) # 다른 모듈의 구독은 무시
    _expect(received == [[accessory_id, "navigation_accessory_event", {"id": "settings"}]], "event routed with name")
    _expect(failed == [[cases[3][0], "update_location", {"code": "PERMISSION_DENIED"}]], "error routed with name")

    events.dispose(accessory_id)
    core.subscription_event.emit(accessory_id, {"id": "late"})
    _expect(received.size() == 1, "no events after dispose")
    _expect(core.calls.back() == {"dispose": accessory_id}, "dispose forwarded")

    core.free()
    if not failures.is_empty():
        printerr("[AIT] events FAIL: ", failures)
        quit(1)
        return
    print("[AIT] events subscriptions check passed")
    quit(0)
