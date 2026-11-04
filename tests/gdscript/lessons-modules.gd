extends SceneTree
## cat-room-godot에서 옮긴 모듈 검사(헤드리스, 브리지 없음).
## AITKorean, AITBack, AITSafeArea, AITSoundGate(+ 광고·결제 수명 신호), AITSaveSlot, AITAuth.hash_from_response,
## AITTouchScroll(마우스 길)을 확인합니다. 브리지 대신 AITCore를 상속한 FakeCore로 구독·호출을 흉내 냅니다.
## 실행(애드온이 설치된 게임 프로젝트에 이 파일을 복사한 뒤):
##   Godot --headless --path <game> --script res://tests/lessons-modules.gd

var _fails := 0
var _checks := 0


class FakeCore extends AITCore:
    var apis := {}
    var started: Array = [] # [subscription_id, path, options, args]
    var disposed: Array = []
    var results := {}

    func is_available() -> bool:
        return true

    func has_api(path: String) -> bool:
        return apis.has(path)

    func start_path_subscription(subscription_id: int, path: String, options: Dictionary = {}, args: Array = []) -> void:
        started.append([subscription_id, path, options, args])

    func start_event_subscription(subscription_id: int, bridge_method: String, options: Dictionary = {}) -> void:
        started.append([subscription_id, bridge_method, options, []])

    func start_iap_one_time_purchase(subscription_id: int, sku: String) -> void:
        started.append([subscription_id, "iap", {"sku": sku}, []])

    func dispose_subscription(subscription_id: int) -> void:
        disposed.append(subscription_id)

    func invoke_and_wait(path: String, args: Array = [], timeout_ms: int = 0) -> Dictionary:
        return results.get(path, {"ok": false, "error": {"code": "FAKE_UNAVAILABLE"}})


class FakeStorage:
    var items := {}
    var fail_gets := 0
    var gets := 0

    func get_item(key: String) -> Dictionary:
        gets += 1
        if fail_gets > 0:
            fail_gets -= 1
            return {"ok": false, "error": {"message": "fake read failure"}}
        return {"ok": true, "result": items.get(key)}

    func set_item(key: String, value: String) -> Dictionary:
        items[key] = value
        return {"ok": true, "result": null}

    func remove_item(key: String) -> Dictionary:
        items.erase(key)
        return {"ok": true, "result": null}


func _initialize() -> void:
    _run.call_deferred()


func _check(name: String, ok: bool, detail: String = "") -> void:
    _checks += 1
    if not ok:
        _fails += 1
        printerr("[AIT] FAIL %s %s" % [name, detail])


func _frames(n: int) -> void:
    for i in n:
        await process_frame


func _run() -> void:
    _korean()
    _auth()
    await _back()
    await _safe_area()
    await _sound_gate()
    await _save_slot()
    await _touch_scroll()
    if _fails == 0:
        print("[AIT] lessons modules check passed (%d checks)" % _checks)
        quit(0)
    else:
        printerr("[AIT] lessons modules check FAILED (%d of %d)" % [_fails, _checks])
        quit(1)


# ── AITKorean ───────────────────────────────────────────

func _korean() -> void:
    var wj := AITKorean.WORD_JOINER
    _check("keep_all joins syllables", AITKorean.keep_all("고양이 집중방") == "고%s양%s이 집%s중%s방" % [wj, wj, wj, wj])
    _check("keep_all leaves ascii", AITKorean.keep_all("abc def") == "abc def")
    _check("keep_all joins latin+hangul", AITKorean.keep_all("TV를") == "TV%s를" % wj)
    _check("keep_all is idempotent on spaces", AITKorean.keep_all("가 나") == "가 나")
    var cases := [
        ["치즈", "은/는", "치즈는"], ["구름", "과/와", "구름과"], ["고양이", "이/가", "고양이가"],
        ["물", "으로/로", "물로"], ["집", "으로/로", "집으로"], ["바다", "으로/로", "바다로"],
        ["3", "을/를", "3을"], ["2", "을/를", "2를"], ["10", "은/는", "10은"], ["7", "으로/로", "7로"],
        ["TV", "은/는", "TV는"], ["", "은/는", ""], ["치즈", "은", "치즈"],
    ]
    for c in cases:
        var got := AITKorean.josa(c[0], c[1])
        _check("josa %s %s" % [c[0], c[1]], got == c[2], "got %s" % got)


# ── AITAuth ─────────────────────────────────────────────

func _auth() -> void:
    _check("hash ok", AITAuth.hash_from_response({"ok": true, "result": {"type": "HASH", "hash": "h1"}}) == "h1")
    _check("hash ERROR", AITAuth.hash_from_response({"ok": true, "result": "ERROR"}) == "")
    _check("hash missing", AITAuth.hash_from_response({"ok": true, "result": null}) == "")
    _check("hash failed", AITAuth.hash_from_response({"ok": false}) == "")


