// ait-godot 패키지의 파이프라인 헬퍼 — SDK 리포 체크아웃을 해석해 공통 실행 환경을 제공.
// Unity SDK가 에디터 안에서 처리하던 것(설치 검증, 빌드, 패키징)을 CLI 명령으로 수행한다.
// SDK 우선순위: GODOT_SDK_DIR → 형제 리포 ../apps-in-toss-godot-sdk → lock 커밋 자동 클론.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GAME_DIR = path.resolve(process.env.GODOT_PROJECT_DIR ?? process.cwd());

export function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid JSON: ${filePath} (${String(error)})`);
  }
}

export function readPlatformLock(gameDir) {
  return JSON.parse(fs.readFileSync(path.join(gameDir, '.ait/platform.lock.json'), 'utf8'));
}

/** SDK checkout 확보: AIT_ADDON_DIR(내장) → GODOT_SDK_DIR → 형제 리포 → lock 커밋을 임시 폴더에 클론. */
export function resolveSdkDir(gameDir, lock) {
  if (process.env.AIT_ADDON_DIR) return path.resolve(process.env.AIT_ADDON_DIR);

  const explicit = process.env.GODOT_SDK_DIR;
  if (explicit && fs.existsSync(explicit)) return path.resolve(explicit);

  const sibling = path.resolve(gameDir, '..', 'apps-in-toss-godot-sdk');
  if (fs.existsSync(path.join(sibling, 'addons/apps_in_toss/plugin.cfg'))) return sibling;

  const commit = lock.aitGodotSdk.baseCommit;
  const repository = lock.aitGodotSdk.repository;
  if (!commit || !repository) {
    throw new Error('lock에 aitGodotSdk.baseCommit/repository가 없습니다.');
  }
  const cacheRoot = path.join(os.tmpdir(), 'ait-godot-sdk-cache');
  const cached = path.join(cacheDir, commit);
  if (!fs.existsSync(path.join(cached, 'addons/apps_in_toss/plugin.cfg'))) {
    console.log(`[ait-godot] 클론 중: SDK ${commit.slice(0, 7)} (${originShort(repository)})`);
    fs.mkdirSync(cacheDir, { recursive: true });
    const tmp = fs.mkdtempSync(path.join(cacheDir, `${commit}.`));
    fs.rmSync(tmp, { force: true, recursive: true });
    const cloned = spawnSync('git', ['clone', '--quiet', repository, tmp], { stdio: 'inherit' });
    if (cloned.status !== 0) {
      throw new Error(`SDK clone failed: ${repository}`);
    }
    fs.renameSync(tmp, cached);
  }
  return cached;
}

function originShort(repo) {
  try {
    const url = new URL(repo);
    return url.host === 'github.com' ? url.pathname.slice(1) : url.host;
  } catch {
    return repo;
  }
}

/** SDK 리포 안의 bridge 도구를 cwd=bridgeDir로 실행한다. */
export function runBridgeTool(sdkDir, argv, { env = {}, inherit = true } = {}) {
  const result = spawnSync(process.execPath, argv, {
    cwd: path.join(sdkDir, 'bridge'),
    stdio: 'inherit',
    env: { ...process.env, GODOT_PROJECT_DIR: process.env.GODOT_PROJECT_DIR ?? '', ...env },
  });
  if (result.status !== 0) throw new Error(`bridge tool failed: ${argv.join(' ')}`);
}

export { PACKAGE_ROOT };