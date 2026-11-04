// 엔진 JS 패치 — 내보낸 index.js(Godot 엔진 godot.js)를 앱인토스 규칙에 맞게 고친다.
// build와 build:dev가 export 바로 뒤에 부른다. 같은 파일에 다시 돌려도 결과가 같다.
//
// JavaScriptBridge 비활성화: 검수는 index.js의 JavaScriptBridge.eval 구현(_godot_js_eval)을
// "외부 코드 실행"으로 반려한다. 호출만 지우면 함수·변수 이름과 오류 문구의 글자 때문에 다시
// 반려되므로(release-scan.mjs), 함수를 이름에 그 글자가 없는 빈 함수로 통째로 바꾸고
// wasm 가져오기 표의 값도 바꾼다. wasm이 이 가져오기를 요구하므로 지우지 않는다.
// 바꾼 함수는 아무것도 실행하지 않고 nil(0)을 돌려준다.
//
// 출시 템플릿은 가져오기 키가 짧은 이름($e 등)이라 글자가 모두 사라진다. 디버그 템플릿은
// 키 자체가 godot_js_eval이라 키는 남는다(build와 build:dev는 출시 템플릿을 쓴다).
//
//   node engine-patch.mjs [exportDir]   (기본: GODOT_EXPORT_DIR 또는 <게임>/build/godot-web)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ORIGINAL_NAME = '_godot_js_eval';
const DISABLED_NAME = '_godot_js_off';
const DISABLED_MESSAGE = 'JavaScriptBridge code execution is disabled in Apps in Toss builds';

