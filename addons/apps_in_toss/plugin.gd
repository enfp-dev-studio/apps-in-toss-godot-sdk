@tool
extends EditorPlugin
## Unity SDK의 `AIT` 메뉴 전체를 Godot 에디터 상단 메인 스크린 탭
## (2D / 3D / Script / AssetLib 옆)으로 노출한다.
##
## AdMob·Firebase·Dialogue Manager류의 "가끔 여는 외부 연결 설정" 애드온이
## 흔히 쓰는 자리다. 실제 실행은 게임 리포에 설치된 ait-godot CLI를
## OS.execute()로 위임한다 — Unity의 AITBuildInitializer가 에디터 프로세스
## 안에서 C# 빌드 코드를 도는 것과 동일한 역할을 CLI 위임으로 재현한다.

const AUTOLOAD_NAME := "AIT"
const AUTOLOAD_PATH := "res://addons/apps_in_toss/ait.gd"
const PANEL_SCRIPT := preload("res://addons/apps_in_toss/editor/ait_panel.gd")

var _panel: Control


func _enter_tree() -> void:
	if not ProjectSettings.has_setting("autoload/%s" % AUTOLOAD_NAME):
		add_autoload_singleton(AUTOLOAD_NAME, AUTOLOAD_PATH)

	_panel = PANEL_SCRIPT.new()
	_panel.name = "AIT"
	_panel.visible = false
	EditorInterface.get_editor_main_screen().add_child(_panel)


func _exit_tree() -> void:
	if is_instance_valid(_panel):
		_panel.queue_free()
	if ProjectSettings.has_setting("autoload/%s" % AUTOLOAD_NAME):
		var configured_path := String(ProjectSettings.get_setting("autoload/%s" % AUTOLOAD_NAME))
		if configured_path.trim_prefix("*") == AUTOLOAD_PATH:
			remove_autoload_singleton(AUTOLOAD_NAME)


func _has_main_screen() -> bool:
	return true


func _make_visible(next_visible: bool) -> void:
	if is_instance_valid(_panel):
		_panel.visible = next_visible


func _get_plugin_name() -> String:
	return "AIT"


func _get_plugin_icon() -> Texture2D:
	# 에디터 테마의 범용 아이콘을 재사용한다. 버전에 따라 아이콘이 없을 수
	# 있으므로 실패 시 기본 EditorPlugin 아이콘(null)로 안전하게 폴백한다.
	var theme := EditorInterface.get_editor_theme()
	if theme and theme.has_icon("ExternalLink", "EditorIcons"):
		return theme.get_icon("ExternalLink", "EditorIcons")
	return null