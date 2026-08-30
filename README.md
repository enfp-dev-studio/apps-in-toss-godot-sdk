# Apps in Toss Godot SDK

Community SDK for Godot 4 Web exports. It follows the public Apps in Toss Unity SDK architecture: expose `@apps-in-toss/web-framework` in the page, then bridge engine calls into JavaScript.

> Status: early preview. The bridge and IAP two-way callback model are implemented, but real Toss runtime verification is still required.

## Architecture

```text
Godot game
  └─ addons/apps_in_toss
       ├─ core/        Promise, event, subscription and nested callback transport
       ├─ iap/         IAP purchase flow
       └─ generated/   generated wrappers for one-shot Web Framework APIs
              ↓ JavaScriptBridge
bridge/src/index.ts
              ↓
@apps-in-toss/web-framework 3.0.1
              ↓
Toss App WebView
```

## Install / export

1. Copy `addons/apps_in_toss` into the Godot project.
2. Export the game with Godot 4 Web export to a folder containing `index.html`.
3. Build and inject the bridge:

```bash
cd bridge
npm install
npm run build
npm run patch -- /absolute/path/to/godot-web-export
```

The patched export can then be used by the Apps in Toss web packaging/deployment flow.

## Basic API

```gdscript
var ait := AppsInToss.new()
add_child(ait)
await get_tree().process_frame

ait.core.request_completed.connect(func(id, result): print(result))
ait.api.get_platform_os()
ait.api.storage_set_item("key", "value")
```

Any Web Framework function can also be called without waiting for a typed wrapper:

```gdscript
ait.invoke("IAP.getProductItemList")
ait.invoke("Storage.getItem", ["key"])
```

## IAP purchase

`processProductGrant` is a reverse callback and cannot be represented by a simple Promise bridge. The SDK keeps a JS Promise pending while Godot decides whether the product was granted.

```gdscript
ait.iap.product_grant_requested.connect(
    func(subscription_id, grant_request_id, order_id):
        var success = grant_product_idempotently(order_id)
        ait.iap.resolve_product_grant(subscription_id, grant_request_id, success)
)

var purchase_id = ait.iap.create_one_time_purchase_order("my.sku")
```

Call `ait.iap.dispose(purchase_id)` after success/error when the flow is no longer needed.

## Generator

`bridge/api-manifest.json` is the source for simple one-shot wrappers.

```bash
cd bridge
npm run generate
```

This regenerates `addons/apps_in_toss/generated/ait_generated_api.gd`. Callback/event APIs stay as handwritten domain modules because they need lifecycle semantics.

## Next domains

- IntegratedAd (`loadFullScreenAd`, `showFullScreenAd`) subscription lifecycle
- authentication convenience layer
- location/event streaming
- push agreement result handling
- build/package CLI around the Apps in Toss config
- upstream API extractor so the manifest updates automatically
- browser mocks and automated bridge tests
