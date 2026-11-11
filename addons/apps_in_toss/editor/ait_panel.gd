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
var _qr: TextureRect
var _busy := false
var _dev_server_pid := 0


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
	_add_button(toolbar, "서버 정지", _stop_dev_server)
	_add_button(toolbar, "서버 재시작", _restart_dev_server)
	_add_button(toolbar, "Build & Package", _run_build)
	_add_button(toolbar, "Deploy for Online Test", _deploy_test)
	_add_button(toolbar, "Deploy Release Candidate", _deploy_rc)
	_add_button(toolbar, "업데이트 확인", _check_updates)
	_add_button(toolbar, "빌드 결과 열기", _open_build_output)
	_add_button(toolbar, "정리(Clean)", _clean)
	_add_button(toolbar, "셸 초기화", _reset_shell)
	_add_button(toolbar, "SDK 상태 초기화", _reset_state)
	_add_button(toolbar, "로그 지우기", _clear_log)
	_add_button(toolbar, "node 경로 지정...", _prompt_node_path)
	_add_button(toolbar, "Node 설치", _install_node)
	_add_button(toolbar, "빌드 전 최적화 검사", _scan_optimization)
	_add_button(toolbar, "git 보호 검사", _git_guard)
	_add_button(toolbar, "이슈 제보하기", _report_issue)

	_status = Label.new()
	_status.text = "대기 중"
	root.add_child(_status)

	# 배포 결과 QR(Unity DeploySuccessWindow 대응). 배포가 끝나면 build/deploy-qr.png를 띄운다
	_qr = TextureRect.new()
	_qr.custom_minimum_size = Vector2(160, 160)
	_qr.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_qr.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_qr.visible = false
	root.add_child(_qr)

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

## 매니페스트 설정 창(Unity AIT Configuration 대응)
func _open_configuration() -> void:
	var manifest_path := _project_dir().path_join(".ait/game.manifest.json")
	if not FileAccess.file_exists(manifest_path):
		_append_log("[game.manifest.json 없음] 터미널에서 먼저 실행하세요: node addons/apps_in_toss/tools/ait-godot.mjs init <gameId> \"<이름>\"")
		return
	var dialog := AITConfigDialog.new()
	add_child(dialog)
	if not dialog.load_manifest(manifest_path):
		dialog.queue_free()
		_append_log("game.manifest.json을 읽지 못했습니다(JSON 확인). 파일을 직접 엽니다.")
		OS.shell_open(manifest_path)
		return
	dialog.confirmed.connect(func() -> void: _append_log("game.manifest.json을 저장했습니다. 다음 빌드부터 반영됩니다."))
	dialog.close_requested.connect(dialog.queue_free)
	dialog.popup_centered()


## 이슈 제보(Unity 이슈 제보하기 대응): 제목·내용을 받아 SDK 저장소의 GitHub 이슈 작성 화면을 진단 정보로 채워 엽니다
func _report_issue() -> void:
	var dialog := ConfirmationDialog.new()
	dialog.title = "이슈 제보하기"
	dialog.ok_button_text = "GitHub에서 쓰기"
	var box := VBoxContainer.new()
	var title_edit := LineEdit.new()
	title_edit.placeholder_text = "제목"
	var body_edit := TextEdit.new()
	body_edit.placeholder_text = "무엇이 어떻게 안 되는지(재현 순서)"
	body_edit.custom_minimum_size = Vector2(420, 160)
	box.add_child(title_edit)
	box.add_child(body_edit)
	var note := Label.new()
	note.text = "SDK·Godot 판, OS, 마지막 빌드 실패 진단이 함께 채워집니다. 보내기 전에 브라우저에서 고칠 수 있습니다."
	note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	note.custom_minimum_size.x = 420
	box.add_child(note)
	dialog.add_child(box)
	add_child(dialog)
	dialog.confirmed.connect(func() -> void:
		OS.shell_open(AITIssueReport.url(title_edit.text, AITIssueReport.body(_project_dir(), body_edit.text))))
	dialog.close_requested.connect(dialog.queue_free)
	dialog.popup_centered()


func _run_doctor() -> void:
	_run_cli(["doctor"], "Doctor")


func _run_doctor_strict() -> void:
	_run_cli(["doctor", "--strict"], "Doctor (strict)")


