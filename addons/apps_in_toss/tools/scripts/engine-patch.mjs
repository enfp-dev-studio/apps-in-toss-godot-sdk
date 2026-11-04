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

// index.js에 적용할 패치 목록. 각 패치는 code를 받아 { code, changed }를 돌려준다.
export const ENGINE_PATCHES = [
  { name: 'JavaScriptBridge 실행 끄기', apply: disableJsBridgeExec },
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
