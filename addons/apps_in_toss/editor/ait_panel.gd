@tool
extends Control
## Apps in Toss 통합 패널 — Unity SDK의 AIT 메뉴 전체를 하나의 도킹 패널로 통합한다.
## 다른 Godot 애드온(Git, GitHub Actions 등)처럼 하단 패널에 상주하며,
## 버튼 클릭 → CLI 실행 → 로그 누적 표시의 단일 흐름을 제공한다.
##
## 개별 Tool 메뉴 항목 + 매번 뜨는 모달 다이얼로그 대신, 상태·로그가 계속
## 보이는 패널 하나로 통합했다 (이전 버전의 6개 메뉴 항목을 대체).

const LOCK_LABELS := {
	"doctor": "Doctor",
	"doctor_strict": "Doctor --strict",
	"dev_server": "Dev Server (mock build)",
	"build": "Build & Package",
}

var _log: TextEdit
var _status: Label
var _buttons: Array[Button] = []
var _busy := false


func _ready() -> void:
	_build_ui()
	_refresh_status()


func _build_ui() -> void:
	custom_minimum_size = Vector2(0, 220)

	var root := VBoxContainer.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_theme_constant_override("separation", 6)
	add_child(root)

	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 8)
	margin.add_theme_constant_override("margin_top", 8)
	margin.add_theme_constant_override("margin_right", 8)
	margin.add_theme_constant_override("margin_bottom", 8)
	margin.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(margin)

	var inner := VBoxContainer.new()
	inner.add_theme_constant_override("separation", 6)
	margin.add_child(inner)

	var toolbar := HFlowContainer.new()
	toolbar.add_theme_constant_override("h_separation", 6)
	toolbar.add_theme_constant_override("v_separation", 6)
	inner.add_child(toolbar)

	_add_button(toolbar, "Configuration 열기", _open_configuration)
	_add_button(toolbar, "Doctor", _run_doctor)
	_add_button(toolbar, "Doctor --strict", _run_doctor_strict)
	_add_button(toolbar, "Dev Server", _run_dev_server)
	_add_button(toolbar, "Build & Package", _run_build)
	_add_button(toolbar, "Publish 안내", _show_publish_hint)
	_add_button(toolbar, "로그 지우기", _clear_log)

	_status = Label.new()
	_status.text = "대기 중"
	inner.add_child(_status)

	_log = TextEdit.new()
	_log.editable = false
	_log.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	_log.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_log.placeholder_text = "명령을 실행하면 결과가 여기 누적됩니다."
	inner.add_child(_log)


func _add_button(parent: Control, text: String, handler: Callable) -> void:
	var button := Button.new()
	button.text = text
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
## 진행되는 것과 동일한 UX). 결과와 exit code를 로그 패널에 누적 출력한다.
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
	var exit_code := OS.execute(cli_bin, args, output, true, true)
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