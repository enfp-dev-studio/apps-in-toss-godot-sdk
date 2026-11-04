extends Node
class_name AITCore

signal request_completed(request_id: int, result: Variant)
signal request_failed(request_id: int, error: Dictionary)
signal subscription_event(subscription_id: int, event: Variant)
signal subscription_error(subscription_id: int, error: Dictionary)
signal nested_callback_requested(subscription_id: int, nested_id: int, name: String, payload: Variant)

# patch-export가 index.html에 넣는 개발·테스트 전용 스크립트(tools/scripts/export-dir.mjs와 같은 이름)
const MOCK_BRIDGE_SCRIPT := "apps-in-toss-godot-bridge.mock.js"
const DEBUG_CONSOLE_SCRIPT := "ait-debug-console.js"

var _bridge: JavaScriptObject
var _callback: JavaScriptObject
var _next_request_id := 1
var _next_subscription_id := 1
var _results: Dictionary = {}
var _waiting_requests: Dictionary = {}
var _abandoned_requests: Dictionary = {}

func _ready() -> void:
    if OS.has_feature("web"):
        _refresh_bridge()

func is_available() -> bool:
    if OS.has_feature("web") and _bridge == null:
        _refresh_bridge()
    return OS.has_feature("web") and _bridge != null

func has_api(path: String) -> bool:
    return is_available() and bool(_bridge.has(path))

## 빌드 종류. SDK는 Web 빌드를 모두 release 템플릿으로 내보내므로 Web에서는 OS.is_debug_build()로 가를 수 없어
## 페이지에 SDK가 넣은 스크립트로 판정합니다.
##   "debug"   에디터·데스크톱 디버그 실행(OS.is_debug_build())
##   "dev"     build:dev(mock 브리지 + DevTools)
##   "test"    build --debug-console(실기기 원격 디버깅 테스트 번들)
##   "release" 그 밖(출시 빌드. release 검증이 mock 브리지·debug-console을 막습니다)
func build_kind() -> String:
    if OS.is_debug_build():
        return "debug"
    if not OS.has_feature("web"):
        return "release"
    if _page_has_script(MOCK_BRIDGE_SCRIPT):
        return "dev"
    if _page_has_script(DEBUG_CONSOLE_SCRIPT):
        return "test"
    return "release"

func _page_has_script(file_name: String) -> bool:
    var document: Variant = JavaScriptBridge.get_interface("document")
    if document == null:
        return false
    return document.querySelector('script[src*="%s"]' % file_name) != null

func get_value(path: String) -> Variant:
    if not is_available():
        return null
    var raw: String = _bridge.getValue(path)
    return JSON.parse_string(raw)

func invoke(path: String, args: Array = []) -> int:
    var request_id := _next_request_id
    _next_request_id += 1
    if not is_available():
        call_deferred("_emit_unavailable_request", request_id)
        return request_id
    _bridge.invoke(path, JSON.stringify(args), request_id, _callback)
    return request_id

func invoke_and_wait(path: String, args: Array = [], timeout_ms: int = 0) -> Dictionary:
    var request_id := invoke(path, args)
    _waiting_requests[request_id] = true
    var started_at := Time.get_ticks_msec()
    while not _results.has(request_id):
        if timeout_ms > 0 and Time.get_ticks_msec() - started_at >= timeout_ms:
            _waiting_requests.erase(request_id)
            _abandoned_requests[request_id] = true
            return {
                "request_id": request_id,
                "ok": false,
                "error": {
                    "code": "AIT_CLIENT_TIMEOUT",
                    "message": "Apps in Toss bridge response timed out after %dms." % timeout_ms
                }
            }
        await get_tree().process_frame
    var result: Dictionary = _results[request_id]
    _results.erase(request_id)
    _waiting_requests.erase(request_id)
    return result

func create_subscription_id() -> int:
    var id := _next_subscription_id
    _next_subscription_id += 1
    return id

func start_iap_one_time_purchase(subscription_id: int, sku: String) -> void:
    if not is_available():
        call_deferred("_emit_unavailable_subscription", subscription_id)
        return
    _bridge.iapCreateOneTimePurchaseOrder(subscription_id, sku, _callback)

func start_iap_subscription_purchase(subscription_id: int, options: Dictionary) -> void:
    if not is_available():
        call_deferred("_emit_unavailable_subscription", subscription_id)
        return
    _bridge.iapCreateSubscriptionPurchaseOrder(subscription_id, JSON.stringify(options), _callback)

func has_bridge_method(method_name: String) -> bool:
    if not is_available():
        return false
    return bool(_bridge.call("hasBridgeMethod", method_name))

