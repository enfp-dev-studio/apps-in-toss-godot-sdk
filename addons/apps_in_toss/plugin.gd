@tool
extends EditorPlugin
## Unity SDK의 `AIT > Configuration / Dev Server / Build & Package / Publish`
## 에디터 메뉴에 대응한다. 각 메뉴 항목은 게임 리포에 설치된 ait-godot CLI를
## OS.execute()로 실행한다 — Unity의 AITBuildInitializer가 에디터 프로세스
## 안에서 빌드를 트리거하는 것과 동일한 역할을 npm CLI 위임으로 재현한다.

const AUTOLOAD_NAME := "AIT"
const AUTOLOAD_PATH := "res://addons/apps_in_toss/ait.gd"

const MENU_LABELS: Array[String] = [
	"AIT: Configuration 열기 (game.manifest.json)",
	"AIT: Doctor (호환성 검사)",
	"AIT: Doctor --strict",
	"AIT: Dev Server 시작 (mock + 브라우저)",
	"AIT: Build & Package (.ait 생성)",
	"AIT: Publish 안내",
]


func _enter_tree() -> void:
	if not ProjectSettings.has_setting("autoload/%s" % AUTOLOAD_NAME):
		add_autoload_singleton(AUTOLOAD_NAME, AUTOLOAD_PATH)

	add_tool_menu_item(MENU_LABELS[0], _open_configuration)
	add_tool_menu_item(MENU_LABELS[1], _run_doctor)
	add_tool_menu_item(MENU_LABELS[2], _run_doctor_strict)
	add_tool_menu_item(MENU_LABELS[3], _run_dev_server)
	add_tool_menu_item(MENU_LABELS[4], _run_build)
	add_tool_menu_item(MENU_LABELS[5], _show_publish_hint)


func _exit_tree() -> void:
	for label in MENU_LABELS:
		remove_tool_menu_item(label)
	if ProjectSettings.has_setting("autoload/%s" % AUTOLOAD_NAME):
		var configured_path := String(ProjectSettings.get_setting("autoload/%s" % AUTOLOAD_NAME))
		if configured_path.trim_prefix("*") == AUTOLOAD_PATH:
			remove_autoload_singleton(AUTOLOAD_NAME)


# ---------------------------------------------------------------- 명령 핸들러

func _open_configuration() -> void:
	var manifest_path := _project_dir().path_join(".ait/game.manifest.json")
	if not FileAccess.file_exists(manifest_path):
		_alert(
			"game.manifest.json이 없습니다.\n터미널에서 먼저 실행하세요:\n\n  npx ait-godot init <gameId> \"<이름>\"",
		)
		return
	OS.shell_open(manifest_path)


func _run_doctor() -> void:
	_run_cli(["doctor"], "AIT Doctor")


func _run_doctor_strict() -> void:
	_run_cli(["doctor", "--strict"], "AIT Doctor (strict)")


func _run_dev_server() -> void:
	# Unity Dev Server처럼 브라우저까지 자동으로 여는 것이 목표지만, build:dev와
	# preview는 각각 독립 프로세스라 여기서는 build:dev를 동기 실행한 뒤
	# preview 실행을 안내한다(Godot 에디터를 서버로 블로킹하지 않기 위함).
	var ok := _run_cli(["build:dev"], "AIT Dev Server (mock build)")
	if ok:
		_alert(
			"Dev 빌드 완료.\n터미널에서 계속 실행하세요:\n\n  npx ait-godot preview\n\n" +
			"브라우저가 열리면 API 테스터와 DevTools 패널을 확인하세요.",
		)


func _run_build() -> void:
	_run_cli(["build"], "AIT Build & Package")


func _show_publish_hint() -> void:
	_alert(
		"배포는 앱인토스 CLI를 그대로 사용합니다 (Unity의 AIT > Publish 대응):\n\n" +
		"  npx ait token add     (최초 1회, 콘솔 API 키)\n" +
		"  npx ait deploy\n\n" +
		"업로드 후 QR/deploymentId로 샌드박스·토스 앱에서 확인하세요.",
	)


# ---------------------------------------------------------------- CLI 실행

func _project_dir() -> String:
	return ProjectSettings.globalize_path("res://")


func _find_cli_bin() -> String:
	var candidate := _project_dir().path_join("node_modules/.bin/ait-godot")
	if FileAccess.file_exists(candidate):
		return candidate
	return ""


## OS.execute로 ait-godot CLI를 동기 실행한다. Unity 빌드도 에디터를 블로킹하며
## 진행되므로(Build & Package 중 Unity Editor가 멈추는 것과 동일한 UX), 여기서도
## 동기 실행 후 결과를 다이얼로그로 보여준다. 반환값: true(성공)/false(실패).
func _run_cli(args: PackedStringArray, label: String) -> bool:
	var cli_bin := _find_cli_bin()
	if cli_bin.is_empty():
		_alert(
			"%s: ait-godot CLI를 찾을 수 없습니다.\n\n터미널에서 먼저 설치하세요:\n\n  npm i -D @enfp-dev/ait-godot" % label,
		)
		return false

	var output: Array = []
	var exit_code := OS.execute(cli_bin, args, output, true, true)
	print("[%s]\n%s" % [label, "\n".join(output)])

	if exit_code != 0:
		_alert("%s 실패 (exit %d).\n에디터 하단 출력(Output) 패널에서 로그를 확인하세요." % [label, exit_code])
		return false
	_alert("%s 완료." % label)
	return true


func _alert(message: String) -> void:
	var dialog := AcceptDialog.new()
	dialog.dialog_text = message
	dialog.title = "Apps in Toss"
	EditorInterface.get_base_control().add_child(dialog)
	dialog.popup_centered()
	dialog.confirmed.connect(dialog.queue_free)
	dialog.canceled.connect(dialog.queue_free)