# ── AITBack ─────────────────────────────────────────────

func _back() -> void:
    var core := FakeCore.new()
    root.add_child(core)
    var back := AITBack.new(core)
    root.add_child(back)
    var calls: Array[String] = []
    var h1 := func() -> void: calls.append("h1")
    var h2 := func() -> void: calls.append("h2")

    _check("back empty handle", back.handle() == false)
    back.push(h1)
    _check("back no graniteEvent → not listening", not back.is_listening())
    _check("back handle without bridge", back.handle() and calls == ["h1"])
    back.clear()
    calls.clear()

    core.apis["graniteEvent.addEventListener"] = true
    back.push(h1)
    _check("back listening after push", back.is_listening())
    var last: Array = core.started.back()
    _check("back subscribes backEvent", last[1] == "graniteEvent.addEventListener" and last[3] == ["backEvent"], str(last))
    var sub := int(last[0])
    back.push(h2)
    _check("back one subscription", core.started.size() == 1)
    core.subscription_event.emit(sub, null)
    await _frames(2)
    _check("back event calls top handler", calls == ["h2"], str(calls))
    back.remove(h2)
    _check("back still listening with one", back.is_listening())
    back.remove(h1)
    _check("back unsubscribes when empty", not back.is_listening() and core.disposed.has(sub))
    core.subscription_event.emit(sub, null)
    await _frames(2)
    _check("back ignores stale events", calls == ["h2"], str(calls))
    back.queue_free()
    core.queue_free()


# ── AITSafeArea ─────────────────────────────────────────

func _safe_area() -> void:
    _check("safe ratio", is_equal_approx(AITSafeArea.ratio(360.0, 375.0), 0.96))
    _check("safe ratio unknown", AITSafeArea.ratio(360.0, 0.0) == 1.0)
    var n := AITSafeArea.normalize({"top": 47, "bottom": "x"})
    _check("safe normalize", n == {"top": 47.0, "right": 0.0, "bottom": 0.0, "left": 0.0}, str(n))
    _check("safe normalize non-dict", AITSafeArea.normalize(null).is_empty())
    _check("safe scale", AITSafeArea.scale_insets({"top": 50.0, "bottom": 34.0}, 0.5)["bottom"] == 17.0)

    var core := FakeCore.new()
    root.add_child(core)
    core.apis["SafeArea.get"] = true
    core.apis["SafeArea.subscribe"] = true
    core.results["SafeArea.get"] = {"ok": true, "result": {"top": 47, "right": 0, "bottom": 34, "left": 0}}
    var sa := AITSafeArea.new(core)
    root.add_child(sa)
    var changes := [0]
    sa.changed.connect(func() -> void: changes[0] += 1)
    var got: Dictionary = await sa.refresh()
    _check("safe sdk values", got["top"] == 47.0 and got["bottom"] == 34.0 and sa.source == "sdk", str(got))
    _check("safe changed once", changes[0] == 1)
    var sub := -1
    for s in core.started:
        if s[1] == "SafeArea.subscribe":
            sub = int(s[0])
    _check("safe subscribes", sub != -1)
    core.subscription_event.emit(sub, {"top": 59, "right": 0, "bottom": 34, "left": 0})
    _check("safe subscription update", sa.top == 59.0 and changes[0] == 2)
    await sa.refresh()
    _check("safe refresh rereads sdk", sa.top == 47.0 and changes[0] == 3)
    await sa.refresh()
    _check("safe refresh same → no change", changes[0] == 3)

    var bare := FakeCore.new()
    root.add_child(bare)
    var sa2 := AITSafeArea.new(bare)
    root.add_child(sa2)
    var none: Dictionary = await sa2.refresh()
    _check("safe no sdk → zeros", none["top"] == 0.0 and sa2.source == "none", sa2.source)
    for node in [sa, sa2, core, bare]:
        node.queue_free()


# ── AITSoundGate + 수명 신호 ───────────────────────────