func start_event_subscription(subscription_id: int, bridge_method: String, options: Dictionary = {}) -> void:
    if not is_available():
        call_deferred("_emit_unavailable_subscription", subscription_id)
        return
    if not has_bridge_method(bridge_method):
        call_deferred("_emit_subscription_error", subscription_id, {
            "code": "AIT_API_UNAVAILABLE",
            "message": "Apps in Toss API is unavailable: %s" % bridge_method,
        })
        return
    _bridge.call(bridge_method, subscription_id, JSON.stringify(options), _callback)

## args는 구독 객체 앞에 넣을 인자입니다.
## 예: graniteEvent.addEventListener("backEvent", { onEvent }) → path "graniteEvent.addEventListener", args ["backEvent"]
func start_path_subscription(subscription_id: int, path: String, options: Dictionary = {}, args: Array = []) -> void:
    if not is_available():
        call_deferred("_emit_unavailable_subscription", subscription_id)
        return
    var method := "subscribePath" if args.is_empty() else "subscribePathArgs"
    if not has_bridge_method(method):
        call_deferred("_emit_subscription_error", subscription_id, {
            "code": "AIT_API_UNAVAILABLE",
            "message": "Apps in Toss bridge does not support path subscriptions. Reinstall the addon.",
        })
        return
    if args.is_empty():
        _bridge.call("subscribePath", subscription_id, path, JSON.stringify(options), _callback)
    else:
        _bridge.call("subscribePathArgs", subscription_id, path, JSON.stringify(args), JSON.stringify(options), _callback)

func dispose_subscription(subscription_id: int) -> void:
    if is_available():
        _bridge.disposeSubscription(subscription_id)

func resolve_nested_callback(subscription_id: int, nested_id: int, result: Variant) -> void:
    if is_available():
        _bridge.resolveNested(subscription_id, nested_id, JSON.stringify(result))

func reject_nested_callback(subscription_id: int, nested_id: int, error: Variant) -> void:
    if is_available():
        _bridge.rejectNested(subscription_id, nested_id, JSON.stringify(error))

func _on_js_callback(args: Array) -> void:
    if args.is_empty():
        return
    var raw = args[0]
    var message = JSON.parse_string(raw) if typeof(raw) == TYPE_STRING else raw
    if typeof(message) != TYPE_DICTIONARY:
        return

    var kind := String(message.get("kind", "request"))
    match kind:
        "request":
            var request_id := int(message.get("requestId", 0))
            if _abandoned_requests.erase(request_id):
                return
            if bool(message.get("ok", false)):
                var result = message.get("result")
                if _waiting_requests.has(request_id):
                    _results[request_id] = {"request_id": request_id, "ok": true, "result": result}
                request_completed.emit(request_id, result)
            else:
                var error: Dictionary = _normalize_error(message.get("error"))
                if _waiting_requests.has(request_id):
                    _results[request_id] = {"request_id": request_id, "ok": false, "error": error}
                request_failed.emit(request_id, error)
        "subscription_event":
            subscription_event.emit(int(message.get("subscriptionId", 0)), message.get("event"))
        "subscription_error":
            subscription_error.emit(int(message.get("subscriptionId", 0)), _normalize_error(message.get("error")))
        "nested":
            nested_callback_requested.emit(
                int(message.get("subscriptionId", 0)),
                int(message.get("nestedId", 0)),
                String(message.get("name", "")),
                message.get("payload")
            )

func _normalize_error(value: Variant) -> Dictionary:
    if typeof(value) == TYPE_DICTIONARY:
        return value
    return {"message": str(value) if value != null else "Unknown Apps in Toss error"}

func _emit_unavailable_request(request_id: int) -> void:
    var error := _unavailable_error()
    if _waiting_requests.has(request_id):
        _results[request_id] = {"request_id": request_id, "ok": false, "error": error}
    request_failed.emit(request_id, error)

func _emit_unavailable_subscription(subscription_id: int) -> void:
    subscription_error.emit(subscription_id, _unavailable_error())

func _emit_subscription_error(subscription_id: int, error: Dictionary) -> void:
    subscription_error.emit(subscription_id, error)

func _unavailable_error() -> Dictionary:
    return {
        "code": "AIT_BRIDGE_UNAVAILABLE",
        "message": "AppsInTossGodot bridge is unavailable. Use a patched Godot Web export inside Apps in Toss."
    }

func _refresh_bridge() -> void:
    if not OS.has_feature("web"):
        return
    if _bridge == null:
        # get_interface로 직접 읽으면 없을 때 엔진 오류가 찍히므로 window 속성으로 조용히 확인한다.
        var window: Variant = JavaScriptBridge.get_interface("window")
        if window != null:
            var bridge: Variant = window.AppsInTossGodot
            if bridge is JavaScriptObject:
                _bridge = bridge
    if _callback == null:
        _callback = JavaScriptBridge.create_callback(_on_js_callback)
