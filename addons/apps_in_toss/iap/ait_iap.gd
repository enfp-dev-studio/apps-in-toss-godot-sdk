extends RefCounted
class_name AITIAP

signal purchase_succeeded(subscription_id: int, event: Dictionary)
signal purchase_failed(subscription_id: int, error: Dictionary)
signal product_grant_requested(subscription_id: int, grant_request_id: int, order_id: String)

## reject_product_grant의 기본 오류 코드(토스가 지급 실패 주문에 쓰는 코드와 같게 맞춤)
const GRANT_REJECTED_CODE := "PRODUCT_NOT_GRANTED_BY_PARTNER"
## product_grant_requested에 연결된 함수가 없어 SDK가 대신 거절했을 때의 코드
const NO_GRANT_HANDLER_CODE := "AIT_NO_GRANT_HANDLER"
## 주문(create_*_purchase_order)을 시작한 때부터 결과(purchase_succeeded·purchase_failed)·dispose까지.
## 결제 화면이 떠 있는 동안이며, AIT.sound(사운드 게이트)가 이 신호로 소리를 멈춥니다.
signal order_started(subscription_id: int)
signal order_ended(subscription_id: int)

var _core: AITCore
var _active: Dictionary = {}
var _ordering: Dictionary = {}

func _init(core: AITCore) -> void:
    _core = core
    _core.subscription_event.connect(_on_subscription_event)
    _core.subscription_error.connect(_on_subscription_error)
    _core.nested_callback_requested.connect(_on_nested_callback)

func get_product_item_list() -> int:
    return _core.invoke("IAP.getProductItemList")

func get_pending_orders() -> int:
    return _core.invoke("IAP.getPendingOrders")

func get_completed_or_refunded_orders(options: Dictionary = {}) -> int:
    return _core.invoke("IAP.getCompletedOrRefundedOrders", [options])

func complete_product_grant(order_id: String) -> int:
    return _core.invoke("IAP.completeProductGrant", [{"params": {"orderId": order_id}}])

func get_product_item_list_and_wait(timeout_ms: int = 0) -> Dictionary:
    return await _core.invoke_and_wait("IAP.getProductItemList", [], timeout_ms)

func get_pending_orders_and_wait(timeout_ms: int = 0) -> Dictionary:
    return await _core.invoke_and_wait("IAP.getPendingOrders", [], timeout_ms)

func get_completed_or_refunded_orders_and_wait(timeout_ms: int = 0, options: Dictionary = {}) -> Dictionary:
    return await _core.invoke_and_wait("IAP.getCompletedOrRefundedOrders", [options], timeout_ms)

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
    _ordering[subscription_id] = true
    order_started.emit(subscription_id)
    _core.start_iap_one_time_purchase(subscription_id, sku)
    return subscription_id

func create_subscription_purchase_order(sku: String, offer_id: String = "") -> int:
    var subscription_id := _core.create_subscription_id()
    _active[subscription_id] = true
    var options := {"sku": sku}
    if not offer_id.is_empty():
        options["offerId"] = offer_id
    _ordering[subscription_id] = true
    order_started.emit(subscription_id)
    _core.start_iap_subscription_purchase(subscription_id, options)
    return subscription_id

func resolve_product_grant(subscription_id: int, grant_request_id: int, success: bool) -> void:
    _core.resolve_nested_callback(subscription_id, grant_request_id, success)

## 지급하지 못했다고 알립니다. web-framework 3.9.0부터 지급 콜백이 실패하면(이 함수, 응답 전 dispose, 페이지 종료)
## 토스에 바로 '지급 안 됨'으로 알리고, purchase_failed가 이 오류로 한 번만 옵니다(뒤에 오는 이벤트는 없습니다).
func reject_product_grant(subscription_id: int, grant_request_id: int, message: String, code: String = GRANT_REJECTED_CODE) -> void:
    _core.reject_nested_callback(subscription_id, grant_request_id, {"code": code, "message": message})

func dispose(subscription_id: int) -> void:
    _active.erase(subscription_id)
    _core.dispose_subscription(subscription_id)
    _end_order(subscription_id)

func _on_subscription_event(subscription_id: int, event: Variant) -> void:
    if not _active.has(subscription_id):
        return
    purchase_succeeded.emit(subscription_id, event if typeof(event) == TYPE_DICTIONARY else {"data": event})
    _end_order(subscription_id)

func _on_subscription_error(subscription_id: int, error: Dictionary) -> void:
    if not _active.has(subscription_id):
        return
    purchase_failed.emit(subscription_id, error)
    _end_order(subscription_id)

func _end_order(subscription_id: int) -> void:
    if _ordering.erase(subscription_id):
        order_ended.emit(subscription_id)

func _on_nested_callback(subscription_id: int, nested_id: int, name: String, payload: Variant) -> void:
    if not _active.has(subscription_id) or name != "processProductGrant":
        return
    # 지급 응답을 받을 곳이 없으면 토스가 30초 기다린 뒤 환불 화면을 띄운다. 바로 지급 안 됨으로 알린다.
    if product_grant_requested.get_connections().is_empty():
        push_error("AIT: product_grant_requested에 연결된 함수가 없어 지급하지 못했다고 알렸습니다. 주문 전에 연결하세요.")
        reject_product_grant(subscription_id, nested_id, "No product_grant_requested handler is connected.", NO_GRANT_HANDLER_CODE)
        return
    var order_id := ""
    if typeof(payload) == TYPE_DICTIONARY:
        order_id = String(payload.get("orderId", ""))
    product_grant_requested.emit(subscription_id, nested_id, order_id)
