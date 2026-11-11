// ait-godot update [--check] — SDK 업데이트 확인과 적용(Unity SDK 3.9.0 AITAutoUpdater·Check for Updates 대응).
// 최신은 SDK 저장소 main의 커밋과 plugin.cfg 판이다. --check면 알리기만 하고, 아니면 최신 SDK를 임시 폴더에 받아
// 설치 가이드의 SDK 업데이트 순서(addon:install --force → platform.lock 복사 → 브리지 npm ci → doctor --strict)를 돈다.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SDK_REPOSITORY, compareVersions } from './sdk-policy.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const gameDir = path.resolve(process.env.GODOT_PROJECT_DIR ?? process.cwd());
const checkOnly = process.argv.includes('--check');

function fail(message) {
  console.error(`[ait-godot update] ${message}`);
  process.exit(1);
}
function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) fail(`git ${args.join(' ')} 실패: ${(result.stderr || '').trim()}`);
  return result.stdout.trim();
}

const installed = fs.readFileSync(path.join(here, '../../plugin.cfg'), 'utf8').match(/version="([^"]+)"/)?.[1];
const lockPath = path.join(gameDir, '.ait/platform.lock.json');
const lock = fs.existsSync(lockPath) ? JSON.parse(fs.readFileSync(lockPath, 'utf8')) : null;
const installedCommit = lock?.aitGodotSdk?.baseCommit ?? '';

const latestCommit = git(['ls-remote', `${SDK_REPOSITORY}.git`, 'refs/heads/main']).split(/\s+/)[0];
if (!latestCommit) fail('SDK 저장소의 main을 찾지 못했습니다.');
const cacheDir = path.join(os.tmpdir(), 'ait-godot-sdk', latestCommit);
if (!fs.existsSync(path.join(cacheDir, 'addons/apps_in_toss/plugin.cfg'))) {
  fs.mkdirSync(path.dirname(cacheDir), { recursive: true });
  const tmp = `${cacheDir}.tmp`;
  fs.rmSync(tmp, { recursive: true, force: true });
  git(['clone', '--quiet', '--depth', '1', `${SDK_REPOSITORY}.git`, tmp], gameDir);
  fs.renameSync(tmp, cacheDir);
}
const latest = fs.readFileSync(path.join(cacheDir, 'addons/apps_in_toss/plugin.cfg'), 'utf8').match(/version="([^"]+)"/)?.[1];
const newer = compareVersions(installed, latest) < 0 || (installedCommit !== '' && !latestCommit.startsWith(installedCommit) && compareVersions(installed, latest) === 0);
console.log(`[ait-godot update] 설치: ${installed}${installedCommit ? ` (${installedCommit.slice(0, 7)})` : ''} · 최신: ${latest} (${latestCommit.slice(0, 7)})`);
if (!newer) {
  console.log('[ait-godot update] 최신 판입니다.');
  process.exit(0);
}
if (checkOnly) {
  console.log('[ait-godot update] 새 판이 있습니다. 올리려면: node addons/apps_in_toss/tools/ait-godot.mjs update');
  process.exit(0);
}

const sdkCli = path.join(cacheDir, 'addons/apps_in_toss/tools/ait-godot.mjs');
const env = { ...process.env, GODOT_PROJECT_DIR: gameDir, AIT_ADDON_DIR: '', AIT_TOOLS_DIR: '', AIT_BRIDGE_DIR: '' };
const step = (label, command, args) => {
  console.log(`\n[ait-godot update] ▶ ${label}`);
  const result = spawnSync(command, args, { cwd: gameDir, stdio: 'inherit', env });
  if (result.status !== 0) fail(`${label} 실패 (exit ${result.status})`);
};
step('애드온 교체', process.execPath, [sdkCli, 'addon:install', '--force']);
fs.copyFileSync(path.join(cacheDir, 'addons/apps_in_toss/tools/templates/platform.lock.json'), lockPath);
console.log('[ait-godot update] .ait/platform.lock.json을 새 판으로 바꿨습니다.');
step('브리지 의존성 설치', 'npm', ['--prefix', path.join(gameDir, 'addons/apps_in_toss/tools/bridge'), 'ci']);
step('호환성 검사', process.execPath, [path.join(gameDir, 'addons/apps_in_toss/tools/ait-godot.mjs'), 'doctor', '--strict']);
console.log(`\n[ait-godot update] ✅ ${latest} (${latestCommit.slice(0, 7)})로 올렸습니다. 바뀐 점은 SDK docs/sdk-development.md를 보세요.`);
