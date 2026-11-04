import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { injectAppConfig, readAppConfig } from './engine-patch.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const projectDir = path.resolve(process.env.GODOT_PROJECT_DIR ?? path.join(root, 'godot'));
const lockPath = path.resolve(
  process.env.AIT_PLATFORM_LOCK ??
    (fs.existsSync(path.join(projectDir, '.ait/platform.lock.json'))
      ? path.join(projectDir, '.ait/platform.lock.json')
      : path.join(root, '.ait/platform.lock.json')),
);
const exportDir = path.resolve(
  process.argv[2] ?? process.env.GODOT_EXPORT_DIR ?? path.join(root, 'build/godot-web'),
);

if (!fs.existsSync(lockPath)) throw new Error(`Platform lock not found: ${lockPath}`);
if (!fs.existsSync(exportDir)) throw new Error(`Godot export directory not found: ${exportDir}`);

const platformLock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
// 게임 매니페스트: .ait/game.manifest.json(실제 게임) 또는 예시 매니페스트(공개 샘플)를 쓴다.
// 예시 매니페스트를 쓸 때는 placeholder gameId를 기록하지 않는다.
const manifestCandidates = [
  path.join(projectDir, '.ait/game.manifest.json'),
  path.join(root, '.ait/game.manifest.json'),
  path.join(root, '.ait/game.manifest.example.json'),
];
const gameManifestPath = manifestCandidates.find((candidate) => fs.existsSync(candidate));
const gameManifest = gameManifestPath ? JSON.parse(fs.readFileSync(gameManifestPath, 'utf8')) : null;
const isPlaceholder = gameManifest?.gameId === 'replace-with-private-game-id';
const lockSha256 = crypto.createHash('sha256').update(fs.readFileSync(lockPath)).digest('hex');

const manifest = {
  schemaVersion: 1,
  platformVersion: platformLock.platformVersion,
  channel: platformLock.channel,
  godot: platformLock.godot,
  aitGodotSdk: {
    version: platformLock.aitGodotSdk?.version,
    repository: platformLock.aitGodotSdk?.repository,
  },
  bridge: platformLock.bridge,
  webFramework: platformLock.webFramework,
  unitySdk: {
    repository: platformLock.unitySdk?.repository,
    commit: platformLock.unitySdk?.commit,
    packageVersion: platformLock.unitySdk?.packageVersion,
  },
  platformLockSha256: lockSha256,
};

if (gameManifest && !isPlaceholder) {
  manifest.game = {
    gameId: gameManifest.gameId,
    gameVersion: gameManifest.gameVersion,
    releaseChannel: gameManifest.releaseChannel,
  };
  if (gameManifest.displayName) manifest.game.displayName = gameManifest.displayName;
} else if (gameManifest) {
  manifest.game = { gameVersion: gameManifest.gameVersion, releaseChannel: gameManifest.releaseChannel, sample: true };
}

// 테스트 빌드(build --debug-console)임을 남긴다. doctor와 verify가 이 값을 본다.
if (process.env.AIT_DEBUG_CONSOLE === '1') manifest.debugConsole = true;

// 어떤 프리셋으로 내보냈는지 남긴다. verify-ait가 lock의 출시 프리셋과 비교한다.
manifest.exportPreset = process.env.GODOT_EXPORT_PRESET ?? platformLock.godot?.web?.exportPreset ?? 'Apps in Toss Web';

// 빌드 도장 — 토스 최근 목록이 예전 테스트 빌드를 다시 열 수 있어서, 화면에서 어떤 빌드인지 알아볼 수 있게
// 시간·커밋·라벨을 남긴다(AIT.build_info()). 라벨은 AIT_BUILD_LABEL(예: 테스트 번호)로 준다.
manifest.build = buildStamp(projectDir);

const outputPath = path.join(exportDir, 'ait-platform-manifest.json');
fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote Apps in Toss platform manifest: ${outputPath}`);

// 빌드 도장을 index.html의 앱 설정(JSON)에도 넣어 AIT.build_info()가 읽게 한다.
const indexPath = path.join(exportDir, 'index.html');
if (fs.existsSync(indexPath)) {
  const html = fs.readFileSync(indexPath, 'utf8');
  fs.writeFileSync(indexPath, injectAppConfig(html, { ...(readAppConfig(html) ?? {}), build: manifest.build }));
}
function buildStamp(dir) {
  const git = (args) => {
    const result = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
    return result.status === 0 ? String(result.stdout).trim() : null;
  };
  const stamp = { time: new Date().toISOString() };
  const commit = git(['rev-parse', '--short=12', 'HEAD']);
  if (commit) {
    stamp.commit = commit;
    stamp.dirty = (git(['status', '--porcelain', '--untracked-files=no']) ?? '') !== '';
  }
  if (process.env.AIT_BUILD_LABEL) stamp.label = String(process.env.AIT_BUILD_LABEL);
  return stamp;
}
