extends Control
class_name AITSampleScene
## Unity SDK의 샘플 프로젝트 + E2EBootstrapper에 대응하는 Godot 연동 확인 씬.
## - "API 테스터 열기": 카탈로그(AITGeneratedCatalog) 전체를 목록으로 실험하는 테스터를 연다.
## - 일반 버튼: 로그인/식별키/IAP 복구/전면 광고의 실제 호출 흐름 예시.
## 실제 게임은 이 파일을 복사하지 말고 필요한 AIT API만 게임 코드에서 호출하세요.

const TEST_TIMEOUT_MS := 15_000
const DEMO_GRANTS_PATH := "user://ait_demo_grants.json"
const TEST_AD_GROUP_ID := ""  # 실기기 광고 테스트 시 앱인토스 콘솔의 광고 그룹 ID

signal game_identity_ready(user_hash: String)
signal toss_login_code_received(authorization_code: String, referrer: String)

var _status: Label
var _busy := false
var _loaded_ad_subscription_id := 0


func _ready() -> void:
	_build_ui()
	if not AIT.is_available():
		_status_message("브리지 없음 — 일반 브라우저/에디터에서는 게임 화면만 확인돼요.", true)
	else:
		_status_message("브리지 연결됨 — 버튼으로 로그인·결제·광고를 확인하세요.")
	AIT.iap.product_grant_requested.connect(_on_product_grant_requested)
	AIT.iap.purchase_succeeded.connect(_on_purchase_succeeded)
	AIT.iap.purchase_failed.connect(_on_purchase_failed)
	AIT.ads.ad_loaded.connect(_on_ad_loaded)
	AIT.ads.ad_event.connect(_on_ad_event)
	AIT.ads.ad_failed.connect(_on_ad_failed)
	if AIT.is_available() and _is_e2e_mode():
		_run_e2e_suite()


func _build_ui() -> void:
	var background := ColorRect.new()
	background.color = Color("f2f4f6")
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(background)

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", 24)
	margin.add_theme_constant_override("margin_top", 24)
	margin.add_theme_constant_override("margin_right", 24)
	margin.add_theme_constant_override("margin_bottom", 34)
	add_child(margin)

	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	margin.add_child(scroll)

	var layout := VBoxContainer.new()
	layout.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	layout.add_theme_constant_override("separation", 12)
	scroll.add_child(layout)

	layout.add_child(_label("Apps in Toss Godot Sample", 30, Color("191f28")))
	layout.add_child(_label(
		"Unity SDK 샘플 구성에 대응하는 연동 확인 화면이에요. API 테스터에서 카탈로그 전체를 실험할 수 있어요.",
		17, Color("4e5968")))

	layout.add_child(_button("API 테스터 열기", _open_tester, true))
	layout.add_child(_section("사용자 식별과 로그인"))
	layout.add_child(_button("게임 사용자 식별키 받기", _on_user_key, true))
	layout.add_child(_button("토스 로그인 인가 코드 받기", _on_app_login, false))
	layout.add_child(_section("인앱결제"))
	layout.add_child(_button("인앱 상품 불러오기", _on_products, true))
	layout.add_child(_button("미결 주문 복구하기", _on_pending_orders, false))
	layout.add_child(_section("전면 광고"))
	layout.add_child(_button("전면 광고 지원 확인", _on_check_ads, false))
	layout.add_child(_button("전면 광고 미리 불러오기", _on_load_ad, false))
	layout.add_child(_button("미리 불러온 광고 보기", _on_show_ad, false))

	_status = _label("브리지 상태 확인 중…", 16, Color("333d4b"))
	layout.add_child(_status)

	var note := _label(
		"일반 브라우저에는 토스 브리지가 없어요. 로그인·결제·광고는 샌드박스 앱 또는 토스 앱 QR 테스트에서 확인하세요.",
		15, Color("6b7684"))
	layout.add_child(note)


func _is_e2e_mode() -> bool:
	if not OS.has_feature("web"):
		return false
	var query := String(JavaScriptBridge.eval("window.location.search", true))
	return query.contains("e2e=true")


