extends RefCounted
class_name AITStatus

## 실행 환경에서 핵심 Apps in Toss API가 실제로 응답하는지 확인하는 진단 모듈입니다.
## 진단 결과는 UI 표시용이며, 로그인 토큰이나 결제 entitlement를 저장하지 않습니다.

var _core: AITCore

func _init(core: AITCore) -> void:
    _core = core

func check_all(timeout_ms: int = 5_000) -> Dictionary:
    var report: Dictionary = {
        "bridge": _core.is_available(),
        "platform": await _check("getPlatformOS", timeout_ms),
        "environment": await _check("getOperationalEnvironment", timeout_ms),
        "toss_app_version": await _check("getTossAppVersion", timeout_ms),
        "network": await _check("getNetworkStatus", timeout_ms),
        "login_integration": await _check("getIsTossLoginIntegratedService", timeout_ms),
        "game_user_key": await _check("getUserKeyForGame", timeout_ms),
        "ad_load_supported": await _check("loadFullScreenAd.isSupported", timeout_ms),
        "ad_show_supported": await _check("showFullScreenAd.isSupported", timeout_ms),
        "iap_products": await _check("IAP.getProductItemList", timeout_ms),
    }
    return report

func check_environment(timeout_ms: int = 5_000) -> Dictionary:
    return {
        "bridge": _core.is_available(),
        "platform": await _check("getPlatformOS", timeout_ms),
        "environment": await _check("getOperationalEnvironment", timeout_ms),
        "toss_app_version": await _check("getTossAppVersion", timeout_ms),
        "network": await _check("getNetworkStatus", timeout_ms),
    }

func check_ads(timeout_ms: int = 5_000) -> Dictionary:
    return {
        "bridge": _core.is_available(),
        "load": await _check("loadFullScreenAd.isSupported", timeout_ms),
        "show": await _check("showFullScreenAd.isSupported", timeout_ms),
    }

func check_iap(timeout_ms: int = 5_000) -> Dictionary:
    return {
        "bridge": _core.is_available(),
        "products": await _check("IAP.getProductItemList", timeout_ms),
        "pending_orders": await _check("IAP.getPendingOrders", timeout_ms),
    }

func _check(path: String, timeout_ms: int) -> Dictionary:
    if not _core.has_api(path):
        return {
            "ok": false,
            "error": {
                "code": "AIT_API_UNAVAILABLE",
                "message": "Apps in Toss API is unavailable: %s" % path,
            },
        }
    return await _core.invoke_and_wait(path, [], timeout_ms)
