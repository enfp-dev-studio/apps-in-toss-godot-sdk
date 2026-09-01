@tool
extends Control
## Apps in Toss 메인 스크린 탭 — 2D/3D/Script/AssetLib 옆에 추가되는
## 상단 탭 화면. Unity SDK의 AIT 메뉴 전체(Configuration/Doctor/Dev Server/
## Build & Package/Publish)를 여기 하나로 통합한다.
##
## AdMob·Firebase·Dialogue Manager류의 "가끔 여는 외부 연결 설정" 애드온이
## 흔히 쓰는 패턴(상단 메인 스크린 탭)을 따른다 — 상시 조작용 하단 패널과는
## 다른 자리다.

var _log: TextEdit
var _status: Label
var _buttons: Array[Button] = []
var _busy := false


func _ready() -> void:
	_build_ui()
	_refresh_status()


func _build_ui() -> void:
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var background := ColorRect.new()
	background.color = get_theme_color("dark_color_2", "Editor") if has_theme_color("dark_color_2", "Editor") else Color(0.14, 0.15, 0.17)
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(background)

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side in ["left", "top", "right", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 16)
	add_child(margin)

	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 10)
	margin.add_child(root)

	var title := Label.new()
	title.text = "Apps in Toss"
	title.add_theme_font_size_override("font_size", 20)
	root.add_child(title)

	var subtitle := Label.new()
	subtitle.text = "Unity SDK의 AIT 메뉴(Configuration / Dev Server / Build & Package / Publish)에 대응합니다."
	subtitle.add_theme_color_override("font_color", Color(0.7, 0.7, 0.7))
	root.add_child(subtitle)

	var toolbar := HFlowContainer.new()
	toolbar.add_theme_constant_override("h_separation", 8)
	toolbar.add_theme_constant_override("v_separation", 8)
	root.add_child(toolbar)

	_add_button(toolbar, "Configuration 열기", _open_configuration)
	_add_button(toolbar, "Doctor", _run_doctor)
	_add_button(toolbar, "Doctor --strict", _run_doctor_strict)
	_add_button(toolbar, "Dev Server", _run_dev_server)
	_add_button(toolbar, "Build & Package", _run_build)
	_add_button(toolbar, "Publish 안내", _show_publish_hint)
	_add_button(toolbar, "로그 지우기", _clear_log)
	_add_button(toolbar, "node 경로 지정...", _prompt_node_path)

	_status = Label.new()
	_status.text = "대기 중"
	root.add_child(_status)

	var log_panel := PanelContainer.new()
	log_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(log_panel)

	_log = TextEdit.new()
	_log.editable = false
	_log.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	_log.placeholder_text = "명령을 실행하면 결과가 여기 누적됩니다."
	log_panel.add_child(_log)


func _add_button(parent: Control, text: String, handler: Callable) -> void:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size = Vector2(0, 36)
	button.pressed.connect(handler)
	parent.add_child(button)
	_buttons.append(button)


# ---------------------------------------------------------------- 명령 핸들러

func _open_configuration() -> void:
	var manifest_path := _project_dir().path_join(".ait/game.manifest.json")
	if not FileAccess.file_exists(manifest_path):
		_append_log("[game.manifest.json 없음] 터미널에서 먼저 실행하세요: npx ait-godot init <gameId> \"<이름>\"")
		return
	OS.shell_open(manifest_path)
	_append_log("game.manifest.json을 기본 편집기로 열었습니다.")


func _run_doctor() -> void:
	_run_cli(["doctor"], "Doctor")


func _run_doctor_strict() -> void:
	_run_cli(["doctor", "--strict"], "Doctor (strict)")


func _run_dev_server() -> void:
	var ok := _run_cli(["build:dev"], "Dev Server (mock build)")
	if ok:
		_append_log(
			"Dev 빌드 완료. 터미널에서 계속 실행하세요: npx ait-godot preview\n" +
			"브라우저가 열리면 API 테스터와 DevTools 패널을 확인하세요.",
		)