func _run_e2e_suite() -> void:
	# Unity SDK의 E2E 자동 점검에 대응: 파라미터 없는 API를 순회 호출한다.
	# close_view는 mock에서도 실제 닫기(history.back)를 수행해 페이지가 사라지므로
	# 브라우저 E2E에서는 제외한다. 실기기에서는 토스 앱이 뷰를 닫는다.
	const SKIP_IN_BROWSER_E2E := ["close_view"]
	_status_message("E2E 자동 점검 시작…")
	var passed := 0
	var failed := 0
	for api in AITGeneratedCatalog.APIS:
		var args: Array = api.get("args", [])
		if not args.is_empty():
			continue
		if String(api.get("name", "")) in SKIP_IN_BROWSER_E2E:
			continue
		var response := await AIT.invoke_and_wait(String(api.get("path")), [], TEST_TIMEOUT_MS)
		if bool(response.get("ok", false)):
			passed += 1
		else:
			failed += 1
	_status_message("E2E 자동 점검 완료 — 성공 %d, 실패 %d" % [passed, failed], failed > 0)
	print("[AIT-E2E] scene suite done passed=%d failed=%d" % [passed, failed])


func _label(text: String, size: int, color: Color) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", color)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return label


func _section(text: String) -> Label:
	return _label(text, 20, Color("191f28"))


func _button(text: String, handler: Callable, primary := false) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size = Vector2(0, 52)
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.add_theme_font_size_override("font_size", 17)
	button.pressed.connect(handler)
	return button


func _status_message(message: String, is_error := false) -> void:
	if _status == null:
		return
	_status.text = message
	_status.add_theme_color_override("font_color", Color("e42939") if is_error else Color("333d4b"))


func _guard_busy() -> bool:
	if _busy:
		return true
	_busy = true
	return false


func _resume() -> void:
	_busy = false


func _error_text(response: Dictionary) -> String:
	var error: Variant = response.get("error", {})
	if typeof(error) == TYPE_DICTIONARY:
		return String(error.get("message", JSON.stringify(error)))
	return String(error)


func _open_tester() -> void:
	get_tree().root.add_child(AITSampleTester.new())


func _on_user_key() -> void:
	if _guard_busy():
		return
	_status_message("게임 사용자 식별키 요청 중…")
	var response := await AIT.get_user_key_for_game(TEST_TIMEOUT_MS)
	_busy = false
	if bool(response.get("ok", false)):
		var result: Variant = response.get("result")
		if typeof(result) == TYPE_DICTIONARY and result.get("type") == "HASH":
			game_identity_ready.emit(String(result.get("hash", "")))
			_status_message("사용자 식별 준비 완료 (hash)")
		else:
			_status_message("식별키를 받을 수 없는 환경이에요.", true)
	else:
		_status_message("식별키 실패: %s" % _error_text(response), true)


func _on_app_login() -> void:
	if _guard_busy():
		return
	_status_message("토스 로그인 창을 여는 중…")
	var response := await AIT.app_login(TEST_TIMEOUT_MS)
	_busy = false
	if bool(response.get("ok", false)):
		var result: Dictionary = response.get("result", {})
		toss_login_code_received.emit(
			String(result.get("authorizationCode", "")),
			String(result.get("referrer", "DEFAULT")))
		_status_message("인가 코드 수신 — 파트너 서버에서 토큰 교환하세요.")
	else:
		_status_message("토스 로그인 실패: %s" % _error_text(response), true)


func _on_products() -> void:
	if _guard_busy():
		return
	_status_message("인앱 상품 불러오는 중…")
	var response := await AIT.iap.get_product_item_list_and_wait(TEST_TIMEOUT_MS)
	_busy = false
	if bool(response.get("ok", false)):
		var products: Array = []
		var value: Variant = response.get("result")
		if typeof(value) == TYPE_DICTIONARY:
			products = value.get("products", [])
		_status_message("인앱 상품 %d개" % products.size())
	else:
		_status_message("상품 조회 실패: %s" % _error_text(response), true)


