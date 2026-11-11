extends SceneTree

## AITUserFiles(저장 미러링)가 처음과 바뀔 때만 Storage.setItem으로 base64를 올리고, 지워지면 removeItem을 부르는지 본다.

class RecordingCore extends AITCore:
    var calls: Array = []
    func invoke(path: String, args: Array = []) -> int:
        calls.append([path, args])
        return 1

var failures: Array[String] = []
var checks := 0

func _initialize() -> void:
    _run.call_deferred()

func _expect(condition: bool, message: String) -> void:
    checks += 1
    if not condition:
        failures.append(message)

func _write(path: String, text: String) -> void:
    var f := FileAccess.open(path, FileAccess.WRITE)
    f.store_string(text)
    f.close()

func _run() -> void:
    DirAccess.make_dir_recursive_absolute("user://ait-user-files-test")
    var path := "user://ait-user-files-test/settings.cfg"
    _write(path, "volume=3")
    var core := RecordingCore.new()
    root.add_child(core)
    var mirror := AITUserFiles.new(core)
    mirror.set_paths(PackedStringArray([path, "user://ait-user-files-test/none.cfg"]))
    mirror.flush()
    _expect(core.calls.size() == 1, "only the existing file is uploaded first: %s" % [core.calls])
    _expect(core.calls[0][0] == "Storage.setItem" and core.calls[0][1][0] == "ait:userfile:ait-user-files-test/settings.cfg", "key")
    _expect(Marshalls.base64_to_utf8(core.calls[0][1][1]) == "volume=3", "base64 content")
    mirror.flush()
    _expect(core.calls.size() == 1, "unchanged file is not uploaded again")
    _write(path, "volume=7")
    mirror.on_visibility_changed(false)
    _expect(core.calls.size() == 2 and Marshalls.base64_to_utf8(core.calls[1][1][1]) == "volume=7", "changed file uploaded when leaving")
    DirAccess.remove_absolute(path)
    mirror.flush()
    _expect(core.calls.back() == ["Storage.removeItem", ["ait:userfile:ait-user-files-test/settings.cfg"]], "deleted file removed from Storage")
    DirAccess.remove_absolute("user://ait-user-files-test")
    mirror.free()
    core.free()
    if not failures.is_empty():
        printerr("[AIT] user files FAIL: ", failures)
        quit(1)
        return
    print("[AIT] user files check passed (%d checks)" % checks)
    quit(0)
