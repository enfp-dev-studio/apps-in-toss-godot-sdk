import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findScriptErrors, isClearableExportDir, needsGodotImport, removeDevOnlyFiles } from './export-dir.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const defaultProjectDir = path.join(root, 'godot');
const defaultExportDir = path.join(root, 'build/godot-web');

const projectDir = path.resolve(process.env.GODOT_PROJECT_DIR ?? defaultProjectDir);
// Godot Web export — 결과물은 항상 게임 리포의 build/godot-web에 둔다.
const exportDir = path.resolve(process.env.GODOT_EXPORT_DIR ?? path.join(projectDir, 'build/godot-web'));
const preset = process.env.GODOT_EXPORT_PRESET ?? 'Apps in Toss Web';
const godotBin = process.env.GODOT_BIN ?? 'godot';
const outputPath = path.join(exportDir, 'index.html');
const toolsDir = process.env.AIT_TOOLS_DIR ? path.resolve(process.env.AIT_TOOLS_DIR) : root;
const verifyScript = path.join(toolsDir, 'scripts', 'verify-gdscript.gd');

if (!fs.existsSync(path.join(projectDir, 'project.godot'))) {
  throw new Error(`Godot project not found: ${projectDir}`);
}

// import는 캐시가 있어도 항상 실행한다. 오래된 .godot 캐시가 있으면
// 새 class_name이 등록되지 않아 컴파일 게이트를 통과하고도 export에서
// SCRIPT ERROR가 나는데, 캐시가 있을 때 import를 건너뛰면 이를 못 잡는다.
// 증분 import라 빠르다. needsGodotImport는 로그 문구 구분에만 쓴다.
{
  const firstImport = needsGodotImport(projectDir);
  console.log(
    firstImport
      ? '[Godot] project not imported yet; running headless import'
      : '[Godot] refreshing project import (headless)',
  );
  const importStart = Date.now();
  const headlessImport = spawnSync(godotBin, ['--headless', '--path', projectDir, '--import'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  const importOutput = `${headlessImport.stdout ?? ''}\n${headlessImport.stderr ?? ''}`;
  process.stdout.write(importOutput);
  console.log(`[Godot] headless import done in ${Date.now() - importStart}ms`);
  if (headlessImport.error) {
    throw new Error(`Godot headless import failed: ${headlessImport.error.message}`);
  }
  if (headlessImport.status !== 0) {
    throw new Error(
      `Godot headless import failed (exit ${headlessImport.status ?? '?'}). Run '${godotBin} --headless --path ${projectDir} --import' manually and fix the errors above, then rebuild.`,
    );
  }
  const importErrors = findScriptErrors(importOutput);
  if (importErrors.length > 0) {
    throw new Error(
      `Godot project import contains ${importErrors.length} script error(s), failing the build:\n` +
        importErrors.slice(0, 10).join('\n'),
    );
  }
}

// 0. 컴파일 게이트: export는 깨진 스크립트가 있어도 exit 0을 내는 경우가 있어
// 먼저 설치된 애드온 전체를 프로젝트 컨텍스트에서 컴파일 검사한다.
if (fs.existsSync(verifyScript)) {
  console.log('[Godot] GDScript compile check (addon-wide, project context)');
  const verify = spawnSync(
    godotBin,
    ['--headless', '--path', projectDir, '--script', verifyScript],
    { cwd: root, stdio: 'inherit' },
  );
  if (verify.error) throw verify.error;
  if (verify.status !== 0) {
    throw new Error(`GDScript compile check failed (exit ${verify.status ?? '?'}). Fix the scripts above, then rebuild.`);
  }
} else {
  console.log(`[Godot] WARN verify script not found, skipping compile gate: ${verifyScript}`);
}

if (fs.existsSync(exportDir)) {
  if (isClearableExportDir(exportDir, { projectDir, defaultExportDir })) {
    fs.rmSync(exportDir, { recursive: true, force: true });
  } else {
    // 프로젝트 바깥이거나 export 폴더로 보이지 않으면 통째로 지우지 않고 개발 전용 파일만 지운다.
    const removed = removeDevOnlyFiles(exportDir);
    console.log(
      `[Godot] WARN export dir was not cleared (outside the project or not an export folder): ${exportDir}; removed dev-only files: ${removed.join(', ') || '(none)'}`,
    );
  }
}
fs.mkdirSync(exportDir, { recursive: true });

console.log(`[Godot] project: ${projectDir}`);
console.log(`[Godot] preset: ${preset}`);
console.log(`[Godot] output: ${outputPath}`);

const result = spawnSync(
  godotBin,
  ['--headless', '--path', projectDir, '--export-release', preset, outputPath],
  // 출력을 검사해야 하므로 파이프로 받는다. Godot은 스크립트 컴파일 에러가 있어도
  // exit 0으로 export를 계속하는 경우가 있어 상태만으로는 깨진 빌드를 못 잡는다.
  { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' },
);

if (result.error) throw result.error;
const combinedOutput = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
process.stdout.write(combinedOutput);
if (result.status !== 0) process.exit(result.status ?? 1);
// GDScript 컴파일 에러(SCRIPT ERROR:)는 export를 깨뜨리지 않고 exit 0으로
// 묻히는 경우가 있다. 깨진 스크립트가 실리면 런타임에 터지므로 여기서 실패시킨다.
// 색 코드·줄 앞 공백이 있어도 잡고, 일반 WARNING이나 'error: WARNING' 같은
// 정보성 라인은 대상이 아니다.
const scriptErrors = findScriptErrors(combinedOutput);
if (scriptErrors.length > 0) {
  throw new Error(
    `Godot Web export contains ${scriptErrors.length} script compile error(s), failing the build:\n` +
      scriptErrors.slice(0, 10).join('\n'),
  );
}
if (!fs.existsSync(outputPath)) {
  throw new Error(`Godot exited without creating the Web export: ${outputPath}`);
}
