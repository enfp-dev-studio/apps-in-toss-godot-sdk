// Source/embedded parity + upstream version pins (web-framework 3.10.0, Unity SDK 3.10.0).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const read = (p) => fs.readFileSync(path.join(repoRoot, p), 'utf8');
const readJson = (p) => JSON.parse(read(p));

// Unity retains these deprecated names for the same operation. Godot exposes the canonical API.
const RENAMED = {
  'SafeAreaInsets.get': 'SafeArea.get',
  'SafeAreaInsets.subscribe': 'SafeArea.subscribe',
  getSafeAreaInsets: 'SafeArea.get',
  getGameCenterGameProfile: 'Game.getUserProfile',
  openGameCenterLeaderboard: 'Game.openLeaderboard',
  submitGameCenterLeaderBoardScore: 'Game.setLeaderboardScore',
  getTossShareLink: 'Share.createLink',
};

function missingUnityPaths(paths) {
  const covered = new Set(readJson('bridge/api-manifest.json').map((entry) => entry.path));
  const bridge = read('bridge/src/index.ts');
  for (const match of bridge.matchAll(/startEventSubscription\(subscriptionId, '([^']+)'/g)) covered.add(match[1]);
  assert.match(bridge, /const iap = getProperty\(namespaces, 'IAP'\)/);
  for (const match of bridge.matchAll(/startIapOrder\(subscriptionId, '([^']+)'/g)) covered.add(`IAP.${match[1]}`);
  for (const file of ['events/ait_events.gd', 'navigation/ait_back.gd', 'screen/ait_safe_area.gd', 'game/ait_game.gd']) {
    for (const match of read(`addons/apps_in_toss/${file}`).matchAll(/"([A-Za-z][\w]*(?:\.[\w]+)*)"/g)) covered.add(match[1]);
  }
  return paths.filter((p) => !covered.has(RENAMED[p] ?? p));
}

describe('bridge source/embedded parity + version pins', () => {
  it('both api-manifest.json copies carry the latest mapped APIs', () => {
    const expected = [
      { name: 'iap_get_completed_or_refunded_orders', path: 'IAP.getCompletedOrRefundedOrders', args: ['options'], defaults: { options: {} } },
      { name: 'navigation_bar_set_options', path: 'NavigationBar.setOptions', args: ['options'] },
      { name: 'migration_get_origin_storage', path: 'Migration.getOriginStorage', args: [] },
      { name: 'user_create_anonymous_key_auth_code', path: 'User.createAnonymousKeyAuthCode', args: [] },
      { name: 'share_create_link', path: 'Share.createLink', args: ['options'] },
    ];
    for (const p of ['bridge/api-manifest.json', 'addons/apps_in_toss/tools/bridge/api-manifest.json']) {
      const manifest = readJson(p);
      for (const entry of expected) {
        assert.deepEqual(manifest.find((e) => e.name === entry.name), entry, p);
      }
    }
  });

  it('source and embedded bridge copies are exactly in parity', () => {
    const pairs = [
      ['bridge/api-manifest.json', 'addons/apps_in_toss/tools/bridge/api-manifest.json'],
      ['bridge/package.json', 'addons/apps_in_toss/tools/bridge/package.json'],
      ['bridge/package-lock.json', 'addons/apps_in_toss/tools/bridge/package-lock.json'],
      ['bridge/src/index.ts', 'addons/apps_in_toss/tools/bridge/src/index.ts'],
      ['bridge/src/web-runtime.ts', 'addons/apps_in_toss/tools/bridge/src/web-runtime.ts'],
      ['bridge/src/metrics.ts', 'addons/apps_in_toss/tools/bridge/src/metrics.ts'],
      ['bridge/src/sentry.ts', 'addons/apps_in_toss/tools/bridge/src/sentry.ts'],
      ['bridge/src/user-files.ts', 'addons/apps_in_toss/tools/bridge/src/user-files.ts'],
      ['bridge/src/debug-console.ts', 'addons/apps_in_toss/tools/bridge/src/debug-console.ts'],
      ['bridge/vite.config.ts', 'addons/apps_in_toss/tools/bridge/vite.config.ts'],
      ['bridge/tsconfig.json', 'addons/apps_in_toss/tools/bridge/tsconfig.json'],
      ['bridge/scripts/patch-export.mjs', 'addons/apps_in_toss/tools/bridge/scripts/patch-export.mjs'],
    ];
    for (const [a, b] of pairs) {
      assert.equal(read(a), read(b), `${a} === ${b} (byte-identical)`);
    }
    // JSON deep-compare as well, so field-level drift is caught with a clear diff.
    assert.deepEqual(
      readJson('bridge/api-manifest.json'),
      readJson('addons/apps_in_toss/tools/bridge/api-manifest.json'),
    );
    assert.deepEqual(
      readJson('bridge/package.json'),
      readJson('addons/apps_in_toss/tools/bridge/package.json'),
    );
  });

  it('generated GDScript matches all 207 callable/property entries', () => {
    const manifest = readJson('bridge/api-manifest.json');
    assert.equal(manifest.length, 207);
    assert.equal(new Set(manifest.map((entry) => entry.name)).size, manifest.length);
    assert.equal(new Set(manifest.map((entry) => entry.path)).size, manifest.length);
    const api = read('addons/apps_in_toss/generated/ait_generated_api.gd');
    const catalog = read('addons/apps_in_toss/generated/ait_generated_catalog.gd');
    assert.ok(api.includes('func iap_get_completed_or_refunded_orders(options: Variant = {}) -> int:'));
    assert.ok(api.includes('_core.invoke("IAP.getCompletedOrRefundedOrders", [options])'));
    for (const entry of manifest) {
      assert.ok(api.includes(`func ${entry.name}(`), `generated api has ${entry.name}`);
      const expression = entry.kind === 'property'
        ? `_core.get_value("${entry.path}")`
        : `_core.invoke("${entry.path}"`;
      assert.ok(api.includes(expression), `generated api dispatches ${entry.path}`);
      assert.ok(catalog.includes(`"name": "${entry.name}"`), `catalog has ${entry.name}`);
    }
  });

  it('web-framework and devtools are pinned to 3.10.0 everywhere', () => {
    for (const p of ['bridge/package.json', 'addons/apps_in_toss/tools/bridge/package.json']) {
      const pkg = readJson(p);
      assert.equal(pkg.dependencies['@apps-in-toss/web-framework'], '3.10.0', p);
      assert.equal(pkg.devDependencies['@apps-in-toss/devtools'], '3.10.0', p);
    }
    const lock = readJson('addons/apps_in_toss/tools/templates/platform.lock.json');
    assert.equal(lock.webFramework.version, '3.10.0');
    assert.equal(lock.unitySdk.packageVersion, '3.10.0');
    assert.equal(lock.unitySdk.commit, 'b46a21bf6395a4c502e23ccde97b8cd47f5afbf6');
    assert.equal(read('addons/apps_in_toss/plugin.cfg').match(/version="([^"]+)"/)[1], '0.2.0');
    const versionGd = read('addons/apps_in_toss/status/ait_version.gd');
    assert.equal(versionGd.match(/const VERSION := "([^"]+)"/)[1], read('addons/apps_in_toss/plugin.cfg').match(/version="([^"]+)"/)[1], 'AITVersion.VERSION = plugin.cfg');
    assert.equal(versionGd.match(/const WEB_FRAMEWORK := "([^"]+)"/)[1], readJson('bridge/package.json').dependencies['@apps-in-toss/web-framework'], 'AITVersion.WEB_FRAMEWORK = bridge');
  });

  // 기존 Unity SDK 3.9.0(c2892282)의 경로도 호환성 검사로 유지한다.
  // 덮는 곳: 매니페스트(AIT.api), 브리지 전용 메서드(IAP 주문·전면 광고), AIT.events·AIT.back(구독형),
  // 그리고 같은 기능의 새 이름(아래 RENAMED: web-framework가 deprecated·v2 별칭으로 둔 옛 이름).
  it('retains all 85 Unity SDK 3.9.0 compatibility paths', () => {
    const UNITY_390_PATHS = [
      'Analytics.click', 'Analytics.impression', 'Analytics.screen',
      'GoogleAdMob.isAppsInTossAdMobLoaded', 'GoogleAdMob.loadAppsInTossAdMob', 'GoogleAdMob.showAppsInTossAdMob',
      'IAP.completeProductGrant', 'IAP.createOneTimePurchaseOrder', 'IAP.createSubscriptionPurchaseOrder',
      'IAP.getCompletedOrRefundedOrders', 'IAP.getPendingOrders', 'IAP.getProductItemList', 'IAP.getSubscriptionInfo',
      'SafeAreaInsets.get', 'SafeAreaInsets.subscribe',
      'Storage.clearItems', 'Storage.getItem', 'Storage.getItems', 'Storage.removeItem', 'Storage.setItem', 'Storage.setItems',
      'TossAds.attach', 'TossAds.attachBanner', 'TossAds.destroy', 'TossAds.destroyAll', 'TossAds.initialize',
      'appLogin', 'appsInTossSignTossCert', 'checkoutPayment', 'closeView', 'contactsViral', 'env.getDeploymentId',
      'eventLog', 'fetchAlbumItems', 'fetchAlbumPhotos', 'fetchContacts', 'generateHapticFeedback', 'getAnonymousKey',
      'getAppsInTossGlobals', 'getClipboardText', 'getConsentedUserData', 'getCurrentLocation', 'getDeclaredAgeRange',
      'getDeviceId', 'getGameCenterGameProfile', 'getGroupId', 'getIsTossLoginIntegratedService', 'getLocale',
      'getNetworkStatus', 'getOperationalEnvironment', 'getPermission', 'getPlatformOS', 'getSchemeUri', 'getServerTime',
      'getTossAppVersion', 'getTossShareLink', 'getUserKeyForGame', 'graniteEvent.addEventListener', 'grantPromotionReward',
      'grantPromotionRewardForGame', 'isMinVersionSupported', 'loadFullScreenAd', 'onVisibilityChangedByTransparentServiceWeb',
      'openCamera', 'openGameCenterLeaderboard', 'openPDFViewer', 'openPermissionDialog', 'openURL',
      'partner.addAccessoryButton', 'partner.removeAccessoryButton', 'requestNotificationAgreement', 'requestPermission',
      'requestReview', 'requestTossPayPaysBilling', 'saveBase64Data', 'setClipboardText', 'setDeviceOrientation',
      'setIosSwipeGestureEnabled', 'setScreenAwakeMode', 'setSecureScreen', 'share', 'showFullScreenAd',
      'startUpdateLocation', 'submitGameCenterLeaderBoardScore', 'tdsEvent.addEventListener',
    ];
    assert.equal(UNITY_390_PATHS.length, 85);
    assert.deepEqual(missingUnityPaths(UNITY_390_PATHS), []);
  });

  it('covers the exact 231 routes in the official Unity SDK 3.10.0 tag', () => {
    const fixture = readJson('tests/fixtures/unity-sdk-3.10.0-paths.json');
    const lock = readJson('addons/apps_in_toss/tools/templates/platform.lock.json');
    assert.equal(fixture.tag, `release/v${lock.unitySdk.packageVersion}`);
    assert.equal(fixture.commit, lock.unitySdk.commit);
    assert.equal(fixture.paths.length, 231);
    assert.equal(new Set(fixture.paths).size, fixture.paths.length);
    assert.equal(fixture.paths.filter((p) => p.endsWith('.isSupported')).length, 58);
    assert.equal(fixture.paths.filter((p) => /\.(getPermission|openPermissionDialog)$/.test(p)).length, 28);
    assert.deepEqual(missingUnityPaths(fixture.paths), []);
    const manifest = readJson('bridge/api-manifest.json');
    assert.deepEqual(manifest.filter((e) => e.kind === 'property').map((e) => e.path).sort(), fixture.properties);
    for (const route of fixture.paths.filter((p) => /\.(isSupported|getPermission|openPermissionDialog)$/.test(p))) {
      const entry = manifest.find((e) => e.path === route);
      assert.ok(entry, `${route} has its own callable wrapper (has_api is only an existence check)`);
      assert.deepEqual(entry.args, [], route);
      assert.notEqual(entry.kind, 'property', route);
    }
  });

  it('marks property catalog entries so the sample uses get_value, and preserves optional media options', () => {
    const manifest = readJson('bridge/api-manifest.json');
    const catalog = read('addons/apps_in_toss/generated/ait_generated_catalog.gd');
    for (const entry of manifest.filter((e) => e.kind === 'property')) {
      assert.deepEqual(entry.args, []);
      assert.ok(catalog.includes(`"path": "${entry.path}", "args": [], "kind": "property"`));
    }
    for (const route of ['Device.getPhotos', 'Device.openCamera', 'Device.getAlbumItems']) {
      assert.deepEqual(manifest.find((e) => e.path === route).defaults, { options: {} });
    }

  });

  it('platform.lock apiManifestSha256 matches the embedded manifest', () => {
    const lock = readJson('addons/apps_in_toss/tools/templates/platform.lock.json');
    const sha = crypto.createHash('sha256')
      .update(read('addons/apps_in_toss/tools/bridge/api-manifest.json')).digest('hex');
    assert.equal(lock.aitGodotSdk.apiManifestSha256, sha);
  });
});
