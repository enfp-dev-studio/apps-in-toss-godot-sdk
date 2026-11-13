extends SceneTree

class RecordingCore extends AITCore:
    var last_path := ""
    var last_args: Array = []
    var reads: Array[String] = []

    func invoke(path: String, args: Array = []) -> int:
        last_path = path
        last_args = args.duplicate(true)
        return 310

    func get_value(path: String) -> Variant:
        reads.append(path)
        return "property:" + path

var failures: Array[String] = []
var checks := 0

# Exact function/path pairs from the official 3.10.0 jslib, not has_api() substitutes.
const HELPERS := [
    [
        "clipboard_get_text_get_permission",
        "Clipboard.getText.getPermission"
    ],
    [
        "clipboard_get_text_open_permission_dialog",
        "Clipboard.getText.openPermissionDialog"
    ],
    [
        "clipboard_set_text_get_permission",
        "Clipboard.setText.getPermission"
    ],
    [
        "clipboard_set_text_open_permission_dialog",
        "Clipboard.setText.openPermissionDialog"
    ],
    [
        "device_get_album_items_is_supported",
        "Device.getAlbumItems.isSupported"
    ],
    [
        "device_get_contacts_get_permission",
        "Device.getContacts.getPermission"
    ],
    [
        "device_get_contacts_open_permission_dialog",
        "Device.getContacts.openPermissionDialog"
    ],
    [
        "device_get_location_get_permission",
        "Device.getLocation.getPermission"
    ],
    [
        "device_get_location_open_permission_dialog",
        "Device.getLocation.openPermissionDialog"
    ],
    [
        "device_get_photos_get_permission",
        "Device.getPhotos.getPermission"
    ],
    [
        "device_get_photos_open_permission_dialog",
        "Device.getPhotos.openPermissionDialog"
    ],
    [
        "device_open_camera_get_permission",
        "Device.openCamera.getPermission"
    ],
    [
        "device_open_camera_open_permission_dialog",
        "Device.openCamera.openPermissionDialog"
    ],
    [
        "device_subscribe_location_get_permission",
        "Device.subscribeLocation.getPermission"
    ],
    [
        "device_subscribe_location_open_permission_dialog",
        "Device.subscribeLocation.openPermissionDialog"
    ],
    [
        "environment_get_server_time_is_supported",
        "Environment.getServerTime.isSupported"
    ],
    [
        "file_open_pdf_viewer_is_supported",
        "File.openPDFViewer.isSupported"
    ],
    [
        "file_save_base64_is_supported",
        "File.saveBase64.isSupported"
    ],
    [
        "game_get_user_profile_is_supported",
        "Game.getUserProfile.isSupported"
    ],
    [
        "game_open_leaderboard_is_supported",
        "Game.openLeaderboard.isSupported"
    ],
    [
        "game_set_leaderboard_score_is_supported",
        "Game.setLeaderboardScore.isSupported"
    ],
    [
        "google_ad_mob_is_apps_in_toss_ad_mob_loaded_is_supported",
        "GoogleAdMob.isAppsInTossAdMobLoaded.isSupported"
    ],
    [
        "google_ad_mob_load_apps_in_toss_ad_mob_is_supported",
        "GoogleAdMob.loadAppsInTossAdMob.isSupported"
    ],
    [
        "google_ad_mob_show_apps_in_toss_ad_mob_is_supported",
        "GoogleAdMob.showAppsInTossAdMob.isSupported"
    ],
    [
        "iap_complete_product_grant_is_supported",
        "IAP.completeProductGrant.isSupported"
    ],
    [
        "iap_create_one_time_purchase_order_is_supported",
        "IAP.createOneTimePurchaseOrder.isSupported"
    ],
    [
        "iap_create_subscription_purchase_order_is_supported",
        "IAP.createSubscriptionPurchaseOrder.isSupported"
    ],
    [
        "iap_get_completed_or_refunded_orders_is_supported",
        "IAP.getCompletedOrRefundedOrders.isSupported"
    ],
    [
        "iap_get_pending_orders_is_supported",
        "IAP.getPendingOrders.isSupported"
    ],
    [
        "iap_get_product_item_list_is_supported",
        "IAP.getProductItemList.isSupported"
    ],
    [
        "iap_get_subscription_info_is_supported",
        "IAP.getSubscriptionInfo.isSupported"
    ],
    [
        "notification_request_agreement_is_supported",
        "Notification.requestAgreement.isSupported"
    ],
    [
        "promotion_grant_reward_is_supported",
        "Promotion.grantReward.isSupported"
    ],
    [
        "promotion_open_contacts_invite_is_supported",
        "Promotion.openContactsInvite.isSupported"
    ],
    [
        "review_request_is_supported",
        "Review.request.isSupported"
    ],
    [
        "screen_set_orientation_is_supported",
        "Screen.setOrientation.isSupported"
    ],
    [
        "storage_get_items_is_supported",
        "Storage.getItems.isSupported"
    ],
    [
        "storage_set_items_is_supported",
        "Storage.setItems.isSupported"
    ],
    [
        "toss_ads_attach_is_supported",
        "TossAds.attach.isSupported"
    ],
    [
        "toss_ads_attach_banner_is_supported",
        "TossAds.attachBanner.isSupported"
    ],
    [
        "toss_ads_destroy_is_supported",
        "TossAds.destroy.isSupported"
    ],
    [
        "toss_ads_destroy_all_is_supported",
        "TossAds.destroyAll.isSupported"
    ],
    [
        "toss_ads_initialize_is_supported",
        "TossAds.initialize.isSupported"
    ],
    [
        "toss_auth_is_integrated_is_supported",
        "TossAuth.isIntegrated.isSupported"
    ],
    [
        "toss_auth_sign_is_supported",
        "TossAuth.sign.isSupported"
    ],
    [
        "toss_pay_authorize_subscription_is_supported",
        "TossPay.authorizeSubscription.isSupported"
    ],
    [
        "toss_pay_request_toss_pay_pays_billing_is_supported",
        "TossPay.requestTossPayPaysBilling.isSupported"
    ],
    [
        "user_get_anonymous_key_is_supported",
        "User.getAnonymousKey.isSupported"
    ],
    [
        "user_get_consented_data_is_supported",
        "User.getConsentedData.isSupported"
    ],
    [
        "user_get_declared_age_range_is_supported",
        "User.getDeclaredAgeRange.isSupported"
    ],
    [
        "apps_in_toss_sign_toss_cert_is_supported",
        "appsInTossSignTossCert.isSupported"
    ],
    [
        "contacts_viral_is_supported",
        "contactsViral.isSupported"
    ],
    [
        "fetch_album_items_is_supported",
        "fetchAlbumItems.isSupported"
    ],
    [
        "fetch_album_photos_get_permission",
        "fetchAlbumPhotos.getPermission"
    ],
    [
        "fetch_album_photos_open_permission_dialog",
        "fetchAlbumPhotos.openPermissionDialog"
    ],
    [
        "fetch_contacts_get_permission",
        "fetchContacts.getPermission"
    ],
    [
        "fetch_contacts_open_permission_dialog",
        "fetchContacts.openPermissionDialog"
    ],
    [
        "get_anonymous_key_is_supported",
        "getAnonymousKey.isSupported"
    ],
    [
        "get_clipboard_text_get_permission",
        "getClipboardText.getPermission"
    ],
    [
        "get_clipboard_text_open_permission_dialog",
        "getClipboardText.openPermissionDialog"
    ],
    [
        "get_consented_user_data_is_supported",
        "getConsentedUserData.isSupported"
    ],
    [
        "get_current_location_get_permission",
        "getCurrentLocation.getPermission"
    ],
    [
        "get_current_location_open_permission_dialog",
        "getCurrentLocation.openPermissionDialog"
    ],
    [
        "get_declared_age_range_is_supported",
        "getDeclaredAgeRange.isSupported"
    ],
    [
        "get_game_center_game_profile_is_supported",
        "getGameCenterGameProfile.isSupported"
    ],
    [
        "get_is_toss_login_integrated_service_is_supported",
        "getIsTossLoginIntegratedService.isSupported"
    ],
    [
        "get_server_time_is_supported",
        "getServerTime.isSupported"
    ],
    [
        "get_user_key_for_game_is_supported",
        "getUserKeyForGame.isSupported"
    ],
    [
        "grant_promotion_reward_is_supported",
        "grantPromotionReward.isSupported"
    ],
    [
        "grant_promotion_reward_for_game_is_supported",
        "grantPromotionRewardForGame.isSupported"
    ],
    [
        "load_full_screen_ad_is_supported",
        "loadFullScreenAd.isSupported"
    ],
    [
        "open_camera_get_permission",
        "openCamera.getPermission"
    ],
    [
        "open_camera_open_permission_dialog",
        "openCamera.openPermissionDialog"
    ],
    [
        "open_game_center_leaderboard_is_supported",
        "openGameCenterLeaderboard.isSupported"
    ],
    [
        "open_pdf_viewer_is_supported",
        "openPDFViewer.isSupported"
    ],
    [
        "request_notification_agreement_is_supported",
        "requestNotificationAgreement.isSupported"
    ],
    [
        "request_review_is_supported",
        "requestReview.isSupported"
    ],
    [
        "request_toss_pay_pays_billing_is_supported",
        "requestTossPayPaysBilling.isSupported"
    ],
    [
        "save_base64_data_is_supported",
        "saveBase64Data.isSupported"
    ],
    [
        "set_clipboard_text_get_permission",
        "setClipboardText.getPermission"
    ],
    [
        "set_clipboard_text_open_permission_dialog",
        "setClipboardText.openPermissionDialog"
    ],
    [
        "set_device_orientation_is_supported",
        "setDeviceOrientation.isSupported"
    ],
    [
        "show_full_screen_ad_is_supported",
        "showFullScreenAd.isSupported"
    ],
    [
        "start_update_location_get_permission",
        "startUpdateLocation.getPermission"
    ],
    [
        "start_update_location_open_permission_dialog",
        "startUpdateLocation.openPermissionDialog"
    ],
    [
        "submit_game_center_leader_board_score_is_supported",
        "submitGameCenterLeaderBoardScore.isSupported"
    ]
]
const PROPERTIES := [
    [
        "device_locale",
        "Device.locale"
    ],
    [
        "device_os",
        "Device.os"
    ],
    [
        "environment_deployment_id",
        "Environment.deploymentId"
    ],
    [
        "environment_device_id",
        "Environment.deviceId"
    ],
    [
        "environment_environment",
        "Environment.environment"
    ],
    [
        "environment_group_id",
        "Environment.groupId"
    ],
    [
        "environment_initial_url",
        "Environment.initialURL"
    ],
    [
        "environment_toss_app_version",
        "Environment.tossAppVersion"
    ]
]

