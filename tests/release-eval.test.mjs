// 검수 eval 반려 대응 — 엔진 JS 패치, 번들 글자 검사, export 폴더·최종 .ait 검사.
// 2026-11-04 cat-room-godot 번들이 엔진 index.js의 JavaScriptBridge.eval 구현 때문에 반려됐고,
// 호출을 없앤 뒤에도 남은 "eval" 글자 때문에 다시 반려됐다.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { addAudioHooks, disableJsBridgeExec, ENGINE_PATCHES, injectAppConfig, patchEngineCode, patchExportDir } from '../addons/apps_in_toss/tools/scripts/engine-patch.mjs';
import { referencesScript, scanReleaseText, scriptSources } from '../addons/apps_in_toss/tools/scripts/release-scan.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const scriptsDir = path.join(repoRoot, 'addons/apps_in_toss/tools/scripts');
const bridgeDir = path.join(repoRoot, 'bridge');
const { AITWriter } = createRequire(path.join(bridgeDir, 'package.json'))('@apps-in-toss/ait-format');

// Godot 4.7.2 출시 템플릿 godot.js의 해당 부분을 줄인 것. 문자열 안의 '}'와 중첩 블록을 일부러 넣었다.
const ENGINE = [
  'var logged=[];var GodotRuntime={error:function(m){logged.push(String(m))},parseString:function(s){return s}};',
  'function _godot_js_emscripten_get_version(){return 1}',
  'function _godot_js_eval(p_js,p_use_global_ctx,p_union_ptr,p_byte_arr,p_byte_arr_write,p_callback){const js_code=GodotRuntime.parseString(p_js);let eval_ret=null;try{if(p_use_global_ctx){const global_eval=eval;eval_ret=global_eval(js_code)}else{eval_ret=eval(js_code)}}catch(e){GodotRuntime.error(e)}switch(typeof eval_ret){case"boolean":return 1;case"string":if(eval_ret==="}"){break}return 4}return 0}',
  'var IDHandler={_last_id:0};function _godot_js_fetch_create(){return 2}',
  'var wasmImports={Ue:_godot_js_emscripten_get_version,$e:_godot_js_eval,Ab:_godot_js_fetch_create};',
].join('');
// 아래 축약 엔진에는 소리 코드가 없어 eval 패치만 쓴다(소리 훅은 실제 템플릿 검사에서 함께 확인한다).
const EVAL_ONLY = ENGINE_PATCHES.filter((patch) => patch.apply === disableJsBridgeExec);

