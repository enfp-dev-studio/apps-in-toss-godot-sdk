extends SceneTree

class RecordingCore extends AITCore:
    var last_path := ""
    var last_args: Array = []
    var last_timeout := 0

    func invoke(path: String, args: Array = []) -> int:
        last_path = path
        last_args = args.duplicate(true)
        return 7

    func invoke_and_wait(path: String, args: Array = [], timeout_ms: int = 0) -> Dictionary:
        invoke(path, args)
        last_timeout = timeout_ms
        return {"ok": true, "result": {"hasNext": false, "orders": []}}

var failures: Array[String] = []

func _initialize() -> void:
    _run.call_deferred()

func _expect(condition: bool, message: String) -> void:
    if not condition:
        failures.append(message)

func _run() -> void:
    var core := RecordingCore.new()
    root.add_child(core)
    var iap := AITIAP.new(core)
    var api := AITGeneratedAPI.new(core)
    _expect(iap.get_completed_or_refunded_orders() == 7, "request ID")
    _expect(core.last_path == "IAP.getCompletedOrRefundedOrders" and core.last_args == [{}], "first page")
    iap.get_completed_or_refunded_orders({"key": "page-2"})
    _expect(core.last_args == [{"key": "page-2"}], "cursor forwarding")
    var result := await iap.get_completed_or_refunded_orders_and_wait(1234)
    _expect(result.get("ok", false) and core.last_timeout == 1234 and core.last_args == [{}], "legacy positional timeout")
    await iap.get_completed_or_refunded_orders_and_wait(4321, {"key": "page-3"})
    _expect(core.last_timeout == 4321 and core.last_args == [{"key": "page-3"}], "wait cursor forwarding")
    api.iap_get_completed_or_refunded_orders()
    _expect(core.last_args == [{}], "generated optional default")
    api.iap_get_completed_or_refunded_orders({"key": null})
    _expect(core.last_args == [{"key": null}], "generated nullable cursor")
    core.free()
    if not failures.is_empty():
        printerr("[AIT] IAP pagination FAIL: ", failures)
        quit(1)
        return
    print("[AIT] iap pagination check passed")
    quit(0)
