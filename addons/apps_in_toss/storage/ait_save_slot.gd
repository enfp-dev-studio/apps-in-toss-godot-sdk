extends Node
class_name AITSaveSlot

## 진행 상태를 SDK 저장소(Storage.getItem/setItem)에 JSON 하나로 두는 저장 칸입니다.
## localStorage·IndexedDB는 쓰지 않습니다. iOS WebView는 7일간 상호작용이 없으면 IndexedDB를 지우고,
## Web Storage는 오리진별이라 QR 테스트와 라이브가 공유되지 않습니다.
##
## 저장을 잃지 않는 규칙:
## - 키는 사용자 식별키 기준입니다("<base_key>:<sha256(hash) 앞 24자>"). 한 기기에서 토스 계정을 바꿔도 섞이지 않습니다.
##   식별키 API가 있는데 두 번 받지 못하면 접미사 없는 키로 넘어가지 않고 실패합니다(reason "user_key").
## - 읽기는 한 번 더 시도합니다. 그래도 실패하면 새 저장으로 시작하지 않습니다(reason "storage").
##   브리지가 bridge_wait_ms 안에 붙지 않아도 실패합니다(reason "bridge"). 앱은 막는 안내를 띄우고 load_data()를 다시 부르세요.
## - 해석할 수 없는 저장은 원본을 "<key>:broken"에 두고 can_save를 끕니다(reason "broken"). 원본을 덮어쓰지 않습니다.
##   새로 시작해도 된다고 앱이 정하면 can_save = true로 켭니다.
## - 식별키 기준 키가 비어 있으면 접미사 없는 예전 키(base_key)를 한 번 읽어 옮기고, 새 키에 쓴 뒤에만 지웁니다.
## - save()는 debounce_sec만큼 모아 씁니다. 앱이 백그라운드로 가면 기다리지 않고 바로 씁니다(AIT.app_events).
## 브리지가 없는 에디터·데스크톱 실행에서는 user:// 파일(fallback_path)에 둡니다.
##
## 사용:
##   var slot := AITSaveSlot.new("mygame.save.v1")
##   add_child(slot)
##   var r := await slot.load_data()   # {ok, reason, data, fresh}
##   slot.data["coins"] = 10
##   slot.save()

signal saved(ok: bool)

const REASON_BRIDGE := "bridge"
const REASON_USER_KEY := "user_key"
const REASON_STORAGE := "storage"
const REASON_BROKEN := "broken"
const KEY_HASH_LENGTH := 24

var base_key: String
## 실제 저장 키(load_data 뒤에 정해진다)
var key := ""
var data: Dictionary = {}
var can_save := false
var is_loaded := false
var debounce_sec := 0.8
var timeout_ms := 8000
var bridge_wait_ms := 5000
var scope_by_user := true
var migrate_unscoped := true
## 브리지가 없는 실행에서 쓸 파일. 비우면 user://<base_key>.json
var fallback_path := ""
## 사용자 식별키를 시도할 API 순서(AITAuth.USER_KEY_PATHS)
var user_key_paths: PackedStringArray = AITAuth.USER_KEY_PATHS
## 비우면 /root/AIT의 core를 씁니다
var core: AITCore
## 테스트용 저장소: get_item(key)·set_item(key, value)·remove_item(key) → {ok, result}
var storage: Object = null
## 테스트용 식별키: () -> String(실패면 "")
var user_key_source: Callable

var _legacy_key := ""
var _timer: Timer
var _events: AITAppEvents


func _init(slot_key: String = "") -> void:
    base_key = slot_key
    _timer = Timer.new()
    _timer.one_shot = true
    _timer.timeout.connect(flush)
    add_child(_timer)


func _ready() -> void:
    if core == null:
        var ait := get_node_or_null("/root/AIT")
        if ait != null and ait.get("core") is AITCore:
            core = ait.get("core")
        if ait != null and ait.get("app_events") is AITAppEvents:
            _events = ait.get("app_events")
    if core == null:
        core = AITCore.new()
        core.name = "Core"
        add_child(core)
    if _events == null:
        _events = AITAppEvents.new()
    _events.visibility_changed.connect(_on_visibility)


## 저장을 읽습니다. {ok, reason, data, fresh}
##   ok true, fresh false  읽었다(data에 저장 내용)
##   ok true, fresh true   저장이 아직 없다(새로 시작)
##   ok false              reason: "bridge" / "user_key" / "storage"(다시 시도) / "broken"(원본 보관, 저장 꺼짐)
func load_data() -> Dictionary:
    is_loaded = false
    can_save = false
    var r := await _read()
    if not bool(r["ok"]):
        return {"ok": false, "reason": String(r["reason"]), "data": {}, "fresh": false}
    var raw := String(r["raw"])
    if raw == "":
        data = {}
        is_loaded = true
        can_save = true
        return {"ok": true, "reason": "", "data": data, "fresh": true}
    # JSON.parse_string은 실패하면 엔진 오류를 찍으므로 JSON 객체로 조용히 판정한다
    var json := JSON.new()
    var parsed: Variant = json.data if json.parse(raw) == OK else null
    if typeof(parsed) != TYPE_DICTIONARY:
        await _keep_broken(raw)
        data = {}
        is_loaded = true
        return {"ok": false, "reason": REASON_BROKEN, "data": {}, "fresh": false}
    data = parsed
    is_loaded = true
    can_save = true
    return {"ok": true, "reason": "", "data": data, "fresh": false}


