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
  windowObj = { addEventListener: () => {} };
  const sandbox = {
    window: windowObj,
    queueMicrotask,
    setTimeout,
    console,
    exports: {},
    require: (id) => {
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

  it('has() is framework-only; hasBridgeMethod() covers bridge methods', () => {
    assert.equal(bridge.has('NavigationBar.setOptions'), true);
    assert.equal(bridge.has('Nope.missing'), false);
    assert.equal(bridge.has('subscribePath'), false);
    assert.equal(bridge.hasBridgeMethod('subscribePath'), true);
    assert.equal(bridge.hasBridgeMethod('nope'), false);
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
