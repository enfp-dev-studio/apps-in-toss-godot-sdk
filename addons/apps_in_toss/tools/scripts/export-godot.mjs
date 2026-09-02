import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

if (!fs.existsSync(path.join(projectDir, 'project.godot'))) {
  throw new Error(`Godot project not found: ${projectDir}`);
}

if (exportDir === defaultExportDir && fs.existsSync(exportDir)) {
  fs.rmSync(exportDir, { recursive: true, force: true });
}
fs.mkdirSync(exportDir, { recursive: true });

console.log(`[Godot] project: ${projectDir}`);
console.log(`[Godot] preset: ${preset}`);
console.log(`[Godot] output: ${outputPath}`);

const result = spawnSync(
  godotBin,
  ['--headless', '--path', projectDir, '--export-release', preset, outputPath],
  { cwd: root, stdio: 'inherit' },
);

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
if (!fs.existsSync(outputPath)) {
  throw new Error(`Godot exited without creating the Web export: ${outputPath}`);
}
