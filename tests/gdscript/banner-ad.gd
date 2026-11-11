extends SceneTree

## AIT.banner(위·아래 한 슬롯)와 AITBannerAdView(영역 노드)가 Unity SDK 3.9.0 배너 도우미처럼
## 슬롯을 열고·바꾸고·닫고, 이벤트를 snake_case로 바꿔 돌려주며, 영역 좌표와 자동 높이를 맞추는지 본다.

class RecordingCore extends AITCore:
    var calls: Array = []

    func start_banner(subscription_id: int, ad_group_id: String, mode: int, theme: String, tone: String, variant: String) -> void:
        calls.append(["start", subscription_id, ad_group_id, mode, theme, tone, variant])

    func set_banner_rect(subscription_id: int, rect: Rect2) -> void:
        calls.append(["rect", subscription_id, rect])

    func refresh_banner_sizes() -> void:
        calls.append(["refresh"])

    func dispose_subscription(subscription_id: int) -> void:
        calls.append(["dispose", subscription_id])

var failures: Array[String] = []
var checks := 0

func _initialize() -> void:
    _run.call_deferred()

func _expect(condition: bool, message: String) -> void:
    checks += 1
    if not condition:
        failures.append(message)

func _run() -> void:
    var core := RecordingCore.new()
    root.add_child(core)
    var banner := AITBannerAd.new(core)
    var events: Array = []
    var errors: Array = []
    banner.ad_event.connect(func(event: Dictionary) -> void: events.append(event))
    banner.error.connect(func(message: String) -> void: errors.append(message))

    banner.show("")
    _expect(errors.size() == 1 and core.calls.is_empty(), "empty ad group id is an error, no slot")

    banner.show("group-a", AITBannerAd.Position.TOP, "dark", "grey", "card")
    var first: Array = core.calls.back()
    _expect(first[0] == "start" and first[2] == "group-a" and first[3] == AITBannerAd.MODE_TOP, "top slot opened")
    _expect(first.slice(4) == ["dark", "grey", "card"], "appearance forwarded")
    _expect(banner.is_showing(), "showing")

    core.subscription_event.emit(first[1], {"kind": "noFill", "adGroupId": "group-a", "slotId": "s", "errorCode": 0})
    core.subscription_event.emit(first[1], {"kind": "resized", "adGroupId": "group-a", "width": 360, "height": 96, "heightFraction": 0.12})
    core.subscription_event.emit(999, {"kind": "rendered"}) # 다른 구독은 무시
    _expect(events.size() == 2, "two events for this slot")
    _expect(events[0]["kind"] == "no_fill" and events[0]["slot_id"] == "s", "kind and keys in snake_case")
    _expect(events[1]["kind"] == "resized" and is_equal_approx(events[1]["height_fraction"], 0.12), "resized carries size")

    banner.show("group-b") # 다시 부르면 바꾼다
    _expect(core.calls[-2] == ["dispose", first[1]], "previous slot closed on replace")
    var second: Array = core.calls.back()
    _expect(second[2] == "group-b" and second[3] == AITBannerAd.MODE_BOTTOM, "bottom by default")
    _expect(second.slice(4) == ["auto", "blackAndWhite", "expanded"], "Unity defaults")
    core.subscription_error.emit(second[1], {"code": "AIT_BRIDGE_UNAVAILABLE", "message": "no bridge"})
    _expect(events.back()["kind"] == "initialization_failed" and events.back()["error_message"] == "no bridge", "unavailable bridge → initialization_failed")
    banner.hide()
    _expect(core.calls.back() == ["dispose", second[1]] and not banner.is_showing(), "hide closes the slot")

    # AITBannerAdView: 영역 좌표, 자동 높이, 트리에서 나가면 닫힘
    root.size = Vector2i(400, 800)
    var view := AITBannerAdView.new()
    view.banner_module = banner
    view.ad_group_id = "group-view"
    view.show_on_ready = false
    view.position = Vector2(100, 400)
    view.size = Vector2(200, 100)
    root.add_child(view)
    var view_events: Array = []
    view.ad_event.connect(func(event: Dictionary) -> void: view_events.append(event))
    core.calls.clear()
    view.show_banner()
    var start: Array = core.calls[0]
    _expect(start[0] == "start" and start[3] == AITBannerAd.MODE_RECT, "view opens a rect slot")
    var rect_call: Array = core.calls[1]
    _expect(rect_call[0] == "rect" and rect_call[2].is_equal_approx(Rect2(0.25, 0.5, 0.5, 0.125)), "rect normalized to the canvas: %s" % rect_call[2])
    core.subscription_event.emit(start[1], {"kind": "resized", "height": 72, "heightFraction": 0.09})
    _expect(is_equal_approx(view.rendered_height_local, 72.0), "rendered height in local units: %s" % view.rendered_height_local)
    _expect(is_equal_approx(view.size.y, 72.0), "auto resize height: %s" % view.size.y)
    _expect(view_events.size() == 1 and view_events[0]["kind"] == "resized", "view forwards events")
    root.size = Vector2i(400, 700)
    _expect(core.calls.back() == ["refresh"], "screen size change asks for sizes again")
    view.queue_free()
    await process_frame
    _expect(core.calls.back() == ["dispose", start[1]], "leaving the tree closes the slot")

    core.free()
    if not failures.is_empty():
        printerr("[AIT] banner FAIL: ", failures)
        quit(1)
        return
    print("[AIT] banner ad check passed (%d checks)" % checks)
    quit(0)
