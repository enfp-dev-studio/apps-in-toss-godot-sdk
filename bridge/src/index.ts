import * as WebFramework from '@apps-in-toss/web-framework';
import { installWebRuntime } from './web-runtime.ts';
import { installMetrics } from './metrics.ts';
import { restoreUserFiles, userFilesFromPage } from './user-files.ts';

type NamespaceRecord = Record<string, unknown>;
type BridgeFunction = (...args: unknown[]) => unknown;
type GodotCallback = (payload: string) => void;
type Disposer = () => void;

interface GodotBridge {
  invoke: typeof invoke;
  iapCreateOneTimePurchaseOrder: typeof iapCreateOneTimePurchaseOrder;
  iapCreateSubscriptionPurchaseOrder: typeof iapCreateSubscriptionPurchaseOrder;
  adsLoadFullScreenAd: typeof adsLoadFullScreenAd;
  adsShowFullScreenAd: typeof adsShowFullScreenAd;
  bannerShow: typeof bannerShow;
  bannerSetRect: typeof bannerSetRect;
  bannerRefreshSizes: typeof bannerRefreshSizes;
  runtimeLog: typeof runtimeLog;
  userFilesReady: typeof userFilesReady;
  subscribePath: typeof subscribePath;
  subscribePathArgs: typeof subscribePathArgs;
  hasBridgeMethod: typeof hasBridgeMethod;
  disposeSubscription: typeof disposeSubscription;
  resolveNested: (subscriptionId: number, nestedId: number, json: string) => boolean;
  rejectNested: (subscriptionId: number, nestedId: number, json: string) => boolean;
  has: (path: string) => boolean;
  keys: () => string[];
  getValue: typeof getValue;
  runtimeSubscribe: (callback: GodotCallback) => void;
  runtimeState: () => string;
  audioRecovery: (enabled: boolean) => void;
}

type AppsInTossWindow = Window & {
  AppsInToss?: NamespaceRecord;
  AppsInTossGodot?: GodotBridge;
  __AIT_VERBOSE?: boolean;
};

// 엔진보다 먼저 설치해야 위치 워크릿 훅과 초기 가시성 신호를 놓치지 않는다(web-runtime.ts).
const runtime = installWebRuntime(window);

const namespaces: NamespaceRecord = { ...WebFramework };
// 토스 웹 디버그 툴즈의 Godot Metrics 탭(vConsole이 있을 때만 화면을 만든다)
const metrics = installMetrics(window);
const bridgeWindow = window as AppsInTossWindow;
bridgeWindow.AppsInToss = namespaces;

const subscriptions = new Map<number, Disposer>();
const nestedResolvers = new Map<
  string,
  { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }
>();
let nextNestedId = 1;

function emit(callback: GodotCallback, payload: Record<string, unknown>) {
  callback(JSON.stringify(payload));
}

// Godot의 JavaScriptBridge 콜백은 GDScript→JS 호출 도중에
// 동기 re-entrancy로 들어오면 유실될 수 있다(관측: 존재하지 않는 API 호출이
// 구조화 에러 대신 클라이언트 타임아웃이 됨). 모든 브리지→Godot 전달을
// microtask로 미뤄 호출 스택이 Godot으로 복귀한 뒤에 배달되게 한다.
// FIFO 순서가 보장되므로 이벤트 순서(loaded→dismissed 등)는 유지된다.
function emitAsync(callback: GodotCallback, payload: Record<string, unknown>) {
  const deliver = () => emit(callback, payload);
  if (typeof queueMicrotask === 'function') queueMicrotask(deliver);
  else setTimeout(deliver, 0);
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    const own = Object.fromEntries(
      Object.getOwnPropertyNames(error).map((key) => [key, Reflect.get(error, key)]),
    );
    return { name: error.name, message: error.message, stack: error.stack ?? null, ...own };
  }
  if (typeof error === 'object' && error !== null) return error;
  return { message: String(error) };
}

function getProperty(owner: unknown, key: string): unknown {
  if ((typeof owner !== 'object' && typeof owner !== 'function') || owner === null) return undefined;
  return Reflect.get(owner, key);
}

function resolvePath(path: string): { fn: BridgeFunction; owner: unknown } {
  const parts = path.split('.').filter(Boolean);
  if (parts.length === 0) throw new Error('Apps in Toss API path is empty');

  let owner: unknown = namespaces;
  for (let index = 0; index < parts.length - 1; index += 1) {
    owner = getProperty(owner, parts[index]);
  }

  const fn = getProperty(owner, parts.at(-1)!);
  if (typeof fn !== 'function') throw new Error(`Apps in Toss API not found: ${path}`);
  return { fn: fn as BridgeFunction, owner };
}