## 저장을 예약합니다(debounce_sec 뒤 flush). value를 주면 data를 바꿉니다
func save(value: Variant = null) -> void:
    if typeof(value) == TYPE_DICTIONARY:
        data = value
    if not is_loaded or not can_save:
        return
    if _timer.is_inside_tree():
        _timer.start(debounce_sec)
    else:
        flush()


## 기다리던 저장을 바로 씁니다. 쓴 결과를 돌려줍니다
func flush() -> bool:
    if not is_loaded or not can_save:
        return false
    _timer.stop()
    var raw := JSON.stringify(data)
    var ok := true
    if _has_store():
        ok = await _store_set(key, raw)
        if ok and _legacy_key != "":
            var old := _legacy_key
            _legacy_key = ""
            await _store_remove(old)
    elif not OS.has_feature("web"):
        var f := FileAccess.open(_fallback_file(), FileAccess.WRITE)
        ok = f != null
        if f:
            f.store_string(raw)
            f.close()
    saved.emit(ok)
    return ok


## 이 칸의 저장을 지우고 빈 상태로 둡니다(내 데이터 삭제 등)
func wipe() -> void:
    _timer.stop()
    if _has_store():
        if key != "":
            await _store_remove(key)
    elif not OS.has_feature("web") and FileAccess.file_exists(_fallback_file()):
        DirAccess.remove_absolute(_fallback_file())
    data = {}


## 사용자 식별키 hash로 저장 키를 만듭니다
static func scoped_key(slot_key: String, user_hash: String) -> String:
    return "%s:%s" % [slot_key, user_hash.sha256_text().left(KEY_HASH_LENGTH)]


func _read() -> Dictionary:
    if storage == null and OS.has_feature("web"):
        # 브리지 스크립트가 늦게 붙는 경우를 기다린다
        var waited := 0
        while not core.is_available() and waited < bridge_wait_ms:
            await get_tree().create_timer(0.1).timeout
            waited += 100
        if not core.is_available():
            return {"ok": false, "reason": REASON_BRIDGE}
    key = base_key
    _legacy_key = ""
    if not _has_store():
        if not OS.has_feature("web") and FileAccess.file_exists(_fallback_file()):
            return {"ok": true, "raw": FileAccess.get_file_as_string(_fallback_file())}
        return {"ok": true, "raw": ""}
    if scope_by_user and _has_user_key_api():
        var user_hash := await _fetch_user_hash()
        if user_hash == "":
            user_hash = await _fetch_user_hash()
        if user_hash == "":
            return {"ok": false, "reason": REASON_USER_KEY}
        key = scoped_key(base_key, user_hash)
    var g := await _get_retry(key)
    if not bool(g["ok"]):
        return {"ok": false, "reason": REASON_STORAGE}
    var raw := String(g["value"])
    if raw == "" and migrate_unscoped and key != base_key:
        var legacy := await _get_retry(base_key)
        if not bool(legacy["ok"]):
            return {"ok": false, "reason": REASON_STORAGE}
        if String(legacy["value"]) != "":
            raw = String(legacy["value"])
            _legacy_key = base_key
    return {"ok": true, "raw": raw}


func _has_store() -> bool:
    return storage != null or (core != null and core.has_api("Storage.getItem"))


func _has_user_key_api() -> bool:
    if user_key_source.is_valid():
        return true
    for path in user_key_paths:
        if core.has_api(path):
            return true
    return false


func _fetch_user_hash() -> String:
    if user_key_source.is_valid():
        return String(await user_key_source.call())
    return await AITAuth.new(core).get_user_hash(5000, user_key_paths)


func _get_retry(store_key: String) -> Dictionary:
    var g := await _store_get(store_key)
    if not bool(g["ok"]):
        g = await _store_get(store_key)
    return g


func _store_get(store_key: String) -> Dictionary:
    var res: Dictionary
    if storage != null:
        res = await storage.get_item(store_key)
    else:
        res = await core.invoke_and_wait("Storage.getItem", [store_key], timeout_ms)
    if not bool(res.get("ok", false)):
        push_warning("AITSaveSlot: Storage.getItem failed: %s" % JSON.stringify(res.get("error")))
        return {"ok": false, "value": ""}
    var v: Variant = res.get("result")
    return {"ok": true, "value": v if typeof(v) == TYPE_STRING else ""}


func _store_set(store_key: String, raw: String) -> bool:
    var res: Dictionary
    if storage != null:
        res = await storage.set_item(store_key, raw)
    else:
        res = await core.invoke_and_wait("Storage.setItem", [store_key, raw], timeout_ms)
    if not bool(res.get("ok", false)):
        push_warning("AITSaveSlot: Storage.setItem failed: %s" % JSON.stringify(res.get("error")))
        return false
    return true


func _store_remove(store_key: String) -> void:
    if storage != null:
        await storage.remove_item(store_key)
    elif core.has_api("Storage.removeItem"):
        await core.invoke_and_wait("Storage.removeItem", [store_key], timeout_ms)


func _keep_broken(raw: String) -> void:
    if _has_store():
        await _store_set("%s:broken" % key, raw)
    elif not OS.has_feature("web"):
        var f := FileAccess.open(_fallback_file() + ".broken", FileAccess.WRITE)
        if f:
            f.store_string(raw)
            f.close()


func _fallback_file() -> String:
    if fallback_path != "":
        return fallback_path
    return "user://%s.json" % base_key.validate_filename()


func _on_visibility(is_visible: bool) -> void:
    if not is_visible and is_loaded and can_save:
        flush()
