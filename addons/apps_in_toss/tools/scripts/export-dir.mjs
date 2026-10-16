import fs from 'node:fs';
import path from 'node:path';

// 테스트 빌드(build --debug-console)에서만 넣는 실기기 원격 디버깅 번들.
export const DEBUG_CONSOLE_EXPORT_FILE = 'ait-debug-console.js';

// 개발 빌드(build:dev)나 테스트 빌드(build --debug-console)에서만 export 폴더에 넣는 파일.
// release 빌드의 .ait에 섞이면 안 된다.
export const DEV_ONLY_EXPORT_FILES = [
  'apps-in-toss-godot-bridge.mock.js',
  'ait-devtools-panel.js',
  DEBUG_CONSOLE_EXPORT_FILE,
];

// export 폴더를 통째로 지워도 되는지 판단한다.
// SDK 기본 경로면 true, 프로젝트 안의 export 결과물 폴더(비어 있거나
// index.html 또는 *.pck가 있고 project.godot이 없는 하위 폴더)면 true.
// 프로젝트 바깥·projectDir 자신·소스 폴더는 통째로 지우면 안 되므로 false.
export function isClearableExportDir(dir, { projectDir, defaultExportDir }) {
  const resolvedDir = path.resolve(dir);
  if (!fs.existsSync(resolvedDir)) return false;
  if (resolvedDir === path.resolve(defaultExportDir)) return true;

  const resolvedProject = path.resolve(projectDir);
  if (resolvedDir === resolvedProject) return false;
  const rel = path.relative(resolvedProject, resolvedDir);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return false;

  if (fs.existsSync(path.join(resolvedDir, 'project.godot'))) return false;
  let entries;
  try {
    entries = fs.readdirSync(resolvedDir);
  } catch {
    return false;
  }
  if (entries.length === 0) return true;
  if (entries.includes('index.html')) return true;
  if (entries.some((entry) => entry.endsWith('.pck'))) return true;
  return false;
}

// 깨끗한 체크아웃(.godot 없음)인지 판단한다. import는 캐시가 있어도
// 항상 실행하므로(오래된 .godot 캐시가 깨진 스크립트를 가릴 수 있다)
// 이 값은 로그 문구(처음/갱신) 구분에만 쓴다.
export function needsGodotImport(projectDir) {
  return !fs.existsSync(path.join(path.resolve(projectDir), '.godot', 'global_script_class_cache.cfg'));
}

// Godot 출력에서 SCRIPT ERROR 줄을 찾는다. 색 코드와 줄 앞 공백을 허용하고
// 'error: WARNING' 같은 정보성 라인은 고르지 않는다.
export function findScriptErrors(text) {
  if (!text) return [];
  const stripped = String(text).replace(/\x1b\[[0-9;]*m/g, '');
  return stripped
    .split('\n')
    .filter((line) => line.includes('SCRIPT ERROR'))
    .map((line) => line.trim());
}

// 지우면 안 되는 폴더에 남은 개발 전용 파일만 골라 지운다.
// 지운 파일 이름 배열을 반환한다.
export function removeDevOnlyFiles(dir) {
  const removed = [];
  for (const name of DEV_ONLY_EXPORT_FILES) {
    const target = path.join(dir, name);
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
      removed.push(name);
    }
  }
  return removed;
}
