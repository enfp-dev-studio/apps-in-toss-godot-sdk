import * as WebFramework from '@apps-in-toss/web-framework';
import { Analytics } from '@apps-in-toss/web-analytics';

const namespaces: Record<string, any> = { ...WebFramework, Analytics };
(window as any).AppsInToss = namespaces;

type GodotCallback = (payload: string) => void;
type Disposer = () => void;

const subscriptions = new Map<number, Disposer>();
const nestedResolvers = new Map<string, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }>();
let nextNestedId = 1;

function emit(callback: GodotCallback, payload: Record<string, unknown>) {
  callback(JSON.stringify(payload));
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    const own = Object.fromEntries(Object.getOwnPropertyNames(error).map((key) => [key, (error as any)[key]]));
    return { name: error.name, message: error.message, stack: error.stack ?? null, ...own };
  }
  if (typeof error === 'object' && error !== null) return error;
  return { message: String(error) };
}

function resolvePath(path: string): { fn: Function; owner: any } {
  const parts = path.split('.').filter(Boolean);
  let owner: any = namespaces;
  for (let i = 0; i < parts.length - 1; i++) owner = owner?.[parts[i]];
  const fnName = parts.at(-1)!;
  const fn = owner?.[fnName];
  if (typeof fn !== 'function') throw new Error(`Apps in Toss API not found: ${path}`);
  return { fn, owner };
}

async function invoke(path: string, argsJson: string, requestId: number, callback: GodotCallback) {
  try {
    const args = JSON.parse(argsJson || '[]');
    if (!Array.isArray(args)) throw new Error('Bridge arguments must be a JSON array');
    const { fn, owner } = resolvePath(path);
    const result = await Promise.resolve(fn.apply(owner, args));
    emit(callback, { kind: 'request', requestId, ok: true, result: result ?? null });
  } catch (error) {
    emit(callback, { kind: 'request', requestId, ok: false, error: serializeError(error) });
  }
}

function requestNested(subscriptionId: number, name: string, payload: unknown, callback: GodotCallback): Promise<unknown> {
  const nestedId = nextNestedId++;
  const key = `${subscriptionId}:${nestedId}`;
  return new Promise((resolve, reject) => {
    nestedResolvers.set(key, { resolve, reject });
    emit(callback, { kind: 'nested', subscriptionId, nestedId, name, payload: payload ?? null });
  }).finally(() => nestedResolvers.delete(key));
}

function iapCreateOneTimePurchaseOrder(subscriptionId: number, sku: string, callback: GodotCallback) {
  try {
    const IAP = namespaces.IAP;
    if (!IAP?.createOneTimePurchaseOrder) throw new Error('IAP.createOneTimePurchaseOrder is unavailable');
    subscriptions.get(subscriptionId)?.();
    const dispose = IAP.createOneTimePurchaseOrder({
      options: {
        sku,
        processProductGrant: (payload: unknown) => requestNested(subscriptionId, 'processProductGrant', payload, callback),
      },
      onEvent: (event: unknown) => emit(callback, { kind: 'subscription_event', subscriptionId, event }),
      onError: (error: unknown) => emit(callback, { kind: 'subscription_error', subscriptionId, error: serializeError(error) }),
    });
    subscriptions.set(subscriptionId, typeof dispose === 'function' ? dispose : () => {});
  } catch (error) {
    emit(callback, { kind: 'subscription_error', subscriptionId, error: serializeError(error) });
  }
}

function disposeSubscription(subscriptionId: number) {
  try { subscriptions.get(subscriptionId)?.(); } finally { subscriptions.delete(subscriptionId); }
}

function settleNested(subscriptionId: number, nestedId: number, json: string, reject: boolean) {
  const key = `${subscriptionId}:${nestedId}`;
  const pending = nestedResolvers.get(key);
  if (!pending) return false;
  let value: unknown;
  try { value = JSON.parse(json); } catch { value = json; }
  reject ? pending.reject(value) : pending.resolve(value);
  return true;
}

(window as any).AppsInTossGodot = {
  invoke,
  iapCreateOneTimePurchaseOrder,
  disposeSubscription,
  resolveNested(subscriptionId: number, nestedId: number, json: string) { return settleNested(subscriptionId, nestedId, json, false); },
  rejectNested(subscriptionId: number, nestedId: number, json: string) { return settleNested(subscriptionId, nestedId, json, true); },
  has(path: string) { try { resolvePath(path); return true; } catch { return false; } },
  keys() { return Object.keys(namespaces); },
};

window.addEventListener('pagehide', () => {
  for (const dispose of subscriptions.values()) { try { dispose(); } catch {} }
  subscriptions.clear();
});

console.info('[Godot Bridge] Apps in Toss initialized', Object.keys(namespaces));