async function invoke(path: string, argsJson: string, requestId: number, callback: GodotCallback) {
  try {
    const parsed: unknown = JSON.parse(argsJson || '[]');
    if (!Array.isArray(parsed)) throw new Error('Bridge arguments must be a JSON array');
    const { fn, owner } = resolvePath(path);
    if (path === 'eventLog' || path.startsWith('Analytics.')) metrics.record('event', path, parsed[0]);
    const result = await Promise.resolve(Reflect.apply(fn, owner, parsed));
    emitAsync(callback, { kind: 'request', requestId, ok: true, result: result ?? null });
  } catch (error) {
    emitAsync(callback, { kind: 'request', requestId, ok: false, error: serializeError(error) });
  }
}

function requestNested(
  subscriptionId: number,
  name: string,
  payload: unknown,
  callback: GodotCallback,
): Promise<unknown> {
  const nestedId = nextNestedId++;
  const key = `${subscriptionId}:${nestedId}`;
  return new Promise((resolve, reject) => {
    nestedResolvers.set(key, { resolve, reject });
    emitAsync(callback, { kind: 'nested', subscriptionId, nestedId, name, payload: payload ?? null });
  }).finally(() => nestedResolvers.delete(key));
}

function startIapOrder(
  subscriptionId: number,
  methodName: string,
  orderOptions: Record<string, unknown>,
  callback: GodotCallback,
) {
  try {
    const iap = getProperty(namespaces, 'IAP');
    const createOrder = getProperty(iap, methodName);
    if (typeof createOrder !== 'function') {
      throw new Error(`IAP.${methodName} is unavailable`);
    }

    subscriptions.get(subscriptionId)?.();
    const dispose = Reflect.apply(createOrder, iap, [
      {
        options: {
          ...orderOptions,
          processProductGrant: (payload: unknown) =>
            requestNested(subscriptionId, 'processProductGrant', payload, callback),
        },
        onEvent: (event: unknown) =>
          emitAsync(callback, { kind: 'subscription_event', subscriptionId, event }),
        onError: (error: unknown) =>
          emitAsync(callback, {
            kind: 'subscription_error',
            subscriptionId,
            error: serializeError(error),
          }),
      },
    ]);
    const disposer: Disposer = typeof dispose === 'function' ? () => dispose() : () => undefined;
    subscriptions.set(subscriptionId, disposer);
  } catch (error) {
    emitAsync(callback, { kind: 'subscription_error', subscriptionId, error: serializeError(error) });
  }
}

function iapCreateOneTimePurchaseOrder(
  subscriptionId: number,
  sku: string,
  callback: GodotCallback,
) {
  startIapOrder(subscriptionId, 'createOneTimePurchaseOrder', { sku }, callback);
}

function iapCreateSubscriptionPurchaseOrder(
  subscriptionId: number,
  optionsJson: string,
  callback: GodotCallback,
) {
  let orderOptions: Record<string, unknown>;
  try {
    const parsed = parseOptions(optionsJson);
    const { sku, offerId } = parsed;
    if (typeof sku !== 'string' || sku.length === 0) {
      throw new Error('IAP subscription purchase requires a non-empty "sku" option');
    }
    orderOptions = offerId == null ? { sku } : { sku, offerId };
  } catch (error) {
    emitAsync(callback, { kind: 'subscription_error', subscriptionId, error: serializeError(error) });
    return;
  }
  startIapOrder(subscriptionId, 'createSubscriptionPurchaseOrder', orderOptions, callback);
}