func _sound_gate() -> void:
    var core := FakeCore.new()
    root.add_child(core)
    var events := AITAppEvents.new()
    var ads := AITAds.new(core)
    var admob := AITAdMob.new(core)
    var iap := AITIAP.new(core)
    var gate := AITSoundGate.new(events, ads, admob, iap)
    root.add_child(gate)
    AudioServer.set_bus_mute(0, false)

    var ended: Array[int] = []
    ads.show_ended.connect(func(id: int) -> void: ended.append(id))
    var off := ads.show_full_screen_ad({"adGroupId": "g"})
    _check("ads is_showing", ads.is_showing(off))
    _check("gate off does not mute", not AudioServer.is_bus_mute(0))
    core.subscription_event.emit(off, {"type": "dismissed"})
    _check("ads show_ended on dismissed", ended == [off] and not ads.is_showing(off))

    gate.enable()
    var ad := ads.show_full_screen_ad({"adGroupId": "g"})
    _check("gate mutes during ad", gate.is_silenced() and AudioServer.is_bus_mute(0))
    events.visibility_changed.emit(false)
    _check("gate hidden reason", gate.reasons().has("hidden"))
    events.visibility_changed.emit(true)
    _check("gate stays muted until ad ends", gate.is_silenced())
    core.subscription_event.emit(ad, {"type": "show"})
    _check("gate show event keeps mute", gate.is_silenced())
    core.subscription_event.emit(ad, {"type": "dismissed"})
    _check("gate unmutes after ad", not gate.is_silenced() and not AudioServer.is_bus_mute(0))

    var order := iap.create_one_time_purchase_order("sku-1")
    _check("gate mutes during order", gate.is_silenced() and gate.reasons() == ["iap:%d" % order])
    core.subscription_error.emit(order, {"code": "USER_CANCELED"})
    _check("gate unmutes after order error", not gate.is_silenced())

    var mob := admob.show_admob({"adGroupId": "g"})
    _check("gate mutes during admob", gate.is_silenced())
    admob.dispose(mob)
    _check("gate unmutes after admob dispose", not gate.is_silenced())

    var failed_ad := ads.show_full_screen_ad({"adGroupId": "g"})
    core.subscription_event.emit(failed_ad, {"type": "failedToShow"})
    _check("gate unmutes after failedToShow", not gate.is_silenced())

    gate.silence("cutscene")
    _check("gate custom reason", gate.is_silenced())
    gate.disable()
    _check("gate disable clears", not gate.is_silenced() and not AudioServer.is_bus_mute(0) and gate.reasons().is_empty())
    gate.queue_free()
    core.queue_free()


# ── AITSaveSlot ─────────────────────────────────────────

func _new_slot(storage: FakeStorage, user_hash: String) -> AITSaveSlot:
    var slot := AITSaveSlot.new("t.save")
    slot.storage = storage
    slot.user_key_source = func() -> String: return user_hash
    slot.debounce_sec = 0.05
    root.add_child(slot)
    return slot


func _save_slot() -> void:
    var scoped := AITSaveSlot.scoped_key("t.save", "hash-abc")
    _check("slot scoped key", scoped == "t.save:" + "hash-abc".sha256_text().left(24))

    var st := FakeStorage.new()
    var slot := _new_slot(st, "hash-abc")
    var r: Dictionary = await slot.load_data()
    _check("slot fresh", bool(r["ok"]) and bool(r["fresh"]) and slot.can_save and slot.key == scoped, str(r))
    slot.data["coins"] = 3
    slot.save()
    _check("slot debounced", not st.items.has(scoped))
    await create_timer(0.3).timeout
    _check("slot debounced write", st.items.has(scoped) and JSON.parse_string(String(st.items[scoped]))["coins"] == 3)
    slot.queue_free()

    var again := _new_slot(st, "hash-abc")
    r = await again.load_data()
    _check("slot loads existing", bool(r["ok"]) and not bool(r["fresh"]) and int(again.data["coins"]) == 3, str(r))
    again.queue_free()

    var other := _new_slot(st, "hash-other")
    r = await other.load_data()
    _check("slot other user is separate", bool(r["fresh"]))
    other.queue_free()

    var fail_once := FakeStorage.new()
    fail_once.fail_gets = 1
    var s1 := _new_slot(fail_once, "h")
    r = await s1.load_data()
    _check("slot retries once", bool(r["ok"]), str(r))
    s1.queue_free()

    var fail_twice := FakeStorage.new()
    fail_twice.fail_gets = 2
    var s2 := _new_slot(fail_twice, "h")
    r = await s2.load_data()
    _check("slot storage failure blocks", not bool(r["ok"]) and r["reason"] == AITSaveSlot.REASON_STORAGE and not s2.can_save, str(r))
    s2.data["x"] = 1
    _check("slot no flush after failure", not await s2.flush() and fail_twice.items.is_empty())
    s2.queue_free()

    var nokey := FakeStorage.new()
    var s3 := _new_slot(nokey, "")
    r = await s3.load_data()
    _check("slot user key failure blocks", not bool(r["ok"]) and r["reason"] == AITSaveSlot.REASON_USER_KEY and nokey.gets == 0, str(r))
    s3.queue_free()

    var broken := FakeStorage.new()
    var bkey := AITSaveSlot.scoped_key("t.save", "h")
    broken.items[bkey] = "{not json"
    var s4 := _new_slot(broken, "h")
    r = await s4.load_data()
    _check("slot broken reason", not bool(r["ok"]) and r["reason"] == AITSaveSlot.REASON_BROKEN and not s4.can_save, str(r))
    _check("slot broken backup", broken.items.get(bkey + ":broken") == "{not json")
    _check("slot broken not overwritten", not await s4.flush() and broken.items[bkey] == "{not json")
    s4.queue_free()

    var legacy := FakeStorage.new()
    legacy.items["t.save"] = JSON.stringify({"coins": 9})
    var s5 := _new_slot(legacy, "h")
    r = await s5.load_data()
    _check("slot migrates unscoped", bool(r["ok"]) and int(s5.data["coins"]) == 9, str(r))
    _check("slot keeps legacy until written", legacy.items.has("t.save"))
    _check("slot flush moves legacy", await s5.flush() and legacy.items.has(bkey) and not legacy.items.has("t.save"))
    s5.queue_free()

    # 브리지·저장소 없는 실행: user:// 파일
    var path := "user://ait_lessons_slot_test.json"
    if FileAccess.file_exists(path):
        DirAccess.remove_absolute(path)
    var bare := FakeCore.new()
    root.add_child(bare)
    var f1 := AITSaveSlot.new("t.file")
    f1.core = bare
    f1.fallback_path = path
    root.add_child(f1)
    r = await f1.load_data()
    f1.data["n"] = 5
    _check("slot file fresh + write", bool(r["fresh"]) and await f1.flush() and FileAccess.file_exists(path))
    var f2 := AITSaveSlot.new("t.file")
    f2.core = bare
    f2.fallback_path = path
    root.add_child(f2)
    r = await f2.load_data()
    _check("slot file reload", bool(r["ok"]) and int(f2.data["n"]) == 5, str(r))
    DirAccess.remove_absolute(path)
    for node in [f1, f2, bare]:
        node.queue_free()


