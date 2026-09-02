import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

const outputPath = path.join(exportDir, 'ait-platform-manifest.json');
fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote Apps in Toss platform manifest: ${outputPath}`);