function parseOptions(optionsJson: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(optionsJson || '{}');
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Bridge options must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

function startEventSubscription(
  subscriptionId: number,
  path: string,
  optionsJson: string,
  callback: GodotCallback,
  leadingArgs: unknown[] = [],
) {
  try {
    const options = parseOptions(optionsJson);
    const { fn, owner } = resolvePath(path);
    subscriptions.get(subscriptionId)?.();
    const params: Record<string, unknown> = {
      onEvent: (event: unknown) =>
        emitAsync(callback, { kind: 'subscription_event', subscriptionId, event }),
      onError: (error: unknown) =>
        emitAsync(callback, {
          kind: 'subscription_error',
          subscriptionId,
          error: serializeError(error),
        }),
    };
    if (Object.keys(options).length > 0) params.options = options;
    const dispose = Reflect.apply(fn, owner, [...leadingArgs, params]);
    const disposer: Disposer = typeof dispose === 'function' ? () => dispose() : () => undefined;
    subscriptions.set(subscriptionId, disposer);
  } catch (error) {
    emitAsync(callback, { kind: 'subscription_error', subscriptionId, error: serializeError(error) });
  }
}

function adsLoadFullScreenAd(
  subscriptionId: number,
  optionsJson: string,
  callback: GodotCallback,
) {
  startEventSubscription(subscriptionId, 'loadFullScreenAd', optionsJson, callback);
}

function adsShowFullScreenAd(
  subscriptionId: number,
  optionsJson: string,
  callback: GodotCallback,
) {
  startEventSubscription(subscriptionId, 'showFullScreenAd', optionsJson, callback);
}

function subscribePath(
  subscriptionId: number,
  path: string,
  optionsJson: string,
  callback: GodotCallback,
) {
  startEventSubscription(subscriptionId, path, optionsJson, callback);
}

// graniteEvent.addEventListener('backEvent', { onEvent, onError })처럼 구독 객체 앞에
// 인자를 받는 API용. argsJson은 구독 객체 앞에 넣을 인자 배열(JSON)이다.
function subscribePathArgs(
  subscriptionId: number,
  path: string,
  argsJson: string,
  optionsJson: string,
  callback: GodotCallback,
) {
  let leadingArgs: unknown[];
  try {
    const parsed: unknown = JSON.parse(argsJson || '[]');
    if (!Array.isArray(parsed)) throw new Error('Bridge arguments must be a JSON array');
    leadingArgs = parsed;
  } catch (error) {
    emitAsync(callback, { kind: 'subscription_error', subscriptionId, error: serializeError(error) });
    return;
  }
  startEventSubscription(subscriptionId, path, optionsJson, callback, leadingArgs);
}

// 배너 광고(Unity SDK 3.9.0 AITBannerAd·AITBannerAdView, AppsInToss-BannerAd.jslib 대응).
// 캔버스 위에 고정 위치 컨테이너를 만들고 TossAds.attachBanner를 붙인 뒤, 생명주기 콜백과 렌더된 높이를
// 구독 이벤트로 돌려준다. 배너를 내릴 때는 disposeSubscription(subscriptionId)을 부른다.
// mode 0: 화면 위(Safe Area), 1: 화면 아래(Safe Area), 2: 영역(bannerSetRect가 캔버스 기준 0~1 좌표를 준다).
// attachBanner는 실패를 throw하지 않고 콜백으로만 알리므로 콜백을 모두 구독해 같은 모양의 이벤트로 바꾼다.
type BannerRect = { x: number; y: number; w: number; h: number };
interface BannerSlot {
  lastRect: BannerRect | null;
  destroyed: boolean;
  applyRect(): void;
  refreshSize(): void;
}
type BannerPayload = {
  adGroupId?: string;
  slotId?: string;
  adMetadata?: { creativeId?: string; requestId?: string };
  error?: { code?: unknown; message?: string };
};

const bannerSlots = new Map<number, BannerSlot>();
// TossAds.initialize는 한 번만 부른다. 동시에 연 슬롯은 줄을 서고, 실패하면 idle로 돌아가 다음 표시에서 다시 부른다.
const bannerInit: { state: 'idle' | 'pending' | 'ready'; queue: Array<{ ready(): void; failed(error: unknown): void }> } = {
  state: 'idle',
  queue: [],
};

function bannerCanvasRect(): { left: number; top: number; width: number; height: number } {
  const canvas = document.querySelector('#canvas') ?? document.querySelector('canvas');
  return canvas
    ? canvas.getBoundingClientRect()
    : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
}

function bannerShow(
  subscriptionId: number,
  adGroupId: string,
  mode: number,
  theme: string,
  tone: string,
  variant: string,
  callback: GodotCallback,
) {
  subscriptions.get(subscriptionId)?.();
  const send = (kind: string, payload: BannerPayload = {}, size: Record<string, number> = {}) => {
    const error = payload.error ?? {};
    const meta = payload.adMetadata ?? {};
    emitAsync(callback, {
      kind: 'subscription_event',
      subscriptionId,
      event: {
        kind,
        adGroupId: payload.adGroupId || adGroupId,
        slotId: payload.slotId || '',
        creativeId: meta.creativeId || '',
        requestId: meta.requestId || '',
        errorCode: typeof error.code === 'number' ? error.code : 0,
        errorMessage: error.message || '',
        ...size,
      },
    });
  };
  const errorMessage = (error: unknown) => {
    const message = (error as { message?: unknown } | null)?.message;
    return typeof message === 'string' && message !== '' ? message : String(error);
  };

  // attachBanner가 컨테이너를 키로 캐싱하므로 표시할 때마다 새 div를 만든다.
  const container = document.createElement('div');
  container.id = `ait-banner-container-${subscriptionId}`;
  container.style.position = 'fixed';
  container.style.zIndex = '9000'; // 토스트(9999)·모달(10000) 아래
  container.style.pointerEvents = 'none';
  if (mode === 0) {
    container.style.top = 'env(safe-area-inset-top, 0px)';
    container.style.left = 'env(safe-area-inset-left, 0px)';
    container.style.right = 'env(safe-area-inset-right, 0px)';
  } else if (mode === 1) {
    container.style.bottom = 'env(safe-area-inset-bottom, 0px)';
    container.style.left = 'env(safe-area-inset-left, 0px)';
    container.style.right = 'env(safe-area-inset-right, 0px)';
  } else {
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '0';
  }
  document.body.appendChild(container);

  let banner: { destroy?: () => void } | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let resizeHandler: (() => void) | null = null;
  let lastSentHeight = -1;
  const slot: BannerSlot = {
    lastRect: null,
    destroyed: false,
    applyRect() {
      if (slot.destroyed || !slot.lastRect) return;
      const r = slot.lastRect;
      const base = bannerCanvasRect();
      container.style.left = `${base.left + r.x * base.width}px`;
      container.style.top = `${base.top + r.y * base.height}px`;
      container.style.width = `${r.w * base.width}px`;
      // 높이는 광고 소재가 정한다. 컨테이너는 가로 폭과 위치만 준다.
    },
    refreshSize() {
      slot.applyRect();
      sendResize(true);
    },
  };
  // 렌더된 배너 높이(= 컨테이너 높이)를 캔버스 대비 비율과 함께 보고한다. 게임은 이 값으로 영역 높이를 맞춘다.
  function sendResize(force: boolean) {
    if (slot.destroyed) return;
    const rect = container.getBoundingClientRect();
    if (rect.height <= 0) return;
    if (!force && Math.abs(rect.height - lastSentHeight) < 0.5) return;
    lastSentHeight = rect.height;
    const base = bannerCanvasRect();
    send('resized', {}, {
      width: rect.width,
      height: rect.height,
      widthFraction: base.width > 0 ? rect.width / base.width : 0,
      heightFraction: base.height > 0 ? rect.height / base.height : 0,
    });
  }
  const destroy = () => {
    if (slot.destroyed) return;
    slot.destroyed = true;
    resizeObserver?.disconnect();
    resizeObserver = null;
    if (resizeHandler) window.removeEventListener('resize', resizeHandler);
    resizeHandler = null;
    try {
      banner?.destroy?.();
    } catch {
      // 이미 제거된 배너
    }
    banner = null;
    container.remove();
    bannerSlots.delete(subscriptionId);
  };
  bannerSlots.set(subscriptionId, slot);
  subscriptions.set(subscriptionId, destroy);
  if (mode === 2) {
    resizeHandler = () => slot.applyRect();
    window.addEventListener('resize', resizeHandler);
  }
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => sendResize(false));
    resizeObserver.observe(container);
  }
  // 광고 영역만 터치를 받고 나머지는 캔버스로 넘긴다.
  const markWrapperInteractive = () => {
    const wrapper = container.querySelector<HTMLElement>('[data-toss-ads-attach-banner-wrapper="true"]');
    if (wrapper) wrapper.style.pointerEvents = 'auto';
    container.style.pointerEvents = 'none';
  };
  const tossAds = () => getProperty(namespaces, 'TossAds') as NamespaceRecord | undefined;
  const attach = () => {
    if (slot.destroyed) return;
    try {
      const attachBanner = getProperty(tossAds(), 'attachBanner');
      if (typeof attachBanner !== 'function') throw new Error('TossAds.attachBanner is unavailable');
      banner = Reflect.apply(attachBanner, tossAds(), [
        adGroupId,
        container,
        {
          theme,
          tone,
          variant,
          callbacks: {
            onAdRendered: (p: BannerPayload) => {
              markWrapperInteractive();
              send('rendered', p);
            },
            onAdViewable: (p: BannerPayload) => send('viewable', p),
            onAdClicked: (p: BannerPayload) => send('clicked', p),
            onAdImpression: (p: BannerPayload) => send('impression', p),
            onAdFailedToRender: (p: BannerPayload) => send('failedToRender', p),
            onNoFill: (p: BannerPayload) => send('noFill', p),
          },
        },
      ]) as { destroy?: () => void } | null;
      markWrapperInteractive();
    } catch (error) {
      send('failedToRender', { error: { message: errorMessage(error) } });
    }
  };
  // 한 틱 미뤄 Show 직후의 bannerSetRect가 attach보다 먼저 적용되게 한다.
  setTimeout(() => {
    if (slot.destroyed) return;
    const ads = tossAds();
    if (!ads) {
      send('initializationFailed', { error: { message: 'AppsInToss.TossAds bridge not available' } });
      return;
    }
    const kit = (window as Window & { TossAdsSpaceKit?: { isInitialized?: () => boolean } }).TossAdsSpaceKit;
    if (bannerInit.state === 'ready' || (typeof kit?.isInitialized === 'function' && kit.isInitialized())) {
      bannerInit.state = 'ready';
      send('initialized');
      attach();
      return;
    }
    bannerInit.queue.push({
      ready() {
        if (slot.destroyed) return;
        send('initialized');
        attach();
      },
      failed(error: unknown) {
        if (slot.destroyed) return;
        send('initializationFailed', { error: { message: errorMessage(error) } });
      },
    });
    if (bannerInit.state === 'pending') return;
    bannerInit.state = 'pending';
    const flush = (ok: boolean, error?: unknown) => {
      bannerInit.state = ok ? 'ready' : 'idle';
      for (const waiter of bannerInit.queue.splice(0)) {
        if (ok) waiter.ready();
        else waiter.failed(error);
      }
    };
    try {
      const initialize = getProperty(ads, 'initialize');
      if (typeof initialize !== 'function') throw new Error('TossAds.initialize is unavailable');
      Reflect.apply(initialize, ads, [
        { callbacks: { onInitialized: () => flush(true), onInitializationFailed: (error: unknown) => flush(false, error) } },
      ]);
    } catch (error) {
      flush(false, error);
    }
  }, 0);
}

