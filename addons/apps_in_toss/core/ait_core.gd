extends Node
class_name AITCore

signal request_completed(request_id: int, result: Variant)
signal request_failed(request_id: int, error: Dictionary)
signal subscription_event(subscription_id: int, event: Variant)
signal subscription_error(subscription_id: int, error: Dictionary)
signal nested_callback_requested(subscription_id: int, nested_id: int, name: String, payload: Variant)

var _bridge: JavaScriptObject
var _callback: JavaScriptObject
var _next_request_id := 1
var _next_subscription_id := 1
var _results: Dictionary = {}

func _ready() -> void:
    if OS.has_feature("web"):
        _bridge = JavaScriptBridge.get_interface("AppsInTossGodot")
        _callback = JavaScriptBridge.create_callback(_on_js_callback)

func is_available() -> bool:
    return OS.has_feature("web") and _bridge != null

func has_api(path: String) -> bool:
    return is_available() and bool(_bridge.has(path))

func invoke(path: String, args: Array = []) -> int:
    var request_id := _next_request_id
    _next_request_id += 1
    if not is_available():
        call_deferred("_emit_unavailable_request", request_id)
        return request_id
    _bridge.invoke(path, JSON.stringify(args), request_id, _callback)
    return request_id

func invoke_and_wait(path: String, args: Array = []) -> Dictionary:
    var request_id := invoke(path, args)
    while not _results.has(request_id):
        await get_tree().process_frame
    var result: Dictionary = _results[request_id]
    _results.erase(request_id)
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
            if bool(message.get("ok", false)):
                var result = message.get("result")
                _results[request_id] = {"request_id": request_id, "ok": true, "result": result}
                request_completed.emit(request_id, result)
            else:
                var error: Dictionary = _normalize_error(message.get("error"))
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
    _results[request_id] = {"request_id": request_id, "ok": false, "error": error}
    request_failed.emit(request_id, error)

func _emit_unavailable_subscription(subscription_id: int) -> void:
    subscription_error.emit(subscription_id, _unavailable_error())

func _unavailable_error() -> Dictionary:
    return {
        "code": "AIT_BRIDGE_UNAVAILABLE",
        "message": "AppsInTossGodot bridge is unavailable. Use a patched Godot Web export inside Apps in Toss."
    }
