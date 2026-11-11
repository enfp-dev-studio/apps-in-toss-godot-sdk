// Bridge transport behavior — evaluates the real bridge/src/index.ts
// (TypeScript transpiled with the installed compiler) against a minimal fake
// WebFramework namespace in a vm sandbox. No Toss calls, no network.
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const require = createRequire(path.join(repoRoot, 'bridge/package.json'));
const ts = require(path.join(repoRoot, 'bridge/node_modules/typescript'));

const FAKE_SOURCE = `
const calls = [];
function track(entry) { calls.push(entry); }
module.exports = {
  __calls: calls,
  NavigationBar: {
    setOptions: function (options) {
      track({ path: 'NavigationBar.setOptions', options, owner: this });
      return Promise.resolve();
    },
  },
  GoogleAdMob: {
    loadAppsInTossAdMob: function (params) {
      track({ path: 'GoogleAdMob.loadAppsInTossAdMob', params, owner: this });
      module.exports.__lastLoad = params;
      return () => { track({ disposed: 'GoogleAdMob.loadAppsInTossAdMob' }); };
    },
    showAppsInTossAdMob: function (params) {
      track({ path: 'GoogleAdMob.showAppsInTossAdMob', params, owner: this });
      module.exports.__lastShow = params;
      return () => { track({ disposed: 'GoogleAdMob.showAppsInTossAdMob' }); };
    },
    isAppsInTossAdMobLoaded: function (options) {
      track({ path: 'GoogleAdMob.isAppsInTossAdMobLoaded', options, owner: this });
      return Promise.resolve(true);
    },
  },
  Environment: {
    initialURL: 'intoss://cat-room-godot/visit?code=abc',
  },
  debugLog: function (payload) {
    track({ path: 'debugLog', payload });
  },
  TossAds: {
    initialize: function (options) {
      track({ path: 'TossAds.initialize', owner: this });
      module.exports.__lastAdsInit = options;
    },
    attachBanner: function (adGroupId, target, options) {
      track({ path: 'TossAds.attachBanner', adGroupId, owner: this });
      module.exports.__lastBanner = { adGroupId, target, options };
      return { destroy: () => { track({ disposed: 'TossAds.attachBanner', adGroupId }); } };
    },
  },
  graniteEvent: {
    addEventListener: function (event, args) {
      track({ path: 'graniteEvent.addEventListener', event, args, owner: this });
      module.exports.__lastGranite = { event, args };
      return () => { track({ disposed: 'graniteEvent.addEventListener', event }); };
    },
  },
};
`;

let bridge;
let fake;
let windowObj;
let ctx;

// 배너 컨테이너용 최소 DOM. 브리지는 전역 document를 쓰고, web-runtime은 window.document만 보므로 서로 섞이지 않는다.
function fakeElement() {
  return {
    id: '', style: {}, parent: null, wrapper: null, height: 0,
    remove() {
      if (!this.parent) return;
      this.parent.children = this.parent.children.filter((c) => c !== this);
      this.parent = null;
    },
    querySelector(selector) { return selector.includes('attach-banner-wrapper') ? this.wrapper : null; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 360, height: this.height }; },
  };
}
const canvasEl = { getBoundingClientRect: () => ({ left: 10, top: 20, width: 400, height: 800 }) };
const documentObj = {
  body: { children: [], appendChild(el) { el.parent = this; this.children.push(el); } },
  createElement: () => fakeElement(),
  querySelector: (selector) => (selector === '#canvas' ? canvasEl : null),
};

