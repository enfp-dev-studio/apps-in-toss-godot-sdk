// 출시 번들 글자 검사 — export 폴더와 최종 .ait가 함께 쓴다.
//
// 앱인토스 검수는 "외부 코드를 실행하는 eval"을 반려한다. 2026-11-04 cat-room-godot 사례에서
// eval 호출을 없앤 뒤에도 함수 이름(_godot_js_eval), 변수(eval_ret), 오류 문구에 남은
// "eval" 글자 때문에 다시 반려됐다. 그래서 호출이 아니라 글자 자체를 찾는다(대소문자 무시).
// Function 생성자는 eval과 같은 동작이라 함께 막는다. 엔진의 entryFunction(처럼 이름 끝에
// 붙은 경우는 생성자가 아니므로 앞 글자가 식별자인 경우는 뺀다.
import path from 'node:path';

const EVAL_TEXT = /eval/gi;
const FUNCTION_CTOR = /(?<![\w$])Function\s*\(/g;

// .ait에 들어가서 사람이 읽을 수 있는 글자 파일. wasm·pck·이미지는 보지 않는다.
export const TEXT_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.html', '.htm', '.json', '.css', '.svg', '.txt', '.map', '.xml', '.webmanifest',
]);

export function isTextFile(name) {
  return TEXT_EXTENSIONS.has(path.extname(name).toLowerCase());
}

// 글자 하나에서 금지 글자를 찾는다. [{ file, kind, line, snippet }]
export function scanReleaseText(file, text) {
  const found = [];
  for (const [kind, pattern] of [['eval', EVAL_TEXT], ['Function(', FUNCTION_CTOR]]) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text))) {
      const line = text.slice(0, match.index).split('\n').length;
      const start = Math.max(0, match.index - 40);
      const snippet = text.slice(start, match.index + 40).replace(/\s+/g, ' ');
      found.push({ file, kind, line, snippet });
    }
  }
  return found;
}

export function formatFindings(findings, limit = 10) {
  const lines = findings
    .slice(0, limit)
    .map((item) => `  ${item.file}:${item.line} "${item.kind}" … ${item.snippet} …`);
  if (findings.length > limit) lines.push(`  … 외 ${findings.length - limit}곳`);
  return lines.join('\n');
}

// index.html이 실제로 불러오는 <script src>만 고른다. 셸 코드의 글자(예: 'bridge.mock')는 무시한다.
export function scriptSources(html) {
  const sources = [];
  const tag = /<script\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>/gi;
  let match;
  while ((match = tag.exec(html))) sources.push(match[2]);
  return sources;
}

export function referencesScript(html, fileName) {
  return scriptSources(html).some((src) => path.posix.basename(src.split(/[?#]/)[0]) === fileName);
}
