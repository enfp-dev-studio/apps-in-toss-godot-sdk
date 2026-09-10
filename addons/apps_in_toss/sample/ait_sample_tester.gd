extends CanvasLayer
class_name AITSampleTester
## Unity SDK의 InteractiveAPITester + E2EBootstrapper에 대응하는 샘플 하네스.
##
## - 인터랙티브 모드: AITGeneratedCatalog.APIS를 목록으로 제시하고, 항목을 누르면
##   이 샘플이 아는 파라미터 양식(문자열 입력)을 보여준 뒤 호출 결과를 표시한다.
## - E2E 모드: URL에 ?e2e=true가 있으면(JavaScriptBridge로 확인) 파라미터 없는
##   API를 자동으로 순회 호출해 결과 로그를 남긴다. Unity의 e2e 자동화에 대응.
##
## 이 씬은 smoke-test/예제일 뿐이다. 실제 게임은 이 파일을 복사하지 말고
## 필요한 AIT API만 게임 코드에서 호출하면 된다.

const TEST_TIMEOUT_MS := 15_000
const TEST_AD_GROUP_ID := ""  # 실기기 광고 테스트 시 콘솔 광고 그룹 ID를 넣는다.
const E2E_MODE_VAR := "ait_e2e_mode"

var _api_list: ItemList
var _detail_label: RichTextLabel
var _param_input: LineEdit
var _call_button: Button
var _selected_api: Dictionary = {}
var _busy := false


func _ready() -> void:
	_build_ui()
	if OS.has_feature("web"):
		_check_e2e_mode()
	else:
		_append("에디터/데스크톱에서는 브리지가 없어 결과가 비어 있다. Web 빌드에서 실행해 주세요.")


# ---------------------------------------------------------------- UI 빌드

func _build_ui() -> void:
	layer = 10
	var root := Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(root)

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side in ["margin_left", "margin_top", "margin_right"]:
		margin.add_theme_constant_override("margin_" + side, 16)
	margin.add_theme_constant_override("margin_bottom", 34)
	root.add_child(margin)

	var split := VSplitContainer.new()
	split.size_flags_vertical = Control.SIZE_EXPAND_FILL
	margin.add_child(split)

	# API 목록 (카탈로그 단일 소스를 그대로 소비한다)
	_api_list = ItemList.new()
	_api_list.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_api_list.custom_minimum_size = Vector2(0, 200)
	_api_list.item_selected.connect(_on_api_selected)
	split.add_child(_api_list)

	var bottom := VBoxContainer.new()
	bottom.size_flags_vertical = Control.SIZE_EXPAND_FILL
	split.add_child(bottom)

	_param_input = LineEdit.new()
	_param_input.placeholder_text = "파라미터 (필요한 API만, 예: URL 또는 텍스트)"
	_param_input.custom_minimum_size = Vector2(0, 48)
	_param_input.visible = false
	bottom.add_child(_param_input)

	_call_button = Button.new()
	_call_button.text = "선택한 API 호출"
	_call_button.custom_minimum_size = Vector2(0, 52)
	_call_button.visible = false
	_call_button.pressed.connect(_on_invoke_pressed)
	bottom.add_child(_call_button)

	_detail_label = RichTextLabel.new()
	_detail_label.bbcode_enabled = true
	_detail_label.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_detail_label.custom_minimum_size = Vector2(0, 180)
	_detail_label.text = "API를 선택하세요. 일부 API는 토스 앱 환경에서만 응답합니다."
	bottom.add_child(_detail_label)

	_fill_api_list()


func _fill_api_list() -> void:
	_api_list.clear()
	for api in AITGeneratedCatalog.APIS:
		var label := "%s(%s)" % [api.name, ", ".join(api.args)]
		_api_list.add_item(label)


# ---------------------------------------------------------------- 상호작용

func _on_api_selected(index: int) -> void:
	_selected_api = AITGeneratedCatalog.APIS[index] if index < AITGeneratedCatalog.APIS.size() else {}
	var args: Array = _selected_api.get("args", [])
	_param_input.visible = not args.is_empty()
	_call_button.disabled = false
	_call_button.text = "%s 호출" % _selected_api.get("name", "")
	_detail_label.text = "[b]%s[/b]\npath: %s\nargs: %s" % [
		_selected_api.get("name", ""), _selected_api.get("path", ""), str(args),
	]


func _on_invoke_pressed() -> void:
	if _busy or _selected_api.is_empty():
		return
	_busy = true
	_call_button.disabled = true
	var response: Dictionary = await AIT.invoke_and_wait(
		String(_selected_api.get("path", "")),
		_argument_for(_selected_api),
		TEST_TIMEOUT_MS
	)
	_busy = false
	_call_button.disabled = false
	if response.get("ok", false):
		_detail_label.text = "[b]%s[/b]\n[colored=#177e2e]OK[/colored]\n%s" % [
			_selected_api.get("name", ""), JSON.stringify(response.get("result"), "  ", false)]
	else:
		var error: Variant = response.get("error", {})
		_detail_label.text = "[b]%s[/b]\n[colored=#e42939]실패[/colored]\n%s" % [
			_selected_api.get("name", ""), JSON.stringify(error, "  ", false)]


func _argument_for(_api: Dictionary) -> Array:
	# 이 샘플은 문자열 파라미터만 단일 값으로 넘긴다. 실제 게임은 타입에 맞춰 구성.
	if _param_input.visible and not _param_input.text.is_empty():
		return [_param_input.text]
	return []


# ---------------------------------------------------------------- E2E 모드

func _check_e2e_mode() -> void:
	if not OS.has_feature("web"):
		return
	var bridge: JavaScriptObject = JavaScriptBridge.get_interface("AITGodotE2EProbe")
	if bridge == null:
		return
	var enabled: bool = bool(bridge.is_e2e())
	Engine.set_meta(E2E_MODE_VAR, enabled)
	if enabled:
		_run_e2e_suite()


func _run_e2e_suite() -> void:
	_append("[b]E2E 자동 점검 시작[/b] (파라미터 없는 API 순회)")
	for api in AITGeneratedCatalog.APIS:
		var args: Array = api.get("args", [])
		if not args.is_empty():
			continue
		var response: Dictionary = await AIT.invoke_and_wait(api.path, [], TEST_TIMEOUT_MS)
		var state := "OK" if bool(response.get("ok", false)) else "FAIL"
		_append("%s %s -> %s" % [state, api.name, str(response.get("result", response.get("error", {})))])
	_append("[b]E2E 자동 점검 완료[/b]")


func _append(line: String) -> void:
	_detail_label.append_text(line + "\n")