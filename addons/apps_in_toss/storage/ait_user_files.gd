extends Node
class_name AITUserFiles

## user:// 파일을 앱인토스 Storage에 복사해 두는 저장 미러링(Unity SDK 3.9.0 PlayerPrefs 미러링 대응).
## 토스 WebView(iOS ITP 등)에서는 user://가 있는 IndexedDB가 지워질 수 있어, 게임 매니페스트에 적은 파일만 복사합니다.
##   "userFiles": ["user://settings.cfg", "user://save/progress.json"]
## 엔진이 뜨기 전에 브리지가 IndexedDB에 없는 파일을 Storage에서 되살립니다(셸이 userFilesReady()를 기다림).
## 실행 중에는 바뀐 파일을 2초마다, 그리고 화면을 떠날 때 Storage에 올립니다. 지워진 파일은 Storage에서도 지웁니다.
## 게임 코드는 바꿀 필요가 없습니다. Storage 값은 base64라 작은 설정·저장 파일에만 쓰세요.
## 진행 저장을 새로 만든다면 AITSaveSlot(Storage에 바로 저장)을 쓰세요.

const KEY_PREFIX := "ait:userfile:"
const CHECK_INTERVAL_SEC := 2.0

var _core: AITCore
var _paths: PackedStringArray = []
var _hashes: Dictionary = {} # path -> 마지막으로 올린 md5("" = 없음)
var _timer: Timer

func _init(core: AITCore) -> void:
    _core = core

func _ready() -> void:
    var listed: Variant = AITEntry.page_config().get("userFiles")
    if listed is Array:
        for path in listed:
            if path is String and path.begins_with("user://"):
                _paths.append(path)
    if _paths.is_empty():
        return
    _timer = Timer.new()
    _timer.wait_time = CHECK_INTERVAL_SEC
    _timer.timeout.connect(flush)
    add_child(_timer)
    _timer.start()
    flush()

## 지정한 user:// 파일(테스트에서 바꿔 넣음)
func set_paths(paths: PackedStringArray) -> void:
    _paths = paths

func paths() -> PackedStringArray:
    return _paths

## 바뀐 파일을 지금 올립니다(화면을 떠날 때 AppsInToss가 부름)
func flush() -> void:
    for path in _paths:
        var md5 := FileAccess.get_md5(path) if FileAccess.file_exists(path) else ""
        if _hashes.has(path) and _hashes[path] == md5:
            continue
        var key := KEY_PREFIX + path.trim_prefix("user://")
        if md5 == "":
            if _hashes.has(path):
                _core.invoke("Storage.removeItem", [key])
        else:
            _core.invoke("Storage.setItem", [key, Marshalls.raw_to_base64(FileAccess.get_file_as_bytes(path))])
        _hashes[path] = md5

func on_visibility_changed(is_visible: bool) -> void:
    if not is_visible:
        flush()