# ── AITTouchScroll ──────────────────────────────────────

func _mouse_button(p: Vector2, pressed: bool) -> void:
    var e := InputEventMouseButton.new()
    e.button_index = MOUSE_BUTTON_LEFT
    e.pressed = pressed
    e.button_mask = MOUSE_BUTTON_MASK_LEFT if pressed else 0
    e.position = p
    e.global_position = p
    root.push_input(e, true)


func _mouse_move(p: Vector2, rel: Vector2) -> void:
    var e := InputEventMouseMotion.new()
    e.button_mask = MOUSE_BUTTON_MASK_LEFT
    e.position = p
    e.global_position = p
    e.relative = rel
    root.push_input(e, true)


func _drag(from: Vector2, dy: float, steps: int) -> void:
    _mouse_button(from, true)
    await _frames(1)
    var p := from
    for i in steps:
        var rel := Vector2(0, dy / steps)
        p += rel
        _mouse_move(p, rel)
        await _frames(1)
    _mouse_button(p, false)
    await _frames(1)


func _tap(p: Vector2) -> void:
    _mouse_button(p, true)
    await _frames(2)
    _mouse_button(p, false)
    await _frames(2)


func _touch_scroll() -> void:
    # 헤드리스 기본 창은 64×64라 GUI가 그 밖의 누름을 받지 않는다
    root.size = Vector2i(400, 700)
    await _frames(2)
    var sc := AITTouchScroll.scroll_area()
    sc.position = Vector2(20, 20)
    sc.size = Vector2(300, 300)
    root.add_child(sc)
    var list := VBoxContainer.new()
    list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    sc.add_child(list)
    var presses := [0]
    for i in 20:
        var b := Button.new()
        b.text = "item %d" % i
        b.custom_minimum_size = Vector2(0, 60)
        b.pressed.connect(func() -> void: presses[0] += 1)
        list.add_child(b)
    await _frames(5)
    _check("touch internal child", sc.get_child_count() == 1 and sc.get_child(0) == list)
    _check("touch no horizontal", sc.horizontal_scroll_mode == ScrollContainer.SCROLL_MODE_DISABLED)

    await _drag(Vector2(120, 250), -150, 10)
    var ts: AITTouchScroll = null
    for c in sc.get_children(true):
        if c is AITTouchScroll:
            ts = c
    var t0 := Time.get_ticks_msec()
    while ts != null and ts.is_processing() and Time.get_ticks_msec() - t0 < 3000:
        await process_frame
    _check("touch drag on button scrolls", sc.scroll_vertical >= 140, "scroll=%d" % sc.scroll_vertical)
    _check("touch drag does not click", presses[0] == 0, "presses=%d" % presses[0])

    await _tap(Vector2(120, 150))
    _check("touch tap clicks once", presses[0] == 1, "presses=%d" % presses[0])

    var before := sc.scroll_vertical
    await _drag(Vector2(360, 250), -150, 10)
    _check("touch drag outside does not scroll", sc.scroll_vertical == before)
    sc.queue_free()
