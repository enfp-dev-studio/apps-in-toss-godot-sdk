// ait-godot addon:install / sync — SDK 애드온을 게임 프로젝트에 설치·갱신.
// 내장 모드(AIT_ADDON_DIR): 이 CLI가 SDK 애드온 안에 있으므로 자기 자신을
// 게임 리포의 addons/apps_in_toss로 복사한다. 별도 SDK checkout이 필요 없다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const gameDir = path.resolve(process.env.GODOT_PROJECT_DIR ?? process.cwd());
const force = process.env.GODOT_ADDON_FORCE === '1' || process.argv.includes('--force');

function fail(message) { console.error(`[ait-godot] ${message}`); process.exit(1); }

function resolveSdkDir() {
  if (process.env.AIT_ADDON_DIR) return path.resolve(process.env.AIT_ADDON_DIR);
  const explicit = process.env.GODOT_SDK_DIR;
  if (explicit) return path.resolve(explicit);
  const sibling = path.resolve(gameDir, '..', 'apps-in-toss-godot-sdk');
  if (fs.existsSync(path.join(sibling, 'addons/apps_in_toss/plugin.cfg'))) return sibling;
  const lockPath = path.join(gameDir, '.ait/platform.lock.json');
  if (!fs.existsSync(lockPath)) {
    fail('Missing .ait/platform.lock.json. Run "ait-godot init" first.');
  }
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  const commit = lock.aitGodotSdk?.baseCommit;
  const repo = lock.aitGodotSdk?.repository;
  if (!commit || !repo) fail('platform lock에 aitGodotSdk.commit/repository가 없습니다.');
  const cache = path.join(os.tmpdir(), 'ait-godot-sdk');
  const cached = path.join(cache, commit);
  if (!fs.existsSync(path.join(cached, 'addons/apps_in_toss/plugin.cfg'))) {
    fs.mkdirSync(cache, { recursive: true });
    const tmp = path.join(cache, `${commit}.tmp`);
    const clone = spawnSync('git', ['clone', '--quiet', repo, tmp], { stdio: 'inherit' });
    if (clone.status !== 0) fail(`SDK 클론 실패: ${repo}`);
    // lock이 고정한 커밋으로 체크아웃한다. 기본 브랜치 HEAD를 쓰면
    // doctor의 lock 검사가 실패한다.
    const checkout = spawnSync('git', ['checkout', '--quiet', commit], { cwd: tmp, stdio: 'inherit' });
    if (checkout.status !== 0) {
      fs.rmSync(tmp, { recursive: true, force: true });
      fail(`SDK 커밋을 찾을 수 없음: ${commit}`);
    }
    fs.renameSync(tmp, cached);
  }
  return cached;
}

const sdkDir = resolveSdkDir();
// 내장 모드: sdkDir = addonDir 자체(addons/apps_in_toss). 그 외에는 SDK 리포의
// addons/apps_in_toss 경로를 쓴다.
const source = process.env.AIT_ADDON_DIR
  ? sdkDir
  : path.join(sdkDir, 'addons/apps_in_toss');
const target = path.join(gameDir, 'addons/apps_in_toss');
if (!fs.existsSync(source)) fail(`SDK addon not found: ${source}`);

const pluginVersion = fs
  .readFileSync(path.join(source, 'plugin.cfg'), 'utf8')
  .match(/version="?([^"\n]+)"?/)?.[1];

// source와 target이 같은 폴더(내장 모드 자기 자신, 또는 게임 경로가 SDK를
// 가리키는 심링크)면 --force라도 자기 자신을 지우지 않는다. 지우고 복사하면
// 애드온이 통째로 사라진다. realpath로 비교해 심링크 별칭도 잡는다.
if (fs.existsSync(target) && fs.realpathSync(source) === fs.realpathSync(target)) {
  console.log(`[ait-godot] 애드온이 이미 자기 자신입니다 (내장 모드, SDK ${pluginVersion}). 복사 없이 둡니다.`);
  console.log('[ait-godot] Godot Editor → Project Settings → Plugins → "Apps in Toss Godot SDK" 활성화');
  process.exit(0);
}

// Godot 4.4+가 스크립트마다 만드는 .uid 파일 중 SDK가 배포하지 않는 것은 게임 쪽에서 생긴 값이다.
// 지우고 다시 복사하면 Godot이 새 uid를 만들어 게임 리포에 불필요한 변경이 생기므로 지켜 둔다.
function collectUids(dir, base = dir, out = new Map()) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      collectUids(full, base, out);
    } else if (entry.isFile() && entry.name.endsWith('.uid')) {
      out.set(path.relative(base, full), fs.readFileSync(full));
    }
  }
  return out;
}

let keptUids = new Map();
if (fs.existsSync(target)) {
  const installed = fs.readFileSync(path.join(target, 'plugin.cfg'), 'utf8').match(/version="?([^"\n]+)"?/)?.[1];
  if (installed === pluginVersion && !force) {
    console.log(`[ait-godot] 애드온이 이미 최신입니다 (${installed}). --force로 강제 재설치.`);
    process.exit(0);
  }
  if (!force) {
    fail(`애드온이 이미 있습니다(${installed}). 다른 버전(${pluginVersion})이 필요하면 --force로 재설치하세요.`);
  }
  keptUids = collectUids(target);
  fs.rmSync(target, { recursive: true, force: true });
}
fs.cpSync(source, target, { recursive: true });
let restored = 0;
for (const [rel, content] of keptUids) {
  const uidPath = path.join(target, rel);
  const scriptPath = uidPath.slice(0, -'.uid'.length);
  if (!fs.existsSync(uidPath) && fs.existsSync(scriptPath)) {
    fs.writeFileSync(uidPath, content);
    restored += 1;
  }
}
if (restored > 0) console.log(`[ait-godot] 게임 쪽 .uid ${restored}개를 그대로 두었습니다.`);
console.log(`[ait-godot] 설치 완료: ${target} (SDK ${pluginVersion})`);
console.log('[ait-godot] Godot Editor → Project Settings → Plugins → "Apps in Toss Godot SDK" 활성화');