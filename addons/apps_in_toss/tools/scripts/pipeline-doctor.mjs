// ait-godot doctor — 게임 리포 호환성 검사 (Unity Configuration 검증 대응).
// 플랫폼/SDK 원본의 검사 로직을 그대로 사용해 게임 환경으로 실행한다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const gameDir = path.resolve(process.env.GODOT_PROJECT_DIR ?? process.cwd());
const strict = process.argv.includes('--strict');

function resolveSdkDir() {
  if (process.env.AIT_ADDON_DIR) return path.resolve(process.env.AIT_ADDON_DIR);
  const explicit = process.env.GODOT_SDK_DIR;
  if (explicit) return path.resolve(explicit);
  const sibling = path.resolve(gameDir, '..', 'apps-in-toss-godot-sdk');
  if (fs.existsSync(path.join(sibling, 'addons/apps_in_toss/plugin.cfg'))) return sibling;
  const lock = JSON.parse(fs.readFileSync(path.join(gameDir, '.ait/platform.lock.json'), 'utf8'));
  const { baseCommit: commit, repository: repo } = lock.aitGodotSdk;
  if (!commit) throw new Error('lock에 SDK 커밋이 없습니다.');
  const cached = path.join(os.tmpdir(), 'ait-godot-sdk', commit);
  if (!fs.existsSync(path.join(cached, 'addons/apps_in_toss/plugin.cfg'))) {
    fs.mkdirSync(path.dirname(cached), { recursive: true });
    const tmp = `${cached}.tmp`;
    spawnSync('git', ['clone', '--quiet', repo, tmp], { stdio: 'inherit' });
    fs.renameSync(tmp, cached);
  }
  return cached;
}

const platformScripts = path.join(path.dirname(here), 'scripts');
const doctor = path.join(platformScripts, 'ait-doctor.mjs');
if (!fs.existsSync(doctor)) {
  console.error('[ait-godot doctor] 검사 스크립트가 패키지에 없습니다. 재설치하세요.');
  process.exit(1);
}

const result = spawnSync(process.execPath, [doctor, ...(strict ? ['--strict'] : [])], {
  stdio: 'inherit',
  env: { ...process.env, GODOT_PROJECT_DIR: gameDir, GODOT_SDK_DIR: resolveSdkDir() },
});
process.exit(result.status ?? 1);