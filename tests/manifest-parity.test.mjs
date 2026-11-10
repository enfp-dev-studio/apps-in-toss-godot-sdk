// Source/embedded parity + upstream version pins (web-framework 3.10.0, Unity SDK 3.9.0).
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

  it('generated GDScript matches the manifest (81 APIs)', () => {
    const manifest = readJson('bridge/api-manifest.json');
    assert.equal(manifest.length, 81);
    const api = read('addons/apps_in_toss/generated/ait_generated_api.gd');
    const catalog = read('addons/apps_in_toss/generated/ait_generated_catalog.gd');
    assert.ok(api.includes('func iap_get_completed_or_refunded_orders(options: Variant = {}) -> int:'));
    assert.ok(api.includes('_core.invoke("IAP.getCompletedOrRefundedOrders", [options])'));
    for (const entry of manifest) {
      assert.ok(api.includes(`func ${entry.name}(`), `generated api has ${entry.name}`);
      assert.ok(api.includes(`_core.invoke("${entry.path}"`), `generated api invokes ${entry.path}`);
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
    assert.equal(lock.unitySdk.packageVersion, '3.9.0');
    assert.equal(lock.unitySdk.commit, 'c2892282018b44e1666b364a7a97711a130761d6');
    assert.equal(read('addons/apps_in_toss/plugin.cfg').match(/version="([^"]+)"/)[1], '0.2.0');
  });

  // Unity SDK 3.9.0(c2892282)의 jslib가 부르는 web-framework 경로 85개를 이 SDK가 모두 덮는지 본다.
  // 덮는 곳: 매니페스트(AIT.api), 브리지 전용 메서드(IAP 주문·전면 광고), AIT.events·AIT.back(구독형),
  // 그리고 같은 기능의 새 이름(아래 RENAMED: web-framework가 deprecated·v2 별칭으로 둔 옛 이름).
  it('covers every web-framework path the Unity SDK 3.9.0 jslib calls', () => {
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
    const RENAMED = {
      'SafeAreaInsets.get': 'SafeArea.get',
      'SafeAreaInsets.subscribe': 'SafeArea.subscribe',
      getGameCenterGameProfile: 'Game.getUserProfile',
      openGameCenterLeaderboard: 'Game.openLeaderboard',
      submitGameCenterLeaderBoardScore: 'Game.setLeaderboardScore',
      getTossShareLink: 'Share.createLink',
    };
    const manifestPaths = new Set(readJson('bridge/api-manifest.json').map((e) => e.path));
    const bridgeSrc = read('bridge/src/index.ts');
    const modules = ['events/ait_events.gd', 'navigation/ait_back.gd', 'screen/ait_safe_area.gd']
      .map((f) => read(`addons/apps_in_toss/${f}`)).join('\n');
    const missing = UNITY_390_PATHS.filter((p) => {
      const target = RENAMED[p] ?? p;
      if (manifestPaths.has(target)) return false;
      const leaf = target.split('.').pop();
      return !(bridgeSrc.includes(`'${leaf}'`) || modules.includes(`"${target}"`));
    });
    assert.deepEqual(missing, []);
  });

  it('platform.lock apiManifestSha256 matches the embedded manifest', () => {
    const lock = readJson('addons/apps_in_toss/tools/templates/platform.lock.json');
    const sha = crypto.createHash('sha256')
      .update(read('addons/apps_in_toss/tools/bridge/api-manifest.json')).digest('hex');
    assert.equal(lock.aitGodotSdk.apiManifestSha256, sha);
  });
});
