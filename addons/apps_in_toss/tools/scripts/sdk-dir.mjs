import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export function readJson(filePath, label = 'JSON file') {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${filePath} (${String(error)})`);
  }
}

export function resolvePlatformLock({ root, projectDir, lockOverride } = {}) {
  const preferredDir = projectDir ?? root;
  return path.resolve(
    lockOverride ??
      process.env.AIT_PLATFORM_LOCK ??
      (fs.existsSync(path.join(preferredDir, '.ait/platform.lock.json'))
        ? path.join(preferredDir, '.ait/platform.lock.json')
        : path.join(root, '.ait/platform.lock.json')),
  );
}

/**
 * Resolve the Apps in Toss Godot SDK directory.
 * Priority: AIT_ADDON_DIR (내장 모드 — 이 CLI가 SDK 애드온 안에서 실행 중)
 *           -> GODOT_SDK_DIR env -> sibling checkout (../apps-in-toss-godot-sdk)
 *           -> clone at the lock's pinned commit into a local cache.
 */
export function resolveSdkDir(root, { projectDir, lockPath: lockPathOverride } = {}) {
  const resolvedLockPath = resolvePlatformLock({ root, projectDir, lockOverride: lockPathOverride });
  const lock = readJson(resolvedLockPath, 'Platform lock');
  if (!lock) throw new Error('Platform lock is required to resolve the AIT Godot SDK.');

  // 내장 모드: 이 CLI가 SDK 애드온(addons/apps_in_toss) 안에 들어 있으므로
  // addonDir 자체가 SDK다. sibling/clone 해석이 필요 없다.
  if (process.env.AIT_ADDON_DIR) {
    return { sdkDir: path.resolve(process.env.AIT_ADDON_DIR), origin: 'addon', lock, lockPath: resolvedLockPath };
  }

  const explicit = process.env.GODOT_SDK_DIR;
  if (explicit) {
    return { sdkDir: path.resolve(explicit), origin: 'env', lock, lockPath: resolvedLockPath };
  }

  const sibling = path.resolve(root, '..', 'apps-in-toss-godot-sdk');
  if (fs.existsSync(path.join(sibling, 'addons/apps_in_toss/plugin.cfg'))) {
    return { sdkDir: sibling, origin: 'sibling', lock, lockPath: resolvedLockPath };
  }

  const baseCommit = lock.aitGodotSdk?.baseCommit;
  const repository = lock.aitGodotSdk?.repository;
  if (!baseCommit || !repository) {
    throw new Error(
      'Platform lock does not pin an SDK commit. Set GODOT_SDK_DIR to an apps-in-toss-godot-sdk checkout.',
    );
  }

  const cacheDir = path.join(root, 'node_modules/.cache/ait-godot-sdk');
  const cached = path.join(cacheDir, baseCommit);
  if (!fs.existsSync(path.join(cached, 'addons/apps_in_toss/plugin.cfg'))) {
    fs.mkdirSync(cacheDir, { recursive: true });
    const cloneTarget = path.join(cacheDir, `${baseCommit}.tmp`);
    fs.rmSync(cloneTarget, { recursive: true, force: true });
    const clone = spawnSync('git', ['clone', '--quiet', repository, cloneTarget], { encoding: 'utf8' });
    if (clone.error || clone.status !== 0) {
      fs.rmSync(cloneTarget, { recursive: true, force: true });
      throw new Error(
        `Could not clone the AIT Godot SDK (${repository}).\n` +
          'Set GODOT_SDK_DIR to an existing checkout to build without network access.',
      );
    }
    const checkout = spawnSync('git', ['checkout', '--quiet', baseCommit], { cwd: cloneTarget, encoding: 'utf8' });
    if (checkout.error || checkout.status !== 0) {
      fs.rmSync(cloneTarget, { recursive: true, force: true });
      throw new Error(`AIT Godot SDK commit not found on origin: ${baseCommit}`);
    }
    fs.renameSync(cloneTarget, cached);
    console.log(`[AIT] cloned AIT Godot SDK at ${baseCommit.slice(0, 7)} -> ${cached}`);
  }
  return { sdkDir: cached, origin: 'cache', lock, lockPath: resolvedLockPath };
}

export function sdkHeadCommit(sdkDir) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: sdkDir, encoding: 'utf8' });
  if (result.error || result.status !== 0) return null;
  return String(result.stdout ?? '').trim() || null;
}