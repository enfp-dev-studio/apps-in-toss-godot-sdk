// ait-godot optimize [--fix] — 빌드 전 최적화 검사(Unity SDK 3.9.0 AITBuildOptimizationScanner 대응).
// Unity는 웹 압축을 쓰지 않는 텍스처·오디오를 찾아 고친다. Godot에서는 .import 설정으로 같은 것을 본다.
//   텍스처: 무손실(compress/mode=0)·VRAM 비압축(3)이고 원본이 256KB를 넘음 → 무손실은 손실(1, 품질 0.85), VRAM 비압축은 VRAM 압축(2)
//   오디오: WAV 압축 끔(compress/mode=0)이고 원본이 256KB를 넘음 → QOA(2)
// --fix를 줄 때만 .import를 고친다(그림·소리 품질이 바뀌므로 목록을 먼저 보세요). 다음 가져오기·빌드에 반영된다.
import fs from 'node:fs';
import path from 'node:path';

const gameDir = path.resolve(process.env.GODOT_PROJECT_DIR ?? process.cwd());
const fix = process.argv.includes('--fix');
const LIMIT = 256 * 1024;
const SKIP = new Set(['.godot', '.git', 'node_modules', 'build', 'dist']);

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.import')) out.push(full);
  }
  return out;
}

function param(text, key) {
  return text.match(new RegExp(`^${key.replace('/', '\\/')}=(.+)$`, 'm'))?.[1];
}

function setParam(text, key, value) {
  const line = new RegExp(`^${key.replace('/', '\\/')}=.*$`, 'm');
  return line.test(text) ? text.replace(line, `${key}=${value}`) : text.replace(/^\[params\]$/m, `[params]\n\n${key}=${value}`);
}

const issues = [];
for (const importPath of walk(gameDir, [])) {
  const source = importPath.slice(0, -'.import'.length);
  if (!fs.existsSync(source)) continue;
  const size = fs.statSync(source).size;
  if (size <= LIMIT) continue;
  const text = fs.readFileSync(importPath, 'utf8');
  const importer = param(text, 'importer')?.replaceAll('"', '');
  const mode = param(text, 'compress/mode');
  if (importer === 'texture' && (mode === '0' || mode === '3')) {
    issues.push({ kind: '텍스처', importPath, size, from: mode === '0' ? '무손실' : 'VRAM 비압축', to: mode === '0' ? '손실(0.85)' : 'VRAM 압축',
      apply: (t) => (mode === '0' ? setParam(setParam(t, 'compress/mode', '1'), 'compress/lossy_quality', '0.85') : setParam(t, 'compress/mode', '2')) });
  } else if (importer === 'wav' && mode === '0') {
    issues.push({ kind: '오디오', importPath, size, from: 'WAV 압축 끔', to: 'QOA', apply: (t) => setParam(t, 'compress/mode', '2') });
  }
}

const kb = (n) => `${Math.round(n / 1024)}KB`;
if (issues.length === 0) {
  console.log('[ait-godot optimize] 고칠 것이 없습니다(256KB를 넘는 무손실 텍스처·압축 끈 WAV 없음).');
  process.exit(0);
}
for (const issue of issues) {
  console.log(`  ${issue.kind} ${path.relative(gameDir, issue.importPath.slice(0, -7))} ${kb(issue.size)}: ${issue.from} → ${issue.to}`);
}
console.log(`[ait-godot optimize] ${issues.length}개 (텍스처 ${issues.filter((i) => i.kind === '텍스처').length}, 오디오 ${issues.filter((i) => i.kind === '오디오').length}).`);
if (!fix) {
  console.log('[ait-godot optimize] 고치려면 --fix. 그림·소리 품질이 바뀌니 위 목록을 먼저 확인하세요.');
  process.exit(0);
}
for (const issue of issues) fs.writeFileSync(issue.importPath, issue.apply(fs.readFileSync(issue.importPath, 'utf8')));
console.log('[ait-godot optimize] .import를 고쳤습니다. 에디터를 열거나 다음 빌드에서 다시 가져옵니다.');
