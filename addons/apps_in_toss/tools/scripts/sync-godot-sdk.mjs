import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveSdkDir } from './sdk-dir.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const projectDir = path.resolve(process.env.GODOT_PROJECT_DIR ?? path.join(root, 'godot'));
const { sdkDir } = resolveSdkDir(root, { projectDir });
// 내장 모드: sdkDir = addonDir 자체(addons/apps_in_toss). 그 외에는 SDK 리포의
// addons/apps_in_toss 경로를 쓴다.
const sourceCandidates = process.env.AIT_ADDON_DIR
  ? [sdkDir]
  : [
      path.join(sdkDir, 'addons/apps_in_toss'),
      path.join(sdkDir, 'addon/apps_in_toss'),
    ];
const source = sourceCandidates.find((candidate) => fs.existsSync(candidate));
const target = path.join(projectDir, 'addons/apps_in_toss');
const checkOnly = process.argv.includes('--check');

if (!source) {
  throw new Error(
    `Apps in Toss Godot addon not found under ${sdkDir}. ` +
      'Expected addons/apps_in_toss or addon/apps_in_toss.',
  );
}
if (!fs.existsSync(path.join(projectDir, 'project.godot'))) {
  throw new Error(`Godot project not found: ${projectDir}`);
}

function listFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(absolute).map((file) => path.join(entry.name, file)));
    } else if (entry.isFile()) {
      files.push(entry.name);
    }
  }
  return files;
}

function relativeFiles(directory) {
  return listFiles(directory).sort();
}

function isSameTree(left, right) {
  if (!fs.existsSync(right)) return false;
  const leftFiles = relativeFiles(left);
  const rightFiles = relativeFiles(right);
  if (leftFiles.length !== rightFiles.length || leftFiles.some((file, index) => file !== rightFiles[index])) {
    return false;
  }
  return leftFiles.every((file) => {
    const leftData = fs.readFileSync(path.join(left, file));
    const rightData = fs.readFileSync(path.join(right, file));
    return leftData.equals(rightData);
  });
}

if (checkOnly) {
  const same = isSameTree(source, target);
  console.log(`${same ? 'OK' : 'DRIFT'} Godot SDK addon: ${target}`);
  if (!same) {
    console.error('Run npm run godot:sdk:sync to refresh the demo project copy.');
    process.exitCode = 2;
  }
} else if (path.resolve(source) === path.resolve(target)) {
  // 내장 모드: 이미 게임 리포의 addons/apps_in_toss가 SDK 자체다. no-op.
  console.log(`[AIT] addon is self (embedded mode); sync skipped: ${target}`);
} else {
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
  console.log(`Synced Godot SDK addon: ${source} -> ${target}`);
}