func _on_pending_orders() -> void:
	if _guard_busy():
		return
	_status_message("미결 주문 복구 중…")
	var response := await AIT.iap.get_pending_orders_and_wait(TEST_TIMEOUT_MS)
	if not bool(response.get("ok", false)):
		_busy = false
		_status_message("미결 주문 조회 실패: %s" % _error_text(response), true)
		return
	var orders: Array = []
	var value: Variant = response.get("result")
	if typeof(value) == TYPE_DICTIONARY:
		orders = value.get("orders", [])
	for order in orders:
		var order_id := String(order.get("orderId", "")) if typeof(order) == TYPE_DICTIONARY else ""
		if order_id.is_empty() or not _grant_idempotent(order_id):
			continue
		var completion := await AIT.iap.complete_product_grant_and_wait(order_id, TEST_TIMEOUT_MS)
		if not bool(completion.get("ok", false)):
			_busy = false
			_status_message("지급 완료 보고 실패: %s" % _error_text(completion), true)
			return
	_busy = false
	_status_message("미결 주문 %d건 처리 완료" % orders.size())


func _on_check_ads() -> void:
	if _guard_busy():
		return
	_status_message("전면 광고 지원 확인 중…")
	# 현재 SDK는 전면 광고 지원 여부 조회 API가 없으므로 로드 가능 여부로 대체 확인한다.
	var response := await AIT.invoke_and_wait("getPlatformOS", [], TEST_TIMEOUT_MS)
	_busy = false
	if bool(response.get("ok", false)):
		_status_message("광고는 토스 앱 환경에서만 실동작해요. 미리 불러오기 버튼으로 시도하세요.")
	else:
		_status_message("플랫폼 확인 실패: %s" % _error_text(response), true)


func _on_load_ad() -> void:
	if TEST_AD_GROUP_ID.is_empty():
		_status_message("광고 그룹 ID가 비어 있어요. sample 스크립트의 TEST_AD_GROUP_ID를 설정하세요.", true)
		return
	_status_message("전면 광고를 미리 불러오는 중…")
	AIT.ads.load_full_screen_ad({"adGroupId": TEST_AD_GROUP_ID})


func _on_show_ad() -> void:
	if _loaded_ad_subscription_id == 0:
		_status_message("먼저 전면 광고를 미리 불러와 주세요.", true)
		return
	AIT.ads.show_full_screen_ad({"adGroupId": TEST_AD_GROUP_ID})


func _on_ad_loaded(subscription_id: int) -> void:
	_loaded_ad_subscription_id = subscription_id
	_status_message("전면 광고 로드 완료 — 표시 버튼을 눌러 주세요.")


func _on_ad_event(subscription_id: int, event: Variant) -> void:
	if typeof(event) == TYPE_DICTIONARY and String(event.get("type", "")) == "dismissed":
		AIT.ads.dispose(subscription_id)
		_loaded_ad_subscription_id = 0
		_status_message("전면 광고가 닫혔어요.")


func _on_ad_failed(subscription_id: int, error: Dictionary) -> void:
	AIT.ads.dispose(subscription_id)
	if subscription_id == _loaded_ad_subscription_id:
		_loaded_ad_subscription_id = 0
	_status_message("광고 오류: %s" % String(error.get("message", "")), true)


func _on_product_grant_requested(subscription_id: int, grant_request_id: int, order_id: String) -> void:
	var granted := _grant_idempotent(order_id)
	AIT.iap.resolve_product_grant(subscription_id, grant_request_id, granted)
	if granted:
		_status_message("결제 지급 완료: %s" % order_id)


func _on_purchase_succeeded(subscription_id: int, event: Dictionary) -> void:
	AIT.iap.dispose(subscription_id)
	_status_message("결제·지급이 완료됐어요.")


func _on_purchase_failed(subscription_id: int, error: Dictionary) -> void:
	AIT.iap.dispose(subscription_id)
	_status_message("결제 실패: %s" % String(error.get("message", "")), true)


func _grant_idempotent(order_id: String) -> bool:
	if order_id.is_empty():
		return false
	var grants := _load_grants()
	if grants.has(order_id):
		return true
	grants[order_id] = Time.get_datetime_string_from_system(true)
	var file := FileAccess.open(DEMO_GRANTS_PATH, FileAccess.WRITE)
	if file == null:
		return false
	file.store_string(JSON.stringify(grants))
	return true


func _load_grants() -> Dictionary:
	if not FileAccess.file_exists(DEMO_GRANTS_PATH):
		return {}
	var file := FileAccess.open(DEMO_GRANTS_PATH, FileAccess.READ)
	if file == null:
		return {}
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	return parsed if typeof(parsed) == TYPE_DICTIONARY else {}
