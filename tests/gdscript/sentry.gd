extends SceneTree

## AIT.sentry(Unity AITSentryIntegration·AITSentryAnalytics 대응)가 태그·앱인토스 정보·장면 기록·Analytics 기록·
## Godot 오류를 Sentry 클라이언트로 보내는지, 꺼져 있으면 Analytics만 부르는지 본다.

class FakeClient extends RefCounted:
    var calls: Array = []
    func setTag(key: String, value: String) -> void: calls.append(["tag", key, value])
    func setUser(json: String) -> void: calls.append(["user", JSON.parse_string(json)])
    func setContext(name: String, json: String) -> void: calls.append(["context", name, JSON.parse_string(json)])
    func addBreadcrumb(json: String) -> void: calls.append(["crumb", JSON.parse_string(json)])
    func captureGodotError(json: String) -> void: calls.append(["error", JSON.parse_string(json)])

class FakeCore extends AITCore:
    var invoked: Array = []
    func invoke_and_wait(path: String, args: Array = [], _timeout_ms: int = 0) -> Dictionary:
        invoked.append([path, args])
        var values := {"getDeviceId": "dev-1", "getPlatformOS": "ios", "getLocale": "ko-KR", "getTossAppVersion": "5.260.0", "getOperationalEnvironment": "toss"}
        if values.has(path):
            return {"ok": true, "result": values[path]}
        if path == "env.getDeploymentId":
            return {"ok": false, "error": {"code": "X"}}
        return {"ok": true, "result": null}

var failures: Array[String] = []
var checks := 0

func _initialize() -> void:
    _run.call_deferred()

func _expect(condition: bool, message: String) -> void:
    checks += 1
    if not condition:
        failures.append(message)

func _tags(client: FakeClient) -> Dictionary:
    var tags := {}
    for call in client.calls:
        if call[0] == "tag":
            tags[call[1]] = call[2]
    return tags

func _run() -> void:
    var core := FakeCore.new()
    root.add_child(core)

    # 꺼진 상태: Analytics만 부르고 아무것도 보내지 않는다
    var off := AITSentry.new(core)
    root.add_child(off)
    _expect(not off.is_enabled(), "disabled without the bundle")
    await off.track_click({"button": "buy"})
    _expect(core.invoked.back() == ["Analytics.click", [{"button": "buy"}]], "analytics still called when off")

    var main := Node.new()
    main.name = "Main"
    root.add_child(main)
    current_scene = main
    var client := FakeClient.new()
    var sentry := AITSentry.new(core)
    sentry.client = client
    root.add_child(sentry)
    for i in 12:
        await process_frame
    var tags := _tags(client)
    _expect(tags.get("ait.sdk_version", "").begins_with(AITVersion.VERSION), "sdk version tag")
    _expect(tags.has("ait.godot_version") and tags.get("ait.current_scene") == "Main", "godot version and scene tags: %s" % tags)
    _expect(tags.get("ait.device_id") == "dev-1" and tags.get("ait.platform_os") == "ios" and tags.get("ait.locale") == "ko-KR", "context tags")
    _expect(not tags.has("ait.deployment_id"), "unavailable values are not tagged")
    var users := client.calls.filter(func(c: Array) -> bool: return c[0] == "user")
    _expect(users.size() == 1 and users[0][1] == {"id": "dev-1"}, "device id as user id")
    var contexts := client.calls.filter(func(c: Array) -> bool: return c[0] == "context" and c[1] == "apps_in_toss")
    _expect(contexts.size() == 1 and contexts[0][2]["deployment_id"] == "unavailable", "apps_in_toss context")

    sentry.auto_screen_tracking = true
    var room := Node.new()
    room.name = "Room"
    root.add_child(room)
    current_scene = room
    scene_changed.emit()
    await process_frame
    var crumbs := client.calls.filter(func(c: Array) -> bool: return c[0] == "crumb")
    _expect(crumbs.size() >= 2 and crumbs[0][1]["category"] == "scene" and crumbs[0][1]["data"]["scene_name"] == "Room", "scene breadcrumb")
    _expect(_tags(client).get("ait.current_scene") == "Room", "current scene tag updated")
    _expect(core.invoked.back() == ["Analytics.screen", [{"screen_name": "Room"}]], "auto screen tracking")
    _expect(crumbs[1][1]["category"] == "analytics" and crumbs[1][1]["message"] == "screen", "analytics breadcrumb")
    var analytics := client.calls.filter(func(c: Array) -> bool: return c[0] == "context" and c[1] == "ait_analytics")
    _expect(analytics.back()[2]["screen_count"] == 1 and analytics.back()[2]["last_screen"] == "Room", "analytics context")

    sentry.capture_godot_error("boom", "res://a.gd:3", "script")
    _expect(client.calls.back() == ["error", {"message": "boom", "stack_trace": "res://a.gd:3", "kind": "script"}], "godot error captured")

    core.free()
    if not failures.is_empty():
        printerr("[AIT] sentry FAIL: ", failures)
        quit(1)
        return
    print("[AIT] sentry check passed (%d checks)" % checks)
    quit(0)