func _run_build() -> void:
	_run_cli(["build"], "Build & Package")


func _show_publish_hint() -> void:
	_append_log(
		"배포는 앱인토스 CLI를 그대로 사용합니다 (Unity AIT > Publish 대응):\n" +
		"  npx ait token add     (최초 1회, 콘솔 API 키)\n" +
		"  npx ait deploy",
	)


func _clear_log() -> void:
	if _log:
		_log.text = ""


# ---------------------------------------------------------------- 상태·CLI 실행

func _project_dir() -> String:
	return ProjectSettings.globalize_path("res://")


## npm이 만드는 node_modules/.bin 셔뱅 스크립트를 직접 실행하는 대신, package.json의
## "bin" 필드에서 실제 JS 진입점 경로를 읽어 절대 경로로 반환한다. 셔뱅(#!/usr/bin/env
## node) 해석에 PATH가 필요 없게 되어, 이후 node 실행 파일도 애드온이 직접 찾은
## 절대 경로로 호출하면 셸이나 사용자의 PATH 설정에 전혀 의존하지 않는다.
func _find_cli_entry() -> String:
	var package_dir := _project_dir().path_join("node_modules/@enfp-dev/ait-godot")
	var package_json_path := package_dir.path_join("package.json")
	if not FileAccess.file_exists(package_json_path):
		return ""
	var file := FileAccess.open(package_json_path, FileAccess.READ)
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if typeof(parsed) != TYPE_DICTIONARY:
		return ""
	var bin_field: Variant = parsed.get("bin")
	var rel_path := ""
	if typeof(bin_field) == TYPE_STRING:
		rel_path = bin_field
	elif typeof(bin_field) == TYPE_DICTIONARY:
		rel_path = String(bin_field.get("ait-godot", ""))
	if rel_path.is_empty():
		return ""
	return package_dir.path_join(rel_path)


## node 실행 파일의 절대 경로를 애드온이 직접 찾는다 — 셸(zsh -lc 등)에 위임하지
## 않는다. Godot.app을 Finder/Dock에서 실행하면 최소 PATH만 상속되어 사용자의
## .zshrc에 등록된 node(nvm, volta, ~/.local/bin 등)를 못 찾는 문제를 피한다.
## 우선순위: EditorSettings에 저장된 수동 지정 → 흔한 설치 위치 → 현재 PATH.
func _find_node_executable() -> String:
	var settings := EditorInterface.get_editor_settings()
	const SETTING_KEY := "apps_in_toss/node_executable_path"
	if settings.has_setting(SETTING_KEY):
		var manual := String(settings.get_setting(SETTING_KEY))
		if not manual.is_empty() and FileAccess.file_exists(manual):
			return manual

	var home := OS.get_environment("HOME")
	var candidates := PackedStringArray([
		"/opt/homebrew/bin/node",
		"/usr/local/bin/node",
		"/usr/bin/node",
		home.path_join(".local/bin/node"),
		home.path_join(".volta/bin/node"),
	])
	for candidate in candidates:
		if FileAccess.file_exists(candidate):
			return candidate

	# nvm은 버전별 디렉터리라 고정 경로가 없다 — 설치된 버전 중 하나를 찾는다.
	var nvm_dir := home.path_join(".nvm/versions/node")
	if DirAccess.dir_exists_absolute(nvm_dir):
		var dir := DirAccess.open(nvm_dir)
		if dir:
			for entry in dir.get_directories():
				var node_path := nvm_dir.path_join(entry).path_join("bin/node")
				if FileAccess.file_exists(node_path):
					return node_path

	# 마지막 수단: 현재 프로세스가 이미 PATH에서 node를 상속받은 경우
	# (터미널에서 실행된 Godot일 때) 그대로 사용한다.
	for path_entry in OS.get_environment("PATH").split(":"):
		var candidate := path_entry.path_join("node")
		if FileAccess.file_exists(candidate):
			return candidate

	return ""


