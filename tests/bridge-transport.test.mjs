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
  // 이벤트를 테스트에서 직접 보낼 수 있게 등록된 리스너를 모은다.
  windowObj = {
    listeners: {},
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
    dispatch(type, event = {}) { for (const fn of this.listeners[type] ?? []) fn(event); },
  };
  const sandbox = {
    window: windowObj,
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