func _run_dev_server() -> void:
	# Unity Dev Server 대응: build:dev(동기) → preview 서버(비동기) → 브라우저 자동 오픈.
	# preview는 종료하지 않는 서버라 OS.execute(동기)로는 못 띄우고 OS.create_process로
	# 백그라운드 프로세스로 띄워야 에디터도 멈추지 않는다.
	var ok := _run_cli(["build:dev"], "Dev Server (mock build)")
	if not ok:
		return

	var node_exe := _require_node("Preview server")
	if node_exe.is_empty():
		return
	var entry := _find_cli_entry()
	var export_dir := _project_dir().path_join("build/godot-web")

	var pid := OS.create_process(node_exe, [entry, "preview", export_dir])
	if pid == -1:
		_append_log("[Preview] 서버 시작 실패 (OS.create_process)")
		return
	_dev_server_pid = pid
	_append_log("[Preview] 개발 서버 시작 (PID %d). 브라우저 주소는 출력 패널/로그에서 확인하세요." % pid)

	# 서버가 몇 초 내에 뜨면 vite가 localhost:<port>를 출력한다 — 폴링해서 자동 오픈.
	_wait_and_open_browser(pid)


func _wait_and_open_browser(pid: int) -> void:
	for attempt in 20:  # 최대 20초 빌드+서버 기동 대기
		await get_tree().create_timer(1.0).timeout
		if not OS.is_process_running(pid):
			_append_log("[Preview] 서버 프로세스가 조기 종료됐습니다. 로그를 확인하세요.")
			_dev_server_pid = 0
			return
		var base_port := _preview_port()
		for port in [base_port, base_port + 1, base_port + 2, base_port + 3, base_port + 4]:
			if await _http_probe("http://localhost:%d/" % port):
				_append_log("[Preview] 응답 확인: http://localhost:%d/ → 브라우저를 엽니다." % port)
				OS.shell_open("http://localhost:%d/" % port)
				return
	_append_log("[Preview] 서버 포트를 자동으로 찾지 못했습니다. 프로세스는 살아 있어요.")


func _http_probe(url: String) -> bool:
	var http := HTTPRequest.new()
	http.timeout = 1.5
	add_child(http)
	http.request(url)
	var result: Array = await http.request_completed
	http.queue_free()
	return result[0] == HTTPRequest.RESULT_SUCCESS


func _stop_dev_server() -> void:
	if _dev_server_pid == 0:
		return
	if OS.is_process_running(_dev_server_pid):
		OS.kill(_dev_server_pid)
		_append_log("[Preview] 개발 서버를 종료했습니다.")
	_dev_server_pid = 0


func _restart_dev_server() -> void:
	_stop_dev_server()
	_run_dev_server()


## 매니페스트 preview.port(없으면 5173)
func _preview_port() -> int:
	var manifest: Variant = JSON.parse_string(FileAccess.get_file_as_string(_project_dir().path_join(".ait/game.manifest.json")))
	if manifest is Dictionary and manifest.get("preview") is Dictionary:
		return int(manifest["preview"].get("port", 5173))
	return 5173


func _open_build_output() -> void:
	var dir := _project_dir().path_join("build/godot-web")
	if not DirAccess.dir_exists_absolute(dir):
		_append_log("[빌드 결과] build/godot-web이 없습니다. 먼저 Build & Package나 Dev Server를 실행하세요.")
		return
	OS.shell_open(dir)


func _clean() -> void:
	_stop_dev_server()
	_run_cli(PackedStringArray(["clean"]), "정리")


func _reset_shell() -> void:
	var dialog := ConfirmationDialog.new()
	dialog.dialog_text = "custom_shell.html을 SDK 템플릿으로 바꿉니다. 지금 셸은 custom_shell.html.bak으로 남깁니다."
	add_child(dialog)
	dialog.confirmed.connect(func() -> void: _run_cli(PackedStringArray(["shell:reset"]), "셸 초기화"))
	dialog.close_requested.connect(dialog.queue_free)
	dialog.popup_centered()


## 패널이 기억하는 것(node 경로, 개발 서버, QR, 로그)을 지웁니다(Unity Reset All SDK State 대응)
func _reset_state() -> void:
	_stop_dev_server()
	var settings := EditorInterface.get_editor_settings()
	if settings.has_setting("apps_in_toss/node_executable_path"):
		settings.erase("apps_in_toss/node_executable_path")
	_qr.visible = false
	_clear_log()
	_append_log("SDK 상태를 초기화했습니다(node 경로 지정·개발 서버·배포 QR).")
	_refresh_status()


## Node.js를 받아 설치하고 패널의 node 경로로 지정합니다(Unity AITNodeJSDownloader 대응)
func _install_node() -> void:
	if _busy:
		return
	_set_busy(true, "Node.js %s 내려받는 중... (약 40~50MB)" % AITNodeInstaller.VERSION)
	var installer := AITNodeInstaller.new()
	add_child(installer)
	installer.install.call_deferred()
	var outcome: Array = await installer.finished
	installer.queue_free()
	_set_busy(false, "Node 설치 %s" % ("완료" if outcome[1] == "" else "실패"))
	if outcome[1] != "":
		_append_log("[Node 설치] 실패: %s" % outcome[1])
		return
	EditorInterface.get_editor_settings().set_setting("apps_in_toss/node_executable_path", outcome[0])
	_append_log("[Node 설치] %s를 쓰도록 지정했습니다." % outcome[0])
	_refresh_status()


