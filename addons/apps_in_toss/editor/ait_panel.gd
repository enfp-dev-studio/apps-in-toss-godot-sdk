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


func _find_cli_bin() -> String:
	var candidate := _project_dir().path_join("node_modules/.bin/ait-godot")
	if FileAccess.file_exists(candidate):
		return candidate
	return ""


func _refresh_status() -> void:
	var has_manifest := FileAccess.file_exists(_project_dir().path_join(".ait/game.manifest.json"))
	var has_cli := not _find_cli_bin().is_empty()
	var parts: Array[String] = []
	parts.append("CLI: %s" % ("설치됨" if has_cli else "없음 (npm i -D @enfp-dev/ait-godot)"))
	parts.append(".ait/: %s" % ("있음" if has_manifest else "없음 (npx ait-godot init)"))
	_status.text = " | ".join(parts)


## OS.execute로 CLI를 동기 실행한다(Unity Build & Package도 에디터를 블로킹하며
## 진행되는 것과 동일한 UX). 결과와 exit code를 로그에 누적 출력한다.
func _run_cli(args: PackedStringArray, label: String) -> bool:
	if _busy:
		return false
	var cli_bin := _find_cli_bin()
	if cli_bin.is_empty():
		_append_log("[%s] ait-godot CLI를 찾을 수 없습니다. 터미널에서: npm i -D @enfp-dev/ait-godot" % label)
		return false

	_set_busy(true, "%s 실행 중..." % label)
	_append_log("▶ %s (ait-godot %s)" % [label, " ".join(args)])

	var output: Array = []
	# open_console=false 필수: true면 macOS에서 출력이 별도 콘솔 창으로 새어나가
	# output 배열이 비어버린다(로그 패널에 아무것도 안 쌓이던 버그의 원인).
	var exit_code := OS.execute(cli_bin, args, output, true, false)
	_append_log("\n".join(output))

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