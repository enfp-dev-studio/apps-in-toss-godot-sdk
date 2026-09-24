// ait-godot build:dev의 mock 브리지 빌드 단계.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const gameDir = path.resolve(process.env.GODOT_PROJECT_DIR ?? process.cwd());

function resolveSdkDir() {
  if (process.env.AIT_ADDON_DIR) return path.resolve(process.env.AIT_ADDON_DIR);
  if (process.env.GODOT_SDK_DIR) return path.resolve(process.env.GODOT_SDK_DIR);
  const sibling = path.resolve(path.dirname(gameDir), 'apps-in-toss-godot-sdk');
  if (fs.existsSync(path.join(sibling, 'addons/apps_in_toss/plugin.cfg'))) return sibling;
  const lock = JSON.parse(fs.readFileSync(path.join(gameDir, '.ait/platform.lock.json'), 'utf8'));
  const { baseCommit: commit, repository: repo } = lock.aitGodotSdk;
  const cached = path.join(os.tmpdir(), 'ait-godot-sdk', commit);
  if (!fs.existsSync(path.join(cached, 'addons/apps_in_toss/plugin.cfg'))) {
    fs.mkdirSync(path.dirname(cached), { recursive: true });
    const tmp = `${cached}.tmp`;
    fs.rmSync(tmp, { recursive: true, force: true });
    const clone = spawnSync('git', ['clone', '--quiet', repo, tmp], { stdio: 'inherit' });
    if ((clone.status ?? 1) !== 0) {
      fs.rmSync(tmp, { recursive: true, force: true });
      throw new Error(`SDK clone failed: ${repo}`);
    }
    // lock이 고정한 커밋으로 체크아웃한다. 기본 브랜치 HEAD를 쓰면
    // doctor의 lock 검사가 실패한다.
    const checkout = spawnSync('git', ['checkout', '--quiet', commit], { cwd: tmp, stdio: 'inherit' });
    if ((checkout.status ?? 1) !== 0) {
      fs.rmSync(tmp, { recursive: true, force: true });
      throw new Error(`SDK commit not found on origin: ${commit}`);
    }
    fs.renameSync(tmp, cached);
  }
  return cached;
}

// 내장 모드: bridge는 addonDir/tools/bridge에 있다. 그 외에는 SDK 리포의 bridge.
const bridgeDir = process.env.AIT_BRIDGE_DIR
  ? path.resolve(process.env.AIT_BRIDGE_DIR)
  : path.join(resolveSdkDir(), 'bridge');
const result = spawnSync('npm', ['run', 'build'], {
  cwd: bridgeDir,
  stdio: 'inherit',
  env: { ...process.env, AIT_BRIDGE_MOCK: '1' },
});
process.exit(result.status ?? 1);