function bannerSetRect(subscriptionId: number, x: number, y: number, width: number, height: number) {
  const slot = bannerSlots.get(subscriptionId);
  if (!slot || slot.destroyed) return;
  slot.lastRect = { x, y, w: width, h: height };
  slot.applyRect();
}

// 화면 크기가 바뀌면 캔버스 대비 비율이 달라지므로 모든 배너의 크기를 다시 보고한다.
function bannerRefreshSizes() {
  setTimeout(() => {
    for (const slot of bannerSlots.values()) slot.refreshSize();
  }, 0);
}

// 런타임 디버그 로그(AITRuntimeLog, Unity 런타임 이벤트 로거 대응). { log_name, log_type, params }를
// window.AppsInToss.debugLog가 있으면 넘기고(없으면 건너뜀), Godot Metrics 탭 기록에 더한다.
function runtimeLog(json: string) {
  let payload: { log_name?: unknown; log_type?: unknown; params?: unknown };
  try {
    payload = JSON.parse(json);
  } catch {
    return;
  }
  const name = typeof payload.log_name === 'string' ? payload.log_name : 'unknown';
  metrics.record('runtime', name, payload.params);
  const debugLog = getProperty(namespaces, 'debugLog');
  if (typeof debugLog !== 'function') return;
  try {
    const result = Reflect.apply(debugLog, namespaces, [payload]);
    if (result && typeof (result as Promise<unknown>).catch === 'function') (result as Promise<unknown>).catch(() => undefined);
  } catch {
    // 디버그 로그는 게임에 영향을 주지 않는다.
  }
}

