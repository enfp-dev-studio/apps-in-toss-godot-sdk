import * as WebFramework from '@apps-in-toss/web-framework';

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
  subscribePath: typeof subscribePath;
  hasBridgeMethod: typeof hasBridgeMethod;
  disposeSubscription: typeof disposeSubscription;
  resolveNested: (subscriptionId: number, nestedId: number, json: string) => boolean;
  rejectNested: (subscriptionId: number, nestedId: number, json: string) => boolean;
  has: (path: string) => boolean;
  keys: () => string[];
}

type AppsInTossWindow = Window & {
  AppsInToss?: NamespaceRecord;
  AppsInTossGodot?: GodotBridge;
  __AIT_VERBOSE?: boolean;
};

const namespaces: NamespaceRecord = { ...WebFramework };
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
    const dispose = Reflect.apply(fn, owner, [params]);
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

// start_event_subscription 계열의 가드는 프레임워크 경로가 아니라 이 브리지
// 객체의 메서드를 검사해야 한다. has()는 프레임워크 네임스페이스 전용이므로
// 별도 hasBridgeMethod를 둔다(추가 메서드를 노출할 때는 아래 목록도 갱신).
const BRIDGE_METHODS = [
  'invoke',
  'iapCreateOneTimePurchaseOrder',
  'iapCreateSubscriptionPurchaseOrder',
  'adsLoadFullScreenAd',
  'adsShowFullScreenAd',
  'subscribePath',
  'disposeSubscription',
  'resolveNested',
  'rejectNested',
  'has',
  'hasBridgeMethod',
  'keys',
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

bridgeWindow.AppsInTossGodot = {
  invoke,
  iapCreateOneTimePurchaseOrder,
  iapCreateSubscriptionPurchaseOrder,
  adsLoadFullScreenAd,
  adsShowFullScreenAd,
  subscribePath,
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
};

window.addEventListener('pagehide', () => {
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
