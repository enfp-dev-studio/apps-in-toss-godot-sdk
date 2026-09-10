extends RefCounted
class_name AITIAP

signal purchase_succeeded(subscription_id: int, event: Dictionary)
signal purchase_failed(subscription_id: int, error: Dictionary)
signal product_grant_requested(subscription_id: int, grant_request_id: int, order_id: String)

var _core: AITCore
var _active: Dictionary = {}

func _init(core: AITCore) -> void:
    _core = core
    _core.subscription_event.connect(_on_subscription_event)
    _core.subscription_error.connect(_on_subscription_error)
    _core.nested_callback_requested.connect(_on_nested_callback)

func get_product_item_list() -> int:
    return _core.invoke("IAP.getProductItemList")

func get_pending_orders() -> int:
    return _core.invoke("IAP.getPendingOrders")

func get_completed_or_refunded_orders() -> int:
    return _core.invoke("IAP.getCompletedOrRefundedOrders")

func complete_product_grant(order_id: String) -> int:
    return _core.invoke("IAP.completeProductGrant", [{"params": {"orderId": order_id}}])

func get_product_item_list_and_wait(timeout_ms: int = 0) -> Dictionary:
    return await _core.invoke_and_wait("IAP.getProductItemList", [], timeout_ms)

func get_pending_orders_and_wait(timeout_ms: int = 0) -> Dictionary:
    return await _core.invoke_and_wait("IAP.getPendingOrders", [], timeout_ms)

func get_completed_or_refunded_orders_and_wait(timeout_ms: int = 0) -> Dictionary:
    return await _core.invoke_and_wait("IAP.getCompletedOrRefundedOrders", [], timeout_ms)

func complete_product_grant_and_wait(order_id: String, timeout_ms: int = 0) -> Dictionary:
    return await _core.invoke_and_wait(
        "IAP.completeProductGrant",
        [{"params": {"orderId": order_id}}],
        timeout_ms
    )

func get_subscription_info(order_id: String) -> int:
    return _core.invoke("IAP.getSubscriptionInfo", [{"params": {"orderId": order_id}}])

func get_subscription_info_and_wait(order_id: String, timeout_ms: int = 0) -> Dictionary:
    return await _core.invoke_and_wait(
        "IAP.getSubscriptionInfo",
        [{"params": {"orderId": order_id}}],
        timeout_ms
    )

func create_one_time_purchase_order(sku: String) -> int:
    var subscription_id := _core.create_subscription_id()
    _active[subscription_id] = true
    _core.start_iap_one_time_purchase(subscription_id, sku)
    return subscription_id

func create_subscription_purchase_order(sku: String, offer_id: String = "") -> int:
    var subscription_id := _core.create_subscription_id()
    _active[subscription_id] = true
    var options := {"sku": sku}
    if not offer_id.is_empty():
        options["offerId"] = offer_id
    _core.start_iap_subscription_purchase(subscription_id, options)
    return subscription_id

func resolve_product_grant(subscription_id: int, grant_request_id: int, success: bool) -> void:
    _core.resolve_nested_callback(subscription_id, grant_request_id, success)

func reject_product_grant(subscription_id: int, grant_request_id: int, message: String) -> void:
    _core.reject_nested_callback(subscription_id, grant_request_id, {"message": message})

func dispose(subscription_id: int) -> void:
    _active.erase(subscription_id)
    _core.dispose_subscription(subscription_id)

func _on_subscription_event(subscription_id: int, event: Variant) -> void:
    if not _active.has(subscription_id):
        return
    purchase_succeeded.emit(subscription_id, event if typeof(event) == TYPE_DICTIONARY else {"data": event})

func _on_subscription_error(subscription_id: int, error: Dictionary) -> void:
    if not _active.has(subscription_id):
        return
    purchase_failed.emit(subscription_id, error)

func _on_nested_callback(subscription_id: int, nested_id: int, name: String, payload: Variant) -> void:
    if not _active.has(subscription_id) or name != "processProductGrant":
        return
    var order_id := ""
    if typeof(payload) == TYPE_DICTIONARY:
        order_id = String(payload.get("orderId", ""))
    product_grant_requested.emit(subscription_id, nested_id, order_id)