// 저장 미러링(user-files.ts). 셸이 engine.startGame 전에 기다린다. 한 번만 돌고, 실패해도 부팅을 막지 않는다.
let userFilesPromise: Promise<string[]> | null = null;
function userFilesReady(): Promise<string[]> {
  if (!userFilesPromise) {
    const storage = getProperty(namespaces, 'Storage') as { getItem(key: string): Promise<string | null> } | undefined;
    const paths = userFilesFromPage((window as { document?: Document }).document);
    userFilesPromise =
      paths.length === 0 || !storage || typeof indexedDB === 'undefined'
        ? Promise.resolve([])
        : restoreUserFiles(storage, indexedDB, paths).catch((error: unknown) => {
            console.warn('[AIT] user:// 파일을 되살리지 못했어요', error);
            return [];
          });
  }
  return userFilesPromise;
}

// start_event_subscription 계열의 가드는 프레임워크 경로가 아니라 이 브리지
// 객체의 메서드를 검사해야 한다. has()는 프레임워크 네임스페이스 전용이므로
// 별도 hasBridgeMethod를 둔다(추가 메서드를 노출할 때는 아래 목록도 갱신).
const BRIDGE_METHODS = [
  'invoke',
  'iapCreateOneTimePurchaseOrder',
  'iapCreateSubscriptionPurchaseOrder',
  'adsLoadFullScreenAd',
  'adsShowFullScreenAd',
  'bannerShow',
  'bannerSetRect',
  'bannerRefreshSizes',
  'runtimeLog',
  'userFilesReady',
  'subscribePath',
  'subscribePathArgs',
  'disposeSubscription',
  'resolveNested',
  'rejectNested',
  'has',
  'hasBridgeMethod',
  'keys',
  'getValue',
  'runtimeSubscribe',
  'runtimeState',
  'audioRecovery',
];