async function flush(rounds = 5) {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

// vm 경계를 넘어온 객체는 프로토타입이 달라 deepEqual이 실패하므로,
// 값 비교 전에 바깥 realm 객체로 정규화한다.
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function collectCallback() {
  const payloads = [];
  const cb = (json) => { payloads.push(JSON.parse(json)); };
  return { cb, payloads };
}

before(() => {
  const srcPath = path.join(repoRoot, 'bridge/src/index.ts');
  const embeddedPath = path.join(repoRoot, 'addons/apps_in_toss/tools/bridge/src/index.ts');
  assert.equal(
    fs.readFileSync(srcPath, 'utf8'),
    fs.readFileSync(embeddedPath, 'utf8'),
    'bridge sources must be byte-identical',
  );
  const fakePath = path.join(os.tmpdir(), `ait-fake-framework-${Date.now()}.cjs`);
  fs.writeFileSync(fakePath, FAKE_SOURCE);
  const src = fs.readFileSync(srcPath, 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText.replaceAll('@apps-in-toss/web-framework', fakePath);
  // web-runtime.ts는 index.ts가 import한다. 같은 컨텍스트에서 CJS로 풀어 넘긴다.
  const runtimeJs = ts.transpileModule(fs.readFileSync(path.join(repoRoot, 'bridge/src/web-runtime.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const metricsJs = ts.transpileModule(fs.readFileSync(path.join(repoRoot, 'bridge/src/metrics.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  // 이벤트를 테스트에서 직접 보낼 수 있게 등록된 리스너를 모은다.
  windowObj = {
    listeners: {},
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
    removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn); },
    dispatch(type, event = {}) { for (const fn of this.listeners[type] ?? []) fn(event); },
  };
  const sandbox = {
    window: windowObj,
    document: documentObj,
    queueMicrotask,
    setTimeout,
    console,
    exports: {},
    require: (id) => {
      if (id === './web-runtime.ts') {
        if (!sandbox.__runtime) {
          const mod = { exports: {} };
          vm.runInContext(`(function (exports, module) {${runtimeJs}\n})`, sandbox)(mod.exports, mod);
          sandbox.__runtime = mod.exports;
        }
        return sandbox.__runtime;
      }
      if (id === './user-files.ts') {
        const mod = { exports: {} };
        const userFilesJs = ts.transpileModule(fs.readFileSync(path.join(repoRoot, 'bridge/src/user-files.ts'), 'utf8'), {
          compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
        }).outputText;
        vm.runInContext(`(function (exports, module) {${userFilesJs}\n})`, sandbox)(mod.exports, mod);
        return mod.exports;
      }
      if (id === './metrics.ts') {
        if (!sandbox.__metrics) {
          const mod = { exports: {} };
          vm.runInContext(`(function (exports, module) {${metricsJs}\n})`, sandbox)(mod.exports, mod);
          sandbox.__metrics = mod.exports;
        }
        return sandbox.__metrics;
      }
      if (id === fakePath) {
        if (!sandbox.__fake) sandbox.__fake = require(id);
        return sandbox.__fake;
      }
      throw new Error(`unexpected require: ${id}`);
    },
  };
  sandbox.module = { exports: sandbox.exports };
  vm.createContext(sandbox);
  ctx = vm.isContext(sandbox) ? sandbox : sandbox;
  vm.runInContext(js, sandbox, { filename: 'ait-bridge-index.cjs' });
  bridge = windowObj.AppsInTossGodot;
  fake = sandbox.__fake ?? require(fakePath);
  assert.ok(bridge, 'bridge must expose AppsInTossGodot');
});

describe('bridge transport (vm + fake WebFramework)', () => {
  it('NavigationBar.setOptions invoke forwards the options object with namespace owner', async () => {
    const { cb, payloads } = collectCallback();
    bridge.invoke('NavigationBar.setOptions', JSON.stringify([{ theme: 'dark', withTitle: true }]), 7, cb);
    await flush();
    assert.deepEqual(payloads, [{ kind: 'request', requestId: 7, ok: true, result: null }]);
    const call = fake.__calls.find((c) => c.path === 'NavigationBar.setOptions');
    assert.deepEqual(plain(call.options), { theme: 'dark', withTitle: true });
    assert.equal(call.owner, fake.NavigationBar);
  });

  it('AdMob load subscribe delivers events, dispose runs the disposer, errors serialize', async () => {
    const { cb, payloads } = collectCallback();
    bridge.subscribePath(11, 'GoogleAdMob.loadAppsInTossAdMob', JSON.stringify({ adGroupId: 'g1' }), cb);
    await flush();
    const params = fake.__lastLoad;
    assert.deepEqual(plain(params.options), { adGroupId: 'g1' });
    assert.equal(typeof params.onEvent, 'function');
    assert.equal(typeof params.onError, 'function');

    params.onEvent({ type: 'loaded', data: { ok: true } });
    await flush();
    assert.deepEqual(payloads.at(-1), {
      kind: 'subscription_event', subscriptionId: 11, event: { type: 'loaded', data: { ok: true } },
    });

    // realm 안에서 만든 Error로 호출해야 bridge의 instanceof 분기가 탄다.
    const realmError = vm.runInContext('new Error("nope")', ctx);
    params.onError(realmError);
    await flush();
    const err = payloads.at(-1);
    assert.equal(err.kind, 'subscription_error');
    assert.equal(err.subscriptionId, 11);
    assert.equal(err.error.message, 'nope');

    bridge.disposeSubscription(11);
    assert.ok(fake.__calls.some((c) => c.disposed === 'GoogleAdMob.loadAppsInTossAdMob'));
  });

  it('subscribePathArgs passes leading args before the handlers (graniteEvent backEvent)', async () => {
    assert.equal(bridge.hasBridgeMethod('subscribePathArgs'), true);
    const { cb, payloads } = collectCallback();
    bridge.subscribePathArgs(21, 'graniteEvent.addEventListener', JSON.stringify(['backEvent']), '{}', cb);
    await flush();
    const { event, args } = fake.__lastGranite;
    assert.equal(event, 'backEvent');
    assert.equal(typeof args.onEvent, 'function');
    assert.equal(typeof args.onError, 'function');
    assert.equal('options' in args, false, 'empty options are not passed');
    const call = fake.__calls.find((c) => c.path === 'graniteEvent.addEventListener');
    assert.equal(call.owner, fake.graniteEvent);

    args.onEvent();
    await flush();
    assert.deepEqual(payloads.at(-1), { kind: 'subscription_event', subscriptionId: 21 });

    bridge.disposeSubscription(21);
    assert.ok(fake.__calls.some((c) => c.disposed === 'graniteEvent.addEventListener' && c.event === 'backEvent'));
  });

  it('subscribePathArgs rejects non-array args with a subscription error', async () => {
    const { cb, payloads } = collectCallback();
    bridge.subscribePathArgs(22, 'graniteEvent.addEventListener', JSON.stringify({ event: 'backEvent' }), '{}', cb);
    await flush();
    assert.equal(payloads.length, 1);
    assert.equal(payloads[0].kind, 'subscription_error');
    assert.equal(payloads[0].subscriptionId, 22);
    assert.match(payloads[0].error.message, /JSON array/);
  });

  it('has() is framework-only; hasBridgeMethod() covers bridge methods', () => {
    assert.equal(bridge.has('NavigationBar.setOptions'), true);
    assert.equal(bridge.has('Nope.missing'), false);
    assert.equal(bridge.has('subscribePath'), false);
    assert.equal(bridge.hasBridgeMethod('subscribePath'), true);
    assert.equal(bridge.hasBridgeMethod('nope'), false);
  });

  it('getValue reads string properties as JSON, null for missing or function paths', () => {
    assert.equal(bridge.hasBridgeMethod('getValue'), true);
    assert.equal(
      bridge.getValue('Environment.initialURL'),
      JSON.stringify('intoss://cat-room-godot/visit?code=abc'),
    );
    assert.equal(bridge.getValue('Nope.missing'), 'null');
    assert.equal(bridge.getValue('NavigationBar.setOptions'), 'null');
  });

  it('unknown path returns a structured error instead of hanging', async () => {
    const { cb, payloads } = collectCallback();
    bridge.invoke('Nope.missing', '[]', 9, cb);
    await flush();
    assert.equal(payloads.length, 1);
    assert.equal(payloads[0].ok, false);
    assert.match(payloads[0].error.message, /not found/);
  });
});

// web-runtime.ts: 화면 떠남·돌아옴 신호 모으기, 소리 풀기, iOS 복귀 복구(실기기 동작은 미검증).
function fakeAudio() {
  const calls = [];
  const gain = {
    value: 1,
    cancelScheduledValues() {},
    setValueAtTime(value) { calls.push(['gain', value]); this.value = value; },
    linearRampToValueAtTime(value) { calls.push(['ramp', value]); this.value = value; },
  };
  const makeCtx = (name) => ({
    name,
    state: 'running',
    currentTime: 5,
    sampleRate: 48000,
    destination: {},
    listeners: {},
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
    setState(next) { this.state = next; for (const fn of this.listeners.statechange ?? []) fn(); },
    resume() { calls.push(['resume', name]); return Promise.resolve(); },
    suspend() { calls.push(['suspend', name]); this.setState('suspended'); return Promise.resolve(); },
    createBuffer() { return {}; },
    createBufferSource() { return { connect() {}, start() { calls.push(['silent', name]); } }; },
  });
  const audio = {
    ctx: makeCtx('first'),
    aitOutput: () => ({ gain }),
    aitRecreate() { calls.push(['recreate']); this.ctx = makeCtx('renewed'); return this.ctx; },
  };
  return { calls, audio };
}

describe('bridge web runtime (lifecycle + audio)', () => {
  let events;
  let fakeAudioState;

  it('reports the current state on subscribe, then only state-changing signals', async () => {
    events = [];
    bridge.runtimeSubscribe((json) => events.push(JSON.parse(json)));
    await flush();
    assert.deepEqual(events.map((e) => [e.kind, e.state, e.source]), [['life', 'visible', 'initial']]);

    windowObj.dispatch('blur');
    windowObj.dispatch('pagehide', { persisted: true });
    windowObj.dispatch('focus');
    await flush();
    assert.deepEqual(events.slice(1).map((e) => [e.state, e.source]), [['hidden', 'blur'], ['visible', 'focus']]);
    const state = JSON.parse(bridge.runtimeState());
    const pagehide = state.signals.find((s) => s.signal === 'pagehide');
    assert.equal(pagehide.used, false, 'second hidden signal is logged only');
  });

  it('keeps subscriptions on a bfcache pagehide and disposes them on a real one', async () => {
    const { cb } = collectCallback();
    bridge.subscribePath(77, 'GoogleAdMob.loadAppsInTossAdMob', JSON.stringify({ adGroupId: 'g9' }), cb);
    await flush();
    const disposedCount = () => fake.__calls.filter((c) => c.disposed === 'GoogleAdMob.loadAppsInTossAdMob').length;
    const before = disposedCount();
    windowObj.dispatch('pagehide', { persisted: true });
    assert.equal(disposedCount(), before, 'persisted pagehide keeps the subscription');
    windowObj.dispatch('pagehide', { persisted: false });
    assert.equal(disposedCount(), before + 1, 'real pagehide disposes it');
    windowObj.dispatch('focus');
    await flush();
  });

  it('unlocks audio on the first touch only', async () => {
    fakeAudioState = fakeAudio();
    windowObj.__godotAudio = fakeAudioState.audio;
    windowObj.dispatch('touchend');
    windowObj.dispatch('touchend');
    const first = fakeAudioState.calls.filter(([kind, name]) => name === 'first');
    assert.deepEqual(first, [['resume', 'first'], ['silent', 'first']]);
  });

  it('treats an interrupted context as leaving the screen', async () => {
    const before = events.length;
    fakeAudioState.audio.ctx.setState('interrupted');
    await flush();
    assert.deepEqual(events.slice(before).map((e) => [e.state, e.source]), [['hidden', 'audio-interrupted']]);
    fakeAudioState.audio.ctx.state = 'running';
    windowObj.dispatch('focus');
    await flush();
  });

  it('with recovery on: fades and suspends on hide, recreates a stalled context on the first touch back', async () => {
    const { calls, audio } = fakeAudioState;
    bridge.audioRecovery(true);
    const before = events.length;
    windowObj.dispatch('blur');
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.ok(calls.some(([kind, v]) => kind === 'ramp' && v === 0), 'fader ramps to 0');
    assert.ok(calls.some(([kind, name]) => kind === 'suspend' && name === 'first'), 'context suspended by the runtime');
    await flush();
    assert.deepEqual(events.slice(before).map((e) => e.source), ['blur'], 'own suspend is not a new signal');

    windowObj.dispatch('focus');
    assert.equal(calls.some(([kind]) => kind === 'recreate'), false, 'nothing happens until a touch');
    windowObj.dispatch('touchend');
    assert.ok(calls.some(([kind, v]) => kind === 'gain' && v === 1), 'fader restored on touch');
    // currentTime가 그대로(5)라서 0.6초 뒤 멈춘 것으로 보고 새로 만든다.
    await new Promise((resolve) => setTimeout(resolve, 700));
    await flush();
    assert.ok(calls.some(([kind]) => kind === 'recreate'));
    assert.equal(audio.ctx.name, 'renewed');
    assert.ok(calls.some(([kind, name]) => kind === 'silent' && name === 'renewed'));
    assert.deepEqual(events.filter((e) => e.kind === 'audio').map((e) => e.state), ['renewed']);
    bridge.audioRecovery(false);
  });
});

describe('banner slots (Unity AITBannerAd 대응)', () => {
  const wait = () => new Promise((resolve) => setTimeout(resolve, 5));

  it('initialize failure reports initializationFailed and retries on the next show', async () => {
    const { cb, payloads } = collectCallback();
    bridge.bannerShow(31, 'ad-a', 1, 'auto', 'blackAndWhite', 'expanded', cb);
    await wait();
    fake.__lastAdsInit.callbacks.onInitializationFailed(new Error('down'));
    await flush();
    assert.equal(payloads.at(-1).event.kind, 'initializationFailed');
    assert.equal(payloads.at(-1).event.errorMessage, 'down');
    bridge.disposeSubscription(31);
    const before = fake.__calls.filter((c) => c.path === 'TossAds.initialize').length;
    bridge.bannerShow(32, 'ad-a', 1, 'auto', 'blackAndWhite', 'expanded', collectCallback().cb);
    await wait();
    assert.equal(fake.__calls.filter((c) => c.path === 'TossAds.initialize').length, before + 1, 'idle again → initialize again');
    fake.__lastAdsInit.callbacks.onInitializationFailed(new Error('down again'));
    bridge.disposeSubscription(32);
  });

  it('bottom slot: one initialize for two slots, attach with options, callbacks become events, dispose cleans up', async () => {
    const a = collectCallback();
    const b = collectCallback();
    const before = fake.__calls.filter((c) => c.path === 'TossAds.initialize').length;
    bridge.bannerShow(41, 'ad-b', 1, 'dark', 'grey', 'card', a.cb);
    bridge.bannerShow(42, 'ad-c', 0, 'auto', 'blackAndWhite', 'expanded', b.cb);
    await wait();
    assert.equal(fake.__calls.filter((c) => c.path === 'TossAds.initialize').length, before + 1, 'initialize is serialized');
    const containers = documentObj.body.children.filter((c) => c.id.startsWith('ait-banner-container-'));
    const bottom = containers.find((c) => c.id === 'ait-banner-container-41');
    const top = containers.find((c) => c.id === 'ait-banner-container-42');
    assert.equal(bottom.style.position, 'fixed');
    assert.equal(bottom.style.bottom, 'env(safe-area-inset-bottom, 0px)');
    assert.equal(top.style.top, 'env(safe-area-inset-top, 0px)');

    fake.__lastAdsInit.callbacks.onInitialized();
    await flush();
    assert.deepEqual(a.payloads.map((p) => p.event.kind), ['initialized']);
    assert.deepEqual(b.payloads.map((p) => p.event.kind), ['initialized']);
    const attach = fake.__calls.filter((c) => c.path === 'TossAds.attachBanner');
    assert.deepEqual(attach.map((c) => c.adGroupId), ['ad-b', 'ad-c']);
    assert.equal(attach[0].owner, fake.TossAds);

    const call = fake.__lastBanner; // ad-c
    assert.equal(call.target, top);
    assert.deepEqual(plain({ ...call.options, callbacks: Object.keys(call.options.callbacks) }), {
      theme: 'auto', tone: 'blackAndWhite', variant: 'expanded',
      callbacks: ['onAdRendered', 'onAdViewable', 'onAdClicked', 'onAdImpression', 'onAdFailedToRender', 'onNoFill'],
    });
    top.wrapper = { style: {} };
    call.options.callbacks.onAdRendered({ slotId: 's1', adGroupId: 'ad-c', adMetadata: { creativeId: 'cr', requestId: 'rq' } });
    call.options.callbacks.onNoFill({ slotId: 's1', adGroupId: 'ad-c', adMetadata: {} });
    call.options.callbacks.onAdFailedToRender({ slotId: 's1', adGroupId: 'ad-c', adMetadata: {}, error: { code: 3, message: 'bad' } });
    await flush();
    assert.equal(top.wrapper.style.pointerEvents, 'auto', 'only the ad takes touches');
    assert.equal(top.style.pointerEvents, 'none');
    assert.deepEqual(b.payloads.slice(1).map((p) => p.event), [
      { kind: 'rendered', adGroupId: 'ad-c', slotId: 's1', creativeId: 'cr', requestId: 'rq', errorCode: 0, errorMessage: '' },
      { kind: 'noFill', adGroupId: 'ad-c', slotId: 's1', creativeId: '', requestId: '', errorCode: 0, errorMessage: '' },
      { kind: 'failedToRender', adGroupId: 'ad-c', slotId: 's1', creativeId: '', requestId: '', errorCode: 3, errorMessage: 'bad' },
    ]);
    assert.ok(b.payloads.every((p) => p.kind === 'subscription_event' && p.subscriptionId === 42));

    // 이미 초기화됐으면 다음 슬롯은 initialize 없이 바로 붙는다.
    const c = collectCallback();
    bridge.bannerShow(43, 'ad-d', 2, 'auto', 'blackAndWhite', 'expanded', c.cb);
    bridge.bannerSetRect(43, 0.25, 0.5, 0.5, 0.1);
    const rectBox = documentObj.body.children.find((el) => el.id === 'ait-banner-container-43');
    assert.deepEqual(plain({ left: rectBox.style.left, top: rectBox.style.top, width: rectBox.style.width }), {
      left: '110px', top: '420px', width: '200px',
    }, 'normalized rect maps onto the canvas box');
    await wait();
    assert.deepEqual(c.payloads.map((p) => p.event.kind), ['initialized']);
    assert.equal(fake.__calls.filter((x) => x.path === 'TossAds.initialize').length, before + 1);

    // 높이 보고: 화면 크기 변경 뒤 다시 보고를 요청하면 캔버스 대비 비율과 함께 resized가 온다.
    rectBox.height = 96;
    bridge.bannerRefreshSizes();
    await wait();
    await flush();
    const resized = c.payloads.at(-1).event;
    assert.equal(resized.kind, 'resized');
    assert.equal(resized.height, 96);
    assert.equal(resized.heightFraction, 96 / 800);

    for (const id of [41, 42, 43]) bridge.disposeSubscription(id);
    assert.equal(documentObj.body.children.filter((el) => el.id.startsWith('ait-banner-container-')).length, 0);
    assert.deepEqual(
      fake.__calls.filter((x) => x.disposed === 'TossAds.attachBanner').map((x) => x.adGroupId).sort(),
      ['ad-b', 'ad-c', 'ad-d'],
    );
  });

  it('banner methods are listed as bridge methods', () => {
    for (const name of ['bannerShow', 'bannerSetRect', 'bannerRefreshSizes']) assert.equal(bridge.hasBridgeMethod(name), true);
  });
});

describe('runtime log and Godot Metrics tab', () => {
  it('runtimeLog forwards { log_name, log_type, params } to debugLog and ignores bad JSON', () => {
    bridge.runtimeLog(JSON.stringify({ log_name: 'godot_first_interactive', log_type: 'godot_runtime', params: { scene_name: 'Main' } }));
    bridge.runtimeLog('not json');
    const calls = fake.__calls.filter((c) => c.path === 'debugLog');
    assert.equal(calls.length, 1);
    assert.deepEqual(plain(calls[0].payload), {
      log_name: 'godot_first_interactive', log_type: 'godot_runtime', params: { scene_name: 'Main' },
    });
    assert.equal(bridge.hasBridgeMethod('runtimeLog'), true);
  });

  it('adds a vConsole tab only when the debug tools instance exists, and lists records', async () => {
    const metricsJs = ts.transpileModule(fs.readFileSync(path.join(repoRoot, 'bridge/src/metrics.ts'), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const mod = { exports: {} };
    new Function('exports', 'module', metricsJs)(mod.exports, mod);
    const el = () => {
      const node = {
        children: [], attrs: {}, textContent: '', listeners: {},
        setAttribute(k, v) { this.attrs[k] = v; },
        addEventListener(type, fn) { this.listeners[type] = fn; },
        appendChild(child) { this.children.push(child); return child; },
        append(...nodes) { this.children.push(...nodes); },
        replaceChildren() { this.children = []; },
      };
      return node;
    };
    const doc = { createElement: el };
    const plugins = [];
    class FakePlugin {
      constructor(id, name) { this.id = id; this.name = name; this.handlers = {}; }
      on(event, fn) { this.handlers[event] = fn; }
    }
    const noTools = { document: doc, setTimeout: () => 0, performance: { now: () => 0 } };
    const quiet = mod.exports.installMetrics(noTools);
    quiet.record('runtime', 'godot_error', { message: 'x' });
    assert.equal(plugins.length, 0, 'no tab without the debug tools');

    const instance = { constructor: { VConsolePlugin: FakePlugin }, addPlugin(p) { plugins.push(p); } };
    const win = { document: doc, __VCONSOLE_INSTANCE: instance, setTimeout: () => 0, performance: { now: () => 0 }, requestAnimationFrame: () => 1, cancelAnimationFrame() {} };
    const metrics = mod.exports.installMetrics(win);
    assert.equal(plugins.length, 1);
    assert.equal(plugins[0].id, 'godot_metrics');
    assert.equal(plugins[0].name, 'Godot Metrics');
    let root;
    plugins[0].handlers.renderTab((node) => { root = node; });
    metrics.record('runtime', 'godot_scene_transition', { scene_name: 'Room' });
    metrics.record('event', 'eventLog', { log_name: 'buy' });
    const body = root.children[1];
    const rows = body.children.slice(2).map((row) => row.children.map((c) => c.textContent).join(''));
    assert.equal(rows.length, 2);
    assert.match(rows[0], /eventLog \{"log_name":"buy"\}/);
    assert.match(rows[1], /godot_scene_transition \{"scene_name":"Room"\}/);
    assert.match(body.children[1].textContent, /godot_scene_transition 1/);
  });
});
