@tool
extends Node
class_name AITNodeInstaller

## Node.js 자동 설치(Unity SDK 3.9.0 AITNodeJSDownloader 대응). 에디터 패널이 node를 찾지 못할 때 씁니다.
## nodejs.org에서 고정한 판을 받아 SHA256을 확인하고 ~/.ait-godot-sdk/nodejs/v<판>/<플랫폼>에 풉니다(약 40~50MB).
## 체크섬은 nodejs.org/dist/v24.22.1/SHASUMS256.txt에서 옮겼습니다. 판을 올릴 때 함께 바꾸세요.

signal finished(node_path: String, error: String)

const VERSION := "24.22.1"
const SHA256 := {
    "node-v24.22.1-darwin-arm64.tar.gz": "89c682593d76cd44233fa53b1563264e7de9cbb189cad169135c5b4fadfbc0a7",
    "node-v24.22.1-darwin-x64.tar.gz": "d132557e7ee2b85af08b0c8c34338e65c6430f2238d01f727728ef42dc83b035",
    "node-v24.22.1-linux-arm64.tar.gz": "33c37be234ba8bee041961047b19160f4d7d0f164e8e246f78bdd10feff148b3",
    "node-v24.22.1-linux-x64.tar.gz": "eb6728e77c576a35162c122c45ccadf224d89ff00abc8dae46cc2897c6002d7c",
    "node-v24.22.1-win-arm64.zip": "a0c807319fede24c4a0d8f84564c82a619bd313b16b10c007c383c2609e99171",
    "node-v24.22.1-win-x64.zip": "d2046d28c2c3dcd211ac5145c0bf30e2047ef9dfb306693c8c6e2eccd8b95fa5",
}

## "darwin-arm64"·"linux-x64"·"win-x64" 등. 지원하지 않으면 ""
static func platform() -> String:
    var arch := Engine.get_architecture_name()
    var cpu := "arm64" if arch in ["arm64", "arm64v8"] else ("x64" if arch == "x86_64" else "")
    if cpu == "":
        return ""
    match OS.get_name():
        "macOS": return "darwin-" + cpu
        "Linux": return "linux-" + cpu
        "Windows": return "win-" + cpu
    return ""

static func archive_name(for_platform: String) -> String:
    return "node-v%s-%s.%s" % [VERSION, for_platform, "zip" if for_platform.begins_with("win") else "tar.gz"]

static func install_dir(base: String, for_platform: String) -> String:
    var home := OS.get_environment("USERPROFILE") if OS.get_name() == "Windows" else OS.get_environment("HOME")
    var root := base if not base.is_empty() else home.path_join(".ait-godot-sdk")
    return root.path_join("nodejs").path_join("v" + VERSION).path_join(for_platform)

static func node_path(dir: String, for_platform: String) -> String:
    return dir.path_join("node.exe") if for_platform.begins_with("win") else dir.path_join("bin/node")

## 받고 확인하고 풉니다. finished(node 경로, "") 또는 finished("", 이유)를 보냅니다. base를 비우면 홈 아래
func install(base := "") -> void:
    var target := platform()
    if target.is_empty() or not SHA256.has(archive_name(target)):
        finished.emit("", "이 컴퓨터(%s %s)용 Node를 자동으로 설치할 수 없습니다. https://nodejs.org 에서 설치하세요." % [OS.get_name(), Engine.get_architecture_name()])
        return
    var dir := install_dir(base, target)
    var existing := node_path(dir, target)
    if FileAccess.file_exists(existing):
        finished.emit(existing, "")
        return
    DirAccess.make_dir_recursive_absolute(dir)
    var name := archive_name(target)
    var archive := dir.path_join(name)
    var http := HTTPRequest.new()
    http.download_file = archive
    add_child(http)
    var err := http.request("https://nodejs.org/dist/v%s/%s" % [VERSION, name])
    if err != OK:
        http.queue_free()
        finished.emit("", "내려받기를 시작하지 못했습니다(%s)." % error_string(err))
        return
    var result: Array = await http.request_completed
    http.queue_free()
    if result[0] != HTTPRequest.RESULT_SUCCESS or result[1] != 200:
        finished.emit("", "내려받지 못했습니다(결과 %d, HTTP %d)." % [result[0], result[1]])
        return
    if FileAccess.get_sha256(archive) != SHA256[name]:
        DirAccess.remove_absolute(archive)
        finished.emit("", "체크섬이 맞지 않아 지웠습니다. 다시 시도하거나 https://nodejs.org 에서 설치하세요.")
        return
    var extract_error := _extract(archive, dir, target)
    DirAccess.remove_absolute(archive)
    if not extract_error.is_empty():
        finished.emit("", extract_error)
        return
    var node := node_path(dir, target)
    if not FileAccess.file_exists(node):
        finished.emit("", "풀었지만 node 실행 파일이 없습니다: %s" % node)
        return
    finished.emit(node, "")

func _extract(archive: String, dir: String, target: String) -> String:
    if not target.begins_with("win"):
        var output: Array = []
        var code := OS.execute("tar", ["-xzf", archive, "-C", dir, "--strip-components=1"], output, true)
        return "" if code == 0 else "압축을 풀지 못했습니다: %s" % "\n".join(output)
    var zip := ZIPReader.new()
    if zip.open(archive) != OK:
        return "zip을 열지 못했습니다."
    var prefix := "node-v%s-%s/" % [VERSION, target]
    for entry in zip.get_files():
        var rel := entry.trim_prefix(prefix)
        if rel.is_empty() or rel.ends_with("/"):
            continue
        DirAccess.make_dir_recursive_absolute(dir.path_join(rel).get_base_dir())
        var out := FileAccess.open(dir.path_join(rel), FileAccess.WRITE)
        out.store_buffer(zip.read_file(entry))
        out.close()
    zip.close()
    return ""