// start 위치의 '{'와 짝이 맞는 '}' 위치. 문자열·정규식이 아닌 일반 코드 기준(엔진 함수 몸통용).
export function findBlockEnd(code, start) {
  if (code[start] !== '{') throw new Error(`'{' expected at ${start}`);
  let depth = 0;
  for (let i = start; i < code.length; i += 1) {
    const ch = code[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      i = skipString(code, i);
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error('unbalanced braces in engine function');
}

function skipString(code, start) {
  const quote = code[start];
  for (let i = start + 1; i < code.length; i += 1) {
    if (code[i] === '\\') i += 1;
    else if (code[i] === quote) return i;
  }
  throw new Error('unterminated string in engine function');
}

// JavaScriptBridge 실행 함수를 빈 함수로 바꾼다. { code, changed }
export function disableJsBridgeExec(code) {
  const header = `function ${ORIGINAL_NAME}(`;
  const first = code.indexOf(header);
  if (first === -1) {
    if (code.includes(`function ${DISABLED_NAME}(`)) return { code, changed: false };
    throw new Error(
      `엔진 index.js에서 ${ORIGINAL_NAME} 함수를 찾지 못했습니다. Godot 버전이 바뀌었다면 engine-patch.mjs를 갱신하세요.`,
    );
  }
  if (code.indexOf(header, first + 1) !== -1) throw new Error(`${ORIGINAL_NAME} 함수가 두 번 이상 있습니다.`);
  const paramsEnd = code.indexOf(')', first);
  const params = code.slice(first + header.length, paramsEnd);
  const bodyEnd = findBlockEnd(code, code.indexOf('{', paramsEnd));
  const replacement =
    `function ${DISABLED_NAME}(${params}){GodotRuntime.error(${JSON.stringify(DISABLED_MESSAGE)});return 0}`;
  let next = code.slice(0, first) + replacement + code.slice(bodyEnd + 1);

  // wasm 가져오기 표: {…,$e:_godot_js_xxx,…} 또는 디버그 템플릿의 {…,godot_js_xxx:_godot_js_xxx,…}
  const importEntry = new RegExp(`([,{]\\s*[\\w$]+\\s*:\\s*)${ORIGINAL_NAME}(?=\\s*[,}])`, 'g');
  const entries = next.match(importEntry) ?? [];
  if (entries.length !== 1) {
    throw new Error(`wasm 가져오기 표에서 ${ORIGINAL_NAME} 항목을 정확히 한 번 찾지 못했습니다 (${entries.length}번).`);
  }
  next = next.replace(importEntry, `$1${DISABLED_NAME}`);
  if (new RegExp(`\\b${ORIGINAL_NAME}\\b`).test(next)) {
    throw new Error(`${ORIGINAL_NAME}를 가리키는 곳이 남아 있습니다.`);
  }
  return { code: next, changed: true };
}

// 소리 훅 — 브리지의 web-runtime.ts(첫 터치 소리 풀기, 위치 워크릿 대비, iOS 복귀 복구)가 쓴다.
// 훅만 더하고 동작은 바꾸지 않는다. 바뀌는 것은 하나: 위치 워크릿 풀에서 다른 컨텍스트의 노드를
// 다시 쓰지 않는다(컨텍스트를 새로 만든 뒤 모든 샘플이 "Failed to create PositionWorklet"로 실패하던 엔진 버그).
//   window.__godotAudio      GodotAudio(컨텍스트·버스·샘플)
//   GodotAudio.aitOutput()   출력 앞 페이더 GainNode(컨텍스트마다 하나, 기본 1). 떠날 때 줄여 튀는 소리를 막는다.
//   GodotAudio.aitRecreate() 새 AudioContext로 버스·위치 워크릿·출력 드라이버를 다시 잇는다. 재생 중이던
//                            샘플은 끝난 것으로 처리되므로 게임이 다시 튼다(AIT.sound의 audio_renewed).
const AUDIO_RUNTIME = [
  'GodotAudio._aitStateChange=onstatechange;window.__godotAudio=GodotAudio;',
  'GodotAudio.aitOutput=function(){const ctx=GodotAudio.ctx;if(!GodotAudio._aitFader||GodotAudio._aitFader.context!==ctx){GodotAudio._aitFader=ctx.createGain();GodotAudio._aitFader.connect(ctx.destination)}return GodotAudio._aitFader};',
  'GodotAudio.aitLoadPositionWorklet=function(ctx){const hooks=window.__aitAudioHooks;const path=GodotAudio._aitPositionWorkletPath;return hooks&&hooks.loadPositionWorklet?hooks.loadPositionWorklet(ctx,path):ctx.audioWorklet.addModule(path)};',
  'GodotAudio.aitPositionWorkletNode=function(){const hooks=window.__aitAudioHooks;const stand=hooks&&hooks.positionWorkletNode?hooks.positionWorkletNode(GodotAudio.ctx):null;return stand||new AudioWorkletNode(GodotAudio.ctx,"godot-position-reporting-processor")};',
  'GodotAudio.aitRecreate=function(){',
  'const old=GodotAudio.ctx;if(!old){return null}const opts={};if(GodotAudio.sampleRate){opts["sampleRate"]=GodotAudio.sampleRate}',
  'let ctx;try{ctx=new(window.AudioContext||window.webkitAudioContext)(opts)}catch(e){GodotRuntime.error("AudioContext recreate failed",e);return null}',
  'const driver=GodotAudio.driver;',
  'if(driver===GodotAudioWorklet&&GodotAudioWorklet.worklet){const node=GodotAudioWorklet.worklet;GodotAudioWorklet.worklet=null;node.port.onmessage=null;try{node.port.postMessage({cmd:"stop",data:null})}catch(e){}try{node.disconnect()}catch(e){}}',
  'if(driver===GodotAudioScript&&GodotAudioScript.script){const node=GodotAudioScript.script;GodotAudioScript.script=null;node.onaudioprocess=null;try{node.disconnect()}catch(e){}}',
  'for(const sampleNode of Array.from(GodotAudio.sampleNodes.values())){try{sampleNode.clear()}catch(e){}}',
  'GodotAudio.ctx=ctx;',
  'ctx.onstatechange=function(){let state=0;if(ctx.state==="running"){state=1}else if(ctx.state==="closed"){state=2}if(GodotAudio._aitStateChange){GodotAudio._aitStateChange(state)}};',
  'for(const bus of GodotAudio.buses){const gain=bus._gainNode.gain.value;const solo=bus._soloNode.gain.value;const mute=bus._muteNode.gain.value;bus._gainNode=ctx.createGain();bus._soloNode=ctx.createGain();bus._muteNode=ctx.createGain();bus._gainNode.gain.value=gain;bus._soloNode.gain.value=solo;bus._muteNode.gain.value=mute;bus._gainNode.connect(bus._soloNode).connect(bus._muteNode);bus._sampleNodes=new Set}',
  'for(const bus of GodotAudio.buses){const send=bus.getSend();if(send==null){if(bus.getId()===0){bus.getOutputNode().connect(GodotAudio.aitOutput())}}else{bus.connect(send)}}',
  'GodotAudio.audioPositionWorkletNodes=[];GodotAudio.audioPositionWorkletPromise=GodotAudio.aitLoadPositionWorklet(ctx);',
  'try{if(driver===GodotAudioWorklet&&GodotAudioWorklet._aitStart){GodotAudioWorklet.create(GodotAudioWorklet._aitChannels);GodotAudioWorklet.start_no_threads.apply(null,GodotAudioWorklet._aitStart)}',
  'else if(driver===GodotAudioScript&&GodotAudioScript._aitCreate&&GodotAudioScript._aitStart){GodotAudioScript.create.apply(null,GodotAudioScript._aitCreate);GodotAudioScript.start.apply(null,GodotAudioScript._aitStart)}}',
  'catch(e){GodotRuntime.error("Audio driver restart failed",e)}',
  'old.onstatechange=null;old.close().catch(function(){});ctx.onstatechange();return ctx};',
].join('');

const AUDIO_EDITS = [
  {
    find: 'init:function(mix_rate,latency,onstatechange,onlatencyupdate){',
    insertAfter: AUDIO_RUNTIME,
  },
  {
    find: 'const path=GodotConfig.locate_file("godot.audio.position.worklet.js");GodotAudio.audioPositionWorkletPromise=ctx.audioWorklet.addModule(path);',
    replace: 'GodotAudio._aitPositionWorkletPath=GodotConfig.locate_file("godot.audio.position.worklet.js");GodotAudio.audioPositionWorkletPromise=GodotAudio.aitLoadPositionWorklet(ctx);',
  },
  {
    find: 'if(GodotAudio.audioPositionWorkletNodes.length>0){this._positionWorklet=GodotAudio.audioPositionWorkletNodes.pop()}else{this._positionWorklet=new AudioWorkletNode(GodotAudio.ctx,"godot-position-reporting-processor")}',
    replace: 'while(this._positionWorklet==null&&GodotAudio.audioPositionWorkletNodes.length>0){const pooled=GodotAudio.audioPositionWorkletNodes.pop();if(pooled.context===GodotAudio.ctx){this._positionWorklet=pooled}}if(this._positionWorklet==null){this._positionWorklet=GodotAudio.aitPositionWorkletNode()}',
  },
  {
    find: 'create:function(channels){const path=GodotConfig.locate_file("godot.audio.worklet.js");',
    insertAfter: 'GodotAudioWorklet._aitChannels=channels;',
  },
  {
    find: 'start_no_threads:function(p_out_buf,p_out_size,out_callback,p_in_buf,p_in_size,in_callback){',
    insertAfter: 'GodotAudioWorklet._aitStart=[p_out_buf,p_out_size,out_callback,p_in_buf,p_in_size,in_callback];',
  },
  {
    find: 'GodotAudioScript={script:null,create:function(buffer_length,channel_count){',
    insertAfter: 'GodotAudioScript._aitCreate=[buffer_length,channel_count];',
  },
  {
    find: 'start:function(p_in_buf,p_in_size,p_out_buf,p_out_size,onprocess){',
    insertAfter: 'GodotAudioScript._aitStart=[p_in_buf,p_in_size,p_out_buf,p_out_size,onprocess];',
  },
  { find: '.connect(GodotAudio.ctx.destination)', replace: '.connect(GodotAudio.aitOutput())', count: 4 },
];

export function addAudioHooks(code) {
  if (code.includes('GodotAudio.aitRecreate=')) return { code, changed: false };
  for (const edit of AUDIO_EDITS) {
    const count = code.split(edit.find).length - 1;
    if (count !== (edit.count ?? 1)) {
      throw new Error(
        `엔진 소리 코드가 예상과 다릅니다(${count}번 찾음): ${edit.find.slice(0, 70)}… Godot 버전이 바뀌었다면 engine-patch.mjs를 갱신하세요.`,
      );
    }
    const replacement = edit.replace ?? edit.find + edit.insertAfter;
    code = code.split(edit.find).join(replacement);
  }
  return { code, changed: true };
}

// index.js에 적용할 패치 목록. 각 패치는 code를 받아 { code, changed }를 돌려준다.
export const ENGINE_PATCHES = [
  { name: 'JavaScriptBridge 실행 끄기', apply: disableJsBridgeExec },
  { name: '소리 훅(페이더·위치 워크릿·컨텍스트 재생성)', apply: addAudioHooks },
];

export function patchEngineCode(code, patches = ENGINE_PATCHES) {
  const applied = [];
  for (const patch of patches) {
    const result = patch.apply(code);
    code = result.code;
    if (result.changed) applied.push(patch.name);
  }
  // 문법만 검사한다(실행하지 않는다). 패치가 함수 경계를 잘못 잡으면 여기서 멈춘다.
  new vm.Script(code, { filename: 'index.js' });
  return { code, applied };
}

// build/ait-app-config.json(write-ait-config.mjs)을 index.html에 실행되지 않는 JSON으로 넣는다.
// 같은 id의 태그가 있으면 바꾼다. 설정 파일이 없으면 아무것도 하지 않는다.
export const APP_CONFIG_ID = 'ait-app-config';

export function injectAppConfig(html, config) {
  const json = JSON.stringify(config).replaceAll('<', '\\u003c');
  const tag = `<script type="application/json" id="${APP_CONFIG_ID}">${json}</script>`;
  const existing = new RegExp(`<script type="application/json" id="${APP_CONFIG_ID}">[\\s\\S]*?</script>`);
  if (existing.test(html)) return html.replace(existing, () => tag);
  if (!html.includes('</head>')) throw new Error('index.html에 </head>가 없어 앱 설정을 넣지 못했습니다.');
  return html.replace('</head>', () => `${tag}\n</head>`);
}

// index.html에 이미 들어 있는 앱 설정을 읽는다. 없거나 깨졌으면 null
export function readAppConfig(html) {
  const match = html.match(new RegExp(`<script type="application/json" id="${APP_CONFIG_ID}">([\\s\\S]*?)</script>`));
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

export function patchExportDir(exportDir, patches = ENGINE_PATCHES) {
  const htmlPath = path.join(exportDir, 'index.html');
  const jsPath = path.join(exportDir, 'index.js');
  if (!fs.existsSync(jsPath)) {
    throw new Error(`엔진 JS가 없습니다: ${jsPath}${fs.existsSync(htmlPath) ? '' : ' (export가 먼저 끝나야 합니다)'}`);
  }
  const before = fs.readFileSync(jsPath, 'utf8');
  const { code, applied } = patchEngineCode(before, patches);
  if (code !== before) fs.writeFileSync(jsPath, code);
  return { jsPath, applied };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const gameDir = path.resolve(process.env.GODOT_PROJECT_DIR ?? process.cwd());
  const exportDir = path.resolve(process.argv[2] ?? process.env.GODOT_EXPORT_DIR ?? path.join(gameDir, 'build/godot-web'));
  try {
    const { jsPath, applied } = patchExportDir(exportDir);
    const configPath = path.join(gameDir, 'build/ait-app-config.json');
    const htmlPath = path.join(exportDir, 'index.html');
    if (fs.existsSync(configPath) && fs.existsSync(htmlPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      fs.writeFileSync(htmlPath, injectAppConfig(fs.readFileSync(htmlPath, 'utf8'), config));
      applied.push('앱 설정(ait-app-config)');
    }
    const shown = path.relative(gameDir, jsPath) || jsPath;
    console.log(
      applied.length > 0
        ? `[AIT engine] ${shown}: ${applied.join(', ')}`
        : `[AIT engine] ${shown}: 이미 패치됨`,
    );
  } catch (error) {
    console.error(`[AIT engine] ${error.message}`);
    process.exit(1);
  }
}
