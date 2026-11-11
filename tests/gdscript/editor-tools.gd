extends SceneTree

## 설정 창(AITConfigDialog)이 매니페스트를 칸으로 고쳐 저장하면서 모르는 키와 appType 기본값을 지키는지,
## 이슈 제보 본문이 판·진단을 담고 홈 경로를 가리는지 본다.

var failures: Array[String] = []
var checks := 0

func _initialize() -> void:
    _run.call_deferred()

func _expect(condition: bool, message: String) -> void:
    checks += 1
    if not condition:
        failures.append(message)

func _run() -> void:
    var dir := "user://ait-editor-tools-test"
    DirAccess.make_dir_recursive_absolute(dir + "/build")
    var path := ProjectSettings.globalize_path(dir + "/game.manifest.json")
    var original := {
        "gameId": "g", "gameVersion": "0.1.0", "appType": "nongame", "releaseChannel": "sandbox",
        "requiredApis": ["app_login"], "custom": {"keep": true},
        "permissions": [{"name": "clipboard", "access": "read"}],
    }
    var f := FileAccess.open(path, FileAccess.WRITE)
    f.store_string(JSON.stringify(original))
    f.close()

    var dialog := AITConfigDialog.new()
    root.add_child(dialog)
    _expect(dialog.load_manifest(path), "loads")
    dialog.set_field("displayName", "고양이 공부방")
    dialog.set_field("permission:camera/access", true)
    dialog.set_field("permission:clipboard/read", false)
    dialog.set_field("keyboardMode", "resize")
    dialog.set_field("userFiles", "user://a.cfg, user://b.json")
    dialog.set_field("sentry.dsn", "https://k@o1.ingest.sentry.io/2")
    dialog.save()
    var saved: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(path))
    _expect(saved["custom"] == {"keep": true} and saved["requiredApis"] == ["app_login"], "unknown keys kept")
    _expect(saved["displayName"] == "고양이 공부방", "display name")
    _expect(saved["permissions"] == [{"name": "camera", "access": "access"}], "permissions: %s" % [saved["permissions"]])
    _expect(not saved.has("navigationBar"), "nav defaults from appType are not overridden: %s" % saved.get("navigationBar"))
    _expect(not saved.has("webView") and not saved.has("preview") and not saved.has("runtimeLog"), "defaults are not written")
    _expect(saved["keyboardMode"] == "resize", "keyboard mode")
    _expect(saved["userFiles"] == ["user://a.cfg", "user://b.json"], "user files")
    _expect(saved["sentry"] == {"dsn": "https://k@o1.ingest.sentry.io/2"}, "sentry")
    _expect(not saved.has("debugConsole"), "empty relay keys removed")

    var body := AITIssueReport.body(ProjectSettings.globalize_path(dir), "버튼이 안 눌려요")
    _expect(body.begins_with("버튼이 안 눌려요") and body.contains(AITVersion.VERSION) and body.contains("Godot:"), "issue body")
    var home := OS.get_environment("HOME")
    _expect(home.is_empty() or not AITIssueReport.body(home, home + "/x").contains(home), "home path hidden")
    var link := AITIssueReport.url("제목", body)
    _expect(link.begins_with(AITIssueReport.NEW_ISSUE_URL + "?title=") and link.contains("&body="), "issue url")

    dialog.free()
    DirAccess.remove_absolute(dir + "/game.manifest.json")
    DirAccess.remove_absolute(dir + "/build")
    DirAccess.remove_absolute(dir)
    if not failures.is_empty():
        printerr("[AIT] editor tools FAIL: ", failures)
        quit(1)
        return
    print("[AIT] editor tools check passed (%d checks)" % checks)
    quit(0)
