extends Node

var ait: AppsInToss

func _ready() -> void:
    ait = AppsInToss.new()
    add_child(ait)
    await get_tree().process_frame

    ait.core.request_completed.connect(_on_request_completed)
    ait.core.request_failed.connect(_on_request_failed)
    ait.iap.product_grant_requested.connect(_on_product_grant_requested)
    ait.iap.purchase_succeeded.connect(_on_purchase_succeeded)
    ait.iap.purchase_failed.connect(_on_purchase_failed)

func load_products() -> void:
    ait.iap.get_product_item_list()

func buy(sku: String) -> void:
    ait.iap.create_one_time_purchase_order(sku)

func _on_product_grant_requested(subscription_id: int, grant_request_id: int, order_id: String) -> void:
    # IMPORTANT: persist/grant the entitlement idempotently. Respond within Toss's deadline.
    var granted := grant_product(order_id)
    ait.iap.resolve_product_grant(subscription_id, grant_request_id, granted)

func grant_product(order_id: String) -> bool:
    print("grant product for order: ", order_id)
    return true

func _on_purchase_succeeded(subscription_id: int, event: Dictionary) -> void:
    print("purchase success: ", event)
    ait.iap.dispose(subscription_id)

func _on_purchase_failed(subscription_id: int, error: Dictionary) -> void:
    push_error("purchase failed: %s" % error)
    ait.iap.dispose(subscription_id)

func _on_request_completed(request_id: int, result: Variant) -> void:
    print("request ", request_id, " => ", result)

func _on_request_failed(request_id: int, error: Dictionary) -> void:
    push_error("request %s failed: %s" % [request_id, error])