func _git_guard() -> void:
	_run_cli(PackedStringArray(["git:guard"]), "git 보호 검사")
	_append_log("고치려면 터미널에서: node addons/apps_in_toss/tools/ait-godot.mjs git:guard --fix (빠진 줄 더하기 + git rm --cached)")


func _scan_optimization() -> void:
	_run_cli(PackedStringArray(["optimize"]), "빌드 전 최적화 검사")
	_append_log("고치려면 터미널에서: node addons/apps_in_toss/tools/ait-godot.mjs optimize --fix (그림·소리 품질이 바뀌니 목록을 먼저 확인하세요)")


func _run_build() -> void:
	_run_cli(["build"], "Build & Package")


func _check_updates() -> void:
	_run_cli(PackedStringArray(["update", "--check"]), "업데이트 확인")


func _deploy_test() -> void:
	_deploy(PackedStringArray(["deploy"]), "Deploy for Online Test")


func _deploy_rc() -> void:
	_deploy(PackedStringArray(["deploy", "--rc"]), "Deploy Release Candidate")


func _deploy(args: PackedStringArray, label: String) -> void:
	_qr.visible = false
	if not _run_cli(args, label):
		_append_log("배포 토큰이 없다면 터미널에서 처음 한 번: addons/apps_in_toss/tools/bridge/node_modules/.bin/ait token add")
		return
	var png := _project_dir().path_join("build/deploy-qr.png")
	var image := Image.load_from_file(png) if FileAccess.file_exists(png) else null
	if image != null:
		_qr.texture = ImageTexture.create_from_image(image)
		_qr.visible = true
	var result: Variant = JSON.parse_string(FileAccess.get_file_as_string(_project_dir().path_join("build/deploy-result.json")))
	if result is Dictionary:
		DisplayServer.clipboard_set(String(result.get("link", "")))
		_append_log("링크를 클립보드에 복사했습니다: %s" % result.get("link", ""))


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
##
## 내장 모드: CLI가 SDK 애드온(addons/apps_in_toss/tools/ait-godot.mjs)에 포함되어
## 있으므로 npm 패키지 설치 없이 res:// 경로에서 바로 찾는다.
func _find_cli_entry() -> String:
	var embedded := _project_dir().path_join("addons/apps_in_toss/tools/ait-godot.mjs")
	if FileAccess.file_exists(embedded):
		return embedded
	# 레거시: npm 패키지(@enfp-dev/ait-godot)로 설치된 경우
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
	parts.append("CLI: %s" % ("내장" if has_cli else "없음 (애드온 재설치 필요)"))
	parts.append(".ait/: %s" % ("있음" if has_manifest else "없음 (ait-godot init)"))
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
		"  비표준 위치에 설치했다면 \"node 경로 지정...\" 버튼으로 직접 지정할 수 있습니다.\n" +
		"  \"Node 설치\" 버튼은 Node.js %s를 받아(약 40~50MB, SHA256 확인) 이 패널에 연결합니다." % AITNodeInstaller.VERSION,
	)
	return ""


## node 실행 파일 절대 경로로 CLI 진입점(.js)을 직접 실행한다. 셸을 거치지
## 않으므로 사용자의 dotfile·PATH 설정과 무관하게 동작한다.
func _run_cli(args: PackedStringArray, label: String) -> bool:
	if _busy:
		return false

	var entry := _find_cli_entry()
	if entry.is_empty():
		_append_log("[%s] 실패: ait-godot CLI를 찾을 수 없습니다. 애드온을 다시 설치하세요." % label)
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
	if not success:
		_show_build_diagnosis()
	_append_log("◀ %s %s (exit %d)\n" % [label, "성공" if success else "실패", exit_code])
	_set_busy(false, "%s %s" % [label, "완료" if success else "실패"])
	_refresh_status()
	return success


## 빌드 실패 진단(build/last-build-error.json, Unity AITBuildDiagnostics 대응)의 할 일을 로그에 보여 줍니다
func _show_build_diagnosis() -> void:
	var path := _project_dir().path_join("build/last-build-error.json")
	if not FileAccess.file_exists(path):
		return
	var diagnosis: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not diagnosis is Dictionary:
		return
	var hints: Array = diagnosis.get("hints", [])
	if hints.is_empty():
		return
	_append_log("[진단] %s 실패 — 할 일:\n  - %s" % [diagnosis.get("step", ""), "\n  - ".join(PackedStringArray(hints))])


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