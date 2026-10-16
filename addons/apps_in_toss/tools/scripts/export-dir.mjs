import fs from 'node:fs';
import path from 'node:path';

// 개발 빌드(build:dev)에서만 export 폴더에 넣는 파일.
// release 빌드의 .ait에 섞이면 안 된다.
export const DEV_ONLY_EXPORT_FILES = ['apps-in-toss-godot-bridge.mock.js', 'ait-devtools-panel.js'];

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