func _initialize() -> void:
    _run.call_deferred()

func _expect(condition: bool, message: String) -> void:
    checks += 1
    if not condition:
        failures.append(message)

func _run() -> void:
    var core := RecordingCore.new()
    root.add_child(core)
    var api := AITGeneratedAPI.new(core)
    for helper in HELPERS:
        _expect(api.call(String(helper[0])) == 310, "request ID: " + helper[0])
        _expect(core.last_path == helper[1] and core.last_args.is_empty(), "call helper: " + helper[1])
    for property in PROPERTIES:
        var calls_before := core.last_path
        _expect(api.call(String(property[0])) == "property:" + property[1], "property value: " + property[1])
        _expect(core.reads.back() == property[1] and core.last_path == calls_before, "get_value instead of invoke: " + property[1])
    var cases := [
        ["toss_auth_login", "TossAuth.login", []],
        ["toss_auth_sign", "TossAuth.sign", [{"nonce": "nonce-310", "data": ["a", "b"]}]],
        ["toss_pay_authorize", "TossPay.authorize", [{"amount": 1500, "orderId": "order-310"}]],
        ["toss_pay_authorize_subscription", "TossPay.authorizeSubscription", [{"billingKey": "billing-310"}]],
        ["toss_pay_checkout_payment", "TossPay.checkoutPayment", [{"payToken": "pay-310"}]],
        ["toss_pay_request_toss_pay_pays_billing", "TossPay.requestTossPayPaysBilling", [{"customerKey": "customer-310"}]],
        ["share_send_message", "Share.sendMessage", [{"message": "hello", "url": "intoss://example"}]],
        ["device_trigger_haptic", "Device.triggerHaptic", [{"type": "tap"}]],
        ["device_get_contacts", "Device.getContacts", [{"offset": 4, "limit": 10}]],
        ["device_get_location", "Device.getLocation", [{"accuracy": "high"}]],
        ["device_get_photos", "Device.getPhotos", [{"maxWidth": 256}]],
        ["clipboard_set_text", "Clipboard.setText", ["text-310"]],
        ["file_save_base64", "File.saveBase64", [{"data": "YWJj", "fileName": "file.txt"}]],
        ["user_get_consented_data", "User.getConsentedData", [{"keys": ["email"]}]],
        ["user_get_declared_age_range", "User.getDeclaredAgeRange", [{"lowerBound": 14}]],
        ["promotion_grant_reward", "Promotion.grantReward", [{"promotionCode": "code-310"}]],
        ["screen_set_orientation", "Screen.setOrientation", [{"type": "portrait"}]],
        ["analytics_log", "Analytics.log", [{"event_name": "sdk_test"}]],
    ]
    for entry in cases:
        _expect(api.callv(String(entry[0]), entry[2]) == 310, "request ID: " + entry[0])
        _expect(core.last_path == entry[1] and core.last_args == entry[2], "forward params: " + entry[1])
    for entry in [["device_get_photos", "Device.getPhotos"], ["device_open_camera", "Device.openCamera"], ["device_get_album_items", "Device.getAlbumItems"]]:
        api.call(String(entry[0]))
        _expect(core.last_path == entry[1] and core.last_args == [{}], "optional media options: " + entry[1])
    var property_count := 0
    for entry in AITGeneratedCatalog.APIS:
        if entry.get("kind", "call") == "property":
            property_count += 1
            _expect(entry.args.is_empty() and api.call(String(entry.name)) == "property:" + entry.path, "property catalog: " + entry.path)
    _expect(property_count == 8, "all eight property catalog entries")
    core.free()
    if not failures.is_empty():
        printerr("[AIT] SDK 3.10 API FAIL: ", failures)
        quit(1)
        return
    print("[AIT] sdk 3.10 api check passed (%d checks)" % checks)
    quit(0)