func _prompt_node_path() -> void:
	var dialog := FileDialog.new()
	dialog.file_mode = FileDialog.FILE_MODE_OPEN_FILE
	dialog.access = FileDialog.ACCESS_FILESYSTEM
	dialog.title = "node 실행 파일 선택"
	dialog.file_selected.connect(func(path: String) -> void:
		EditorInterface.get_editor_settings().set_setting("apps_in_toss/node_executable_path", path)
		_append_log("node 경로를 저장했습니다: %s" % path)
		_refresh_status()
	)
	EditorInterface.get_base_control().add_child(dialog)
	dialog.popup_centered_ratio(0.6)


func _refresh_status() -> void:
	var has_manifest := FileAccess.file_exists(_project_dir().path_join(".ait/game.manifest.json"))
	var has_cli := not _find_cli_entry().is_empty()
	var found_node := _find_node_executable()
	var has_node := not found_node.is_empty()
	print("[AIT panel] node search result: '%s' (found=%s)" % [found_node, has_node])
	var parts: Array[String] = []
	parts.append("node: %s" % ("찾음" if has_node else "없음"))
	parts.append("CLI: %s" % ("설치됨" if has_cli else "없음 (npm i -D @enfp-dev/ait-godot)"))
	parts.append(".ait/: %s" % ("있음" if has_manifest else "없음 (npx ait-godot init)"))
	_status.text = " | ".join(parts)
	print("[AIT panel] status text set to: ", _status.text)


## node 미탐색 시: FileDialog를 자동으로 띄우지 않고 로그로 안내만 한다(실패 처리).
## 유저가 node를 설치했는데 못 찾은 경우엔 "node 경로 지정..." 버튼으로 수동 지정.
func _require_node(label: String) -> String:
	var node_exe := _find_node_executable()
	if not node_exe.is_empty():
		return node_exe
	_append_log(
		"[%s] 실패: Node.js를 찾을 수 없습니다.\n" % label +
		"  이 파이프라인은 Node.js(>=24)가 필요합니다. https://nodejs.org 에서 설치하거나,\n" +
		"  nvm/volta 등으로 설치한 뒤 Godot을 재시작하세요.\n" +
		"  비표준 위치에 설치했다면 \"node 경로 지정...\" 버튼으로 직접 지정할 수 있습니다.",
	)
	return ""


## node 실행 파일 절대 경로로 CLI 진입점(.js)을 직접 실행한다. 셸을 거치지
## 않으므로 사용자의 dotfile·PATH 설정과 무관하게 동작한다.
func _run_cli(args: PackedStringArray, label: String) -> bool:
	if _busy:
		return false

	var entry := _find_cli_entry()
	if entry.is_empty():
		_append_log("[%s] 실패: ait-godot CLI가 설치되어 있지 않습니다. 게임 리포에서:\n  npm i -D @enfp-dev/ait-godot" % label)
		return false

	var node_exe := _require_node(label)
	if node_exe.is_empty():
		return false

	_set_busy(true, "%s 실행 중..." % label)
	_append_log("▶ %s (%s %s %s)" % [label, node_exe, entry, " ".join(args)])

	var output: Array = []
	# open_console=false 필수: true면 macOS에서 출력이 별도 콘솔 창으로 새어나가
	# output 배열이 비어버린다.
	var exit_code := OS.execute(node_exe, [entry] + Array(args), output, true, false)
	_append_log("\n".join(output) if not output.is_empty() else "(출력 없음)")

	var success := exit_code == 0
	_append_log("◀ %s %s (exit %d)\n" % [label, "성공" if success else "실패", exit_code])
	_set_busy(false, "%s %s" % [label, "완료" if success else "실패"])
	_refresh_status()
	return success


func _set_busy(busy: bool, status_text: String) -> void:
	_busy = busy
	_status.text = status_text
	for button in _buttons:
		if is_instance_valid(button):
			button.disabled = busy


func _append_log(text: String) -> void:
	if not _log:
		return
	_log.text += text + "\n"
	_log.set_caret_line(_log.get_line_count())