describe('engine-patch.mjs', () => {
  it('replaces the JavaScriptBridge exec function and import entry, leaving no "eval" text', () => {
    const { code, applied } = patchEngineCode(ENGINE, EVAL_ONLY);
    assert.deepEqual(applied, ['JavaScriptBridge 실행 끄기']);
    assert.deepEqual(scanReleaseText('index.js', code), []);
    const sandbox = {};
    vm.runInNewContext(`${code};this.result=wasmImports.$e(1,1,0,0,0,0);this.logged=logged;this.other=wasmImports.Ab();`, sandbox);
    assert.equal(sandbox.result, 0, 'disabled function returns nil (0)');
    assert.equal(sandbox.other, 2, 'other imports untouched');
    assert.equal(sandbox.logged.length, 1);
    assert.doesNotMatch(sandbox.logged[0], /eval/i);
  });

  it('is idempotent', () => {
    const once = patchEngineCode(ENGINE, EVAL_ONLY).code;
    const twice = patchEngineCode(once, EVAL_ONLY);
    assert.equal(twice.code, once);
    assert.deepEqual(twice.applied, []);
  });

  it('keeps the wasm import key of unminified (debug) templates', () => {
    const debug = ENGINE.replace('$e:_godot_js_eval', 'godot_js_eval:_godot_js_eval');
    const { code } = disableJsBridgeExec(debug);
    assert.match(code, /godot_js_eval:_godot_js_off/);
  });

  it('refuses to patch audio code it does not recognize', () => {
    assert.throws(() => addAudioHooks('var GodotAudio={};'), /엔진 소리 코드가 예상과 다릅니다/);
  });

  it('fails loudly when the engine layout changes', () => {
    assert.throws(() => disableJsBridgeExec('var a=1;'), /찾지 못했습니다/);
    assert.throws(() => disableJsBridgeExec(ENGINE.replace(',$e:_godot_js_eval', '')), /가져오기 표/);
    assert.throws(() => disableJsBridgeExec(ENGINE + ENGINE), /두 번 이상/);
  });

  it('patches index.js in an export folder', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ait-engine-'));
    try {
      fs.writeFileSync(path.join(dir, 'index.js'), ENGINE);
      const { applied } = patchExportDir(dir, EVAL_ONLY);
      assert.equal(applied.length, 1);
      assert.deepEqual(scanReleaseText('index.js', fs.readFileSync(path.join(dir, 'index.js'), 'utf8')), []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // 이 기계에 Godot 4.7.2 Web 템플릿이 있으면 실제 엔진 JS로도 확인한다(CI에는 없어 건너뛴다).
  const template = path.join(os.homedir(), 'Library/Application Support/Godot/export_templates/4.7.2.stable/web_nothreads_release.zip');
  it('cleans the real Godot 4.7.2 release template', { skip: !fs.existsSync(template) && 'no local Godot 4.7.2 template' }, () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ait-template-'));
    try {
      const unzip = spawnSync('unzip', ['-q', '-o', template, 'godot.js', '-d', out]);
      assert.equal(unzip.status, 0);
      const { code, applied } = patchEngineCode(fs.readFileSync(path.join(out, 'godot.js'), 'utf8'));
      assert.equal(applied.length, ENGINE_PATCHES.length);
      assert.deepEqual(scanReleaseText('godot.js', code), []);
      assert.equal(code.split('.connect(GodotAudio.ctx.destination)').length - 1, 0, 'every output goes through the fader');
      assert.match(code, /window\.__godotAudio=GodotAudio/);
      assert.deepEqual(patchEngineCode(code).applied, [], 'idempotent on the real engine');
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  });
});

describe('app config injection', () => {
  const read = (html) => JSON.parse(html.match(/<script type="application\/json" id="ait-app-config">([\s\S]*?)<\/script>/)[1]);
  it('adds inert JSON before </head>, replaces it on rebuild, and escapes markup and $ patterns', () => {
    const page = '<html><head><title>g</title></head><body></body></html>';
    const once = injectAppConfig(page, { navigationBar: { transparentBackground: true }, note: '</script>$&' });
    assert.equal(read(once).note, '</script>$&');
    assert.doesNotMatch(once, /<\/script><\/script>/);
    const twice = injectAppConfig(once, { navigationBar: { transparentBackground: false } });
    assert.equal(twice.split('id="ait-app-config"').length - 1, 1);
    assert.equal(read(twice).navigationBar.transparentBackground, false);
  });
});

describe('release-scan.mjs', () => {
  it('finds "eval" anywhere and Function constructors, but not identifiers ending in Function', () => {
    const kinds = (text) => scanReleaseText('x.js', text).map((item) => item.kind);
    assert.deepEqual(kinds('n=e.evaluate'), ['eval']);
    assert.deepEqual(kinds('"scripts":{"strip-eval":"x"}'), ['eval']);
    assert.deepEqual(kinds('new Function("a")'), ['Function(']);
    assert.deepEqual(kinds('window.Function("a")'), ['Function(']);
    assert.deepEqual(kinds('var ret=entryFunction(argc,argv)'), []);
  });

  it('reads only <script src>, not script text', () => {
    const html = '<script src="./a.js?v=1"></script><script>const s="apps-in-toss-godot-bridge.mock.js"</script>';
    assert.deepEqual(scriptSources(html), ['./a.js?v=1']);
    assert.equal(referencesScript(html, 'a.js'), true);
    assert.equal(referencesScript(html, 'apps-in-toss-godot-bridge.mock.js'), false);
  });
});

function makeReleaseExport() {
  const exportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ait-eval-export-'));
  fs.writeFileSync(
    path.join(exportDir, 'index.html'),
    '<!doctype html><html><body><script src="./apps-in-toss-godot-bridge.js"></script><script src="./index.js"></script></body></html>\n',
  );
  fs.writeFileSync(path.join(exportDir, 'apps-in-toss-godot-bridge.js'), 'window.AppsInTossGodot = {};\n');
  fs.writeFileSync(path.join(exportDir, 'index.js'), patchEngineCode(ENGINE, EVAL_ONLY).code);
  fs.writeFileSync(path.join(exportDir, 'index.wasm'), 'wasm');
  fs.writeFileSync(path.join(exportDir, 'index.pck'), 'pck');
  const lockPath = path.join(exportDir, 'platform.lock.json');
  fs.writeFileSync(lockPath, '{"godot":{"web":{"exportPreset":"Apps in Toss Web"}}}\n');
  const sha = crypto.createHash('sha256').update(fs.readFileSync(lockPath)).digest('hex');
  fs.writeFileSync(path.join(exportDir, 'ait-platform-manifest.json'), JSON.stringify({ platformVersion: 'test', platformLockSha256: sha }));
  return { exportDir, lockPath };
}

function runVerifyExport({ exportDir, lockPath }, projectDir) {
  return spawnSync(process.execPath, [path.join(scriptsDir, 'verify-godot-export.mjs'), exportDir], {
    env: { ...process.env, AIT_PLATFORM_LOCK: lockPath, AIT_BRIDGE_MOCK: '', AIT_DEBUG_CONSOLE: '', GODOT_PROJECT_DIR: projectDir ?? exportDir },
    encoding: 'utf8',
  });
}

describe('verify-godot-export.mjs eval scan', () => {
  it('passes a patched release export', () => {
    const bundle = makeReleaseExport();
    try {
      const result = runVerifyExport(bundle);
      assert.equal(result.status, 0, result.stderr);
    } finally {
      fs.rmSync(bundle.exportDir, { recursive: true, force: true });
    }
  });

  it('rejects an unpatched engine', () => {
    const bundle = makeReleaseExport();
    try {
      fs.writeFileSync(path.join(bundle.exportDir, 'index.js'), ENGINE);
      const result = runVerifyExport(bundle);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /index\.js:1 "eval"/);
    } finally {
      fs.rmSync(bundle.exportDir, { recursive: true, force: true });
    }
  });

  it('rejects "eval" in the game package.json (shipped as project-package.json)', () => {
    const bundle = makeReleaseExport();
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ait-eval-project-'));
    try {
      fs.writeFileSync(path.join(project, 'package.json'), '{"scripts":{"strip-eval":"node x.mjs"}}\n');
      const result = runVerifyExport(bundle, project);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /project-package\.json/);
    } finally {
      fs.rmSync(bundle.exportDir, { recursive: true, force: true });
      fs.rmSync(project, { recursive: true, force: true });
    }
  });

  it('does not treat a dev script name inside shell code as a loaded script', () => {
    const bundle = makeReleaseExport();
    try {
      const html = fs.readFileSync(path.join(bundle.exportDir, 'index.html'), 'utf8');
      fs.writeFileSync(
        path.join(bundle.exportDir, 'index.html'),
        html.replace('</body>', '<script>const devOnly = "apps-in-toss-godot-bridge.mock.js";</script></body>'),
      );
      const result = runVerifyExport(bundle);
      assert.equal(result.status, 0, result.stderr);
    } finally {
      fs.rmSync(bundle.exportDir, { recursive: true, force: true });
    }
  });
});

const RELEASE_MANIFEST = {
  platformVersion: 'test',
  exportPreset: 'Apps in Toss Web',
  build: { time: '2026-11-04T00:00:00.000Z', commit: 'abc123def456', dirty: false },
};

async function makeGame(files, { manifest = RELEASE_MANIFEST } = {}) {
  const gameDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ait-verify-ait-'));
  fs.mkdirSync(path.join(gameDir, '.ait'));
  fs.writeFileSync(path.join(gameDir, '.ait/game.manifest.json'), '{"gameId":"game"}\n');
  fs.writeFileSync(path.join(gameDir, '.ait/platform.lock.json'), '{"godot":{"web":{"exportPreset":"Apps in Toss Web"}}}\n');
  const writer = new AITWriter({ appName: 'game' });
  writer.setMetadata({ isGame: true, packageJson: { name: 'game' } });
  const all = {
    'sources/index.html': '<!doctype html><script src="./apps-in-toss-godot-bridge.js"></script><script src="./index.js"></script>',
    'sources/index.js': patchEngineCode(ENGINE, EVAL_ONLY).code,
    'sources/apps-in-toss-godot-bridge.js': 'window.AppsInTossGodot={};',
    'bundle.json': '{"config":{"appName":"game"}}',
    'project-package.json': '{"name":"game","scripts":{"build":"ait-godot build"}}',
    ...(manifest ? { 'sources/ait-platform-manifest.json': JSON.stringify(manifest) } : {}),
    ...files,
  };
  for (const [name, text] of Object.entries(all)) {
    if (text !== null) writer.addFile(name, new TextEncoder().encode(text));
  }
  fs.writeFileSync(path.join(gameDir, 'game.ait'), await writer.toBuffer());
  return gameDir;
}

function runVerifyAit(gameDir) {
  return spawnSync(process.execPath, [path.join(scriptsDir, 'verify-ait.mjs')], {
    cwd: gameDir,
    env: { ...process.env, GODOT_PROJECT_DIR: gameDir, AIT_BRIDGE_DIR: bridgeDir },
    encoding: 'utf8',
  });
}

describe('verify-ait.mjs', () => {
  const cases = [
    ['passes a clean release .ait', {}, {}, 0, /통과.*abc123def456/],
    ['rejects a non-release export preset', {}, { manifest: { ...RELEASE_MANIFEST, exportPreset: 'Apps in Toss Web (dev)' } }, 1, /출시 프리셋/],
    ['rejects "eval" text in shipped JS', { 'sources/index.js': ENGINE }, {}, 1, /sources\/index\.js:1 "eval"/],
    ['rejects "eval" in project-package.json', { 'project-package.json': '{"scripts":{"strip-eval":"x"}}' }, {}, 1, /project-package\.json/],
    ['rejects dev-only files', { 'sources/apps-in-toss-godot-bridge.mock.js': '//' }, {}, 1, /개발 전용 파일/],
    ['rejects a loaded dev-only script', { 'sources/index.html': '<script src="./ait-devtools-panel.js"></script>' }, {}, 1, /개발 전용 스크립트/],
    ['rejects a .ait not built by ait-godot build', {}, { manifest: null }, 1, /ait-platform-manifest\.json가 없습니다/],
  ];
  for (const [title, files, options, status, pattern] of cases) {
    it(title, async () => {
      const gameDir = await makeGame(files, options);
      try {
        const result = runVerifyAit(gameDir);
        assert.equal(result.status, status, `${result.stdout}\n${result.stderr}`);
        assert.match(`${result.stdout}\n${result.stderr}`, pattern);
      } finally {
        fs.rmSync(gameDir, { recursive: true, force: true });
      }
    });
  }

  it('allows the debug console only in a test build, with a warning', async () => {
    const gameDir = await makeGame(
      { 'sources/ait-debug-console.js': 'window.x=1;' },
      { manifest: { ...RELEASE_MANIFEST, debugConsole: true } },
    );
    try {
      const result = runVerifyAit(gameDir);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stderr, /테스트 빌드/);
    } finally {
      fs.rmSync(gameDir, { recursive: true, force: true });
    }
  });
});