function hasBridgeMethod(name: string) {
  return BRIDGE_METHODS.includes(name);
}

function disposeSubscription(subscriptionId: number) {
  try {
    subscriptions.get(subscriptionId)?.();
  } finally {
    subscriptions.delete(subscriptionId);
    const prefix = `${subscriptionId}:`;
    for (const [key, pending] of nestedResolvers) {
      if (!key.startsWith(prefix)) continue;
      pending.reject(new Error('Apps in Toss subscription was disposed'));
      nestedResolvers.delete(key);
    }
  }
}

function settleNested(subscriptionId: number, nestedId: number, json: string, reject: boolean) {
  const key = `${subscriptionId}:${nestedId}`;
  const pending = nestedResolvers.get(key);
  if (!pending) return false;

  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    value = json;
  }

  if (reject) pending.reject(value);
  else pending.resolve(value);
  return true;
}

// initialURL 같은 읽기 전용 속성은 invoke로 부를 수 없으므로
// 동기 값 읽기로 제공한다. 함수는 invoke로 부르도록 'null'을 돌려준다.
function getValue(path: string): string {
  const parts = path.split('.').filter(Boolean);
  if (parts.length === 0) return 'null';
  let current: unknown = namespaces;
  for (const part of parts) {
    current = getProperty(current, part);
    if (current === undefined) return 'null';
  }
  if (typeof current === 'function') return 'null';
  try {
    return JSON.stringify(current ?? null) ?? 'null';
  } catch {
    return 'null';
  }
}

bridgeWindow.AppsInTossGodot = {
  invoke,
  getValue,
  iapCreateOneTimePurchaseOrder,
  iapCreateSubscriptionPurchaseOrder,
  adsLoadFullScreenAd,
  adsShowFullScreenAd,
  bannerShow,
  bannerSetRect,
  bannerRefreshSizes,
  runtimeLog,
  userFilesReady,
  subscribePath,
  subscribePathArgs,
  hasBridgeMethod,
  disposeSubscription,
  resolveNested(subscriptionId: number, nestedId: number, json: string) {
    return settleNested(subscriptionId, nestedId, json, false);
  },
  rejectNested(subscriptionId: number, nestedId: number, json: string) {
    return settleNested(subscriptionId, nestedId, json, true);
  },
  has(path: string) {
    try {
      resolvePath(path);
      return true;
    } catch {
      return false;
    }
  },
  keys() {
    return Object.keys(namespaces);
  },
  runtimeSubscribe(callback: GodotCallback) {
    runtime.subscribe((event) => emitAsync(callback, event));
  },
  runtimeState() {
    return JSON.stringify(runtime.state());
  },
  audioRecovery(enabled: boolean) {
    runtime.setRecovery(Boolean(enabled));
  },
};

// bfcache로 들어가는 pagehide(persisted)는 돌아올 수 있으므로 구독을 끊지 않는다.
// 끊으면 열려 있던 광고·결제 구독의 이벤트가 돌아온 뒤에 오지 않는다.
window.addEventListener('pagehide', (event) => {
  if ((event as PageTransitionEvent).persisted) return;
  for (const dispose of subscriptions.values()) {
    try {
      dispose();
    } catch {
      // pagehide cleanup is best-effort.
    }
  }
  subscriptions.clear();
});

if (bridgeWindow.__AIT_VERBOSE) {
  console.info('[Godot Bridge] Apps in Toss initialized', Object.keys(namespaces));
}
